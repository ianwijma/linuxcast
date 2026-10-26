import { afterEach,expect,it } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StorageOwner } from '../../../../packages/storage/src/owner.ts';
import { createStorageClient } from '@linuxcast/storage';
import { createWorkflowDraft,EDITOR_NODE_TYPES } from '../../../../packages/workflows/src/registry.ts';
import { runTextWorkflow,WorkflowRunError } from '../../../../packages/workflows/src/engine/index.ts';
import { parentMessageSchema } from '../../../../packages/workflows/src/worker-protocol.ts';
import type { WorkflowFork } from '../services/workflow-worker.ts';
import type { WorkflowRunState } from '@linuxcast/contracts';
import { createWorkflowRuns } from './workflow-run.ts';
const owners:StorageOwner[]=[],directories:string[]=[],services:ReturnType<typeof createWorkflowRuns>[]=[];
afterEach(async()=>{for(const service of services.splice(0))await service.terminate();for(const owner of owners.splice(0))await owner.close();for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
const localEngineFork:WorkflowFork=(start,onMessage,onExit)=>{
  const controller=new AbortController();let resolveExit!:()=>void;const exited=new Promise<void>(done=>{resolveExit=done;});let id=0;const pending=new Map<number,{resolve():void;reject(error:Error):void}>();
  const request=(value:object,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{const requestId=++id;const abort=()=>{onMessage({type:'abort-request',runId:start.runId,requestId});pending.delete(requestId);reject(new WorkflowRunError('cancelled','unknown'));};pending.set(requestId,{resolve(){signal.removeEventListener('abort',abort);resolve();},reject(error){signal.removeEventListener('abort',abort);reject(error);}});signal.addEventListener('abort',abort,{once:true});onMessage({...value,runId:start.runId,requestId});});
  queueMicrotask(()=>{void runTextWorkflow({...start,signal:controller.signal,createActivationId:randomUUID,onStep:step=>request({type:'step',step},controller.signal),onValue:text=>onMessage({type:'value',runId:start.runId,text}),copyText:(value,signal)=>request({type:'copy',...value},signal)}).then(result=>onMessage({type:'result',runId:start.runId,result})).finally(()=>{resolveExit();onExit();});});
  return {exited,kill(){controller.abort();resolveExit();},send(value){const data=parentMessageSchema.parse(value);if(data.type==='cancel'){controller.abort();return;}const entry=pending.get(data.requestId);pending.delete(data.requestId);if(data.errorCode)entry?.reject(new WorkflowRunError(data.errorCode,data.effectOutcome));else entry?.resolve();}};
};
async function fixture(timeoutMs?:number,failSecond=false,fork:WorkflowFork=localEngineFork,outcome:'written'|'unsupported'|'busy'='written',name='Public text workflow'){
  const dir=await mkdtemp(join(tmpdir(),'linuxcast-run-host-'));directories.push(dir);const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:'synthetic-run-host'});owners.push(owner);
  let receive:(value:unknown)=>void=()=>{};
  const repository=createStorageClient({onMessage:listener=>{receive=listener;return()=>{};},send(value){const message=value as {kind:string;request:{requestId:string;method:string;params:unknown}};if(message.kind!=='request')return;queueMicrotask(()=>{try{receive({kind:'response',response:{schemaVersion:1,...owner.request(message.request),outcome:'completed'}});}catch{receive({kind:'response',response:{schemaVersion:1,requestId:message.request.requestId,method:message.request.method,outcome:'failed',failure:{code:'invalid-request',message:'Storage request failed.',retryable:false}}});}});}});
  const definition=createWorkflowDraft();definition.name=name;definition.permissions=[{id:'clipboard.write',reason:'Copy explicitly approved text'}];definition.nodes=EDITOR_NODE_TYPES.map((type,i)=>({id:`node-${i}`,type:type.type,typeVersion:1,config:structuredClone(type.config),...(type.type==='output.clipboard'&&timeoutMs?{timeoutMs}:{})}));definition.edges=[{id:'edge-1',from:{nodeId:'node-0',port:'out'},to:{nodeId:'node-1',port:'in'},order:0},{id:'edge-2',from:{nodeId:'node-1',port:'out'},to:{nodeId:'node-2',port:'in'},order:0}];
  if(failSecond){definition.nodes.push({...definition.nodes[2]!,id:'second-copy'});definition.edges.push({id:'edge-3',from:{nodeId:'node-2',port:'out'},to:{nodeId:'second-copy',port:'in'},order:0});}
  await repository.request('workflows.editor.write',{expectedRevision:0,draft:definition,action:'save'});
  let writes=0,text='';const states:WorkflowRunState[]=[];const service=createWorkflowRuns({repository,fork,copyText:async value=>{writes++;if(failSecond&&writes===2)throw new Error('SYNTHETIC_PRIVATE');text=value;return outcome;},ready:()=>true,publish:state=>states.push(state)});services.push(service);
  return {service,repository,states,writes:()=>writes,text:()=>text,definition};
}
async function state(service:ReturnType<typeof createWorkflowRuns>){const reply=await service.get();if(!reply.ok)throw new Error('Unexpected unavailable.');return reply.value;}
it('runs actual engine through broker denial/reset/once, writes only approved transformed text and fences stale cancellation',async()=>{
  const fixtureValue=await fixture(),{service}=fixtureValue;expect(await state(service)).toBeNull();expect(fixtureValue.writes()).toBe(0);
  expect((await service.start({editorRevision:1,triggerNodeId:'node-0',input:'  Public output  '},()=>true)).ok).toBe(true);
  await expect.poll(async()=>(await state(service))?.state).toBe('waiting-ui');const first=(await state(service))!;
  expect(await service.cancel({runId:randomUUID()})).toMatchObject({ok:false,error:{code:'conflict'}});expect((await state(service))?.state).toBe('waiting-ui');
  expect(await service.decide({runId:first.runId,promptId:first.prompt!.id,decision:'deny'})).toMatchObject({ok:true,value:{state:'running'}});
  await expect.poll(async()=>(await state(service))?.state).toBe('failed');expect(fixtureValue.writes()).toBe(0);
  expect((await service.reset({editorRevision:1},()=>true)).ok).toBe(true);
  expect((await service.start({editorRevision:1,triggerNodeId:'node-0',input:'  Public output  '},()=>true)).ok).toBe(true);
  await expect.poll(async()=>(await state(service))?.state).toBe('waiting-ui');const second=(await state(service))!;expect(second.runId).not.toBe(first.runId);
  await service.decide({runId:second.runId,promptId:second.prompt!.id,decision:'once'});
  await expect.poll(async()=>(await state(service))?.state).toBe('succeeded');expect(fixtureValue.writes()).toBe(1);expect(fixtureValue.text()).toBe('Public output');expect(await state(service)).toMatchObject({effectOutcome:'completed',requiresReview:false,output:'Public output'});
  const journal=await fixtureValue.repository.request('workflows.runs.recover',{});expect(JSON.stringify(journal)).not.toContain('Public output');expect(journal?.steps.at(-1)?.state).toBe('completed');
});
it('cancels node-timeout approval immediately, so a late Allow cannot dispatch clipboard work',async()=>{
  const {service,writes}=await fixture(150);await service.start({editorRevision:1,triggerNodeId:'node-0',input:'Public timeout'},()=>true);
  await expect.poll(async()=>(await state(service))?.state,{interval:5}).toBe('waiting-ui');const waiting=(await state(service))!;
  await expect.poll(async()=>(await state(service))?.state,{timeout:3000}).toBe('cancelled');expect(writes()).toBe(0);
  expect(await service.decide({runId:waiting.runId,promptId:waiting.prompt!.id,decision:'once'})).toMatchObject({ok:false,error:{code:'conflict'}});expect(writes()).toBe(0);
});
it('freshly rejects a changed saved revision before permission dispatch and never replays on get',async()=>{
  const {service,repository,definition,writes}=await fixture();await service.start({editorRevision:1,triggerNodeId:'node-0',input:'Public stale'},()=>true);await expect.poll(async()=>(await state(service))?.state).toBe('waiting-ui');const waiting=(await state(service))!;
  await repository.request('workflows.editor.write',{expectedRevision:1,draft:{...definition,name:'New public version'},action:'save'});
  expect((await service.decide({runId:waiting.runId,promptId:waiting.prompt!.id,decision:'once'})).ok).toBe(false);await expect.poll(async()=>(await state(service))?.state).toBe('cancelled');expect(writes()).toBe(0);await state(service);expect(writes()).toBe(0);
});

it('preserves unknown on a second copy after the first copy completed',async()=>{
  const {service,writes,repository}=await fixture(undefined,true);await service.start({editorRevision:1,triggerNodeId:'node-0',input:'Public two copies'},()=>true);
  for(let index=0;index<2;index++){await expect.poll(async()=>(await state(service))?.state).toBe('waiting-ui');const waiting=(await state(service))!;await service.decide({runId:waiting.runId,promptId:waiting.prompt!.id,decision:'once'});}
  await expect.poll(async()=>(await state(service))?.state).toBe('failed');expect(writes()).toBe(2);expect(await state(service)).toMatchObject({effectOutcome:'unknown',requiresReview:true,errorCode:'unknown-outcome'});
  const journal=await repository.request('workflows.runs.recover',{});expect(journal?.steps.filter(step=>step.nodeType==='output.clipboard').map(step=>step.state)).toEqual(['completed','unknown']);
});

it.each([['missing','output.clipboard'],['node-0','output.clipboard'],['node-2','utility.transform']])('rejects worker node %s/type %s before clipboard authority',async(nodeId,nodeType)=>{
  const fork:WorkflowFork=(start,onMessage,onExit)=>{const activationId=randomUUID();queueMicrotask(()=>onMessage({type:'step',runId:start.runId,requestId:1,step:{activationId,nodeId,nodeType,state:'running'}}));return{exited:Promise.resolve(),kill:onExit,send(value){const ack=parentMessageSchema.parse(value);if(ack.type!=='ack')return;if(ack.requestId===1){expect(ack.errorCode).toBeDefined();onMessage({type:'copy',runId:start.runId,requestId:2,activationId,nodeId,text:'Public forged copy'});}else{expect(ack.errorCode).toBeDefined();onMessage({type:'result',runId:start.runId,result:{state:'succeeded',effectOutcome:'completed',requiresReview:false}});}}};};
  const {service,writes}=await fixture(undefined,false,fork);await service.start({editorRevision:1,triggerNodeId:'node-0',input:'Public'},()=>true);await expect.poll(async()=>(await state(service))?.state).toBe('failed');expect(writes()).toBe(0);
});

it('scoped reset cancels pending approval and returns a settled snapshot without starting another run',async()=>{
  const {service,writes}=await fixture();await service.start({editorRevision:1,triggerNodeId:'node-0',input:'Public reset'},()=>true);await expect.poll(async()=>(await state(service))?.state).toBe('waiting-ui');const id=(await state(service))!.runId;
  expect(await service.reset({editorRevision:1},()=>true)).toMatchObject({ok:true,value:{runId:id,state:'cancelled'}});expect(writes()).toBe(0);expect(await state(service)).toMatchObject({runId:id,state:'cancelled'});
});

it.each(['unsupported','busy'] as const)('keeps the known negative %s backend receipt distinct from an unknown write',async outcome=>{
  const {service,repository}=await fixture(undefined,false,localEngineFork,outcome);await service.start({editorRevision:1,triggerNodeId:'node-0',input:'Public unavailable'},()=>true);await expect.poll(async()=>(await state(service))?.state).toBe('waiting-ui');const waiting=(await state(service))!;await service.decide({runId:waiting.runId,promptId:waiting.prompt!.id,decision:'once'});
  await expect.poll(async()=>(await state(service))?.state).toBe('failed');expect(await state(service)).toMatchObject({effectOutcome:'not-dispatched',requiresReview:false,errorCode:'unavailable'});expect((await repository.request('workflows.runs.recover',{}))?.steps.at(-1)?.state).toBe('failed');
});

it.each(['frame','revision'])('does not revoke durable decisions when %s changes during a deferred permission inventory',async change=>{
  const {service,repository,definition}=await fixture();await service.start({editorRevision:1,triggerNodeId:'node-0',input:'Public stale reset'},()=>true);await expect.poll(async()=>(await state(service))?.state).toBe('waiting-ui');const waiting=(await state(service))!;await service.decide({runId:waiting.runId,promptId:waiting.prompt!.id,decision:'deny'});await expect.poll(async()=>(await state(service))?.state).toBe('failed');
  const original=repository.request;let release!:()=>void,listed=false,revokes=0,principalKey='';const gate=new Promise<void>(done=>{release=done;});
  repository.request=(async(...args:Parameters<typeof original>)=>{if(args[0]==='permissions.list'){listed=true;principalKey=(args[1] as {principalKey:string}).principalKey;await gate;}if(args[0]==='permissions.revoke')revokes++;return original(...args);}) as typeof original;
  let trusted=true;const pending=service.reset({editorRevision:1},()=>trusted);await expect.poll(()=>listed).toBe(true);
  if(change==='frame')trusted=false;else await original('workflows.editor.write',{expectedRevision:1,draft:{...definition,name:'Changed public version'},action:'save'});release();
  expect(await pending).toMatchObject({ok:false,error:{code:'conflict'}});expect(revokes).toBe(0);repository.request=original;expect((await repository.request('permissions.list',{principalKey,limit:200})).records).toHaveLength(1);
});

it('runs and recovers valid oversized saved names through a bounded display projection',async()=>{
 const name='😀'.repeat(200),{service,repository,definition,writes}=await fixture(undefined,false,localEngineFork,'written',name);
 expect(definition.name).toBe(name);expect(await service.start({editorRevision:1,triggerNodeId:'node-0',input:'Public oversized name'},()=>true)).toMatchObject({ok:true,value:{workflowName:'😀'.repeat(63)+'…'}});await expect.poll(async()=>(await state(service))?.state).toBe('waiting-ui');const waiting=(await state(service))!;await service.decide({runId:waiting.runId,promptId:waiting.prompt!.id,decision:'once'});await expect.poll(async()=>(await state(service))?.state).toBe('succeeded');expect(writes()).toBe(1);expect((await repository.request('workflows.editor.get',{}))?.saved?.name).toBe(name);
 await service.terminate();const recovered=createWorkflowRuns({repository,fork:localEngineFork,copyText:async()=>{throw new Error('Recovery must not copy');},ready:()=>true,publish:()=>{}});services.push(recovered);expect(await recovered.get()).toMatchObject({ok:true,value:{state:'succeeded',workflowName:'😀'.repeat(63)+'…'}});
});
