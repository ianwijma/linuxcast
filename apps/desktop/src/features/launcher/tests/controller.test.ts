import { afterEach,describe,expect,it,vi } from 'vitest';
import { LauncherController } from '../controller.ts';
import type { LauncherApi,LauncherCommandsSnapshot } from '@linuxcast/contracts';
const snapshot:LauncherCommandsSnapshot={revision:1,rankingAvailable:true,commands:[
  {id:'linuxcast:open-local-data',title:'Local data',subtitle:'Manage saved data and privacy',aliases:['data'],keywords:['settings','privacy'],enabled:true,usage:null},
  {id:'linuxcast:hide',title:'Hide Linuxcast',aliases:['hide'],keywords:['dismiss'],enabled:true,usage:null},
  {id:'linuxcast:quit',title:'Quit Linuxcast',aliases:['quit'],keywords:['exit'],enabled:true,usage:null},
]};
const controls:LauncherController[]=[];afterEach(()=>{for(const controller of controls.splice(0))controller.dispose();});
function setup(overrides:Partial<LauncherApi>={}) {
  const saved=structuredClone(snapshot);
  const api:LauncherApi={setLauncherPinned:vi.fn<LauncherApi['setLauncherPinned']>(async request=>{const command=saved.commands.find(value=>value.id===request.commandId)!;command.usage={useCount:0,lastUsedAt:null,alias:null,...command.usage,pinned:request.pinned};return {ok:true,value:structuredClone(saved)};}),getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value:structuredClone(saved)})),executeLauncherCommand:vi.fn<LauncherApi['executeLauncherCommand']>(async()=>({ok:true,value:{outcome:'completed'}})),...overrides};
  const dismiss=vi.fn(async()=>({ok:true as const,value:null}));const controller=new LauncherController(api,dismiss);controls.push(controller);controller.setVisible(true);return {controller,api,dismiss};
}
const settled=()=>new Promise(resolve=>setTimeout(resolve,0));
function invoke(controller:LauncherController,id='linuxcast:open-local-data'){controller.session.select('linuxcast-launcher',id);const frame=controller.session.getSnapshot().frames[0]!;return controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:id,itemId:id});}
function items(controller:LauncherController){const view=controller.session.getSnapshot().frames[0]!.view;if(view.kind!=='list')throw new Error();return view.sections.flatMap(section=>section.items);}
describe('L1-01 launcher presentation controller',()=>{
  it('requests only registered command IDs and the registry revision after explicit invocation',async()=>{
    const f=setup();await settled();expect(items(f.controller)).toHaveLength(3);await invoke(f.controller);expect(f.api.executeLauncherCommand).toHaveBeenCalledExactlyOnceWith({commandId:'linuxcast:open-local-data',revision:1});
  });
  it('never sends query text to IPC, discards old local queries, and gives filtered-empty results',async()=>{
    const f=setup();await settled();f.controller.query('hide');f.controller.query('data');await settled();expect(items(f.controller).map(x=>x.id)).toEqual(['linuxcast:open-local-data']);expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(1);expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();f.controller.query('no matching fixture');await settled();expect(items(f.controller)).toEqual([]);
  });
  it('keeps selected identity when a delayed metadata refresh changes local ranking',async()=>{
    const f=setup();await settled();f.controller.session.select('linuxcast-launcher','linuxcast:quit');const updated=structuredClone(snapshot);updated.revision=2;updated.commands[0]!.usage={pinned:true,useCount:1,lastUsedAt:'2026-10-25T00:00:00Z',alias:null};vi.mocked(f.api.getLauncherCommands).mockResolvedValue({ok:true,value:updated});await f.controller.refresh();expect(f.controller.session.getSnapshot().frames[0]!.selection).toBe('linuxcast:quit');
  });
  it('ignores a stale refresh after a newer registry reply and rejects obsolete action revisions',async()=>{
    let first!:(value:Awaited<ReturnType<LauncherApi['getLauncherCommands']>>)=>void;const f=setup({getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(()=>new Promise(resolve=>{first=resolve;}))});const updated={...snapshot,revision:2};vi.mocked(f.api.getLauncherCommands).mockResolvedValue({ok:true,value:updated});await f.controller.refresh();first({ok:true,value:snapshot});await settled();
    await f.controller.execute({viewId:'linuxcast-launcher',revision:0,actionId:'linuxcast:quit',itemId:'linuxcast:quit'});expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();await invoke(f.controller);expect(f.api.executeLauncherCommand).toHaveBeenCalledWith({commandId:'linuxcast:open-local-data',revision:2});
  });
  it('rejects disabled, unknown and hidden invocations and keeps an actionable disabled reason',async()=>{
    const value=structuredClone(snapshot);value.commands[0]!.enabled=false;value.commands[0]!.unavailableReason='Local data is unavailable. Reopen Linuxcast to try again.';const f=setup({getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value}))});await settled();expect(items(f.controller).find(x=>x.id===value.commands[0]!.id)?.disabledReason).toContain('unavailable');await invoke(f.controller);await invoke(f.controller,'unknown:command');f.controller.setVisible(false);await invoke(f.controller,'linuxcast:quit');expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
  });
  it('blocks duplicate dispatch while pending and never treats a Quit receipt as completed effect UI',async()=>{
    let finish!:(value:Awaited<ReturnType<LauncherApi['executeLauncherCommand']>>)=>void;const f=setup({executeLauncherCommand:vi.fn<LauncherApi['executeLauncherCommand']>(()=>new Promise(resolve=>{finish=resolve;}))});await settled();const pending=invoke(f.controller,'linuxcast:quit');await invoke(f.controller,'linuxcast:quit');expect(f.api.executeLauncherCommand).toHaveBeenCalledTimes(1);finish({ok:true,value:{outcome:'dispatched'}});await pending;expect(f.controller.session.getSnapshot().frames[0]!.view.status).toBeUndefined();
  });
  it('shows fixed safe errors on malformed replies and unknown outcomes without leaking raw rejection text',async()=>{
    const f=setup({executeLauncherCommand:vi.fn<LauncherApi['executeLauncherCommand']>(async()=>{throw new Error('synthetic private error');})});await settled();await invoke(f.controller);expect(f.controller.session.getSnapshot().frames[0]!.view.status).toEqual({kind:'error',message:'The command outcome is unknown. Check its result before trying again.'});
    vi.mocked(f.api.getLauncherCommands).mockResolvedValue({ok:true,value:{...snapshot,commands:[...snapshot.commands,snapshot.commands[0]!]}});await f.controller.refresh();expect(f.controller.session.getSnapshot().frames[0]!.view.status?.kind).toBe('error');
  });
  it('restores the root after Escape and preserves selection if Hide fails',async()=>{
    const f=setup();await settled();f.controller.session.select('linuxcast-launcher','linuxcast:quit');vi.mocked(f.dismiss).mockRejectedValue(new Error('fixture'));f.controller.session.pop();await settled();expect(f.dismiss).toHaveBeenCalledTimes(1);expect(f.controller.session.getSnapshot().frames[0]!.selection).toBe('linuxcast:quit');expect(f.controller.session.getSnapshot().frames[0]!.view.status?.message).toContain('could not hide');
  });
  it('bounds queries and cancels pending load when the launcher hides',async()=>{
    let finish!:(value:Awaited<ReturnType<LauncherApi['getLauncherCommands']>>)=>void;const f=setup({getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(()=>new Promise(resolve=>{finish=resolve;}))});f.controller.setVisible(false);finish({ok:true,value:snapshot});await settled();expect(items(f.controller)).toEqual([]);vi.mocked(f.api.getLauncherCommands).mockResolvedValue({ok:true,value:snapshot});f.controller.setVisible(true);await settled();f.controller.query('x'.repeat(513));expect(items(f.controller)).toEqual([]);expect(f.controller.session.getSnapshot().frames[0]!.view.status?.kind).toBe('warning');
  });
  it('pins and unpins through metadata only while preserving selected ID and primary action across reorder',async()=>{
    const f=setup();await settled();f.controller.session.select('linuxcast-launcher','linuxcast:hide');
    await pin(f.controller,true);expect(f.api.setLauncherPinned).toHaveBeenCalledExactlyOnceWith({commandId:'linuxcast:hide',revision:1,pinned:true});
    expect(items(f.controller)[0]?.id).toBe('linuxcast:hide');expect(items(f.controller)[0]?.accessories?.[0]?.text).toBe('Pinned');
    expect(f.controller.session.getSnapshot().frames[0]).toMatchObject({selection:'linuxcast:hide',primaryAction:'linuxcast:hide'});
    await pin(f.controller,false);expect(items(f.controller)[0]?.id).toBe('linuxcast:open-local-data');expect(items(f.controller).find(value=>value.id==='linuxcast:hide')?.accessories).toBeUndefined();
    expect(f.controller.session.getSnapshot().frames[0]).toMatchObject({selection:'linuxcast:hide',primaryAction:'linuxcast:hide'});expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
  });
  it('waits for confirmed pin metadata and blocks duplicate pin, execute and refresh while pending',async()=>{
    let finish!:(value:Awaited<ReturnType<LauncherApi['setLauncherPinned']>>)=>void;
    const f=setup({setLauncherPinned:vi.fn<LauncherApi['setLauncherPinned']>(()=>new Promise(resolve=>{finish=resolve;}))});await settled();
    const pending=pin(f.controller,true);expect(items(f.controller)[0]?.accessories).toBeUndefined();await pin(f.controller,true);await invoke(f.controller);await f.controller.refresh();
    expect(f.api.setLauncherPinned).toHaveBeenCalledTimes(1);expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(1);
    finish({ok:true,value:pinnedSnapshot('linuxcast:open-local-data',true)});await pending;expect(items(f.controller)[0]?.accessories?.[0]?.text).toBe('Pinned');
  });
  it('disables pin edits with reload remediation when ranking storage is unavailable, while primary still works',async()=>{
    const f=setup({getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value:{...snapshot,rankingAvailable:false}}))});await settled();
    expect(items(f.controller)[0]?.actions?.[1]).toMatchObject({title:'Pin command',disabledReason:'Pinning is unavailable. Reload commands to reconnect to storage.'});await pin(f.controller,true);expect(f.api.setLauncherPinned).not.toHaveBeenCalled();await invoke(f.controller);expect(f.api.executeLauncherCommand).toHaveBeenCalledTimes(1);
  });
  it('requires an explicit reload after an unconfirmed mutation and never automatically replays it',async()=>{
    const f=setup({setLauncherPinned:vi.fn<LauncherApi['setLauncherPinned']>(async()=>{throw new Error('synthetic private error');})});await settled();await pin(f.controller,true);
    expect(items(f.controller)[0]?.accessories).toBeUndefined();expect(f.controller.session.getSnapshot().frames[0]!.view.status).toEqual({kind:'error',message:'The pin change could not be confirmed. Reload commands before trying again.'});
    await pin(f.controller,true);expect(f.api.setLauncherPinned).toHaveBeenCalledTimes(1);
    await invoke(f.controller);expect(f.controller.session.getSnapshot().frames[0]!.view.actions).toContainEqual({id:'launcher:retry',title:'Reload commands',kind:'invoke',effect:'read'});
    expect(items(f.controller)[0]?.actions?.[1]?.disabledReason).toContain('Reload commands');
    vi.mocked(f.api.getLauncherCommands).mockResolvedValue({ok:true,value:pinnedSnapshot('linuxcast:open-local-data',true)});await f.controller.refresh();expect(items(f.controller)[0]?.actions?.[1]).toMatchObject({title:'Unpin command'});expect(f.api.setLauncherPinned).toHaveBeenCalledTimes(1);
  });
  it('ignores a hidden mutation completion after a fresh visible snapshot',async()=>{
    let finish!:(value:Awaited<ReturnType<LauncherApi['setLauncherPinned']>>)=>void;const f=setup({setLauncherPinned:vi.fn<LauncherApi['setLauncherPinned']>(()=>new Promise(resolve=>{finish=resolve;}))});await settled();const pending=pin(f.controller,true);
    f.controller.setVisible(false);await pending;f.controller.setVisible(true);await settled();finish({ok:true,value:pinnedSnapshot('linuxcast:open-local-data',true)});await settled();expect(items(f.controller)[0]?.accessories).toBeUndefined();expect(f.api.setLauncherPinned).toHaveBeenCalledTimes(1);
  });
  it.each(['old-revision','wrong-pin','missing-command'] as const)('rejects %s pin acknowledgements without claiming saved state',async kind=>{
    const start={...snapshot,revision:2};const reply=pinnedSnapshot('linuxcast:open-local-data',kind!=='wrong-pin');reply.revision=kind==='old-revision'?1:2;if(kind==='missing-command')reply.commands=reply.commands.filter(command=>command.id!=='linuxcast:open-local-data');
    const f=setup({getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value:start})),setLauncherPinned:vi.fn<LauncherApi['setLauncherPinned']>(async()=>({ok:true,value:reply}))});await settled();await pin(f.controller,true);
    expect(items(f.controller)[0]?.accessories).toBeUndefined();expect(f.controller.session.getSnapshot().frames[0]!.view.status?.message).toContain('could not be confirmed');expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
  });

});

function pin(controller:LauncherController,pinned:boolean){const frame=controller.session.getSnapshot().frames[0]!;return controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:pinned?'launcher:pin':'launcher:unpin',itemId:frame.selection!});}
function pinnedSnapshot(id:string,pinned:boolean):LauncherCommandsSnapshot{const value=structuredClone(snapshot);const command=value.commands.find(command=>command.id===id)!;command.usage={useCount:4,lastUsedAt:'2026-10-25T00:00:00Z',alias:'fixture-alias',pinned};return value;}
