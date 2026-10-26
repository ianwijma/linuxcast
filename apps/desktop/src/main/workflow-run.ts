import { createHash,randomUUID } from 'node:crypto';
import * as z from 'zod';
import type { createStorageClient } from '@linuxcast/storage';
import { PermissionBroker,createDecisionStore } from '../../../../packages/permissions/src/index.ts';
import { CapabilityBroker } from '../../../../packages/platform-contracts/src/capabilities.ts';
import { principalKeyMaterial } from '../../../../packages/platform-contracts/src/permissions.ts';
import type { Principal,Requirement } from '../../../../packages/platform-contracts/src/permissions.ts';
import { workflowRunStartSchema,workflowRunDecisionSchema,workflowRunCancelSchema,workflowRunPermissionResetSchema,workflowRunSnapshotSchema,workflowRunTextSchema } from '../../../../packages/contracts/src/workflow-run.ts';
import type { WorkflowRunState,WorkflowRunStep,WorkflowRunReply,WorkflowRunErrorCode } from '../../../../packages/contracts/src/workflow-run.ts';
import type { WorkflowDefinition } from '@linuxcast/contracts';
import { validateTextWorkflow } from '../../../../packages/workflows/src/engine/index.ts';
import { workerMessageSchema } from '../../../../packages/workflows/src/worker-protocol.ts';
import type { textRunResultSchema } from '../../../../packages/workflows/src/worker-protocol.ts';
import { stableWorkflowJson } from '../../../../packages/storage/src/workflow-editor-json.ts';
import type { JournalRun,JournalStep } from '../../../../packages/workflows/src/journal/contracts.ts';
import type { WorkflowFork,WorkflowChild } from '../services/workflow-worker.ts';
import type { ClipboardWriteOutcome } from './clipboard-write.ts';
const hash=(definition:WorkflowDefinition)=>createHash('sha256').update(stableWorkflowJson(definition)).digest('hex');
const copyArgs=z.strictObject({activationId:z.uuid(),nodeId:z.string().min(1).max(200),text:workflowRunTextSchema});
const requirement:Requirement={permissionId:'clipboard.write',scope:{kind:'global'}};
const failure=(code:'invalid-request'|'conflict'|'unavailable'|'unknown-outcome'):WorkflowRunReply=>({ok:false,error:{code,message:{'invalid-request':'Review the saved workflow and run input.',conflict:'The workflow or run changed. Refresh before continuing.',unavailable:'Workflow execution is unavailable. Review clipboard access or reopen the editor.','unknown-outcome':'The run could not be confirmed. Refresh and inspect the clipboard before starting a new run.'}[code]}});
interface Run {
  state:WorkflowRunState;record:JournalRun;steps:Map<string,JournalStep>;definition:WorkflowDefinition;reachable:Set<string>;receipts:Set<string>;trusted():boolean;controller:AbortController;
  broker:PermissionBroker;identity:object;child?:WorkflowChild;chain:Promise<void>;journal:Promise<void>;lastRequest:number;finished:boolean;finishing:boolean;settled:Promise<void>;resolveSettled():void;
  prompt?:{id:string;resolve():void;reject():void}|undefined;cancelInvocation?:(()=>void)|undefined;timer?:ReturnType<typeof setTimeout>;killTimer?:ReturnType<typeof setTimeout>;dispatched:boolean;completed:boolean;denied:boolean;
}
export function createWorkflowRuns(options:{repository:ReturnType<typeof createStorageClient>;fork:WorkflowFork;copyText(text:string):Promise<ClipboardWriteOutcome>;ready():boolean;publish(state:WorkflowRunState):void}){
  const repository=options.repository,store=createDecisionStore(repository);
  const capabilities=new CapabilityBroker(['workflowClipboardAdapter']);
  // This reports the registered host adapter, not a native/session capability.
  // Its actual backend support and exact write/read receipt are checked per call.
  capabilities.report({id:'workflowClipboardAdapter',state:'available',backend:'host-clipboard-receipt'});
  let current:Run|undefined,snapshot:WorkflowRunState|null=null,busy=false,stopped=false,effects=0,recovery:Promise<void>|undefined;
  const emit=(run:Run)=>{if(current!==run)return;run.state={...run.state,sequence:run.state.sequence+1};snapshot=workflowRunSnapshotSchema.parse(run.state);options.publish(structuredClone(snapshot));};
  const ok=():WorkflowRunReply=>({ok:true,value:snapshot?structuredClone(snapshot):null});
  async function recover(){
    return recovery??=(async()=>{const result=await repository.request('workflows.runs.recover',{});if(!result)return;
      const editor=await repository.request('workflows.editor.get',{});const record=result.run;
      snapshot=workflowRunSnapshotSchema.parse({runId:record.runId,sequence:1,editorRevision:record.editorRevision,workflowName:editor?.saved&&hash(editor.saved)===record.definitionHash?editor.saved.name:'Previous workflow run',triggerNodeId:record.triggerNodeId,state:record.state,steps:result.steps.map(step=>({activationId:step.activationId,nodeId:step.nodeId,nodeType:step.nodeType,state:step.state==='completed'?'succeeded':step.state==='cancelled'?'cancelled':'failed',...(step.durationMs===undefined?{}:{durationMs:step.durationMs})})),effectOutcome:record.effectOutcome,requiresReview:record.requiresReview,...(record.errorCode?{errorCode:record.errorCode}:{})});
    })();
  }
  function journal(run:Run,operation:()=>Promise<void>):Promise<void>{const next=run.journal.then(operation);run.journal=next.catch(()=>{});return next;}
  function writeRun(run:Run,state:JournalRun['state'],errorCode?:WorkflowRunErrorCode){return journal(run,async()=>{
    const record:JournalRun={...run.record,state,effectOutcome:run.state.effectOutcome,requiresReview:run.state.requiresReview,revision:run.record.revision+1,updatedAt:new Date().toISOString(),...(errorCode?{errorCode}:{})};
    run.record=await repository.request('workflows.runs.put',{expectedRevision:run.record.revision,record});
  });}
  function writeStep(run:Run,activationId:string,state:JournalStep['state'],step?:WorkflowRunStep){return journal(run,async()=>{
    const prior=run.steps.get(activationId),now=new Date().toISOString();
    if(!prior&&!step)throw new Error('Unknown step.');
    const record:JournalStep={...(prior??{runId:run.state.runId,activationId,nodeId:step!.nodeId,nodeType:step!.nodeType,createdAt:now}),state,revision:(prior?.revision??0)+1,updatedAt:now,...(step?.durationMs===undefined?{}:{durationMs:step.durationMs})};
    run.steps.set(activationId,await repository.request('workflows.steps.put',{expectedRevision:prior?.revision??0,record}));
  });}
  async function fresh(run:Run,signal:AbortSignal){
    if(current!==run||run.finished||run.finishing||run.controller.signal.aborted||signal.aborted||!run.trusted()||stopped)throw new Error('Run authority expired.');
    const editor=await repository.request('workflows.editor.get',{});
    if(!editor?.saved||editor.revision!==run.state.editorRevision||hash(editor.saved)!==run.record.definitionHash||!run.trusted()||run.controller.signal.aborted||signal.aborted)throw new Error('Saved workflow changed.');
  }
  async function finish(run:Run,result:z.infer<typeof textRunResultSchema>){
    if(run.finished||run.finishing)return;run.finishing=true;clearTimeout(run.timer);clearTimeout(run.killTimer);run.prompt?.reject();run.prompt=undefined;run.cancelInvocation?.();run.broker.disconnect(run.identity);run.broker.close();
    const cancelled=run.controller.signal.aborted;
    let unknown=result.effectOutcome==='unknown'||run.dispatched&&!run.completed||[...run.steps.values()].some(step=>step.state==='dispatched'||step.state==='unknown');
    run.state={...run.state,state:cancelled?'cancelled':result.state,prompt:undefined,effectOutcome:unknown?'unknown':run.completed?'completed':result.effectOutcome,requiresReview:unknown||result.requiresReview,...(!cancelled&&result.output!==undefined?{output:result.output}:{}),errorCode:unknown?'unknown-outcome':cancelled?'cancelled':result.errorCode};
    try{
      for(const step of run.steps.values())if(['pending','prepared','dispatched'].includes(step.state))await writeStep(run,step.activationId,step.state==='dispatched'?'unknown':'cancelled');
      await writeRun(run,run.state.state,run.state.errorCode);
    }catch{unknown=unknown||run.dispatched;run.state={...run.state,state:cancelled?'cancelled':'failed',effectOutcome:unknown?'unknown':run.state.effectOutcome,requiresReview:unknown,errorCode:unknown?'unknown-outcome':'storage-unavailable'};}
    run.finished=true;emit(run);run.resolveSettled();run.child?.kill();
  }
  function cancelCurrent(){
    const run=current;if(!run||run.finished||run.finishing)return;
    run.controller.abort();run.prompt?.reject();run.prompt=undefined;run.cancelInvocation?.();run.state={...run.state,state:'cancelling',prompt:undefined};emit(run);
    run.child?.send({type:'cancel',runId:run.state.runId});
    run.killTimer??=setTimeout(()=>{run.child?.kill();void run.chain.finally(()=>finish(run,{state:'cancelled',effectOutcome:run.dispatched&&!run.completed?'unknown':run.completed?'completed':'not-dispatched',requiresReview:run.dispatched&&!run.completed,errorCode:'cancelled'}));},500);
  }
  async function copy(run:Run,message:{activationId:string;nodeId:string;text:string}){
    const step=run.steps.get(message.activationId);if(!step||step.state!=='pending'||step.nodeId!==message.nodeId||step.nodeType!=='output.clipboard')throw new Error('Unexpected copy.');
    await fresh(run,run.controller.signal);
    const invocation=run.broker.begin(run.identity,{source:'explicit-user-action',runId:run.state.runId});run.cancelInvocation=invocation.cancel;
    const submission={schemaVersion:1,operationId:'workflow.copy-text',arguments:{activationId:message.activationId,nodeId:message.nodeId,text:message.text}};
    let outcome=await invocation.submit(submission);
    if(outcome.outcome==='permission-required'){
      const promptId=outcome.prompt.id;
      run.state={...run.state,state:'waiting-ui',prompt:{id:promptId,permissionId:'clipboard.write',choices:outcome.prompt.choices,text:message.text}};
      await writeRun(run,'waiting-ui');emit(run);
      await new Promise<void>((resolve,reject)=>{if(run.controller.signal.aborted){reject(new Error('Cancelled.'));return;}run.prompt={id:promptId,resolve,reject:()=>reject(new Error('Cancelled.'))};});
      await fresh(run,run.controller.signal);outcome=await invocation.submit(submission);
    }
    run.cancelInvocation=undefined;
    if(outcome.outcome==='completed'&&outcome.result==='written'){run.completed=true;return;}
    const uncertain=outcome.outcome==='failed'||outcome.outcome==='cancelled'?outcome.effectOutcome==='unknown':false;
    if(!uncertain){run.dispatched=false;if(run.steps.get(message.activationId)?.state==='dispatched')await writeStep(run,message.activationId,'failed');} // Known negative backend receipt.
    throw Object.assign(new Error('Clipboard action unavailable.'),{code:outcome.outcome==='denied'||run.denied?'permission-denied':uncertain?'unknown-outcome':'unavailable',effectOutcome:uncertain?'unknown':'not-dispatched'});
  }
  async function message(run:Run,value:unknown){
    const parsed=workerMessageSchema.safeParse(value);
    if(!parsed.success||parsed.data.runId!==run.state.runId)throw new Error('Invalid worker message.');
    const data=parsed.data;if(run.finished)return;
    if(data.type==='abort-request'){cancelCurrent();return;}
    if(data.type==='result'){if(data.result.state==='succeeded'&&(!run.steps.size||[...run.steps.values()].some(step=>step.state!=='completed')||data.result.effectOutcome!==(run.receipts.size?'completed':'not-dispatched')||data.result.requiresReview))throw new Error('Unconfirmed run completion.');await finish(run,data.result);return;}
    if(run.controller.signal.aborted)return;
    if(data.type==='value'){run.state={...run.state,output:data.text};return;}
    if(data.requestId!==run.lastRequest+1)throw new Error('Worker request identity changed.');run.lastRequest=data.requestId;
    try{
      if(data.type==='copy')await copy(run,data);
      else{
        const previous=run.steps.get(data.step.activationId);
        if(data.step.state==='running'){const node=run.definition.nodes.find(node=>node.id===data.step.nodeId);if(previous||!node||node.type!==data.step.nodeType||node.disabled||!run.reachable.has(node.id))throw new Error('Invalid activation identity.');await writeStep(run,data.step.activationId,'pending',data.step);}
        else{if(!previous||previous.nodeId!==data.step.nodeId||previous.nodeType!==data.step.nodeType||previous.state==='completed'||data.step.state==='succeeded'&&data.step.nodeType==='output.clipboard'&&(!run.receipts.has(data.step.activationId)||previous.state!=='dispatched'))throw new Error('Changed activation.');if(!['failed','cancelled','unknown','completed'].includes(previous.state))await writeStep(run,data.step.activationId,data.step.state==='succeeded'?'completed':previous.state==='dispatched'?'unknown':data.step.state,data.step);}
        const steps=run.state.steps.filter(step=>step.activationId!==data.step.activationId);run.state={...run.state,steps:[...steps,data.step].slice(-50)};emit(run);
      }
      if(!run.controller.signal.aborted)run.child?.send({type:'ack',runId:run.state.runId,requestId:data.requestId});
    }catch(error){
      const code=error&&typeof error==='object'&&'code'in error?error.code:undefined;
      const errorCode:WorkflowRunErrorCode=['permission-denied','unavailable','unknown-outcome'].includes(String(code))?code as WorkflowRunErrorCode:'storage-unavailable';
      run.child?.send({type:'ack',runId:run.state.runId,requestId:data.requestId,errorCode,effectOutcome:(error&&typeof error==='object'&&'effectOutcome'in error&&error.effectOutcome==='unknown')||run.steps.get(data.type==='copy'?data.activationId:data.step.activationId)?.state==='dispatched'?'unknown':'not-dispatched'});
    }
  }
  return {
    async get(){if(stopped||!options.ready())return failure('unavailable');try{await recover();return ok();}catch{return failure('unavailable');}},
    async start(value:unknown,trusted:()=>boolean):Promise<WorkflowRunReply>{
      const parsed=workflowRunStartSchema.safeParse(value);if(!parsed.success)return failure('invalid-request');
      if(stopped||busy||effects||current&&!current.finished||!options.ready()||!trusted())return failure('conflict');busy=true;
      let run:Run|undefined;
      try{
        await recover();const editor=await repository.request('workflows.editor.get',{});
        if(!trusted()||!editor?.saved||editor.revision!==parsed.data.editorRevision)return failure('conflict');
        const definition=validateTextWorkflow(editor.saved,parsed.data.triggerNodeId),integrity=hash(definition),runId=randomUUID(),now=new Date().toISOString(),identity={};
        let resolveSettled!:()=>void;const settled=new Promise<void>(done=>{resolveSettled=done;});
        const principal:Principal={kind:'workflow',id:definition.id,version:definition.version,integrity};
        run={state:{runId,sequence:1,editorRevision:editor.revision,workflowName:definition.name,triggerNodeId:parsed.data.triggerNodeId,state:'queued',steps:[],effectOutcome:'not-dispatched',requiresReview:false},record:{runId,workflowId:definition.id,workflowVersion:definition.version,definitionHash:integrity,editorRevision:editor.revision,triggerNodeId:parsed.data.triggerNodeId,state:'queued',effectOutcome:'not-dispatched',requiresReview:false,revision:1,createdAt:now,updatedAt:now},steps:new Map(),definition,reachable:new Set([parsed.data.triggerNodeId]),receipts:new Set(),trusted,controller:new AbortController(),identity,broker:undefined!,chain:Promise.resolve(),journal:Promise.resolve(),lastRequest:0,finished:false,finishing:false,settled,resolveSettled,dispatched:false,completed:false,denied:false};
        for(const id of run.reachable){for(const edge of definition.edges)if(edge.from.nodeId===id&&!definition.nodes.find(node=>node.id===edge.to.nodeId)?.disabled)run.reachable.add(edge.to.nodeId);}
        const active=run;
        run.broker=new PermissionBroker({store,capabilities,operations:[{
          contract:{id:'workflow.copy-text',effect:'write',externallyCommunicating:true,queryAllowed:false,retrySafe:false,permissionIds:['clipboard.write']},arguments:copyArgs,capabilities:['workflowClipboardAdapter'],requirements:()=>[requirement],
          async validate(request,signal){if(request.context.runId!==active.state.runId)throw new Error('Wrong run.');const args=copyArgs.parse(request.arguments),step=active.steps.get(args.activationId);if(!step||step.nodeId!==args.nodeId||step.nodeType!=='output.clipboard'||!['pending','prepared','dispatched'].includes(step.state))throw new Error('Wrong activation.');await fresh(active,signal);},
          async prepare(request,signal){await fresh(active,signal);await writeStep(active,copyArgs.parse(request.arguments).activationId,'prepared');},
          async execute(request,lease){await lease.revalidate();const args=copyArgs.parse(request.arguments);await writeStep(active,args.activationId,'dispatched');await lease.revalidate();active.dispatched=true;effects++;try{const result=await options.copyText(args.text);if(result==='written'){active.completed=true;active.receipts.add(args.activationId);}return result;}finally{effects--;}}
        }]});
        current=run;run.record=await repository.request('workflows.runs.put',{expectedRevision:0,record:run.record});
        await run.broker.connect(identity,principal,definition.permissions.some(p=>p.id==='clipboard.write')?[requirement]:[]);
        await fresh(run,run.controller.signal);run.state={...run.state,state:'running'};await writeRun(run,'running');emit(run);
        run.child=options.fork({protocolVersion:1,type:'start',runId,definition,triggerNodeId:parsed.data.triggerNodeId,input:parsed.data.input,context:{runId,workflowId:definition.id,workflowVersion:definition.version,triggerNodeId:parsed.data.triggerNodeId,invocationTime:now,locale:Intl.DateTimeFormat().resolvedOptions().locale,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,callChain:[]}},value=>{if(current!==active||active.finished)return;const urgent=workerMessageSchema.safeParse(value);if(urgent.success&&urgent.data.type==='abort-request'){if(urgent.data.runId===active.state.runId&&urgent.data.requestId===active.lastRequest)cancelCurrent();else{active.child?.kill();cancelCurrent();}return;}active.chain=active.chain.then(()=>message(active,value)).catch(()=>finish(active,{state:'failed',errorCode:'unavailable',effectOutcome:active.dispatched&&!active.completed?'unknown':active.completed?'completed':'not-dispatched',requiresReview:active.dispatched&&!active.completed}));},()=>{void active.chain.then(()=>finish(active,{state:'failed',errorCode:'unavailable',effectOutcome:active.dispatched&&!active.completed?'unknown':active.completed?'completed':'not-dispatched',requiresReview:active.dispatched&&!active.completed}));});
        run.timer=setTimeout(()=>cancelCurrent(),Math.min(definition.defaults.runTimeoutMs+2000,2147483647));
        return ok();
      }catch(error){if(run)await finish(run,{state:'failed',errorCode:'unavailable',effectOutcome:'not-dispatched',requiresReview:false});const code=error&&typeof error==='object'&&'code'in error?error.code:undefined;return failure(code==='unsupported-configuration'||code==='invalid-workflow'?'invalid-request':'unavailable');}
      finally{busy=false;}
    },
    async decide(value:unknown):Promise<WorkflowRunReply>{const parsed=workflowRunDecisionSchema.safeParse(value),run=current;if(!parsed.success)return failure('invalid-request');if(busy||!run||run.finished||run.finishing||run.controller.signal.aborted||run.state.runId!==parsed.data.runId||run.prompt?.id!==parsed.data.promptId)return failure('conflict');busy=true;
      try{await fresh(run,run.controller.signal);const decision=await run.broker.decide(parsed.data.promptId,parsed.data.decision);if(decision.outcome!=='recorded')return failure('unavailable');if(parsed.data.decision==='deny')run.denied=true;const prompt=run.prompt;run.prompt=undefined;run.state={...run.state,state:'running',prompt:undefined};await writeRun(run,'running');emit(run);prompt?.resolve();return ok();}catch{cancelCurrent();return failure('unknown-outcome');}finally{busy=false;}},
    async cancel(value:unknown):Promise<WorkflowRunReply>{const parsed=workflowRunCancelSchema.safeParse(value);if(!parsed.success)return failure('invalid-request');if(!current||current.state.runId!==parsed.data.runId)return failure('conflict');cancelCurrent();return ok();},
    async reset(value:unknown,trusted:()=>boolean):Promise<WorkflowRunReply>{const parsed=workflowRunPermissionResetSchema.safeParse(value);if(!parsed.success)return failure('invalid-request');if(busy||stopped||!options.ready())return failure('conflict');busy=true;
      try{cancelCurrent();const cancelled=current;if(cancelled?.child){await cancelled.child.exited;await cancelled.settled;}const editor=await repository.request('workflows.editor.get',{});if(!trusted()||!editor?.saved||editor.revision!==parsed.data.editorRevision)return failure('conflict');const principal:Principal={kind:'workflow',id:editor.saved.id,version:editor.saved.version,integrity:hash(editor.saved)},key=createHash('sha256').update(principalKeyMaterial(principal)).digest('hex');const records=await store.list(key);
        const freshReset=async()=>{if(stopped||!trusted())return false;const latest=await repository.request('workflows.editor.get',{});return !stopped&&trusted()&&!!latest?.saved&&latest.revision===parsed.data.editorRevision&&hash(latest.saved)===principal.integrity;};
        if(!await freshReset())return failure('conflict');
        let revoked=false;
        for(const record of records)if(record.permissionId==='clipboard.write'&&record.scope.kind==='global'){if(!await freshReset())return failure(revoked?'unknown-outcome':'conflict');await store.revoke(record.id);revoked=true;}
        return ok();}catch{return failure('unknown-outcome');}finally{busy=false;}},
    cancelCurrent,
    async stop(){stopped=true;cancelCurrent();const run=current;if(run?.child){await run.child.exited;await run.settled;}},
    async terminate(){stopped=true;cancelCurrent();current?.child?.kill();if(current?.child)await current.child.exited;},
  };
}
