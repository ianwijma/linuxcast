import { expect,it,vi } from 'vitest';
import type { IpcMainInvokeEvent,WebContents } from 'electron';
import { FILE_SEARCH_CHANNELS as C } from '@linuxcast/contracts';
import { FILE_SEARCH_URL } from './assets.ts';
import { registerFileSearchIpc } from './file-search-ipc.ts';
import type { FileSearchActions } from './file-search-ipc.ts';
const rootId='11111111-1111-4111-8111-111111111111';
const snapshot={revision:1,appearance:'dark' as const,roots:[]};
function fixture(overrides:Partial<FileSearchActions>={}){
  const frame={url:FILE_SEARCH_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>FILE_SEARCH_URL} as unknown as WebContents;
  const event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const actions={contents:()=>contents,isReady:()=>true,getState:vi.fn(async()=>snapshot),chooseFolder:vi.fn(async()=>({ok:true as const,value:{outcome:'selected' as const,rootId}})),startIndex:vi.fn(async()=>{}),pauseIndex:vi.fn(async()=>{}),removeFolder:vi.fn(async()=>'completed' as const),search:vi.fn(async(request:{query:string;rootId?:string})=>({...request,rootId:request.rootId??null,results:[]})),close:vi.fn(),...overrides};
  const dispose=registerFileSearchIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},actions);
  const invoke=(channel:string,payload:unknown={protocolVersion:1},sender=event)=>handlers.get(channel)!(sender,payload);
  return {event,frame,actions,handlers,dispose,invoke};
}
it('keeps metadata actions in their own trusted window and rejects paths, forged frames and extra authority',async()=>{
  const f=fixture();expect([...f.handlers.keys()].sort()).toEqual(Object.values(C).sort());
  for(const sender of [{sender:{},senderFrame:f.frame},{sender:f.event.sender,senderFrame:{url:FILE_SEARCH_URL}},{sender:f.event.sender,senderFrame:null}])expect(await f.invoke(C.choose,{protocolVersion:1},sender as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  for(const payload of [{protocolVersion:1,path:'/private'},{protocolVersion:2},{protocolVersion:1,rootId}])expect(await f.invoke(C.choose,payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  for(const payload of [{protocolVersion:1,rootId:'../other'},{protocolVersion:1,rootId,path:'/private'}])expect(await f.invoke(C.start,payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  f.frame.url='linuxcast-app://shell/index.html';expect(await f.invoke(C.state)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  expect(f.actions.chooseFolder).not.toHaveBeenCalled();expect(f.actions.startIndex).not.toHaveBeenCalled();
});
it('returns only native selection, real admission and search receipts, without treating admission as indexing completion',async()=>{
  const f=fixture();expect(await f.invoke(C.choose)).toEqual({ok:true,value:{outcome:'selected',rootId}});
  for(const channel of [C.start,C.pause,C.remove])expect(await f.invoke(channel,{protocolVersion:1,rootId})).toEqual({ok:true,value:{outcome:'completed'}});
  expect(f.actions.startIndex).toHaveBeenCalledExactlyOnceWith(rootId);expect(f.actions.pauseIndex).toHaveBeenCalledExactlyOnceWith(rootId);
  expect(await f.invoke(C.search,{protocolVersion:1,query:'public',rootId})).toEqual({ok:true,value:{query:'public',rootId,results:[]}});
  expect(await f.invoke(C.state)).toEqual({ok:true,value:snapshot});f.dispose();expect(f.handlers.size).toBe(0);
});
it('blocks reads during mutations and invalidates a read admitted before a mutation started',async()=>{
  let finishRead=()=>{},finishWrite=()=>{};
  const f=fixture({getState:()=>new Promise(resolve=>{finishRead=()=>resolve(snapshot);}),startIndex:()=>new Promise(resolve=>{finishWrite=resolve;})});
  const old=f.invoke(C.state),write=f.invoke(C.start,{protocolVersion:1,rootId});
  expect(await f.invoke(C.state)).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(C.search,{protocolVersion:1,query:'public'})).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(C.choose)).toMatchObject({ok:false,error:{code:'cancelled'}});
  finishWrite();await write;finishRead();expect(await old).toMatchObject({ok:false,error:{code:'cancelled'}});
});
it('rejects overfull concurrency, changed query identity and malformed/oversized responses with fixed errors',async()=>{
  const finishes:(()=>void)[]=[];const f=fixture({getState:()=>new Promise(resolve=>{finishes.push(()=>resolve(snapshot));})});
  const pending=Array.from({length:4},()=>f.invoke(C.state));expect(await f.invoke(C.state)).toMatchObject({ok:false,error:{code:'cancelled'}});
  // Dispose invalidates admitted reads even if the original owner later answers.
  f.dispose();finishes.forEach(finish=>finish());for(const reply of await Promise.all(pending))expect(reply).toMatchObject({ok:false,error:{code:'cancelled'}});
  const wrong=fixture({search:async()=>({query:'different',rootId:null,results:[]})});expect(await wrong.invoke(C.search,{protocolVersion:1,query:'public'})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
  for(const getState of [async()=>{throw new Error('SYNTHETIC_PRIVATE');},async()=>({...snapshot,private:'SYNTHETIC_PRIVATE'}),async()=>({...snapshot,roots:['x'.repeat(1048577)]})]){
    const bad=fixture({getState:getState as unknown as FileSearchActions['getState']});const reply=await bad.invoke(C.state);expect(reply).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');
  }
});
it('keeps explicit Close available without storage and strips unconfirmed mutation details',async()=>{
  const f=fixture({isReady:()=>false});expect(await f.invoke(C.state)).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
  expect(await f.invoke(C.close)).toEqual({ok:true,value:{outcome:'completed'}});await vi.waitFor(()=>expect(f.actions.close).toHaveBeenCalledOnce());
  const bad=fixture({startIndex:async()=>{throw new Error('SYNTHETIC_PRIVATE');}});const reply=await bad.invoke(C.start,{protocolVersion:1,rootId});expect(reply).toMatchObject({ok:false,error:{code:'internal'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');
});

it('does not close a replacement owner through a deferred Close from an old window',async()=>{
  let current:WebContents|undefined;const f=fixture({contents:()=>current});current=f.event.sender;
  expect(await f.invoke(C.close)).toEqual({ok:true,value:{outcome:'completed'}});current=undefined;
  await new Promise(resolve=>setImmediate(resolve));expect(f.actions.close).not.toHaveBeenCalled();
});

const generation='22222222-2222-4222-8222-222222222222';
const indexedRoot={id:rootId,name:'Synthetic folder',displayPath:'/synthetic',state:'ready' as const,activity:'paused' as const,generation,progress:null};
const indexedState={...snapshot,roots:[indexedRoot]};
const indexedRow={id:rootId+':public.txt',rootId,generation,path:'public.txt',kind:'file' as const,size:1,modifiedMs:0};
const selection={protocolVersion:1,resultId:indexedRow.id,rootId,generation};

it('forwards provided search options through main and admits only matching metadata',async()=>{
  const options={sort:'size-desc' as const,kind:'file' as const,modifiedFromMs:0,modifiedBeforeMs:10};
  const copyPath=vi.fn(async()=>'written' as const);
  const search=vi.fn(async(request:Parameters<FileSearchActions['search']>[0])=>({...request,rootId:request.rootId??null,results:[indexedRow]}));
  const f=fixture({getState:async()=>indexedState,search,copyPath});
  expect(await f.invoke(C.search,{protocolVersion:1,query:'public',rootId,options})).toEqual({ok:true,value:{query:'public',rootId,options,results:[indexedRow]}});
  expect(search).toHaveBeenCalledExactlyOnceWith({query:'public',rootId,options});
  expect(await f.invoke(C.copyPath,selection)).toMatchObject({ok:true,value:{path:'/synthetic/public.txt'}});
  expect(copyPath).toHaveBeenCalledExactlyOnceWith('/synthetic/public.txt');
});

it('rejects malformed options before invoking the main search action',async()=>{
  const f=fixture();
  for(const options of [null,[],{}, {sort:'unknown'}, {sort:'name',kind:'symlink'}, {sort:'name',extra:'private'},
    {sort:'name',modifiedFromMs:0.5}, {sort:'name',modifiedBeforeMs:Infinity}, {sort:'name',modifiedFromMs:Number.MIN_SAFE_INTEGER-1},
    {sort:'name',modifiedFromMs:0,modifiedBeforeMs:0}, {sort:'name',modifiedFromMs:2,modifiedBeforeMs:1}]) {
    expect(await f.invoke(C.search,{protocolVersion:1,query:'public',options})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  }
  expect(f.actions.search).not.toHaveBeenCalled();expect(f.actions.getState).not.toHaveBeenCalled();
});

it('rejects mismatched echoed options and wrong-kind/date rows without admitting Copy path',async()=>{
  const options={sort:'name' as const,kind:'file' as const,modifiedFromMs:0,modifiedBeforeMs:10};
  const value={query:'public',rootId,options,results:[indexedRow]};
  for(const reply of [{...value,options:undefined},{...value,options:{...options,sort:'modified-desc'}},
    {...value,options:{...options,modifiedFromMs:1}},{...value,options:{...options,modifiedBeforeMs:11}},
    {...value,results:[{...indexedRow,kind:'directory'}]}, {...value,results:[{...indexedRow,modifiedMs:-1}]},
    {...value,results:[{...indexedRow,modifiedMs:10}]}]) {
    const copyPath=vi.fn(async()=>'written' as const);
    const f=fixture({getState:async()=>indexedState,search:(async()=>reply) as FileSearchActions['search'],copyPath});
    expect(await f.invoke(C.search,{protocolVersion:1,query:'public',rootId,options})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
    expect(await f.invoke(C.copyPath,selection)).toMatchObject({ok:false,error:{code:'conflict'}});expect(copyPath).not.toHaveBeenCalled();
  }
});

it('accepts omitted/default relevance equivalence and negative modified bounds',async()=>{
  const copyPath=vi.fn(async()=>'written' as const);
  const search=vi.fn<FileSearchActions['search']>(async request=>({query:request.query,rootId:null,options:{sort:'relevance'},results:[indexedRow]}));
  const f=fixture({getState:async()=>indexedState,search,copyPath});
  expect(await f.invoke(C.search,{protocolVersion:1,query:'public'})).toMatchObject({ok:true});expect(search).toHaveBeenLastCalledWith({query:'public'});
  search.mockResolvedValueOnce({query:'public',rootId:null,results:[indexedRow]});
  expect(await f.invoke(C.search,{protocolVersion:1,query:'public',options:{sort:'relevance'}})).toMatchObject({ok:true});
  expect(await f.invoke(C.copyPath,selection)).toMatchObject({ok:true});
  const options={sort:'modified-desc' as const,modifiedFromMs:-10,modifiedBeforeMs:0};
  search.mockResolvedValueOnce({query:'public',rootId:null,options,results:[{...indexedRow,modifiedMs:-10}]});
  expect(await f.invoke(C.search,{protocolVersion:1,query:'public',options})).toMatchObject({ok:true});
});

it('clears admitted identities when the same query starts with different options and rejects an old echoed page',async()=>{
  let finish!:(value:Awaited<ReturnType<FileSearchActions['search']>>)=>void;
  const oldOptions={sort:'name' as const,kind:'file' as const},newOptions={sort:'size-desc' as const,kind:'directory' as const};
  const oldValue={query:'public',rootId,options:oldOptions,results:[indexedRow]},copyPath=vi.fn(async()=>'written' as const);
  const search=vi.fn<FileSearchActions['search']>().mockResolvedValueOnce(oldValue).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const f=fixture({getState:async()=>indexedState,search,copyPath});
  expect(await f.invoke(C.search,{protocolVersion:1,query:'public',rootId,options:oldOptions})).toMatchObject({ok:true});
  const pending=f.invoke(C.search,{protocolVersion:1,query:'public',rootId,options:newOptions});
  expect(await f.invoke(C.copyPath,selection)).toMatchObject({ok:false,error:{code:'conflict'}});
  finish(oldValue);expect(await pending).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
  expect(await f.invoke(C.copyPath,selection)).toMatchObject({ok:false,error:{code:'conflict'}});expect(copyPath).not.toHaveBeenCalled();
});

it('never lets a late same-query reply with earlier options overwrite the newer admitted page',async()=>{
  let finish!:(value:Awaited<ReturnType<FileSearchActions['search']>>)=>void;
  const oldOptions={sort:'name' as const,kind:'file' as const},newOptions={sort:'size-desc' as const,kind:'directory' as const};
  const directory={...indexedRow,id:rootId+':public-folder',path:'public-folder',kind:'directory' as const};
  const copyPath=vi.fn(async()=>'written' as const);
  const search=vi.fn<FileSearchActions['search']>().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}))
    .mockResolvedValueOnce({query:'public',rootId,options:newOptions,results:[directory]});
  const f=fixture({getState:async()=>indexedState,search,copyPath});
  const old=f.invoke(C.search,{protocolVersion:1,query:'public',rootId,options:oldOptions});
  expect(await f.invoke(C.search,{protocolVersion:1,query:'public',rootId,options:newOptions})).toMatchObject({ok:true});
  finish({query:'public',rootId,options:oldOptions,results:[indexedRow]});expect(await old).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(C.copyPath,selection)).toMatchObject({ok:false,error:{code:'conflict'}});expect(copyPath).not.toHaveBeenCalled();
  expect(await f.invoke(C.copyPath,{...selection,resultId:directory.id})).toMatchObject({ok:true,value:{path:'/synthetic/public-folder'}});
  expect(copyPath).toHaveBeenCalledExactlyOnceWith('/synthetic/public-folder');
});
