import { expect,it,vi } from 'vitest';
import { createWorkflowRunApi } from './run-api.ts';
import { WORKFLOW_RUN_CHANNELS,WORKFLOW_RUN_UPDATED } from '../../../../packages/contracts/src/workflow-run.ts';
const runId='00000000-0000-4000-8000-000000000001';
function fixture(value:unknown){const listeners=new Map<string,(_event:unknown,value:unknown)=>void>(),invoke=vi.fn(async()=>value);return{invoke,listeners,api:createWorkflowRunApi({invoke,on:(channel,listener)=>{listeners.set(channel,listener);},removeListener:channel=>{listeners.delete(channel);}})};}
it('exposes only frozen named run methods and rejects injected authority before transport',async()=>{
  const {api,invoke}=fixture({ok:true,value:null});expect(Object.isFrozen(api)).toBe(true);expect(Object.keys(api).sort()).toEqual(['cancelWorkflowRun','decideWorkflowRun','getWorkflowRun','onWorkflowRun','resetWorkflowClipboardPermission','startWorkflowRun']);
  for(const extra of [{principal:{kind:'builtin',id:'host'}},{operationId:'arbitrary'},{textForCopy:'other'},{grants:['clipboard.write']}])expect(await api.startWorkflowRun({editorRevision:1,triggerNodeId:'entry',input:'Public',...extra})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(await api.cancelWorkflowRun({} as {runId:string})).toMatchObject({ok:false});expect(invoke).not.toHaveBeenCalled();await api.cancelWorkflowRun({runId});expect(invoke).toHaveBeenCalledExactlyOnceWith(WORKFLOW_RUN_CHANNELS.cancel,{runId});
});
it('treats malformed/lost mutations as unknown without replay or exposing raw errors',async()=>{
  const {api,invoke}=fixture({outcome:'executed'});expect(await api.startWorkflowRun({editorRevision:1,triggerNodeId:'entry',input:'Public'})).toMatchObject({ok:false,error:{code:'unknown-outcome'}});invoke.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));const reply=await api.cancelWorkflowRun({runId});expect(reply).toMatchObject({ok:false,error:{code:'unknown-outcome'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(invoke).toHaveBeenCalledTimes(2);
});
it('validates snapshots, strips Electron event authority and revokes disposed subscriptions',()=>{
  const {api,listeners}=fixture(null),listener=vi.fn(),off=api.onWorkflowRun(listener),receive=listeners.get(WORKFLOW_RUN_UPDATED)!;
  const state={runId,sequence:1,editorRevision:1,workflowName:'Public workflow',triggerNodeId:'entry',state:'running',steps:[],effectOutcome:'not-dispatched',requiresReview:false};receive({private:'event'},state);expect(listener).toHaveBeenCalledExactlyOnceWith(state);receive({}, {...state,grantIds:['clipboard.write']});receive({}, {...state,effectOutcome:'unknown'});expect(listener).toHaveBeenCalledTimes(1);off();receive({},state);expect(listener).toHaveBeenCalledTimes(1);expect(listeners.size).toBe(0);
});
