import { expect,it,vi } from 'vitest';
import { WORKFLOW_EDITOR_CHANNELS,WORKFLOW_EDITOR_CLOSE_REQUESTED } from '@linuxcast/contracts';
import type { WorkflowEditorWrite } from '@linuxcast/contracts';
import { createWorkflowDraft } from '../../../../packages/workflows/src/registry.ts';
import { createWorkflowEditorApi } from './api.ts';
const input:WorkflowEditorWrite={expectedRevision:0,draft:createWorkflowDraft(),action:'save'},time='2026-10-26T00:00:00.000Z';
const record=()=>({revision:1,draft:createWorkflowDraft(),saved:createWorkflowDraft(),updatedAt:time});
function fixture(value:unknown){const listeners=new Map<string,(_event:unknown,value:unknown)=>void>(),invoke=vi.fn(async()=>value),removeListener=vi.fn((channel:string)=>{listeners.delete(channel);});const api=createWorkflowEditorApi({invoke,on:(channel,listener)=>{listeners.set(channel,listener);},removeListener});return {api,invoke,listeners,removeListener};}
it('exposes frozen named methods and refuses injected execution authority locally',async()=>{
  const f=fixture({ok:true,value:record()});expect(Object.isFrozen(f.api)).toBe(true);expect(Object.keys(f.api).sort()).toEqual(['close','getAppearance','load','onAppearance','onCloseRequested','write']);
  expect(await f.api.write({...input,execute:true} as WorkflowEditorWrite)).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(f.invoke).not.toHaveBeenCalled();
  expect(await f.api.write(input)).toEqual({ok:true,value:record()});expect(f.invoke).toHaveBeenCalledExactlyOnceWith(WORKFLOW_EDITOR_CHANNELS.write,{protocolVersion:1,input});
});
it('rejects stale revision, wrong draft, wrong saved baseline and fabricated success without replay',async()=>{
  for(const value of [{...record(),revision:2},{...record(),draft:{...createWorkflowDraft(),name:'Other'}},{...record(),saved:null},{outcome:'executed'}]){
    const f=fixture({ok:true,value});expect(await f.api.write(input)).toMatchObject({ok:false,error:{code:'unknown-outcome'}});expect(f.invoke).toHaveBeenCalledTimes(1);
  }
});
it('retains known failures but makes thrown or malformed write replies unknown',async()=>{
  const f=fixture({ok:false,error:{code:'conflict',message:'Reload the draft.'}});expect(await f.api.write(input)).toMatchObject({ok:false,error:{code:'conflict'}});
  f.invoke.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));const result=await f.api.write(input);expect(result).toMatchObject({ok:false,error:{code:'unknown-outcome'}});expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE');
});
it('validates native close requests and revokes subscriptions without exposing events',async()=>{
  const f=fixture(null),listener=vi.fn(),off=f.api.onCloseRequested(listener);const receive=f.listeners.get(WORKFLOW_EDITOR_CLOSE_REQUESTED)!;
  receive({sender:'untrusted'},{protocolVersion:2,attemptId:1});receive({}, {protocolVersion:1,attemptId:1,force:true});expect(listener).not.toHaveBeenCalled();
  receive({private:'event'},{protocolVersion:1,attemptId:1});await Promise.resolve();expect(listener).toHaveBeenCalledExactlyOnceWith();off();receive({}, {protocolVersion:1,attemptId:1});expect(listener).toHaveBeenCalledTimes(1);expect(f.removeListener).toHaveBeenCalledTimes(1);
});
it('cannot report successful close from an invalid acknowledgement',async()=>{
  const f=fixture({ok:false,error:{code:'unavailable',message:'Unavailable.'}});await expect(f.api.close()).rejects.toThrow('Workflow window could not close.');
});

it('rejects an inconsistent Revert owner relationship as unknown',async()=>{
  const f=fixture({ok:true,value:{...record(),draft:{...createWorkflowDraft(),name:'Unrelated draft'}}});
  expect(await f.api.write({...input,action:'revert'})).toMatchObject({ok:false,error:{code:'unknown-outcome'}});
});
it('acknowledges the exact close attempt only after the asynchronous flush decision',async()=>{
  const f=fixture({ok:true});let resolve!:(value:boolean)=>void;
  f.api.onCloseRequested(()=>new Promise<boolean>(done=>{resolve=done;}));f.listeners.get(WORKFLOW_EDITOR_CLOSE_REQUESTED)!({}, {protocolVersion:1,attemptId:7});await Promise.resolve();expect(f.invoke).not.toHaveBeenCalled();
  resolve(false);await vi.waitFor(()=>expect(f.invoke).toHaveBeenCalledExactlyOnceWith('workflow-editor:close-finished',{protocolVersion:1,attemptId:7,allowClose:false}));
});
