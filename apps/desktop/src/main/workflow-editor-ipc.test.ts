import { expect,it,vi } from 'vitest';
import type { IpcMainInvokeEvent,WebContents } from 'electron';
import { WORKFLOW_EDITOR_CHANNELS } from '@linuxcast/contracts';
import type { WorkflowEditorRecord } from '@linuxcast/contracts';
import { createWorkflowDraft } from '../../../../packages/workflows/src/registry.ts';
import { registerWorkflowEditorIpc } from './workflow-editor-ipc.ts';
import { WORKFLOW_EDITOR_URL } from './assets.ts';
const time='2026-10-26T00:00:00.000Z';
const row=():WorkflowEditorRecord=>({revision:1,draft:createWorkflowDraft(),saved:null,updatedAt:time});
function fixture(){
  const frame={url:WORKFLOW_EDITOR_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>frame.url} as unknown as WebContents,event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const actions={contents:()=>contents,active:()=>true,ready:()=>true,appearance:()=> 'dark' as const,close:vi.fn(),load:vi.fn(async()=>null as WorkflowEditorRecord|null),write:vi.fn(async()=>row())};
  const ipc=registerWorkflowEditorIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},actions);
  const invoke=(channel:string,payload:unknown={protocolVersion:1},sender=event)=>Promise.resolve(handlers.get(channel)!(sender,payload));
  return {actions,frame,event,invoke,ipc,handlers};
}
it('denies foreign windows, subframes and navigation before local draft access',async()=>{
  const f=fixture();
  for(const channel of Object.values(WORKFLOW_EDITOR_CHANNELS))for(const event of [{...f.event,sender:{}},{...f.event,senderFrame:{url:WORKFLOW_EDITOR_URL}}])
    expect(await f.invoke(channel,{protocolVersion:1},event as IpcMainInvokeEvent)).toMatchObject({ok:false});
  f.frame.url='https://example.invalid/';expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.load)).toMatchObject({ok:false});
  expect(f.actions.load).not.toHaveBeenCalled();expect(f.actions.write).not.toHaveBeenCalled();expect(f.actions.close).not.toHaveBeenCalled();
  f.ipc.remove();expect(f.handlers.size).toBe(0);
});
it('rejects extras and executable/path/grant authority before persistence',async()=>{
  const f=fixture(),input={expectedRevision:0,draft:createWorkflowDraft(),action:'draft'};
  for(const change of [{protocolVersion:2},{protocolVersion:1,run:true},{protocolVersion:1,path:'/tmp/public'}])expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.load,change)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  for(const extra of [{enabled:true},{grantIds:['clipboard.write']},{action:'run'},{expectedRevision:-1}])expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.write,{protocolVersion:1,input:{...input,...extra}})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(f.actions.write).not.toHaveBeenCalled();
});
it('serializes operations and revalidates the invoking frame after pending owner reads/writes',async()=>{
  const f=fixture();let resolve!:(value:WorkflowEditorRecord|null)=>void;f.actions.load.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const read=f.invoke(WORKFLOW_EDITOR_CHANNELS.load);await vi.waitFor(()=>expect(f.actions.load).toHaveBeenCalled());
  expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.write,{protocolVersion:1,input:{expectedRevision:0,draft:createWorkflowDraft(),action:'draft'}})).toMatchObject({ok:false});
  f.frame.url='https://example.invalid/';resolve(row());expect(await read).toMatchObject({ok:false});expect(f.actions.write).not.toHaveBeenCalled();
});
it('checks exact revision/content receipts and never retries unknown writes',async()=>{
  const f=fixture(),input={expectedRevision:0,draft:createWorkflowDraft(),action:'draft'};
  f.actions.write.mockResolvedValueOnce({...row(),revision:2});expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.write,{protocolVersion:1,input})).toMatchObject({ok:false,error:{code:'unknown-outcome'}});
  f.actions.write.mockResolvedValueOnce({...row(),draft:{...createWorkflowDraft(),name:'Wrong public definition'}});expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.write,{protocolVersion:1,input})).toMatchObject({ok:false,error:{code:'unknown-outcome'}});
  f.actions.write.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));const result=await f.invoke(WORKFLOW_EDITOR_CHANNELS.write,{protocolVersion:1,input});expect(result).toMatchObject({ok:false,error:{code:'unknown-outcome'}});expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE');expect(f.actions.write).toHaveBeenCalledTimes(3);
});
it('allows only explicit named close and returns truthful owner state without execution',async()=>{
  const f=fixture();expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.load)).toEqual({ok:true,value:null});
  const input={expectedRevision:0,draft:createWorkflowDraft(),action:'draft'};expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.write,{protocolVersion:1,input})).toEqual({ok:true,value:row()});
  expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.close)).toEqual({ok:true});await new Promise(resolve=>setImmediate(resolve));expect(f.actions.close).toHaveBeenCalledTimes(1);
  expect(f.actions.write).toHaveBeenCalledExactlyOnceWith(input);
});
it('returns fixed known CAS/validation failures while keeping unknown effects uncertain',async()=>{
  const f=fixture(),input={expectedRevision:0,draft:createWorkflowDraft(),action:'save'};
  for(const code of ['conflict','invalid-request']){f.actions.write.mockRejectedValueOnce({reasonCode:code,message:'SYNTHETIC_PRIVATE'});expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.write,{protocolVersion:1,input})).toEqual(expect.objectContaining({ok:false,error:expect.objectContaining({code})}));}
});

it('does not close a navigated or replacement workspace from a deferred old close request',async()=>{
  const f=fixture();expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.close)).toEqual({ok:true});f.frame.url='https://example.invalid/';
  await new Promise(resolve=>setImmediate(resolve));expect(f.actions.close).not.toHaveBeenCalled();
  f.frame.url=WORKFLOW_EDITOR_URL;expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.close)).toEqual({ok:true});
  f.actions.contents=()=>({mainFrame:{url:WORKFLOW_EDITOR_URL},isDestroyed:()=>false,getURL:()=>WORKFLOW_EDITOR_URL}) as unknown as WebContents;
  await new Promise(resolve=>setImmediate(resolve));expect(f.actions.close).not.toHaveBeenCalled();
});

it('rejects an inconsistent authoritative Revert receipt',async()=>{
  const f=fixture();f.actions.write.mockResolvedValueOnce({...row(),draft:{...createWorkflowDraft(),name:'Wrong reverted draft'}});
  expect(await f.invoke(WORKFLOW_EDITOR_CHANNELS.write,{protocolVersion:1,input:{expectedRevision:0,draft:createWorkflowDraft(),action:'revert'}})).toMatchObject({ok:false,error:{code:'unknown-outcome'}});
});
