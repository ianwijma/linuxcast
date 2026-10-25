import { expect,it,vi } from 'vitest';
import { FILE_SEARCH_CHANNELS as C,FILE_SEARCH_CHANGED } from '@linuxcast/contracts';
import { createFileSearchApi } from './api.ts';
const rootId='11111111-1111-4111-8111-111111111111';
it('exposes only named metadata actions and validates root/query inputs before crossing IPC',async()=>{
  const invoke=vi.fn(async()=>({ok:true,value:{outcome:'completed'}})),api=createFileSearchApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  expect(Object.isFrozen(api)).toBe(true);expect(Object.keys(api).sort()).toEqual(['chooseFolder','close','getState','onState','pauseIndex','removeFolder','search','startIndex']);
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
