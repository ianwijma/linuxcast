import { parseContract,workflowDefinitionSchema,workflowRunInputSchema,workflowRunTextSchema,workflowRunStepSchema } from '@linuxcast/contracts';
import type { WorkflowDefinition,WorkflowEnvelope,WorkflowRunErrorCode,WorkflowRunStep } from '@linuxcast/contracts';
import { validateWorkflow } from '../graph/index.ts';
import { copyPublicJson,freezeDetached } from '../graph/safe-json.ts';
import { EDITOR_NODE_REGISTRY } from '../registry.ts';
import { forkEnvelope } from '../run/index.ts';
import type { DeepReadonly } from '../graph/safe-json.ts';
export type { WorkflowRunErrorCode } from '@linuxcast/contracts';
export interface TextWorkflowResult {
  state:'succeeded'|'failed'|'cancelled';output?:string;errorCode?:WorkflowRunErrorCode;
  effectOutcome:'not-dispatched'|'completed'|'unknown';requiresReview:boolean;
}
export interface TextWorkflowOptions {
  definition:unknown;triggerNodeId:string;input:string;context:WorkflowEnvelope['context'];signal:AbortSignal;
  createActivationId():string;onStep(step:WorkflowRunStep):Promise<void>;onValue(text:string):void;
  copyText(request:{activationId:string;nodeId:string;text:string},signal:AbortSignal):Promise<void>;
}
const messages:ReadonlyMap<WorkflowRunErrorCode,string>=new Map([
  ['invalid-workflow','Invalid text workflow.'],['unsupported-configuration','This workflow configuration is not supported.'],
  ['invalid-input','Invalid workflow input.'],['invalid-binding','Invalid workflow binding.'],['limit-exceeded','Workflow limit exceeded.'],
  ['deadline-exceeded','Workflow deadline exceeded.'],['permission-denied','Workflow permission denied.'],['unavailable','Workflow operation unavailable.'],
  ['storage-unavailable','Workflow journal unavailable.'],['unknown-outcome','Workflow effect outcome is unknown.'],['cancelled','Workflow cancelled.'],
]);
export class WorkflowRunError extends Error {
  readonly code:WorkflowRunErrorCode;readonly effectOutcome:'not-dispatched'|'unknown';
  constructor(code:WorkflowRunErrorCode,effectOutcome:'not-dispatched'|'unknown'='not-dispatched'){super(messages.get(code)??'Workflow operation unavailable.');this.name='WorkflowRunError';this.code=code;this.effectOutcome=effectOutcome;}
}
const encoder=new TextEncoder();
function validNodeId(value:unknown):value is string {return typeof value==='string'&&value.length>0&&value.length<=200&&encoder.encode(value).length<=200&&!/[\p{Cc}\p{Cs}]/u.test(value);}
function locale(value:unknown):string {
  try{if(typeof value!=='string' || value.length>64)throw new Error();const canonical=Intl.getCanonicalLocales(value)[0];if(!canonical || !Intl.Segmenter.supportedLocalesOf([canonical]).length)throw new Error();return canonical;}
  catch{throw new WorkflowRunError('unsupported-configuration');}
}
/** Only the fixed, explicitly supported text configuration is executable. */
export function validateTextWorkflow(value:unknown,triggerNodeId:string):WorkflowDefinition {
  try{
    const raw=parseContract(workflowDefinitionSchema,copyPublicJson(value));
    if(raw.settings.length || Object.keys(raw.subgraphs??{}).length || raw.nodes.some(node=>!EDITOR_NODE_REGISTRY.has(node.type)))throw new WorkflowRunError('unsupported-configuration');
    const definition=validateWorkflow(raw,EDITOR_NODE_REGISTRY),trigger=definition.nodes.find(node=>node.id===triggerNodeId);
    if(!validNodeId(triggerNodeId) || !trigger || trigger.type!=='input.keyword' || trigger.disabled || definition.nodes.some(node=>!validNodeId(node.id)))throw new WorkflowRunError('invalid-workflow');
    for(const node of definition.nodes){
      if(node.onError==='route')throw new WorkflowRunError('unsupported-configuration');
      const binding=node.type==='utility.transform'?node.config.source:node.type==='output.clipboard'?node.config.text:undefined;
      if(node.type!=='input.keyword' && (binding===null || typeof binding!=='object' || Array.isArray(binding) || Object.keys(binding).length!==1 || binding.ref!=='input#/0'))throw new WorkflowRunError('unsupported-configuration');
      if(node.type==='utility.transform' && node.config.locale!==undefined)locale(node.config.locale);
    }
    if(definition.edges.some(edge=>edge.activation!==undefined || edge.keepLauncherOpen!==undefined))throw new WorkflowRunError('unsupported-configuration');
    const nodes=new Map(definition.nodes.map(node=>[node.id,node])),reachable=new Set([triggerNodeId]),pending=[triggerNodeId];
    for(let index=0;index<pending.length;index++)for(const edge of definition.edges){if(edge.from.nodeId===pending[index] && !nodes.get(edge.to.nodeId)!.disabled && !reachable.has(edge.to.nodeId)){reachable.add(edge.to.nodeId);pending.push(edge.to.nodeId);}}
    if([...reachable].some(id=>nodes.get(id)!.type==='output.clipboard') && !definition.permissions.some(permission=>permission.id==='clipboard.write'))throw new WorkflowRunError('permission-denied');
    return definition;
  }catch(error){if(error instanceof WorkflowRunError)throw error;throw new WorkflowRunError('invalid-workflow');}
}
interface Scope {signal:AbortSignal;deadline:number;check():void;dispose():void}
function scope(deadline:number,parent?:AbortSignal):Scope {
  const controller=new AbortController();
  const cancel=()=>controller.abort(parent?.reason instanceof WorkflowRunError?parent.reason:new WorkflowRunError('cancelled'));
  const expire=()=>controller.abort(new WorkflowRunError('deadline-exceeded'));
  const timer=setTimeout(expire,Math.max(0,deadline-performance.now()));
  if(parent?.aborted)cancel();else parent?.addEventListener('abort',cancel,{once:true});
  return {signal:controller.signal,deadline,check(){if(performance.now()>=deadline&&!controller.signal.aborted)expire();if(controller.signal.aborted)throw controller.signal.reason;},dispose(){clearTimeout(timer);parent?.removeEventListener('abort',cancel);}};
}
function bounded<T>(action:()=>T|Promise<T>,limit:Scope):Promise<T> {
  limit.check();return new Promise((resolve,reject)=>{
    const abort=()=>reject(limit.signal.reason);limit.signal.addEventListener('abort',abort,{once:true});
    Promise.resolve().then(()=>{limit.check();return action();}).then(value=>{try{limit.check();resolve(value);}catch(error){reject(error);}},reject).finally(()=>limit.signal.removeEventListener('abort',abort));
  });
}
function text(value:unknown,code:WorkflowRunErrorCode='limit-exceeded'):string {
  if(typeof value!=='string' || value.length>65536 || !workflowRunTextSchema.safeParse(value).success)throw new WorkflowRunError(code);return value;
}
function transformed(value:string,operation:unknown,language:string,limit:Scope):string {
  if(operation==='trim')return value.trim();if(operation==='normalize')return value.normalize('NFC');
  if(operation==='upper')return value.toLocaleUpperCase(language);if(operation==='lower')return value.toLocaleLowerCase(language);
  if(operation!=='title')throw new WorkflowRunError('unsupported-configuration');
  const graphemes=new Intl.Segmenter(language,{granularity:'grapheme'});let result='';
  for(const part of new Intl.Segmenter(language,{granularity:'word'}).segment(value)){
    limit.check();if(!part.isWordLike){result+=part.segment;continue;}
    const lower=part.segment.toLocaleLowerCase(language),first=graphemes.segment(lower)[Symbol.iterator]().next().value?.segment??'';
    result+=first.toLocaleUpperCase(language)+lower.slice(first.length);
  }
  return result;
}
/** Fixed executors only. All durable metadata and clipboard authority belong to
 * injected host closures. No retry, replay, native API or plugin code runs here. */
export async function runTextWorkflow(options:TextWorkflowOptions):Promise<TextWorkflowResult> {
  const started=performance.now(),{signal,createActivationId,onStep,onValue,copyText}=options;
  let outcome:TextWorkflowResult['effectOutcome']='not-dispatched',output:string|undefined,run:Scope|undefined,finished=false;
  const result=(state:TextWorkflowResult['state'],errorCode?:WorkflowRunErrorCode):TextWorkflowResult=>({state,...(output!==undefined?{output}:{}),...(errorCode?{errorCode}:{}),effectOutcome:outcome,requiresReview:outcome==='unknown'});
  const storageFailure=()=>{if(outcome!=='not-dispatched')outcome='unknown';return new WorkflowRunError('storage-unavailable',outcome==='unknown'?'unknown':'not-dispatched');};
  try{
    if(signal.aborted)throw new WorkflowRunError('cancelled');
    const definition=freezeDetached(validateTextWorkflow(options.definition,options.triggerNodeId));
    if(typeof options.input!=='string' || options.input.length>16384 || !workflowRunInputSchema.safeParse(options.input).success)throw new WorkflowRunError('invalid-input');
    let initial:DeepReadonly<WorkflowEnvelope>;
    try{initial=forkEnvelope({args:[options.input],vars:{},context:options.context});}catch{throw new WorkflowRunError('invalid-input');}
    if(initial.context.workflowId!==definition.id || initial.context.workflowVersion!==definition.version || initial.context.triggerNodeId!==options.triggerNodeId)throw new WorkflowRunError('invalid-input');
    const language=locale(initial.context.locale),nodes=new Map(definition.nodes.map(node=>[node.id,node]));
    run=scope(started+definition.defaults.runTimeoutMs,signal);run.check();
    const edges=new Map(definition.nodes.map(node=>[node.id,definition.edges.filter(edge=>edge.from.nodeId===node.id).sort((a,b)=>a.order-b.order)]));
    const queue=[{nodeId:options.triggerNodeId,envelope:initial}],ids=new Set<string>();let activated=0;
    for(let index=0;index<queue.length;index++){
      run.check();const item=queue[index]!,node=nodes.get(item.nodeId)!;if(node.disabled)continue;
      if(++activated>definition.defaults.maxNodeExecutions)throw new WorkflowRunError('limit-exceeded');
      const activationStarted=performance.now(),limit=scope(Math.min(run.deadline,activationStarted+(node.timeoutMs??definition.defaults.runTimeoutMs)),run.signal);
      let activationId:string,acknowledged=false,terminal=false;
      try{activationId=createActivationId();if(ids.has(activationId))throw new Error();parseContract(workflowRunStepSchema,{activationId,nodeId:node.id,nodeType:node.type,state:'running'});ids.add(activationId);}catch{limit.dispose();throw new WorkflowRunError('unavailable');}
      const step=(state:WorkflowRunStep['state']):WorkflowRunStep=>Object.freeze({activationId,nodeId:node.id,nodeType:node.type as WorkflowRunStep['nodeType'],state,...(state!=='running'?{durationMs:Math.max(0,Math.floor(performance.now()-activationStarted))}:{})});
      try{
        try{await bounded(()=>onStep(step('running')),limit);acknowledged=true;}catch(error){if(limit.signal.aborted)throw error;throw storageFailure();}
        let value=text(item.envelope.args[0],'invalid-binding');
        if(node.type==='input.keyword'){
          if(node.config.trimQuery)value=value.trim();
          if((node.config.argument==='required'&&!value.length)||(node.config.argument==='none'&&value.length))throw new WorkflowRunError('invalid-input');
        }else if(node.type==='utility.transform')value=text(transformed(value,node.config.operation,node.config.locale===undefined?language:locale(node.config.locale),limit));
        else{
          let invoked=false,settled=false,failure:unknown,received=false;
          try{await bounded(()=>{
            invoked=true;let pending:Promise<void>;
            try{pending=copyText(Object.freeze({activationId,nodeId:node.id,text:value}),limit.signal);}catch(error){settled=true;failure=error;throw error;}
            return Promise.resolve(pending).then(()=>{settled=true;received=true;if(!finished&&outcome!=='unknown')outcome='completed';},error=>{settled=true;failure=error;throw error;});
          },limit);}catch(error){
            if(failure instanceof WorkflowRunError){if(failure.effectOutcome==='unknown')outcome='unknown';throw failure;}
            if(invoked&&(!settled||!received))outcome='unknown';
            if(error instanceof WorkflowRunError)throw error;
            throw new WorkflowRunError('unknown-outcome','unknown');
          }
        }
        limit.check();terminal=true;
        try{await bounded(()=>onStep(step('succeeded')),limit);}catch(error){if(outcome!=='not-dispatched')outcome='unknown';if(limit.signal.aborted)throw error;throw storageFailure();}
        limit.check();try{onValue(value);}catch{throw new WorkflowRunError('unavailable');}output=value;
        const outgoing=edges.get(node.id)!.filter(edge=>!nodes.get(edge.to.nodeId)!.disabled);
        if(activated+queue.length-index-1+outgoing.length>definition.defaults.maxNodeExecutions)throw new WorkflowRunError('limit-exceeded');
        for(const edge of outgoing)queue.push({nodeId:edge.to.nodeId,envelope:forkEnvelope({...item.envelope,args:[value]})});
      }catch(error){
        let safe=error instanceof WorkflowRunError?error:new WorkflowRunError('unavailable');
        if(safe.effectOutcome==='unknown')outcome='unknown';
        if(acknowledged&&!terminal){
          const cleanup=scope(performance.now()+1000);
          try{await bounded(()=>onStep(step(safe.code==='cancelled'?'cancelled':'failed')),cleanup);}catch{safe=storageFailure();}finally{cleanup.dispose();}
        }
        throw safe;
      }finally{limit.dispose();}
      // Give actual host cancellation messages a turn even with immediate mocks.
      if(activated%32===0)await bounded(()=>new Promise<void>(resolve=>setTimeout(resolve,0)),run);
    }
    run.check();finished=true;return result('succeeded');
  }catch(error){finished=true;const safe=error instanceof WorkflowRunError?error:new WorkflowRunError('unavailable');if(safe.effectOutcome==='unknown')outcome='unknown';return result(safe.code==='cancelled'?'cancelled':'failed',safe.code);}
  finally{run?.dispose();}
}
