import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>{
  type Handler=(event:unknown,payload:unknown)=>unknown;
  const handlers=new Map<string,Handler>(),events=new Map<string,()=>void>(),windowEvents=new Map<string,()=>void>(),url='linuxcast-app://shell/credential-settings.html',frame={url};let destroyed=false;
  const contents={mainFrame:frame,isDestroyed:()=>destroyed,getURL:()=>frame.url,on:vi.fn(),setWindowOpenHandler:vi.fn(),send:vi.fn()};
  const window={webContents:contents,isDestroyed:()=>destroyed,setMenu:vi.fn(),on:(name:string,listener:()=>void)=>windowEvents.set(name,listener),loadURL:vi.fn(async()=>{}),show:vi.fn(),focus:vi.fn(),close:vi.fn(),destroy:vi.fn(()=>{destroyed=true;windowEvents.get('closed')?.();}),setBackgroundColor:vi.fn()};
  const state={revision:1,appearance:'dark',provider:'openrouter',session:'locked',storage:'unavailable',sessionOnlyAvailable:false,stored:'none',clearSessionOnLock:false,busy:false};
  const model={onChanged:vi.fn<(listener:()=>void)=>()=>void>(()=>vi.fn()),state:vi.fn(async()=>state),save:vi.fn<(_input:unknown,confirm:(replacing:boolean,signal:AbortSignal)=>Promise<boolean>,signal:AbortSignal)=>Promise<unknown>>(async(_input,confirm,signal)=>({ok:true,value:{outcome:await confirm(true,signal)?'saved':'cancelled'}})),remove:vi.fn(),setPolicy:vi.fn(),recheck:vi.fn(async()=>({ok:true,value:{outcome:'refreshing'}})),close:vi.fn(async()=>{})};
  return {handlers,events,windowEvents,frame,url,window,model,reset(){destroyed=false;frame.url=url;},electron:{BrowserWindow:vi.fn<(options:unknown)=>typeof window>(function(){return window;}),ipcMain:{handle:(channel:string,handler:Handler)=>handlers.set(channel,handler),removeHandler:(channel:string)=>handlers.delete(channel)},nativeTheme:{shouldUseDarkColors:true,on:vi.fn(),off:vi.fn()},powerMonitor:{on:vi.fn((name:string,listener:()=>void)=>events.set(name,listener)),off:vi.fn()},screen:{getPrimaryDisplay:()=>({workArea:{width:1280,height:900}})},session:{fromPartition:()=>({})},dialog:{showMessageBox:vi.fn<(owner:unknown,options:unknown)=>Promise<{response:number;checkboxChecked:boolean}>>(async()=>({response:0,checkboxChecked:false}))}}};
});
vi.mock('electron',()=>fixture.electron);
vi.mock('../../../../packages/secrets/src/settings.ts',()=>({CredentialSettingsService:vi.fn(function(){return fixture.model;})}));
import {createCredentialSettings} from './credential-settings.ts';
import type {CredentialRuntime} from '../../../../packages/secrets/src/runtime.ts';
const services:ReturnType<typeof createCredentialSettings>[]=[];
beforeEach(()=>{vi.clearAllMocks();fixture.handlers.clear();fixture.events.clear();fixture.windowEvents.clear();fixture.reset();fixture.electron.dialog.showMessageBox.mockResolvedValue({response:0,checkboxChecked:false});});
afterEach(async()=>{await Promise.all(services.splice(0).map(service=>service.stop()));});
function setup(){const runtime={suspend:vi.fn(),resume:vi.fn(async()=>({outcome:'observing'})),close:vi.fn(async()=>{})},removeReadiness=vi.fn();const service=createCredentialSettings({resourcesDirectory:'/fixed/resources',runtime:runtime as unknown as CredentialRuntime,preferences:{} as never,references:{} as never,removeReadiness});services.push(service);
 const event={sender:fixture.window.webContents,senderFrame:fixture.frame};return {runtime,removeReadiness,service,event,invoke:(channel:string,payload:unknown,sender:unknown=event)=>fixture.handlers.get('credential-settings:'+channel)!(sender,payload)};}
it('accepts only the dedicated owning window/main frame/exact URL and strict bounded payload',async()=>{
  const f=setup();await f.service.open();
  for(const event of [{sender:{},senderFrame:fixture.frame},{sender:fixture.window.webContents,senderFrame:{url:fixture.url}},{sender:fixture.window.webContents,senderFrame:null}])expect(await f.invoke('state',{protocolVersion:1},event)).toEqual({ok:false,error:{code:'permission-denied'}});
  for(const payload of [null,{protocolVersion:2},{protocolVersion:1,referenceId:'SYNTHETIC'}])expect(await f.invoke('state',payload)).toEqual({ok:false,error:{code:'invalid-request'}});
  fixture.frame.url=fixture.url+'?injected';expect(await f.invoke('state',{protocolVersion:1})).toEqual({ok:false,error:{code:'permission-denied'}});expect(fixture.model.state).not.toHaveBeenCalled();
  expect(fixture.electron.BrowserWindow.mock.calls[0]![0]).toMatchObject({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,preload:'/fixed/resources/credential-preload.cjs'}});
});
it('uses native default-Cancel fixed-target replacement and denies a reply after owner close',async()=>{
  const f=setup();await f.service.open();const input={protocolVersion:1,expectedRevision:1,persistence:'session-only',value:'SYNTHETIC_ENTRY'};
  expect(await f.invoke('save',input)).toEqual({ok:true,value:{outcome:'cancelled'}});
  expect(fixture.electron.dialog.showMessageBox.mock.calls[0]![1]).toMatchObject({defaultId:0,cancelId:0,message:'Replace the OpenRouter key?',signal:expect.any(AbortSignal)});expect(JSON.stringify(fixture.electron.dialog.showMessageBox.mock.calls)).not.toContain('SYNTHETIC_ENTRY');
  fixture.electron.dialog.showMessageBox.mockImplementationOnce(async()=>{fixture.windowEvents.get('closed')?.();return {response:1,checkboxChecked:false};});expect(await f.invoke('save',input)).toEqual({ok:true,value:{outcome:'cancelled'}});
});
it('maps suspend/resume through the observed runtime and drains it before confirming service shutdown',async()=>{
  const f=setup();expect([...fixture.events.keys()].sort()).toEqual(['resume','suspend']);fixture.events.get('suspend')!();expect(f.runtime.suspend).toHaveBeenCalledTimes(1);fixture.events.get('resume')!();expect(f.runtime.resume).toHaveBeenCalledTimes(1);
  const order:string[]=[];let finish!:()=>void;fixture.model.close.mockImplementationOnce(async()=>{order.push('model');await new Promise<void>(resolve=>{finish=resolve;});});f.runtime.close.mockImplementationOnce(async()=>{order.push('runtime');});
  const first=f.service.stop();expect(f.service.stop()).toBe(first);await new Promise(resolve=>setImmediate(resolve));expect(f.runtime.close).toHaveBeenCalledTimes(1);finish();await first;expect(order).toEqual(['model','runtime']);expect(f.removeReadiness).toHaveBeenCalledTimes(1);expect(fixture.handlers.size).toBe(0);
});
it('returns no raw error or unexpected content and publishes payload-free metadata change notifications',async()=>{
  const f=setup();await f.service.open();expect(await f.invoke('state',{protocolVersion:1})).toMatchObject({ok:true,value:{provider:'openrouter',stored:'none'}});
  fixture.model.state.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE_ERROR'));expect(await f.invoke('state',{protocolVersion:1})).toEqual({ok:false,error:{code:'unavailable'}});
  const changed=fixture.model.onChanged.mock.calls[0]![0] as ()=>void;changed();expect(fixture.window.webContents.send).toHaveBeenCalledWith('credential-settings:changed');
});
