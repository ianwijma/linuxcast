import { afterEach,expect,it,vi } from 'vitest';
import type { IpcMainInvokeEvent,WebContents } from 'electron';
import { FILE_SEARCH_CHANNELS as C } from '@linuxcast/contracts';
import { FILE_SEARCH_URL } from './assets.ts';
import { registerFileSearchIpc } from './file-search-ipc.ts';
import type { FileSearchActions } from './file-search-ipc.ts';
const rootId='11111111-1111-4111-8111-111111111111',generation='22222222-2222-4222-8222-222222222222';
const root={id:rootId,name:'Public folder',displayPath:'/public',state:'ready' as const,activity:'paused' as const,generation,progress:null};
const row={id:rootId+':notes.txt',rootId,generation,path:'notes.txt',kind:'file' as const,size:9,modifiedMs:0};
const identity={resultId:row.id,rootId,generation},state={revision:1,appearance:'dark' as const,roots:[root]};
const disposers:(()=>void)[]=[];
afterEach(()=>{disposers.splice(0).forEach(dispose=>dispose());vi.useRealTimers();});
function fixture(overrides:Partial<FileSearchActions>={}){
 const frame={url:FILE_SEARCH_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>FILE_SEARCH_URL} as unknown as WebContents,event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
 const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
 const actions:FileSearchActions={contents:()=>contents,isReady:()=>true,isVisible:()=>true,getState:vi.fn(async()=>structuredClone(state)),chooseFolder:vi.fn(),startIndex:vi.fn(),pauseIndex:vi.fn(),removeFolder:vi.fn(),search:vi.fn(async request=>({...request,rootId:request.rootId??null,results:[row]})),previewText:vi.fn(async()=>'<script>public</script>\n雪 🐧'),copyText:vi.fn(async()=>'written' as const),close:vi.fn(),...overrides};
 const dispose=registerFileSearchIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},actions);disposers.push(dispose);
 const invoke=(channel:string,payload:unknown={protocolVersion:1},sender=event)=>handlers.get(channel)!(sender,payload);
 const admit=()=>invoke(C.search,{protocolVersion:1,query:'notes',rootId});
 const preview=async()=>{const reply=await invoke(C.previewText,{protocolVersion:1,...identity}) as {ok:true;value:{previewId:string}};expect(reply.ok).toBe(true);expect(reply.value.previewId).toMatch(/^[0-9a-f-]{36}$/u);return {...identity,protocolVersion:1,previewId:reply.value.previewId};};
 return {actions,event,frame,dispose,invoke,admit,preview};
}
const settle=async()=>{for(let n=0;n<8;n++)await Promise.resolve();};
it('copies exactly the issued literal preview text with an opaque token and no new source read',async()=>{
 const f=fixture();await f.admit();const request=await f.preview();expect(f.actions.copyText).not.toHaveBeenCalled();f.actions.previewText=vi.fn(async()=>'changed source');
 for(let n=0;n<2;n++)expect(await f.invoke(C.copyPreviewText,request)).toEqual({ok:true,value:{...identity,previewId:request.previewId,outcome:'copied'}});
 expect(f.actions.copyText).toHaveBeenCalledTimes(2);expect(f.actions.copyText).toHaveBeenLastCalledWith('<script>public</script>\n雪 🐧');expect(f.actions.previewText).not.toHaveBeenCalled();
});
it('allows deliberate empty text copying without treating it as a missing lease',async()=>{const f=fixture({previewText:async()=>''});await f.admit();const q=await f.preview();expect(await f.invoke(C.copyPreviewText,q)).toMatchObject({ok:true});expect(f.actions.copyText).toHaveBeenCalledExactlyOnceWith('');});
it('rejects unissued, forged, wrong root/result/generation tokens and arbitrary content authority',async()=>{
 const f=fixture();await f.admit();expect(await f.invoke(C.copyPreviewText,{protocolVersion:1,...identity,previewId:rootId})).toMatchObject({ok:false,error:{code:'conflict'}});const q=await f.preview();
 for(const bad of [{...q,previewId:rootId},{...q,rootId:generation},{...q,generation:rootId},{...q,resultId:'other'}])expect(await f.invoke(C.copyPreviewText,bad)).toMatchObject({ok:false,error:{code:'conflict'}});
 for(const bad of [{...q,text:'caller text'},{...q,path:'/private'},[q],{...q,previewId:'bad'},{...q,protocolVersion:2}])expect(await f.invoke(C.copyPreviewText,bad)).toMatchObject({ok:false,error:{code:'invalid-request'}});
 expect(await f.invoke(C.copyPreviewText,q,{sender:f.event.sender,senderFrame:{url:FILE_SEARCH_URL}} as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(f.actions.copyText).not.toHaveBeenCalled();
});
it.each(['query','invalidate','close','new-preview','expiry','dispose'] as const)('invalidates issued text on %s',async mode=>{
 vi.useFakeTimers();const f=fixture();await f.admit();const q=await f.preview();if(mode==='query')await f.admit();if(mode==='invalidate')f.dispose.invalidate();if(mode==='close')await f.invoke(C.close);if(mode==='new-preview'){const next=await f.preview();expect(next.previewId).not.toBe(q.previewId);}if(mode==='expiry')await vi.advanceTimersByTimeAsync(300000);
 if(mode==='dispose'){const handler=f.invoke(C.copyPreviewText,q);f.dispose();expect(await handler).toMatchObject({ok:false});}else expect(await f.invoke(C.copyPreviewText,q)).toMatchObject({ok:false});expect(f.actions.copyText).not.toHaveBeenCalled();
});
it.each(['missing','hidden','storage','path','generation','unavailable','state-error'] as const)('refuses %s before clipboard dispatch',async mode=>{
 const f=fixture();await f.admit();const q=await f.preview();const writer=f.actions.copyText;
 if(mode==='missing')delete f.actions.copyText;if(mode==='hidden')f.actions.isVisible=()=>false;if(mode==='storage')f.actions.isReady=()=>false;
 if(['path','generation','unavailable'].includes(mode))f.actions.getState=async()=>({...state,roots:[{...root,...(mode==='path'?{displayPath:'/other'}:mode==='generation'?{generation:rootId}:{activity:'unavailable' as const})}]});
 if(mode==='state-error')f.actions.getState=async()=>{throw Error('SYNTHETIC_PRIVATE');};const reply=await f.invoke(C.copyPreviewText,q);expect(reply).toMatchObject({ok:false});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(writer).not.toHaveBeenCalled();
});
it('cannot begin a new clipboard write after delayed preflight expires or crosses invalidation',async()=>{
 for(const expired of [true,false]){vi.useFakeTimers();const f=fixture();await f.admit();const q=await f.preview();let finish!:(s:typeof state)=>void;f.actions.getState=()=>new Promise(resolve=>{finish=resolve;});const pending=f.invoke(C.copyPreviewText,q);if(expired)await vi.advanceTimersByTimeAsync(4000);else f.dispose.invalidate();finish(state);expect(await pending).toMatchObject({ok:false});await settle();expect(f.actions.copyText).not.toHaveBeenCalled();f.dispose();}
});
it.each(['unsupported','busy','exception'] as const)('keeps %s writer outcomes truthful and strips raw details',async mode=>{
 const copyText=vi.fn<NonNullable<FileSearchActions['copyText']>>(async()=>{if(mode==='exception')throw Error('SYNTHETIC_PRIVATE');return mode;});const f=fixture({copyText});await f.admit();const q=await f.preview();const reply=await f.invoke(C.copyPreviewText,q);expect(reply).toMatchObject({ok:false,error:{code:mode==='unsupported'?'capability-unavailable':mode==='busy'?'cancelled':'deadline-exceeded'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(copyText).toHaveBeenCalledOnce();
});
it('retains shared copy slot after timeout until real write settles and never replays',async()=>{
 vi.useFakeTimers();let finish!:(outcome:'written')=>void;const copyText=vi.fn(()=>new Promise<'written'>(resolve=>{finish=resolve;})),f=fixture({copyText});await f.admit();const q=await f.preview(),pending=f.invoke(C.copyPreviewText,q);await settle();expect(await f.invoke(C.copyPreviewText,q)).toMatchObject({ok:false,error:{code:'cancelled'}});expect(await f.invoke(C.copyPath,{protocolVersion:1,...identity})).toMatchObject({ok:false,error:{code:'cancelled'}});await vi.advanceTimersByTimeAsync(4000);expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(await f.invoke(C.copyPreviewText,q)).toMatchObject({ok:false,error:{code:'cancelled'}});finish('written');await settle();expect(copyText).toHaveBeenCalledOnce();
});
it.each(['hide','invalidate','new-preview'] as const)('reports unknown when %s occurs during a real pending write',async mode=>{
 let finish!:(s:'written')=>void;const f=fixture({copyText:()=>new Promise(resolve=>{finish=resolve;})});await f.admit();const q=await f.preview(),pending=f.invoke(C.copyPreviewText,q);await settle();if(mode==='hide')f.actions.isVisible=()=>false;if(mode==='invalidate')f.dispose.invalidate();if(mode==='new-preview')await f.preview();finish('written');expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});
});
