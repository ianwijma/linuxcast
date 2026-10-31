import { expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPermissionSettingsApi } from './api.ts';
import { PERMISSION_SETTINGS_CHANNELS,PERMISSION_SETTINGS_APPEARANCE } from '../../../../packages/platform-contracts/src/permission-settings.ts';
it('exposes only fixed permission methods, validates selectors and never forwards event objects',async()=>{
  let listener:((event:unknown,value:unknown)=>void)|undefined;
  const transport={invoke:vi.fn(async()=>({ok:true,value:'removed'})),on:vi.fn((_channel:string,receive:(event:unknown,value:unknown)=>void)=>{listener=receive;}),removeListener:vi.fn()};
  const api=createPermissionSettingsApi(transport);
  expect(Object.keys(api).sort()).toEqual(['close','getState','onAppearance','revoke']);
  await api.revoke({snapshotId:randomUUID(),selectionId:'SYNTHETIC_INVALID'});expect(transport.invoke).not.toHaveBeenCalled();
  const selection={snapshotId:randomUUID(),selectionId:randomUUID()};
  expect(await api.revoke(selection)).toEqual({ok:true,value:'removed'});expect(transport.invoke).toHaveBeenCalledWith(PERMISSION_SETTINGS_CHANNELS.revoke,{protocolVersion:1,...selection});
  await api.revoke({...selection,principal:{kind:'builtin',id:'forged'}} as typeof selection);expect(transport.invoke).toHaveBeenCalledTimes(1);
  const receive=vi.fn(),off=api.onAppearance(receive);listener!({secret:'SYNTHETIC_PRIVATE'},'dark');listener!({},'other');expect(receive).toHaveBeenCalledExactlyOnceWith('dark');
  off();listener!({},'light');expect(receive).toHaveBeenCalledTimes(1);expect(transport.removeListener).toHaveBeenCalledWith(PERMISSION_SETTINGS_APPEARANCE,expect.any(Function));
});
it('rejects wrong reply roots, unexpected fields, oversized pages and raw exception content',async()=>{
  const invoke=vi.fn(async()=>({ok:true,value:{snapshotId:randomUUID(),appearance:'dark',records:[],nextCursor:null,secret:'SYNTHETIC_PRIVATE'}}));
  const api=createPermissionSettingsApi({invoke,on:()=>{},removeListener:()=>{}});
  expect(await api.getState()).toMatchObject({ok:false,error:{code:'unavailable'}});
  invoke.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));
  expect(JSON.stringify(await api.getState())).not.toContain('SYNTHETIC_PRIVATE');
  expect(await api.revoke({snapshotId:randomUUID(),selectionId:randomUUID()})).toMatchObject({ok:false});
});
