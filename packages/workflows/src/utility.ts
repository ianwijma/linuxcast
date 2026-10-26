import { randomUUID } from 'node:crypto';
import { workflowWorkerStartSchema } from '../../contracts/src/workflow-run.ts';
import type { WorkflowWorkerStart } from '../../contracts/src/workflow-run.ts';
import { parentMessageSchema,workerMessageSchema } from './worker-protocol.ts';
import { runTextWorkflow,WorkflowRunError } from './engine/index.ts';
// Trusted bundled fixed-node computation only. No native clipboard, storage,
// grant dispatcher, application environment or arbitrary module loader input.
type ParentPort={postMessage(value:unknown):void;on(event:'message',listener:(event:{data:unknown})=>void):void};
const port=(process as NodeJS.Process&{parentPort?:ParentPort}).parentPort;
if(!port)throw new Error('Workflow parent unavailable.');
// Parent owns termination after it durably accepts the final result; an eager
// child exit can overtake its final IPC message.
let start:WorkflowWorkerStart|undefined,sequence=0;
const controller=new AbortController();
const pending=new Map<number,{resolve():void;reject(error:Error):void}>();
function send(value:unknown){port!.postMessage(workerMessageSchema.parse(value));}
function request(value:object,signal:AbortSignal):Promise<void>{
  if(signal.aborted)return Promise.reject(new WorkflowRunError('cancelled'));
  const requestId=++sequence;
  return new Promise((resolve,reject)=>{
    const abort=()=>{try{send({type:'abort-request',runId:start!.runId,requestId});}catch{/* Parent exit already fences effects. */}pending.delete(requestId);reject(new WorkflowRunError('cancelled', 'unknown'));};
    pending.set(requestId,{resolve(){signal.removeEventListener('abort',abort);resolve();},reject(error){signal.removeEventListener('abort',abort);reject(error);}});
    signal.addEventListener('abort',abort,{once:true});
    try{send({...value,runId:start!.runId,requestId});}catch{pending.get(requestId)?.reject(new WorkflowRunError('unavailable'));pending.delete(requestId);}
  });
}
port.on('message',event=>{
  if(!start){
    const parsed=workflowWorkerStartSchema.safeParse(event.data);if(!parsed.success){setImmediate(()=>process.exit(1));return;}
    start=parsed.data;
    void runTextWorkflow({definition:start.definition,triggerNodeId:start.triggerNodeId,input:start.input,context:start.context,signal:controller.signal,createActivationId:randomUUID,
      onStep:step=>request({type:'step',step},controller.signal),onValue:text=>{if(!controller.signal.aborted)send({type:'value',runId:start!.runId,text});},
      copyText:(value,signal)=>request({type:'copy',...value},signal),
    }).then(result=>send({type:'result',runId:start!.runId,result})).catch(()=>send({type:'result',runId:start!.runId,result:{state:'failed',errorCode:'unavailable',effectOutcome:'unknown',requiresReview:true}}));
    return;
  }
  const parsed=parentMessageSchema.safeParse(event.data);if(!parsed.success||parsed.data.runId!==start.runId){controller.abort();return;}
  const message=parsed.data;
  if(message.type==='cancel'){controller.abort();return;}
  const entry=pending.get(message.requestId);if(!entry){controller.abort();return;}pending.delete(message.requestId);
  if(message.errorCode)entry.reject(new WorkflowRunError(message.errorCode,message.effectOutcome));else entry.resolve();
});
