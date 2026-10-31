import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { DecisionRecord } from '../../../../packages/permissions/src/types.ts';
import type { PermissionRegistry } from '../../../../packages/permissions/src/registry.ts';
const electron=vi.hoisted(()=>{
  type Handler=(event:unknown,payload:unknown)=>unknown;
  const handlers=new Map<string,Handler>(),listeners=new Map<string,()=>void>();
  const frame={url:'linuxcast-app://shell/permission-settings.html'};
  const contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>frame.url,on:vi.fn(),setWindowOpenHandler:vi.fn(),send:vi.fn()};
  const window={webContents:contents,isDestroyed:()=>false,setMenu:vi.fn(),on:vi.fn((event:string,listener:()=>void)=>{listeners.set(event,listener);}),loadURL:vi.fn(async()=>{}),show:vi.fn(),focus:vi.fn(),close:vi.fn(),destroy:vi.fn(),setBackgroundColor:vi.fn()};
  return {handlers,frame,window,BrowserWindow:vi.fn(function(){return window;}),ipcMain:{handle:(name:string,handler:Handler)=>{handlers.set(name,handler);},removeHandler:(name:string)=>{handlers.delete(name);}},
    nativeTheme:{shouldUseDarkColors:true,on:vi.fn(),off:vi.fn()},screen:{getPrimaryDisplay:()=>({workArea:{width:1280,height:900}})},session:{fromPartition:()=>({})}};
});
vi.mock('electron',()=>electron);
import { createPermissionSettings } from './permission-settings.ts';
const services:ReturnType<typeof createPermissionSettings>[]=[];
beforeEach(()=>{vi.clearAllMocks();electron.handlers.clear();});
afterEach(async()=>{for(const service of services.splice(0))await service.stop();});
function fixture(){
  const record:DecisionRecord={schemaVersion:1,id:randomUUID(),principal:{kind:'builtin',id:'public.source'},declarationHash:'a'.repeat(64),permissionId:'clipboard.write',scope:{kind:'global'},decision:'allow',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
  const registry={inventory:vi.fn(async()=>({records:[record],nextCursor:null})),revoke:vi.fn(async()=> 'removed' as const)};
  const service=createPermissionSettings({resourcesDirectory:'/public-resources',registry:registry as unknown as PermissionRegistry,isReady:()=>true});services.push(service);
  const event={sender:electron.window.webContents,senderFrame:electron.frame};
  const invoke=(channel:string,payload:unknown={protocolVersion:1},sender:unknown=event)=>electron.handlers.get('permission-settings:'+channel)!(sender,payload);
  return {record,registry,service,event,invoke};
}
it('derives removal authority from a current main-owned selection, never caller identity or record payload',async()=>{
  const f=fixture();await f.service.open();
  const state=await f.invoke('list') as {ok:true;value:{snapshotId:string;records:{selectionId:string}[]}};
  expect(state.ok).toBe(true);const input={protocolVersion:1,snapshotId:state.value.snapshotId,selectionId:state.value.records[0]!.selectionId};
  expect(input.selectionId).not.toBe(f.record.id);
  expect(await f.invoke('revoke',{...input,record:f.record})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(f.registry.revoke).not.toHaveBeenCalled();
  expect(await f.invoke('revoke',input)).toEqual({ok:true,value:'removed'});expect(f.registry.revoke).toHaveBeenCalledExactlyOnceWith(f.record);
  expect(await f.invoke('revoke',input)).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.registry.revoke).toHaveBeenCalledTimes(1);
});
it('rejects another window, same-URL child frame, wrong version and arbitrary cursor fields',async()=>{
  const f=fixture();await f.service.open();
  for(const event of [{sender:{},senderFrame:electron.frame},{sender:electron.window.webContents,senderFrame:{url:electron.frame.url}},{sender:electron.window.webContents,senderFrame:null}])
    expect(await f.invoke('list',{protocolVersion:1},event)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  for(const payload of [null,[],{protocolVersion:2},{protocolVersion:1,principalId:'forged'},{protocolVersion:1,afterId:'SYNTHETIC_PRIVATE'}])
    expect(await f.invoke('list',payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(f.registry.inventory).not.toHaveBeenCalled();
});
it('invalidates old snapshots on refresh and returns only fixed failures without replay',async()=>{
  const f=fixture();await f.service.open();
  const first=await f.invoke('list') as {value:{snapshotId:string;records:{selectionId:string}[]}};
  await f.invoke('list');
  expect(await f.invoke('revoke',{protocolVersion:1,snapshotId:first.value.snapshotId,selectionId:first.value.records[0]!.selectionId})).toMatchObject({ok:false,error:{code:'conflict'}});
  f.registry.inventory.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));
  const failure=await f.invoke('list');expect(failure).toMatchObject({ok:false,error:{code:'unavailable'}});
  expect(JSON.stringify(failure)).not.toContain('SYNTHETIC_PRIVATE');expect(f.registry.revoke).not.toHaveBeenCalled();
});
