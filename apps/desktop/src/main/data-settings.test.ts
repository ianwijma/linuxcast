import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const electron=vi.hoisted(()=>{
  type Handler=(event:unknown,payload:unknown)=>unknown;
  const handlers=new Map<string,Handler>(),frame={url:'linuxcast-app://shell/data-settings.html'};
  const contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>frame.url,on:vi.fn(),setWindowOpenHandler:vi.fn(),send:vi.fn()};
  const window={webContents:contents,isDestroyed:()=>false,setMenu:vi.fn(),on:vi.fn(),loadURL:vi.fn(async()=>{}),show:vi.fn(),focus:vi.fn(),close:vi.fn(),destroy:vi.fn(),setBackgroundColor:vi.fn()};
  return {handlers,frame,window,BrowserWindow:vi.fn(function(){return window;}),ipcMain:{handle:(name:string,handler:Handler)=>handlers.set(name,handler),removeHandler:(name:string)=>handlers.delete(name)},nativeTheme:{shouldUseDarkColors:true,on:vi.fn(),off:vi.fn()},screen:{getPrimaryDisplay:()=>({workArea:{width:1280,height:900}})},session:{fromPartition:()=>({})},dialog:{showSaveDialog:vi.fn(async()=>({canceled:true})),showMessageBox:vi.fn<(_owner:unknown,_options:unknown)=>Promise<{response:number;checkboxChecked:boolean}>>(async()=>({response:0,checkboxChecked:false}))}};
});
vi.mock('electron',()=>electron);
import { createDataSettings } from './data-settings.ts';
const services:ReturnType<typeof createDataSettings>[]=[];
beforeEach(()=>{vi.clearAllMocks();electron.handlers.clear();electron.dialog.showSaveDialog.mockResolvedValue({canceled:true});electron.dialog.showMessageBox.mockResolvedValue({response:0,checkboxChecked:false});});
afterEach(async()=>{for(const service of services.splice(0))await service.stop();});
function fixture(){
  const clearCategory=vi.fn(async()=>{}),exportCategory=vi.fn(async()=>({}));
  const service=createDataSettings({resourcesDirectory:'/public-resources',clearCategory,exportCategory,isReady:()=>true});services.push(service);
  const event={sender:electron.window.webContents,senderFrame:electron.frame};
  const invoke=(action:string,payload:unknown,sender:unknown=event)=>electron.handlers.get('data-settings:'+action)!(sender,payload);
  return {service,invoke,event,clearCategory,exportCategory};
}
it('requires the exact owner frame and closed diagnostic-category payload before opening a dialog',async()=>{
  const f=fixture();await f.service.open();
  for(const sender of [{sender:{},senderFrame:electron.frame},{sender:electron.window.webContents,senderFrame:{url:electron.frame.url}},{sender:electron.window.webContents,senderFrame:null}])expect(await f.invoke('clear',{protocolVersion:1,category:'application-logs'},sender)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  for(const payload of [{protocolVersion:2,category:'application-logs'},{protocolVersion:1,category:'secrets'},{protocolVersion:1,category:'application-logs',path:'/private-canary'},null])expect(await f.invoke('clear',payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(electron.dialog.showMessageBox).not.toHaveBeenCalled();expect(f.clearCategory).not.toHaveBeenCalled();
});
it('keeps categories on Cancel and requires a separate explicit category-specific clear',async()=>{
  const f=fixture();await f.service.open();
  for(const category of ['application-logs','tool-diagnostics']){
    expect(await f.invoke('clear',{protocolVersion:1,category})).toEqual({ok:true,value:{outcome:'cancelled'}});
    expect(f.clearCategory).not.toHaveBeenCalled();
    electron.dialog.showMessageBox.mockResolvedValueOnce({response:1,checkboxChecked:false});
    expect(await f.invoke('clear',{protocolVersion:1,category})).toEqual({ok:true,value:{outcome:'cleared'}});
    expect(f.clearCategory).toHaveBeenLastCalledWith(category,expect.any(AbortSignal));
    expect(electron.dialog.showMessageBox.mock.lastCall?.[1]).toMatchObject({defaultId:0,cancelId:0,detail:expect.stringContaining('other data stay')});
    f.clearCategory.mockClear();
  }
});
it('returns fixed actionable diagnostic failure and never replays or exposes raw exceptions',async()=>{
  const f=fixture();await f.service.open();electron.dialog.showMessageBox.mockResolvedValueOnce({response:1,checkboxChecked:false});
  f.clearCategory.mockRejectedValueOnce(Object.assign(new Error('SYNTHETIC_PRIVATE_CANARY'),{reasonCode:'diagnostics-unavailable'}));
  const result=await f.invoke('clear',{protocolVersion:1,category:'tool-diagnostics'});
  expect(result).toMatchObject({ok:false,error:{message:expect.stringContaining('Clear only this diagnostic category')}});
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE_CANARY');expect(f.clearCategory).toHaveBeenCalledTimes(1);
});

it('opens credential settings only through the owning validated local-data window',async()=>{
  const openCredentials=vi.fn(async()=>{}),service=createDataSettings({resourcesDirectory:'/public-resources',clearCategory:async()=>{},exportCategory:async()=>({}),isReady:()=>true,openCredentials});services.push(service);await service.open();
  const handler=electron.handlers.get('data-settings:credentials')!;expect(await handler({sender:electron.window.webContents,senderFrame:electron.frame},{protocolVersion:1})).toEqual({ok:true,value:{outcome:'opened'}});expect(openCredentials).toHaveBeenCalledTimes(1);
  expect(await handler({sender:{},senderFrame:electron.frame},{protocolVersion:1})).toMatchObject({ok:false});expect(openCredentials).toHaveBeenCalledTimes(1);
});
