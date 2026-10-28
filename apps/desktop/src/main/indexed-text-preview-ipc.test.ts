import { afterEach,expect,it,vi } from 'vitest';
import type { IpcMainInvokeEvent,WebContents } from 'electron';
import { FILE_SEARCH_CHANNELS as C } from '@linuxcast/contracts';
import { FILE_SEARCH_URL } from './assets.ts';
import { registerFileSearchIpc } from './file-search-ipc.ts';
import type { FileSearchActions } from './file-search-ipc.ts';
const rootId='11111111-1111-4111-8111-111111111111',generation='22222222-2222-4222-8222-222222222222';
const root={id:rootId,name:'Public folder',displayPath:'/public',state:'ready' as const,activity:'paused' as const,generation,progress:null};
const row={id:rootId+':notes.txt',rootId,generation,path:'notes.txt',kind:'file' as const,size:9,modifiedMs:0};
const selection={protocolVersion:1,resultId:row.id,rootId,generation};
const state={revision:1,appearance:'dark' as const,roots:[root]};
const disposers:(()=>void)[]=[];
afterEach(()=>{disposers.splice(0).forEach(dispose=>dispose());vi.useRealTimers();});
function fixture(overrides:Partial<FileSearchActions>={}){
  const frame={url:FILE_SEARCH_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>FILE_SEARCH_URL} as unknown as WebContents;
  const event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const actions:FileSearchActions={contents:()=>contents,isReady:()=>true,isVisible:()=>true,getState:vi.fn(async()=>structuredClone(state)),chooseFolder:vi.fn(),startIndex:vi.fn(),pauseIndex:vi.fn(),removeFolder:vi.fn(),search:vi.fn(async request=>({...request,rootId:request.rootId??null,results:[row]})),previewText:vi.fn(async()=>'<script>public</script>'),close:vi.fn(),...overrides};
  const dispose=registerFileSearchIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},actions);disposers.push(dispose);
  const invoke=(channel:string,payload:unknown=selection,sender=event)=>handlers.get(channel)!(sender,payload);
  return {actions,event,frame,dispose,invoke,admit:()=>invoke(C.search,{protocolVersion:1,query:'notes',rootId})};
}
const settle=async()=>{for(let n=0;n<8;n++)await Promise.resolve();};
it('reads only one admitted current identity and returns literal bounded text, with no background read',async()=>{
 const f=fixture();await f.admit();expect(f.actions.previewText).not.toHaveBeenCalled();
 expect(await f.invoke(C.previewText)).toEqual({ok:true,value:{outcome:'previewed',resultId:row.id,rootId,generation,text:'<script>public</script>',previewId:expect.any(String)}});
 expect(f.actions.previewText).toHaveBeenCalledExactlyOnceWith({rootPath:'/public',relativePath:'notes.txt',size:9,modifiedMs:0});
 expect(f.actions.getState).toHaveBeenCalledTimes(3);
});
it.each([{...selection,path:'/private'},[selection],{...selection,rootId:'../x'},{...selection,protocolVersion:2},{...selection,extra:true}])('refuses extra or invalid read authority %j before backend',async payload=>{
 const f=fixture();await f.admit();expect(await f.invoke(C.previewText,payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(f.actions.previewText).not.toHaveBeenCalled();
});
it('rejects no admission, wrong result/root/generation, directory and forged frame',async()=>{
 const f=fixture();expect(await f.invoke(C.previewText)).toMatchObject({ok:false,error:{code:'conflict'}});await f.admit();
 for(const bad of [{...selection,resultId:'other'},{...selection,rootId:generation},{...selection,generation:rootId}])expect(await f.invoke(C.previewText,bad)).toMatchObject({ok:false,error:{code:'conflict'}});
 expect(await f.invoke(C.previewText,selection,{sender:f.event.sender,senderFrame:{url:FILE_SEARCH_URL}} as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});
 const directory=fixture({search:async request=>({...request,rootId,results:[{...row,kind:'directory'}]})});await directory.admit();expect(await directory.invoke(C.previewText)).toMatchObject({ok:false,error:{code:'conflict'}});
 expect(f.actions.previewText).not.toHaveBeenCalled();expect(directory.actions.previewText).not.toHaveBeenCalled();
});
it.each(['missing','hidden','storage','path','generation','unavailable'] as const)('refuses %s capability or changed root before read',async mode=>{
 const f=fixture();await f.admit();
 if(mode==='missing')delete f.actions.previewText;
 if(mode==='hidden')f.actions.isVisible=()=>false;
 if(mode==='storage')f.actions.isReady=()=>false;
 if(['path','generation','unavailable'].includes(mode))f.actions.getState=async()=>({...state,revision:2,roots:[{...root,...(mode==='path'?{displayPath:'/other'}:mode==='generation'?{generation:rootId}:{activity:'unavailable' as const})}]});
 const read=f.actions.previewText;expect(await f.invoke(C.previewText)).toMatchObject({ok:false});if(read)expect(read).not.toHaveBeenCalled();
});
it.each(['query','invalidate','hide','owner','dispose','generation'] as const)('discards late text on %s and does not replay',async mode=>{
 let finish!:(text:string)=>void;const previewText=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve;}));const f=fixture({previewText});await f.admit();const pending=f.invoke(C.previewText);await settle();expect(previewText).toHaveBeenCalledOnce();
 if(mode==='query')await f.admit();if(mode==='invalidate')f.dispose.invalidate();if(mode==='hide')f.actions.isVisible=()=>false;if(mode==='owner')f.actions.contents=()=>undefined;if(mode==='dispose')f.dispose();if(mode==='generation')f.actions.getState=async()=>({...state,revision:2,roots:[{...root,generation:rootId}]});
 finish('LATE_PUBLIC_CONTENT');const reply=await pending;expect(reply).toMatchObject({ok:false});expect(JSON.stringify(reply)).not.toContain('LATE_PUBLIC_CONTENT');expect(previewText).toHaveBeenCalledOnce();
});
it('rechecks context after the final async state read',async()=>{
 let finish!:(s:typeof state)=>void;let reads=0;const f=fixture({getState:async()=>{if(++reads===3)return new Promise(resolve=>{finish=resolve;});return state;}});await f.admit();const pending=f.invoke(C.previewText);await settle();f.dispose.invalidate();finish(state);expect(await pending).toMatchObject({ok:false,error:{code:'conflict'}});
});
it('retains its slot after timeout until the real read settles, while close remains available',async()=>{
 vi.useFakeTimers();let finish!:(s:string)=>void;const previewText=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve;}));const f=fixture({previewText});await f.admit();const pending=f.invoke(C.previewText);await settle();expect(await f.invoke(C.previewText)).toMatchObject({ok:false,error:{code:'cancelled'}});await vi.advanceTimersByTimeAsync(4000);expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(await f.invoke(C.previewText)).toMatchObject({ok:false,error:{code:'cancelled'}});expect(await f.invoke(C.close,{protocolVersion:1})).toMatchObject({ok:true});finish('old');await settle();expect(previewText).toHaveBeenCalledOnce();
});
it.each(['nul','control','huge','surrogate','exception'] as const)('strips invalid %s content or backend details',async mode=>{
 const f=fixture({previewText:async()=>{if(mode==='exception')throw new Error('SYNTHETIC_PRIVATE');return mode==='nul'?'x\0':mode==='control'?'x\u0001':mode==='surrogate'?'\ud800':'é'.repeat(32769);}});await f.admit();const reply=await f.invoke(C.previewText);expect(reply).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');
});
it('accepts empty text and an exact UTF8 byte boundary',async()=>{
 const f=fixture({previewText:async()=>''});await f.admit();expect(await f.invoke(C.previewText)).toMatchObject({ok:true,value:{text:''}});f.actions.previewText=async()=>'é'.repeat(32768);expect(await f.invoke(C.previewText)).toMatchObject({ok:true});
});

it('never begins a source read when initial folder preflight resolves after the receipt deadline',async()=>{
 vi.useFakeTimers();const f=fixture();await f.admit();let finish!:(s:typeof state)=>void;
 f.actions.getState=()=>new Promise(resolve=>{finish=resolve;});const pending=f.invoke(C.previewText);await vi.advanceTimersByTimeAsync(4000);
 expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});finish(state);await settle();expect(f.actions.previewText).not.toHaveBeenCalled();
});
