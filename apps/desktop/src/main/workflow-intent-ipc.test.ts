import { expect,it,vi } from 'vitest';
import type { IpcMainInvokeEvent,WebContents } from 'electron';
import { registerWorkflowIntentIpc } from './workflow-intent-ipc.ts';
import { createWorkflowIntentApi } from '../workflow-preload/intent-api.ts';
import { WORKFLOW_EDITOR_GET_OPEN_INTENT,WORKFLOW_EDITOR_OPEN_INTENT,workflowEditorOpenIntentSchema } from '../../../../packages/contracts/src/workflow-editor.ts';
import { WORKFLOW_EDITOR_URL } from './assets.ts';
it('exposes a read-only exact-frame navigation intent without any Run authority',()=>{
 const frame={url:WORKFLOW_EDITOR_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>WORKFLOW_EDITOR_URL} as unknown as WebContents,event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent,handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
 const intent={requestId:2,view:'run' as const,editorRevision:3,triggerNodeId:'second'},off=registerWorkflowIntentIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},()=>contents,()=>intent),invoke=handlers.get(WORKFLOW_EDITOR_GET_OPEN_INTENT)!;
 expect([...handlers.keys()]).toEqual([WORKFLOW_EDITOR_GET_OPEN_INTENT]);expect(invoke(event,{protocolVersion:1})).toEqual(intent);
 for(const sender of [{sender:{},senderFrame:frame},{sender:contents,senderFrame:{url:WORKFLOW_EDITOR_URL}},{sender:contents,senderFrame:null}])expect(()=>invoke(sender as IpcMainInvokeEvent,{protocolVersion:1})).toThrow('unavailable');
 for(const extra of [{run:true},{input:'text'},{definition:{}},{grants:['clipboard.write']},{triggerNodeId:'other'}]){expect(()=>invoke(event,{protocolVersion:1,...extra})).toThrow();expect(workflowEditorOpenIntentSchema.safeParse({...intent,...extra}).success).toBe('triggerNodeId' in extra);}
 frame.url='https://example.test';expect(()=>invoke(event,{protocolVersion:1})).toThrow();off();expect(handlers.size).toBe(0);expect(()=>invoke(event,{protocolVersion:1})).toThrow();
});
it('validates intents at preload, strips Electron authority, revokes listeners and sanitizes getter failures',async()=>{
 const value={requestId:2,view:'run' as const,editorRevision:3,triggerNodeId:'second'},invoke=vi.fn(async()=>value),listeners=new Map<string,(_event:unknown,value:unknown)=>void>(),api=createWorkflowIntentApi({invoke,on:(name,listener)=>{listeners.set(name,listener);},removeListener:name=>{listeners.delete(name);}});
 expect(Object.isFrozen(api)).toBe(true);expect(Object.keys(api).sort()).toEqual(['getOpenIntent','onOpenIntent']);expect(await api.getOpenIntent()).toEqual(value);expect(invoke).toHaveBeenCalledExactlyOnceWith(WORKFLOW_EDITOR_GET_OPEN_INTENT,{protocolVersion:1});const listener=vi.fn(),off=api.onOpenIntent(listener),receive=listeners.get(WORKFLOW_EDITOR_OPEN_INTENT)!;receive({private:'event'},value);expect(listener).toHaveBeenCalledExactlyOnceWith(value);receive({}, {...value,run:true});receive({}, {...value,triggerNodeId:'\ud800'});expect(listener).toHaveBeenCalledOnce();off();receive({},value);expect(listener).toHaveBeenCalledOnce();expect(listeners.size).toBe(0);
 invoke.mockRejectedValueOnce(new Error('PRIVATE'));await expect(api.getOpenIntent()).rejects.toThrow('Workflow entry unavailable. Reopen from the launcher.');expect(invoke).toHaveBeenCalledTimes(2);
});
