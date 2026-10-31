import { createHash, randomUUID } from 'node:crypto';
import type * as z from 'zod';
import { MAX_ENVELOPE_BYTES, createBrokerEffectRequest, effectPrincipalSchema, hostOperationContractSchema, parseContract } from '../../contracts/src/index.ts';
import { jsonValueSchema } from '../../contracts/src/json-value.ts';
import type { EffectRequest } from '../../contracts/src/index.ts';
import type { CapabilityBroker } from '../../platform-contracts/src/capabilities.ts';
import { permissionRequirementSchema, permissionDecisionRecordSchema, principalKeyMaterial, scopeKeyMaterial } from '../../platform-contracts/src/permissions.ts';
import type { DecisionStore, DecisionRecord, Requirement, Principal, BrokerOutcome, PermissionPrompt, Remediation } from './types.ts';

type Source = EffectRequest['context']['source'];
export interface Operation {
  contract: z.infer<typeof hostOperationContractSchema>;
  arguments: z.ZodType;
  capabilities: readonly string[];
  requirements(arguments_: unknown): Requirement[];
  /** Fresh resource/DNS/target and source-specific intent checks. Must reject
   * stale handles, changed destinations and missing model/user approval. */
  validate(request: EffectRequest, signal: AbortSignal): Promise<void>;
  /** Durable run/effect record before dispatch; never automatically replay an
   * unknown result. Real workflow/AI adapters provide their actual repositories. */
  prepare(request: EffectRequest, signal: AbortSignal): Promise<void>;
  execute(request: EffectRequest, lease: {signal: AbortSignal; revalidate(): Promise<void>}): Promise<unknown>;
}
interface Connection {
  identity: object; principal: Principal; key: string; declarationHash: string; declarations: Set<string>;
  records: Map<string,DecisionRecord>; closed: boolean; ready: boolean; epoch: number;
}
interface Invocation {
  connection: Connection; context: EffectRequest['context']; generation: number; epoch: number;
  controller: AbortController; request?: EffectRequest; requirements: Requirement[]; once: Set<string>;
  prompt?: PermissionPrompt; busy: boolean; done: boolean; dispatched: boolean; remediation: Remediation;
}
export interface AuditRecord { at: string; principalKind: Principal['kind']; outcome: BrokerOutcome['outcome']; permissionIds: string[] }
const digest = (value:string) => createHash('sha256').update(value).digest('hex');
const requirementKey = (requirement:Requirement) => `${requirement.permissionId}:${scopeKeyMaterial(requirement.scope)}`;
const denied = (reasonCode:string,remediationAction:Remediation='review-permissions'):BrokerOutcome => ({outcome:'denied',reasonCode,remediationAction});
const failure = (invocation:Invocation,reasonCode:string):BrokerOutcome => ({outcome:'failed',reasonCode,effectOutcome:invocation.dispatched?'unknown':'not-dispatched',automaticReplay:false,requiresReview:invocation.dispatched});
function requirements(value:unknown): Requirement[] {
  if (!Array.isArray(value) || value.length>128) throw new Error('Invalid requirements.');
  const parsed = value.map(item=>parseContract(permissionRequirementSchema,item));
  if (new Set(parsed.map(requirementKey)).size!==parsed.length) throw new Error('Duplicate requirements.');
  return structuredClone(parsed);
}

/** This controller is main-only. Never expose connect/begin/decide/revoke through
 * an untrusted generic dispatcher. Main hands a bound submit closure to one
 * authenticated connection; neither payload nor token text supplies identity. */
export class PermissionBroker {
  #store: DecisionStore;
  #capabilities: CapabilityBroker;
  #operations = new Map<string,Operation>();
  #connections = new Map<object,Connection>();
  #invocations = new Set<Invocation>();
  #prompts = new Map<string,Invocation>();
  #quarantined = new Set<string>();
  #mutations = new Map<string,number>();
  #audit: AuditRecord[] = [];
  #unsubscribe: () => void;
  #closed = false;
  #canAdmit: (principalKey: string) => boolean;
  #mutationWaiters = new Set<{key: string|undefined; resolve(): void}>();
  constructor(options:{store:DecisionStore;capabilities:CapabilityBroker;operations:readonly Operation[];canAdmit?:(principalKey:string)=>boolean}) {
    this.#store=options.store; this.#capabilities=options.capabilities;
    this.#canAdmit = key => { try { return options.canAdmit?.(key) ?? true; } catch { return false; } };
    if(options.operations.length>256) throw new Error('Too many operations.');
    for(const operation of options.operations) {
      const contract=parseContract(hostOperationContractSchema,operation.contract);
      if(this.#operations.has(contract.id) || operation.capabilities.length>32 || new Set(contract.permissionIds).size!==contract.permissionIds.length) throw new Error('Invalid operation registration.');
      this.#operations.set(contract.id,{...operation,contract:structuredClone(contract),capabilities:[...operation.capabilities]});
    }
    this.#unsubscribe=this.#capabilities.subscribe(()=>{for(const invocation of this.#invocations)this.#cancel(invocation,'refresh-capability');});
  }
  async connect(identity:object, principalValue:unknown, declared:unknown):Promise<void> {
    if(this.#closed || this.#connections.has(identity) || this.#connections.size>=128) throw new Error('Connection unavailable.');
    const principal=parseContract(effectPrincipalSchema,principalValue);
    const declarations=requirements(declared);
    const key=digest(principalKeyMaterial(principal));
    if(this.#quarantined.has(key) || this.#mutations.has(key) || !this.#canAdmit(key)) throw new Error('Permission storage requires recovery.');
    const connection:Connection={identity,principal:structuredClone(principal),key,declarationHash:digest(JSON.stringify(declarations.map(requirementKey).sort())),declarations:new Set(declarations.map(requirementKey)),records:new Map(),closed:false,ready:false,epoch:0};
    this.#connections.set(identity,connection);
    try {
      const records=await this.#store.list(key);
      if(connection.closed || connection.epoch!==0 || this.#closed || records.length>10_000 || this.#mutations.has(key) || this.#quarantined.has(key) || !this.#canAdmit(key)) throw new Error();
      const staged=new Map<string,DecisionRecord>();
      let inventoryBytes=0;
      for(const value of records) {
        inventoryBytes+=Buffer.byteLength(JSON.stringify(value));
        if(inventoryBytes>16*1024*1024)throw new Error('Permission inventory exceeds byte limit.');
        const record=parseContract(permissionDecisionRecordSchema,value);
        if(digest(principalKeyMaterial(record.principal))!==key) throw new Error();
        if(record.declarationHash===connection.declarationHash && connection.declarations.has(requirementKey(record))) {
          if(staged.has(requirementKey(record))) throw new Error();
          staged.set(requirementKey(record),structuredClone(record));
        }
      }
      connection.records=staged; connection.ready=true;
    } catch { this.disconnect(identity); throw new Error('Permission storage unavailable.'); }
  }
  /** Only the trusted input/workflow/model controller chooses source/intent. */
  begin(identity:object, context:{source:Source;runId?:string;intentRef?:string}):{submit(value:unknown):Promise<BrokerOutcome>;cancel():void} {
    const connection=this.#connections.get(identity);
    if(!connection || !connection.ready || connection.closed || this.#closed || this.#quarantined.has(connection.key) || this.#mutations.has(connection.key) || !this.#canAdmit(connection.key) || this.#invocations.size>=256) throw new Error('Connection unavailable.');
    const invocation:Invocation={connection,context:{schemaVersion:1,invocationId:randomUUID(),principal:structuredClone(connection.principal),source:context.source,...(context.runId?{runId:context.runId}:{}),...(context.intentRef?{intentRef:context.intentRef}:{})},generation:this.#capabilities.generation,epoch:connection.epoch,controller:new AbortController(),requirements:[],once:new Set(),busy:false,done:false,dispatched:false,remediation:'request-permission-again'};
    this.#invocations.add(invocation);
    return {submit:async value=>{const outcome=await this.#submit(invocation,value);this.#audit.push({at:new Date().toISOString(),principalKind:connection.principal.kind,outcome:outcome.outcome,permissionIds:[...new Set(invocation.requirements.map(r=>r.permissionId))]});if(this.#audit.length>1024)this.#audit.shift();return outcome;},cancel:()=>this.#cancel(invocation,'request-permission-again')};
  }
  #fresh(invocation:Invocation):boolean {
    return !this.#closed && !invocation.connection.closed && !this.#quarantined.has(invocation.connection.key) && this.#canAdmit(invocation.connection.key) && invocation.epoch===invocation.connection.epoch && invocation.generation===this.#capabilities.generation && !invocation.controller.signal.aborted;
  }
  #cancelled(invocation:Invocation):BrokerOutcome {return {outcome:'cancelled',effectOutcome:invocation.dispatched?'unknown':'not-dispatched',automaticReplay:false,requiresReview:invocation.dispatched,remediationAction:invocation.remediation};}
  #cancel(invocation:Invocation,remediation:Remediation):void {
    invocation.remediation=remediation; invocation.controller.abort();
    if(invocation.prompt) this.#prompts.delete(invocation.prompt.id);
    if(!invocation.busy) {invocation.done=true; this.#invocations.delete(invocation);}
  }
  #granted(invocation:Invocation):boolean {return invocation.requirements.every(requirement=>invocation.once.has(requirementKey(requirement)) || invocation.connection.records.get(requirementKey(requirement))?.decision==='allow');}
  async #submit(invocation:Invocation,value:unknown):Promise<BrokerOutcome> {
    if(!this.#fresh(invocation)) return this.#cancelled(invocation);
    if(invocation.done || invocation.busy) return denied('invocation-used');
    invocation.busy=true;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const signal=invocation.controller.signal;
    let abortListener:(()=>void)|undefined;
    try {
      if(Buffer.byteLength(JSON.stringify(value))>MAX_ENVELOPE_BYTES)throw new Error('Request exceeds limit.');
      const request=createBrokerEffectRequest(value,invocation.context,this.#operations);
      if(Buffer.byteLength(JSON.stringify(request))>MAX_ENVELOPE_BYTES)throw new Error('Request exceeds limit.');
      if(invocation.request && JSON.stringify(invocation.request)!==JSON.stringify(request)) return denied('invocation-request-changed');
      invocation.request=request;
      const operation=this.#operations.get(request.operation.id)!;
      if(request.context.source==='query' && (request.operation.effect!=='read' || !request.operation.queryAllowed)) return denied('query-effect-forbidden');
      if(request.context.source==='model-tool' && !request.context.intentRef) return denied('missing-approved-intent');
      invocation.requirements=requirements(operation.requirements(structuredClone(request.arguments)));
      if(request.context.source==='background' && !invocation.requirements.some(r=>r.permissionId==='background.run')) invocation.requirements.push({permissionId:'background.run',scope:{kind:'global'}});
      if(operation.contract.permissionIds.some(id=>!invocation.requirements.some(r=>r.permissionId===id)) || invocation.requirements.some(r=>!operation.contract.permissionIds.includes(r.permissionId) && r.permissionId!=='background.run')) return denied('invalid-operation-requirements');
      if(invocation.requirements.some(r=>!invocation.connection.declarations.has(requirementKey(r)))) return denied('undeclared-permission');
      if(invocation.requirements.some(r=>['input.paste','input.shortcut'].includes(r.permissionId)) && request.context.source!=='explicit-user-action') return denied('explicit-action-required');
      for(const id of operation.capabilities) {
        const capability=this.#capabilities.get(id);
        if(capability.state!=='available') return {outcome:'unavailable',capability,remediationAction:capability.remediationAction??'refresh-capability'};
      }
      if(invocation.requirements.some(r=>invocation.connection.records.get(requirementKey(r))?.decision==='deny')) return denied('permission-denied');
      if(!this.#granted(invocation)) {
        if(!invocation.prompt) {
          invocation.prompt={id:randomUUID(),principal:structuredClone(invocation.connection.principal),operationId:request.operation.id,requirements:structuredClone(invocation.requirements.filter(r=>!invocation.once.has(requirementKey(r)) && invocation.connection.records.get(requirementKey(r))?.decision!=='allow')),choices:['once','persistent','deny']};
          this.#prompts.set(invocation.prompt.id,invocation);
        }
        return {outcome:'permission-required',prompt:structuredClone(invocation.prompt),remediationAction:'review-permissions'};
      }
      timer=setTimeout(()=>this.#cancel(invocation,'request-permission-again'),30_000);
      const interrupted=new Promise<BrokerOutcome>(resolve=>{abortListener=()=>resolve(this.#cancelled(invocation));signal.addEventListener('abort',abortListener,{once:true});});
      const assertFresh=()=>{if(!this.#fresh(invocation) || !this.#granted(invocation)) throw new Error('Authority expired.');};
      const revalidate=async()=>{assertFresh();await operation.validate(structuredClone(request),signal);assertFresh();};
      const dispatch=async():Promise<BrokerOutcome>=>{
        try {
          await revalidate();
          await operation.prepare(structuredClone(request),signal);
          await revalidate();
          assertFresh(); invocation.dispatched=true;
          const result=await operation.execute(structuredClone(request),{signal,revalidate});
          assertFresh();
          const safeResult=parseContract(jsonValueSchema,result);
          if(Buffer.byteLength(JSON.stringify(safeResult))>MAX_ENVELOPE_BYTES)throw new Error('Result exceeds limit.');
          return {outcome:'completed',result:structuredClone(safeResult)};
        } catch {return this.#fresh(invocation)?failure(invocation,'operation-failed'):this.#cancelled(invocation);}
      };
      const outcome=await Promise.race([dispatch(),interrupted]);
      invocation.done=true;
      return outcome;
    } catch {invocation.done=true; return failure(invocation,'invalid-request');}
    finally {
      invocation.busy=false;
      if(timer)clearTimeout(timer);
      if(abortListener)signal.removeEventListener('abort',abortListener);
      if(invocation.done || signal.aborted) {this.#invocations.delete(invocation);if(invocation.prompt)this.#prompts.delete(invocation.prompt.id);invocation.once.clear();}
    }
  }
  async decide(promptId:string,decision:'once'|'persistent'|'deny'):Promise<{outcome:'recorded'|'unavailable';remediationAction?:'retry-storage'|'request-permission-again'}> {
    const invocation=this.#prompts.get(promptId);
    if(!invocation || invocation.busy || this.#mutations.has(invocation.connection.key) || !this.#fresh(invocation) || !invocation.prompt) return {outcome:'unavailable',remediationAction:'request-permission-again'};
    const prompt=invocation.prompt;
    this.#prompts.delete(promptId); delete invocation.prompt;
    if(decision==='once') {for(const requirement of prompt.requirements)invocation.once.add(requirementKey(requirement));return {outcome:'recorded'};}
    if(decision!=='persistent' && decision!=='deny') return {outcome:'unavailable',remediationAction:'request-permission-again'};
    invocation.busy=true;
    this.#startMutation(invocation.connection.key);
    try {
      const records:DecisionRecord[]=[];
      for(const requirement of prompt.requirements) {
        const previous=invocation.connection.records.get(requirementKey(requirement));
        const now=new Date(Math.max(Date.now(),previous?Date.parse(previous.updatedAt)+1:0)).toISOString();
        const requested:DecisionRecord={schemaVersion:1,id:previous?.id??randomUUID(),principal:structuredClone(invocation.connection.principal),declarationHash:invocation.connection.declarationHash,...structuredClone(requirement),decision:decision==='persistent'?'allow':'deny',createdAt:previous?.createdAt??now,updatedAt:now};
        const record=parseContract(permissionDecisionRecordSchema,await this.#store.put(requested));
        if(principalKeyMaterial(record.principal)!==principalKeyMaterial(requested.principal) || record.declarationHash!==requested.declarationHash || requirementKey(record)!==requirementKey(requested) || record.decision!==requested.decision || Date.parse(record.updatedAt)<Date.parse(requested.updatedAt)) throw new Error();
        records.push(record);
        if(!this.#fresh(invocation)) {for(const stored of records)await this.#store.revoke(stored.id);return {outcome:'unavailable',remediationAction:'request-permission-again'};}
      }
      for(const connection of this.#connections.values()) if(connection.key===invocation.connection.key && connection.declarationHash===invocation.connection.declarationHash) {if(!connection.ready)connection.epoch++;for(const record of records)connection.records.set(requirementKey(record),structuredClone(record));}
      if(decision==='deny') for(const pending of this.#invocations) if(pending.connection.key===invocation.connection.key && pending.requirements.some(r=>records.some(record=>requirementKey(record)===requirementKey(r)))) this.#cancel(pending,'review-permissions');
      return {outcome:'recorded'};
    } catch {this.#quarantine(invocation.connection.key);return {outcome:'unavailable',remediationAction:'retry-storage'};}
    finally {this.#endMutation(invocation.connection.key);invocation.busy=false;if(invocation.controller.signal.aborted)this.#invocations.delete(invocation);}
  }
  #startMutation(key:string):void {
    this.#mutations.set(key,(this.#mutations.get(key)??0)+1);
    // A paginated read is not an atomic snapshot. Even if the mutation and its
    // cleanup finish first, a read started earlier must never admit stale grants.
    for(const connection of this.#connections.values())if(connection.key===key && !connection.ready)connection.epoch++;
  }
  #endMutation(key:string):void {
    const remaining=(this.#mutations.get(key)??1)-1;
    if(remaining)this.#mutations.set(key,remaining);else this.#mutations.delete(key);
    for(const waiter of this.#mutationWaiters)if(waiter.key ? !this.#mutations.has(waiter.key) : this.#mutations.size===0) {
      this.#mutationWaiters.delete(waiter); waiter.resolve();
    }
  }
  #quarantine(key:string):void {this.#quarantined.add(key);for(const invocation of this.#invocations)if(invocation.connection.key===key)this.#cancel(invocation,'retry-storage');}
  /** Remove access immediately, before waiting on durable deletion. Failed
   * deletion quarantines the principal for this broker lifetime. */
  async revoke(identity:object,recordId:string):Promise<boolean> {
    const connection=this.#connections.get(identity);
    if(!connection)return false;
    const record=[...connection.records.values()].find(r=>r.id===recordId);
    if(!record)return false;
    this.#startMutation(connection.key);
    for(const current of this.#connections.values())if(current.key===connection.key) {current.records.delete(requirementKey(record));current.epoch++;}
    for(const invocation of this.#invocations)if(invocation.connection.key===connection.key)this.#cancel(invocation,'request-permission-again');
    try {await this.#store.revoke(recordId);return true;} catch {this.#quarantine(connection.key);return false;}
    finally {this.#endMutation(connection.key);}
  }
  disconnect(identity:object):void {
    const connection=this.#connections.get(identity);if(!connection)return;
    connection.closed=true;connection.epoch++;
    for(const invocation of this.#invocations)if(invocation.connection===connection)this.#cancel(invocation,'reconnect');
    this.#connections.delete(identity);
  }
  /** Trusted administration only. The registry blocks admission first and
   * waits for late persistent-write cleanup before deleting the selected row. */
  invalidateDecision(value:DecisionRecord):boolean {
    const record=parseContract(permissionDecisionRecordSchema,value),key=digest(principalKeyMaterial(record.principal));
    let matched=false;
    for(const connection of this.#connections.values())if(connection.key===key) {
      matched=true;connection.epoch++;
      for(const [requirement,cached] of connection.records)if(cached.id===record.id)connection.records.delete(requirement);
    }
    for(const invocation of this.#invocations)if(invocation.connection.key===key)this.#cancel(invocation,'request-permission-again');
    return matched;
  }
  waitForMutations(principal?:Principal):Promise<void> {
    const key=principal ? digest(principalKeyMaterial(principal)) : undefined;
    if(key ? !this.#mutations.has(key) : this.#mutations.size===0)return Promise.resolve();
    return new Promise(resolve=>{this.#mutationWaiters.add({key,resolve});});
  }
  audit():AuditRecord[] {return structuredClone(this.#audit);}
  close():void {this.#closed=true;this.#unsubscribe();for(const identity of this.#connections.keys())this.disconnect(identity);}
}
