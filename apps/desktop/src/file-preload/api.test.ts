import { expect,it,vi } from 'vitest';
import { FILE_SEARCH_CHANNELS as C,FILE_SEARCH_CHANGED } from '@linuxcast/contracts';
import { createFileSearchApi } from './api.ts';
const rootId='11111111-1111-4111-8111-111111111111';
it('exposes only named metadata actions and validates root/query inputs before crossing IPC',async()=>{
  const invoke=vi.fn(async()=>({ok:true,value:{outcome:'completed'}})),api=createFileSearchApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  expect(Object.isFrozen(api)).toBe(true);expect(Object.keys(api).sort()).toEqual(['chooseFolder','close','copyPath','getState','onState','pauseIndex','removeFolder','search','startIndex']);
  await api.chooseFolder();expect(invoke).toHaveBeenLastCalledWith(C.choose,{protocolVersion:1});
  await api.startIndex(rootId);expect(invoke).toHaveBeenLastCalledWith(C.start,{protocolVersion:1,rootId});
  invoke.mockClear();await api.startIndex('/private');await api.search({query:'x'.repeat(513)});await api.search({query:'public',path:'/private'} as never);expect(invoke).not.toHaveBeenCalled();
});
it('rejects malformed/oversized replies and mismatched query identities without leaking exceptions',async()=>{
  for(const reply of [null,{ok:true,value:{outcome:'completed',path:'/private'}},{ok:true,value:{query:'other',rootId:null,results:[]}},{ok:true,value:{query:'x'.repeat(1048577),rootId:null,results:[]}}]){
    const api=createFileSearchApi({invoke:async()=>reply,on:vi.fn(),removeListener:vi.fn()});expect(await api.search({query:'public'})).toMatchObject({ok:false,error:{code:'internal'}});
  }
  const api=createFileSearchApi({invoke:async()=>{throw new Error('SYNTHETIC_PRIVATE');},on:vi.fn(),removeListener:vi.fn()});expect(JSON.stringify(await api.chooseFolder())).not.toContain('SYNTHETIC_PRIVATE');
});
it('delivers only validated state without Electron events and unsubscribes once',()=>{
  let receive:((event:unknown,value:unknown)=>void)|undefined;
  const removeListener=vi.fn(),api=createFileSearchApi({invoke:vi.fn(),on:(_channel,handler)=>{expect(_channel).toBe(FILE_SEARCH_CHANGED);receive=handler;},removeListener});
  const listener=vi.fn(),unsubscribe=api.onState(listener),snapshot={revision:1,appearance:'dark',roots:[]};
  receive!({private:'SYNTHETIC_PRIVATE'},snapshot);expect(listener).toHaveBeenCalledExactlyOnceWith(snapshot);
  receive!({},null);receive!({},{...snapshot,secret:'private'});expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();unsubscribe();receive!({},snapshot);expect(listener).toHaveBeenCalledTimes(1);expect(removeListener).toHaveBeenCalledOnce();
});

it('sends only indexed identity for Copy path and rejects mismatched or malformed copied receipts',async()=>{
  const generation='22222222-2222-4222-8222-222222222222',selection={resultId:rootId+':public.txt',rootId,generation};
  const value={...selection,outcome:'copied',path:'/synthetic/public.txt'},invoke=vi.fn(async()=>({ok:true,value}));const api=createFileSearchApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  expect(await api.copyPath!(selection)).toEqual({ok:true,value});expect(invoke).toHaveBeenCalledExactlyOnceWith(C.copyPath,{...selection,protocolVersion:1});
  invoke.mockClear();await api.copyPath!({...selection,path:'/private'} as never);expect(invoke).not.toHaveBeenCalled();
  for(const reply of [{ok:true,value:{...value,resultId:'other'}},{ok:true,value:{...value,path:'/a/../b'}},{ok:true,value:{...value,rootId:generation}}]){invoke.mockResolvedValueOnce(reply);expect(await api.copyPath!(selection)).toMatchObject({ok:false,error:{code:'internal'}});}
});

it('forwards a validated snapshot of search options and accepts matching filtered replies',async()=>{
  const generation='22222222-2222-4222-8222-222222222222';
  const options={sort:'modified-desc' as const,kind:'file' as const,modifiedFromMs:-10,modifiedBeforeMs:0};
  const expected={...options},row={id:rootId+':public.txt',rootId,generation,path:'public.txt',kind:'file' as const,size:1,modifiedMs:-1};
  let finish!:(value:unknown)=>void;
  const invoke=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));const api=createFileSearchApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  const pending=api.search({query:'public',rootId,options});
  options.modifiedFromMs=-20;options.modifiedBeforeMs=10;
  expect(invoke).toHaveBeenCalledExactlyOnceWith(C.search,{protocolVersion:1,query:'public',rootId,options:expected});
  finish({ok:true,value:{query:'public',rootId,options:expected,results:[row]}});
  expect(await pending).toEqual({ok:true,value:{query:'public',rootId,options:expected,results:[row]}});
});

it('rejects malformed search options before IPC, including invalid modified-time intervals',async()=>{
  const invoke=vi.fn(),api=createFileSearchApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  for(const options of [null,[],{}, {sort:'unknown'}, {sort:'name',kind:'symlink'}, {sort:'name',extra:'private'},
    {sort:'name',modifiedFromMs:0.5}, {sort:'name',modifiedBeforeMs:NaN}, {sort:'name',modifiedBeforeMs:Infinity},
    {sort:'name',modifiedBeforeMs:Number.MAX_SAFE_INTEGER+1}, {sort:'name',modifiedFromMs:0,modifiedBeforeMs:0},
    {sort:'name',modifiedFromMs:1,modifiedBeforeMs:0}]) {
    expect(await api.search({query:'public',options} as never)).toMatchObject({ok:false,error:{code:'internal'}});
  }
  expect(invoke).not.toHaveBeenCalled();
});

it('rejects same-query replies with mismatched echoed options or rows outside the requested filters',async()=>{
  const generation='22222222-2222-4222-8222-222222222222';
  const options={sort:'name' as const,kind:'file' as const,modifiedFromMs:0,modifiedBeforeMs:10};
  const row={id:rootId+':public.txt',rootId,generation,path:'public.txt',kind:'file' as const,size:1,modifiedMs:0};
  const base={query:'public',rootId,options,results:[row]};
  const bad=[{...base,options:undefined},{...base,options:{...options,sort:'size-desc'}},
    {...base,options:{...options,kind:'directory'}},{...base,options:{...options,modifiedFromMs:1}},
    {...base,options:{...options,modifiedBeforeMs:11}},{...base,results:[{...row,kind:'directory'}]},
    {...base,results:[{...row,modifiedMs:-1}]},{...base,results:[{...row,modifiedMs:10}]}];
  const invoke=vi.fn(async()=>({ok:true,value:base} as unknown)),api=createFileSearchApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  expect(await api.search({query:'public',rootId,options})).toEqual({ok:true,value:base});
  for(const value of bad) {invoke.mockResolvedValueOnce({ok:true,value});expect(await api.search({query:'public',rootId,options})).toMatchObject({ok:false,error:{code:'internal'}});}
});

it('treats omitted options and explicit default relevance as equivalent without injecting request options',async()=>{
  const invoke=vi.fn(async()=>({ok:true,value:{query:'public',rootId:null,options:{sort:'relevance'},results:[]}} as unknown));
  const api=createFileSearchApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  expect(await api.search({query:'public'})).toMatchObject({ok:true});expect(invoke).toHaveBeenLastCalledWith(C.search,{protocolVersion:1,query:'public'});
  invoke.mockResolvedValueOnce({ok:true,value:{query:'public',rootId:null,results:[]}});
  expect(await api.search({query:'public',options:{sort:'relevance'}})).toEqual({ok:true,value:{query:'public',rootId:null,results:[]}});
  expect(invoke).toHaveBeenLastCalledWith(C.search,{protocolVersion:1,query:'public',options:{sort:'relevance'}});
});
