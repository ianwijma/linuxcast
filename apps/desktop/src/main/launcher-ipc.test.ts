import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { LAUNCHER_CHANNELS } from '../../../../packages/contracts/src/launcher.ts';
import { APP_URL } from './assets.ts';
import { registerLauncherIpc } from './launcher-ipc.ts';
import type { LauncherActions } from './launcher-ipc.ts';
function fixture(overrides: Partial<LauncherActions> = {}, localData = true) {
  const frame={url:APP_URL}, contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>APP_URL} as unknown as WebContents;
  const event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const actions={contents:()=>contents,quitting:()=>false,hide:vi.fn(),quit:vi.fn(),openDataSettings:vi.fn(async()=>{}),
    getUsage:vi.fn(async(commandId:string)=>({commandId,useCount:4,lastUsedAt:'2026-10-25T00:00:00.000Z',pinned:false,alias:null})),recordUse:vi.fn(async()=>{}),...overrides};
  const remove=registerLauncherIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},localData ? actions : (({openDataSettings,...rest})=>{void openDataSettings;return rest;})(actions));
  const invoke=(channel:string,payload:unknown={protocolVersion:1},sender=event)=>handlers.get(channel)!(sender,payload);
  const execute=(commandId='linuxcast:open-local-data',revision=1)=>invoke(LAUNCHER_CHANNELS.execute,{protocolVersion:1,commandId,revision});
  return {actions,frame,event,handlers,remove,invoke,execute};
}
describe('trusted launcher registry and action dispatch',()=>{
  it('projects only the three actual fixed commands and allowlisted usage, with no query IPC',async()=>{
    const f=fixture();
    expect([...f.handlers.keys()].sort()).toEqual(Object.values(LAUNCHER_CHANNELS).sort());
    const reply=await f.invoke(LAUNCHER_CHANNELS.getCommands);
    expect(reply).toMatchObject({ok:true,value:{revision:1,rankingAvailable:true,commands:[{id:'linuxcast:open-local-data',usage:{useCount:4}},{id:'linuxcast:hide'},{id:'linuxcast:quit'}]}});
    expect(JSON.stringify(reply)).not.toContain('commandId');
    expect(await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,query:'SYNTHETIC_PRIVATE'})).toMatchObject({ok:false,error:{code:'invalid-request'}});
    f.remove();expect(f.handlers.size).toBe(0);
  });
  it('rejects forged windows/subframes, navigated documents, malformed, stale and arbitrary commands',async()=>{
    const f=fixture();
    for(const sender of [{sender:{},senderFrame:f.frame},{sender:f.event.sender,senderFrame:{url:APP_URL}},{sender:f.event.sender,senderFrame:null}]) {
      expect(await f.invoke(LAUNCHER_CHANNELS.execute,{protocolVersion:1,commandId:'linuxcast:quit',revision:1},sender as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});
    }
    for(const id of ['arbitrary:exec','linuxcast:quit;sh',''])expect(await f.execute(id)).toMatchObject({ok:false,error:{code:'invalid-request'}});
    expect(await f.execute('linuxcast:quit',2)).toMatchObject({ok:false,error:{code:'invalid-request'}});
    f.frame.url='https://example.test';expect(await f.execute()).toMatchObject({ok:false,error:{code:'permission-denied'}});
    expect(f.actions.quit).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
  });
  it('awaits actual opening, rejects duplicate execution, records only successful actions and strips errors',async()=>{
    let finish=()=>{};
    const openDataSettings=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
    const f=fixture({openDataSettings});const first=f.execute();
    expect(await f.execute()).toMatchObject({ok:false,error:{code:'cancelled'}});
    expect(f.actions.recordUse).not.toHaveBeenCalled();finish();
    expect(await first).toEqual({ok:true,value:{outcome:'completed'}});
    expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith('linuxcast:open-local-data');
    openDataSettings.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));
    expect(await f.execute()).toMatchObject({ok:false,error:{code:'internal'}});
    expect(f.actions.recordUse).toHaveBeenCalledTimes(1);
  });
  it('keeps actions usable when ranking is unavailable, awaits hide and returns only a Quit dispatch receipt',async()=>{
    const f=fixture({getUsage:async()=>{throw new Error('SYNTHETIC_PRIVATE');},recordUse:async()=>{throw new Error('SYNTHETIC_PRIVATE');}});
    expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:true,value:{rankingAvailable:false}});
    expect(await f.execute('linuxcast:hide')).toEqual({ok:true,value:{outcome:'completed'}});expect(f.actions.hide).toHaveBeenCalledOnce();
    expect(await f.execute('linuxcast:quit')).toEqual({ok:true,value:{outcome:'dispatched'}});
    expect(await f.execute('linuxcast:quit')).toMatchObject({ok:false,error:{code:'cancelled'}});
    await vi.waitFor(()=>expect(f.actions.quit).toHaveBeenCalledOnce());
  });
  it('reports unavailable commands and rejects execution during shutdown',async()=>{
    const f=fixture({},false);
    expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:true,value:{revision:2,commands:[{enabled:false,unavailableReason:expect.any(String)},{enabled:true},{enabled:true}]}});
    expect(await f.execute('linuxcast:open-local-data',2)).toMatchObject({ok:false,error:{code:'permission-denied'}});
    const stopped=fixture({quitting:()=>true});
    expect(await stopped.execute()).toMatchObject({ok:false,error:{code:'cancelled'}});
  });
});
