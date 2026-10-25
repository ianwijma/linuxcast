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
  const api:LauncherApi={getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value:structuredClone(snapshot)})),executeLauncherCommand:vi.fn<LauncherApi['executeLauncherCommand']>(async()=>({ok:true,value:{outcome:'completed'}})),...overrides};
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
});
