import { afterEach,expect,it,vi } from 'vitest';
import type { IpcMainInvokeEvent,WebContents } from 'electron';
import { FILE_SEARCH_CHANNELS as C } from '@linuxcast/contracts';
import type { FileSearchResult,FileSearchState } from '@linuxcast/contracts';
import { FILE_SEARCH_URL } from './assets.ts';
import { registerFileSearchIpc } from './file-search-ipc.ts';
import type { FileSearchActions } from './file-search-ipc.ts';
const rootId='11111111-1111-4111-8111-111111111111',generation='22222222-2222-4222-8222-222222222222';
const row:FileSearchResult={id:`${rootId}:sub/space ;$(literal).txt`,rootId,generation,path:'sub/space ;$(literal).txt',kind:'file',size:12,modifiedMs:1};
const request={protocolVersion:1,resultId:row.id,rootId,generation};
afterEach(()=>vi.useRealTimers());
function setup(overrides:Partial<FileSearchActions>={}){
  const frame={url:FILE_SEARCH_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>FILE_SEARCH_URL} as unknown as WebContents;
  const event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
  const state:FileSearchState={revision:1,appearance:'dark',roots:[{id:rootId,name:'Public',displayPath:'/synthetic/Public documents',state:'ready',activity:'paused',generation,progress:null}]};
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const actions:FileSearchActions={contents:()=>contents,isReady:()=>true,getState:vi.fn(async()=>structuredClone(state)),chooseFolder:vi.fn<FileSearchActions['chooseFolder']>(async()=>({ok:true,value:{outcome:'cancelled'}})),startIndex:vi.fn(async()=>{}),pauseIndex:vi.fn(async()=>{}),removeFolder:vi.fn<FileSearchActions['removeFolder']>(async()=>'completed'),search:vi.fn(async input=>({query:input.query,rootId:input.rootId??null,results:input.query.trim()?[structuredClone(row)]:[]})),copyPath:vi.fn<NonNullable<FileSearchActions['copyPath']>>(async()=>'written'),close:vi.fn(),...overrides};
  const registration=registerFileSearchIpc({handle:(key,handler)=>{handlers.set(key,handler);},removeHandler:key=>{handlers.delete(key);}},actions);
  const invoke=(key:string,payload:unknown={protocolVersion:1},sender=event)=>handlers.get(key)!(sender,payload);
  const search=(query='public')=>invoke(C.search,{protocolVersion:1,query});
  return {state,actions,event,frame,registration,invoke,search};
}
it('copies exactly one main-admitted indexed path with literal characters and exact identity',async()=>{
  const f=setup();expect(await f.invoke(C.copyPath,request)).toMatchObject({ok:false,error:{code:'conflict'}});await f.search();
  expect(f.actions.copyPath).not.toHaveBeenCalled();expect(await f.invoke(C.copyPath,request)).toEqual({ok:true,value:{outcome:'copied',resultId:row.id,rootId,generation,path:'/synthetic/Public documents/'+row.path}});
  expect(f.actions.copyPath).toHaveBeenCalledExactlyOnceWith('/synthetic/Public documents/'+row.path);
});
it('rejects arbitrary paths/text, arrays, stale generations, unadmitted IDs and spoofed frames before writing',async()=>{
  const f=setup();await f.search();
  for(const payload of [{...request,path:'/private'},{...request,text:'arbitrary'},[request],{...request,extra:true},{...request,protocolVersion:2}])expect(await f.invoke(C.copyPath,payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  for(const payload of [{...request,resultId:rootId+':other.txt'},{...request,generation:rootId},{...request,rootId:generation}])expect(await f.invoke(C.copyPath,payload)).toMatchObject({ok:false,error:{code:'conflict'}});
  expect(await f.invoke(C.copyPath,request,{sender:f.event.sender,senderFrame:{url:FILE_SEARCH_URL}} as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(f.actions.copyPath).not.toHaveBeenCalled();
});
it('invalidates old search results immediately and prevents a late older query from restoring them',async()=>{
  let resolve!:(value:Awaited<ReturnType<FileSearchActions['search']>>)=>void;
  const f=setup({search:vi.fn<FileSearchActions['search']>().mockImplementationOnce(input=>new Promise(done=>{resolve=()=>done({query:input.query,rootId:null,results:[row]});})).mockImplementation(async input=>({query:input.query,rootId:null,results:[]}))});
  const old=f.search('old');await f.search('new');resolve({query:'old',rootId:null,results:[row]});expect(await old).toMatchObject({ok:false,error:{code:'cancelled'}});expect(await f.invoke(C.copyPath,request)).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.actions.copyPath).not.toHaveBeenCalled();
});
it('rechecks root generation/path/state before native copying and invalidates service/mutation/close state',async()=>{
  for(const change of [(f:ReturnType<typeof setup>)=>{f.state.roots=[];},(f:ReturnType<typeof setup>)=>{f.state.roots[0]!.generation=null;},(f:ReturnType<typeof setup>)=>{f.state.roots[0]!.displayPath='/different';},(f:ReturnType<typeof setup>)=>{f.state.roots[0]!.activity='unavailable';},(f:ReturnType<typeof setup>)=>{f.registration.invalidate();}]){
    const f=setup();await f.search();change(f);expect(await f.invoke(C.copyPath,request)).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.actions.copyPath).not.toHaveBeenCalled();
  }
  const f=setup();await f.search();await f.invoke(C.pause,{protocolVersion:1,rootId});expect(await f.invoke(C.copyPath,request)).toMatchObject({ok:false,error:{code:'conflict'}});await f.search();await f.invoke(C.close);expect(await f.invoke(C.copyPath,request)).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.actions.copyPath).not.toHaveBeenCalled();
});
it('cancels an admitted copy before dispatch when an asynchronous state read crosses invalidation',async()=>{
  const f=setup();await f.search();let finish!:(value:FileSearchState)=>void;vi.mocked(f.actions.getState).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const pending=f.invoke(C.copyPath,request);f.registration.invalidate();finish(f.state);expect(await pending).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.actions.copyPath).not.toHaveBeenCalled();
});
it('distinguishes unsupported/busy before write from unknown native errors and never leaks backend details',async()=>{
  for(const [outcome,code] of [['unsupported','capability-unavailable'],['busy','cancelled']] as const){const f=setup({copyPath:vi.fn<NonNullable<FileSearchActions['copyPath']>>(async()=>outcome)});await f.search();expect(await f.invoke(C.copyPath,request)).toMatchObject({ok:false,error:{code}});}
  const f=setup({copyPath:vi.fn<NonNullable<FileSearchActions['copyPath']>>(async()=>{throw new Error('PRIVATE_SOURCE_SENTINEL');})});await f.search();const reply=await f.invoke(C.copyPath,request);expect(reply).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(JSON.stringify(reply)).not.toContain('PRIVATE_SOURCE_SENTINEL');
});
it('retains unresolved native copies beyond the deadline, keeps Close usable and never replays',async()=>{
  vi.useFakeTimers();let finish!:(value:'written')=>void;const f=setup({copyPath:vi.fn<NonNullable<FileSearchActions['copyPath']>>(()=>new Promise(resolve=>{finish=resolve;}))});await f.search();const pending=f.invoke(C.copyPath,request);await vi.advanceTimersByTimeAsync(4000);expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});
  expect(await f.invoke(C.copyPath,request)).toMatchObject({ok:false,error:{code:'cancelled'}});expect(await f.invoke(C.close)).toMatchObject({ok:true});finish('written');await vi.advanceTimersByTimeAsync(0);expect(f.actions.copyPath).toHaveBeenCalledTimes(1);
});
it('does not claim a confirmed copy after the source query/window context changed during native work',async()=>{
  let finish!:(value:'written')=>void;const f=setup({copyPath:vi.fn<NonNullable<FileSearchActions['copyPath']>>(()=>new Promise(resolve=>{finish=resolve;}))});await f.search();const pending=f.invoke(C.copyPath,request);await vi.waitFor(()=>expect(f.actions.copyPath).toHaveBeenCalledOnce());await f.search('');finish('written');expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});
});
