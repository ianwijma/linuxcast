import {expect,it,vi} from 'vitest';
import {createCredentialSettingsApi} from './api.ts';
import {CREDENTIAL_SETTINGS_CHANGED} from '../../../../packages/platform-contracts/src/credential-settings.ts';
it('exposes only dedicated fixed-target metadata and write actions with no stored credential read',async()=>{
  const invoke=vi.fn(async()=>({ok:true,value:{outcome:'cancelled'}})),api=createCredentialSettingsApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  expect(Object.isFrozen(api)).toBe(true);expect(Object.keys(api).sort()).toEqual(['close','getState','onChanged','recheck','removeKey','saveKey','setPolicy']);
  await api.saveKey({expectedRevision:4,value:'SYNTHETIC_ENTERED_ONCE',persistence:'session-only'});expect(invoke).toHaveBeenLastCalledWith('credential-settings:save',{protocolVersion:1,expectedRevision:4,value:'SYNTHETIC_ENTERED_ONCE',persistence:'session-only'});
  await api.removeKey({expectedRevision:4});expect(invoke).toHaveBeenLastCalledWith('credential-settings:remove',{protocolVersion:1,expectedRevision:4});
  await api.setPolicy({expectedRevision:5,clearSessionOnLock:true});expect(invoke).toHaveBeenLastCalledWith('credential-settings:policy',{protocolVersion:1,expectedRevision:5,clearSessionOnLock:true});
});
it('rejects injected identities, malformed input and response content without leaking transport errors',async()=>{
  const invoke=vi.fn(async()=>{throw new Error('SYNTHETIC_PRIVATE_ERROR');}),api=createCredentialSettingsApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  expect(await api.saveKey({expectedRevision:0,value:'SYNTHETIC',persistence:'session-only',ownerId:'foreign'} as never)).toEqual({ok:false,error:{code:'invalid-request'}});expect(invoke).not.toHaveBeenCalled();
  expect(await api.getState()).toEqual({ok:false,error:{code:'unavailable'}});expect(await api.recheck()).toEqual({ok:false,error:{code:'unavailable'}});
  const bad=createCredentialSettingsApi({invoke:async()=>({ok:true,value:{outcome:'saved',value:'SYNTHETIC'}}),on:vi.fn(),removeListener:vi.fn()});expect(await bad.close()).toEqual({ok:false,error:{code:'unavailable'}});
});
it('accepts only payload-free change notifications and removes the exact listener',()=>{
  const on=vi.fn(),removeListener=vi.fn(),callback=vi.fn(),api=createCredentialSettingsApi({invoke:async()=>null,on,removeListener});
  const off=api.onChanged(callback),receive=on.mock.calls[0]![1] as (...args:unknown[])=>void;expect(on.mock.calls[0]![0]).toBe(CREDENTIAL_SETTINGS_CHANGED);
  receive({});expect(callback).toHaveBeenCalledTimes(1);receive({},'SYNTHETIC_PRIVATE');expect(callback).toHaveBeenCalledTimes(1);off();receive({});expect(callback).toHaveBeenCalledTimes(1);expect(removeListener).toHaveBeenCalledWith(CREDENTIAL_SETTINGS_CHANGED,receive);
});
