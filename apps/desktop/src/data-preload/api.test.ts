import { expect, it, vi } from 'vitest';
import { DATA_SETTINGS_CHANNELS } from '@linuxcast/contracts';
import { createDataSettingsApi } from './api.ts';
it('exposes only fixed data actions without any record, credential, path or dispatcher method',async()=>{
  const invoke=vi.fn(async()=>({ok:true,value:{outcome:'cancelled'}})),api=createDataSettingsApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  expect(Object.keys(api).sort()).toEqual(['clearCategory','close','exportCategory','getState','onAppearance','openCredentials']);expect(Object.isFrozen(api)).toBe(true);
  await api.exportCategory('settings');expect(invoke).toHaveBeenLastCalledWith(DATA_SETTINGS_CHANNELS.export,{protocolVersion:1,category:'settings'});
  await api.clearCategory('file-index');expect(invoke).toHaveBeenLastCalledWith(DATA_SETTINGS_CHANNELS.clear,{protocolVersion:1,category:'file-index'});
  await api.exportCategory('tool-diagnostics');expect(invoke).toHaveBeenLastCalledWith(DATA_SETTINGS_CHANNELS.export,{protocolVersion:1,category:'tool-diagnostics'});
  await api.clearCategory('application-logs');expect(invoke).toHaveBeenLastCalledWith(DATA_SETTINGS_CHANNELS.clear,{protocolVersion:1,category:'application-logs'});
  await api.close();expect(invoke).toHaveBeenLastCalledWith(DATA_SETTINGS_CHANNELS.close,{protocolVersion:1});
});
it('rejects malformed or content-bearing responses and suppresses transport exception content',async()=>{
  for(const value of [{ok:true,value:{outcome:'saved',path:'/private-fixture'}},{ok:true,value:{secret:'synthetic'}},null]){
    const api=createDataSettingsApi({invoke:async()=>value,on:vi.fn(),removeListener:vi.fn()});expect(await api.exportCategory('settings')).toMatchObject({ok:false,error:{message:'Local data controls are unavailable.'}});
  }
  const api=createDataSettingsApi({invoke:async()=>{throw new Error('synthetic exception content');},on:vi.fn(),removeListener:vi.fn()});
  expect(await api.getState()).toEqual({ok:false,error:{code:'internal',message:'Local data controls are unavailable.',retryable:false}});
});
