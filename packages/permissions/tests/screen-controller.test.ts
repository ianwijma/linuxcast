import { expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PermissionScreenController } from '../src/ui/controller.ts';
import type { PermissionSettingsApi,PermissionSettingsState } from '../../platform-contracts/src/permission-settings.ts';
const snapshot=():PermissionSettingsState=>({snapshotId:randomUUID(),appearance:'dark',records:[{selectionId:randomUUID(),sourceKind:'workflow',sourceLabel:'Public workflow',version:'1.0.0',permissionId:'clipboard.write',scopeLabel:'Replace the current clipboard',decision:'allow',updatedAt:'2026-01-01T00:00:00.000Z'}],nextCursor:null});
function fixture() {
  const value=snapshot(),getState=vi.fn(async()=>({ok:true as const,value})),revoke=vi.fn<PermissionSettingsApi['revoke']>(async()=>({ok:true,value:'removed'})),off=vi.fn();
  const api:PermissionSettingsApi={getState,revoke,close:async()=>({ok:true,value:'requested'}),onAppearance:()=>off};
  return {value,getState,revoke,off,controller:new PermissionScreenController(api)};
}
it('waits for a real removal receipt, blocks double submission and keeps the receipt when refresh fails',async()=>{
  const f=fixture();await f.controller.refresh();let finish!:(value:Awaited<ReturnType<PermissionSettingsApi['revoke']>>)=>void;
  f.revoke.mockImplementation(()=>new Promise(done=>{finish=done;}));
  const removing=f.controller.revoke(f.value.records[0]!.selectionId);
  expect(await f.controller.revoke(f.value.records[0]!.selectionId)).toBe(false);
  expect(f.revoke).toHaveBeenCalledTimes(1);expect(f.controller.getSnapshot().removing).toBe(true);
  f.getState.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));finish({ok:true,value:'removed'});
  expect(await removing).toBe(true);expect(f.controller.getSnapshot()).toMatchObject({removing:false,unconfirmed:true});
  expect(f.controller.getSnapshot().message).toContain('Saved decision removed.');
  expect(f.controller.getSnapshot().error).not.toContain('SYNTHETIC_PRIVATE');f.controller.dispose();
});
it('does not turn changed/missing choices into removal successes or replay an uncertain action',async()=>{
  const f=fixture();await f.controller.refresh();
  f.revoke.mockResolvedValueOnce({ok:true,value:'changed'});
  expect(await f.controller.revoke(f.value.records[0]!.selectionId)).toBe(false);
  expect(f.controller.getSnapshot().message).toContain('newer choice was kept');
  f.revoke.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));
  expect(await f.controller.revoke(f.value.records[0]!.selectionId)).toBe(false);
  expect(await f.controller.revoke(f.value.records[0]!.selectionId)).toBe(false);expect(f.revoke).toHaveBeenCalledTimes(2);
  await f.controller.refresh();expect(f.revoke).toHaveBeenCalledTimes(2);f.controller.dispose();
});
it('rejects forged selections, malformed receipts and stale page results after disposal',async()=>{
  const f=fixture();await f.controller.refresh();expect(await f.controller.revoke(randomUUID())).toBe(false);expect(f.revoke).not.toHaveBeenCalled();
  let finish!:(value:{ok:true;value:PermissionSettingsState})=>void;f.getState.mockImplementation(()=>new Promise(done=>{finish=done;}));
  const loading=f.controller.refresh();expect(await f.controller.refresh()).toBe(false);
  f.controller.dispose();finish({ok:true,value:snapshot()});expect(await loading).toBe(false);expect(f.off).toHaveBeenCalledOnce();
});
it('paginates without concatenating or retaining another page selection',async()=>{
  const f=fixture();f.value.nextCursor=randomUUID();await f.controller.refresh();const second=snapshot();f.getState.mockResolvedValueOnce({ok:true,value:second});
  expect(await f.controller.next()).toBe(true);expect(f.getState).toHaveBeenLastCalledWith({afterId:f.value.nextCursor});
  expect(await f.controller.revoke(f.value.records[0]!.selectionId)).toBe(false);
  expect(await f.controller.previous()).toBe(true);expect(f.getState).toHaveBeenLastCalledWith({});f.controller.dispose();
});
