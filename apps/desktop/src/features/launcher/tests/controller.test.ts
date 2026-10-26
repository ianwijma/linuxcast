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
  const api:LauncherApi={openLauncherUrl:vi.fn<LauncherApi['openLauncherUrl']>(async()=>({ok:true,value:{outcome:'dispatched'}})),setLauncherAlias:vi.fn<LauncherApi['setLauncherAlias']>(async request=>{const command=saved.commands.find(value=>value.id===request.commandId)!;command.usage={useCount:0,lastUsedAt:null,pinned:false,...command.usage,alias:request.alias};return {ok:true,value:{...structuredClone(saved),commands:[structuredClone(command)],updateOnly:true,nextCursor:null}};}),setLauncherPinned:vi.fn<LauncherApi['setLauncherPinned']>(async request=>{const command=saved.commands.find(value=>value.id===request.commandId)!;command.usage={useCount:0,lastUsedAt:null,alias:null,...command.usage,pinned:request.pinned};return {ok:true,value:structuredClone(saved)};}),getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value:structuredClone(saved)})),executeLauncherCommand:vi.fn<LauncherApi['executeLauncherCommand']>(async()=>({ok:true,value:{outcome:'completed'}})),...overrides};
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
  it('preserves explicit unknown launch outcomes and never automatically retries them',async()=>{
    const f=setup({executeLauncherCommand:vi.fn<LauncherApi['executeLauncherCommand']>(async()=>({ok:false,error:{code:'deadline-exceeded',message:'synthetic private detail',retryable:false}}))});await settled();await invoke(f.controller);expect(f.controller.session.getSnapshot().frames[0]!.view.status?.message).toBe('The command outcome is unknown. Check its result before trying again.');expect(f.api.executeLauncherCommand).toHaveBeenCalledTimes(1);
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

  it('opens application identities and merges a pin update without dropping hidden catalogue pages',async()=>{
    const apps=Array.from({length:110},(_,i)=>({id:`application:${i.toString(16).padStart(64,'0')}`,provider:'applications' as const,title:`Public App ${i}`,aliases:[],keywords:[],enabled:true,usage:null}));const all=[...snapshot.commands,...apps];
    const f=setup({getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async request=>({ok:true,value:{...snapshot,commands:request?.cursor?all.slice(100):all.slice(0,100),nextCursor:request?.cursor?null:'1:100',applicationState:'available'}})),setLauncherPinned:vi.fn<LauncherApi['setLauncherPinned']>(async request=>({ok:true,value:{...snapshot,updateOnly:true,nextCursor:null,commands:[{...all.find(command=>command.id===request.commandId)!,usage:{pinned:request.pinned,useCount:0,lastUsedAt:null,alias:null}}]}}))});
    await settled();f.controller.query('Public App 109');await settled();expect(items(f.controller)[0]?.actions?.[0]?.title).toBe('Open');await invoke(f.controller,apps[109]!.id);expect(f.api.executeLauncherCommand).toHaveBeenCalledWith({commandId:apps[109]!.id,revision:1});await pin(f.controller,true);
    f.controller.query('Public App 108');await settled();expect(items(f.controller).some(item=>item.id===apps[108]!.id)).toBe(true);
  });
  it('ignores a late second page after hiding and reopening with a new catalogue',async()=>{
    let finish!:(value:Awaited<ReturnType<LauncherApi['getLauncherCommands']>>)=>void;const get=vi.fn<LauncherApi['getLauncherCommands']>().mockResolvedValueOnce({ok:true,value:{...snapshot,nextCursor:'1:3'}}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const f=setup({getLauncherCommands:get});await settled();f.controller.setVisible(false);get.mockResolvedValue({ok:true,value:{...snapshot,revision:2}});f.controller.setVisible(true);await settled();finish({ok:true,value:{...snapshot,commands:[],nextCursor:null}});await settled();await invoke(f.controller);expect(f.api.executeLauncherCommand).toHaveBeenCalledWith({commandId:'linuxcast:open-local-data',revision:2});expect(items(f.controller)).toHaveLength(3);
  });
  it('retains a matching selected application across the provider cap on refresh, but releases mismatched or removed identities',async()=>{
    const apps=Array.from({length:21},(_,i)=>({id:`application:${i.toString(16).padStart(64,'0')}`,provider:'applications' as const,title:`Public App ${i}`,aliases:[],keywords:[],enabled:true,usage:null}));const value:LauncherCommandsSnapshot={...snapshot,commands:apps};const f=setup({getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value}))});await settled();const selected=apps[19]!.id;f.controller.session.select('linuxcast-launcher',selected);
    const refreshed=structuredClone(value);refreshed.revision=2;refreshed.commands[20]!.usage={pinned:true,useCount:0,lastUsedAt:null,alias:null};vi.mocked(f.api.getLauncherCommands).mockResolvedValue({ok:true,value:refreshed});await f.controller.refresh();expect(items(f.controller)).toHaveLength(20);expect(items(f.controller).some(item=>item.id===apps[20]!.id)).toBe(true);expect(f.controller.session.getSnapshot().frames[0]!.selection).toBe(selected);
    f.controller.query('Public App 0');await settled();expect(items(f.controller).some(item=>item.id===selected)).toBe(false);expect(f.controller.session.getSnapshot().frames[0]!.selection).not.toBe(selected);
    f.controller.query('');await settled();f.controller.session.select('linuxcast-launcher',apps[0]!.id);refreshed.revision=3;refreshed.commands=refreshed.commands.filter(command=>command.id!==apps[0]!.id);await f.controller.refresh();expect(f.controller.session.getSnapshot().frames[0]!.selection).not.toBe(apps[0]!.id);
  });
  it('keeps the prior complete catalogue when a later refresh page fails',async()=>{
    const f=setup();await settled();const oldIds=items(f.controller).map(value=>value.id);vi.mocked(f.api.getLauncherCommands).mockResolvedValueOnce({ok:true,value:{...snapshot,nextCursor:'1:3'}}).mockRejectedValueOnce(new Error('synthetic page failure'));
    await f.controller.refresh();expect(items(f.controller).map(value=>value.id)).toEqual(oldIds);expect(f.controller.session.getSnapshot().frames[0]!.view.status?.kind).toBe('error');
  });

});

function pin(controller:LauncherController,pinned:boolean){const frame=controller.session.getSnapshot().frames[0]!;return controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:pinned?'launcher:pin':'launcher:unpin',itemId:frame.selection!});}
function pinnedSnapshot(id:string,pinned:boolean):LauncherCommandsSnapshot{const value=structuredClone(snapshot);const command=value.commands.find(command=>command.id===id)!;command.usage={useCount:4,lastUsedAt:'2026-10-25T00:00:00Z',alias:'fixture-alias',pinned};return value;}

function top(controller:LauncherController){return controller.session.getSnapshot().frames.at(-1)!;}
function formAction(controller:LauncherController,actionId:string,alias?:unknown){const frame=top(controller);return controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId,...(alias===undefined?{}:{values:{[actionId==='launcher:submit-url'?'url':'alias']:alias} as never})});}
async function openAlias(controller:LauncherController,id='linuxcast:hide'){controller.session.select('linuxcast-launcher',id);const frame=top(controller);await controller.execute({viewId:frame.view.viewId,revision:frame.view.revision,actionId:'launcher:alias',itemId:id});}
describe('L1-01 search alias editor',()=>{
  it('prefills current alias, saves trimmed metadata, preserves root query/selection/primary and removes with empty value',async()=>{
    const initial=structuredClone(snapshot);initial.commands[1]!.usage={alias:'conceal',pinned:true,useCount:4,lastUsedAt:'2026-10-25T00:00:00Z'};
    const f=setup({getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value:initial})),setLauncherAlias:vi.fn<LauncherApi['setLauncherAlias']>(async request=>({ok:true,value:{...initial,updateOnly:true,commands:[{...initial.commands[1]!,usage:{...initial.commands[1]!.usage!,alias:request.alias}}]}}))});await settled();f.controller.session.setQuery('linuxcast-launcher','hide');f.controller.query('hide');await settled();await openAlias(f.controller);
    expect(top(f.controller).view).toMatchObject({kind:'form',fields:[{value:'conceal'}]});await formAction(f.controller,'launcher:save-alias','  hush  ');
    expect(f.api.setLauncherAlias).toHaveBeenCalledExactlyOnceWith({commandId:'linuxcast:hide',revision:1,alias:'hush'});expect(top(f.controller)).toMatchObject({query:'hide',selection:'linuxcast:hide',primaryAction:'linuxcast:hide'});expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
    f.controller.query('hush');await settled();expect(items(f.controller).map(x=>x.id)).toEqual(['linuxcast:hide']);await openAlias(f.controller);expect(top(f.controller).view).toMatchObject({fields:[{value:'hush'}]});await formAction(f.controller,'launcher:save-alias','   ');expect(f.api.setLauncherAlias).toHaveBeenLastCalledWith({commandId:'linuxcast:hide',revision:1,alias:null});f.controller.query('hush');await settled();expect(items(f.controller)).toEqual([]);
  });
  it('cancel and stack back preserve root identity/query without IPC, and stale root/form actions cannot submit',async()=>{
    const f=setup();await settled();f.controller.session.setQuery('linuxcast-launcher','hide');f.controller.query('hide');await settled();const root=top(f.controller);await openAlias(f.controller);const old=top(f.controller);await f.controller.execute({viewId:root.view.viewId,revision:root.view.revision,actionId:'linuxcast:hide',itemId:'linuxcast:hide'});await formAction(f.controller,'launcher:cancel-alias');
    expect(top(f.controller)).toMatchObject({query:'hide',selection:'linuxcast:hide'});await openAlias(f.controller);await f.controller.execute({viewId:old.view.viewId,revision:old.view.revision,actionId:'launcher:save-alias',values:{alias:'stale'}});f.controller.session.pop();expect(top(f.controller)).toMatchObject({query:'hide',selection:'linuxcast:hide'});expect(f.api.setLauncherAlias).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.dismiss).not.toHaveBeenCalled();
  });
  it.each(['x'.repeat(65),'😀'.repeat(65),'bad\u0007alias',42])('rejects invalid input locally and retains the submitted draft',async draft=>{
    const f=setup();await settled();await openAlias(f.controller);await formAction(f.controller,'launcher:save-alias',draft);expect(top(f.controller).view).toMatchObject({kind:'form',fields:[{error:expect.any(String)}]});expect(f.api.setLauncherAlias).not.toHaveBeenCalled();
  });
  it.each(['conflict','invalid-request','capability-unavailable'] as const)('retains a %s draft with inline safe error and allows a corrected explicit submit',async code=>{
    const f=setup();await settled();vi.mocked(f.api.setLauncherAlias).mockResolvedValueOnce({ok:false,error:{code,message:'synthetic private detail',retryable:false}});await openAlias(f.controller);await formAction(f.controller,'launcher:save-alias','occupied');expect(top(f.controller).view).toMatchObject({kind:'form',fields:[{value:'occupied',error:expect.any(String)}]});expect(JSON.stringify(top(f.controller).view)).not.toContain('synthetic private');await formAction(f.controller,'launcher:save-alias','available');expect(top(f.controller).view.kind).toBe('list');expect(f.api.setLauncherAlias).toHaveBeenCalledTimes(2);
  });
  it('blocks repeat save, primary, pin and refresh while pending without optimistic metadata',async()=>{
    let finish!:(reply:Awaited<ReturnType<LauncherApi['setLauncherAlias']>>)=>void;const f=setup({setLauncherAlias:vi.fn<LauncherApi['setLauncherAlias']>(()=>new Promise(resolve=>{finish=resolve;}))});await settled();await openAlias(f.controller);const pending=formAction(f.controller,'launcher:save-alias','hush');await formAction(f.controller,'launcher:save-alias','duplicate');await invoke(f.controller);await pin(f.controller,true);await f.controller.refresh();expect(f.api.setLauncherAlias).toHaveBeenCalledTimes(1);expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(1);expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.api.setLauncherPinned).not.toHaveBeenCalled();
    finish({ok:true,value:{...snapshot,updateOnly:true,commands:[{...snapshot.commands[1]!,usage:{useCount:0,lastUsedAt:null,pinned:false,alias:'hush'}}]}});await pending;f.controller.query('hush');await settled();expect(items(f.controller)[0]?.id).toBe('linuxcast:hide');
  });
  it('requires explicit Reload after uncertainty and retains it through cancel and successful primary action',async()=>{
    const f=setup({setLauncherAlias:vi.fn<LauncherApi['setLauncherAlias']>(async()=>{throw new Error('synthetic secret');})});await settled();await openAlias(f.controller);await formAction(f.controller,'launcher:save-alias','hush');expect(top(f.controller).view.status?.message).toContain('could not be confirmed');await formAction(f.controller,'launcher:save-alias','again');expect(f.api.setLauncherAlias).toHaveBeenCalledTimes(1);await formAction(f.controller,'launcher:cancel-alias');await invoke(f.controller,'linuxcast:hide');expect(top(f.controller).view.actions).toContainEqual({id:'launcher:retry',title:'Reload commands',kind:'invoke',effect:'read'});await pin(f.controller,true);await openAlias(f.controller);expect(top(f.controller).view.kind).toBe('list');expect(f.api.setLauncherPinned).not.toHaveBeenCalled();await f.controller.refresh();await openAlias(f.controller);expect(top(f.controller).view.kind).toBe('form');
  });
  it.each(['back','cancel','hide','dispose'] as const)('discards a late acknowledgement after %s without replay or publication',async kind=>{
    let finish!:(reply:Awaited<ReturnType<LauncherApi['setLauncherAlias']>>)=>void;const f=setup({setLauncherAlias:vi.fn<LauncherApi['setLauncherAlias']>(()=>new Promise(resolve=>{finish=resolve;}))});await settled();await openAlias(f.controller);const pending=formAction(f.controller,'launcher:save-alias','late');
    if(kind==='back')f.controller.session.pop();if(kind==='cancel')await formAction(f.controller,'launcher:cancel-alias');if(kind==='hide')f.controller.setVisible(false);if(kind==='dispose')f.controller.dispose();
    await pending;const before=f.controller.session.getSnapshot();finish({ok:true,value:{...snapshot,updateOnly:true,commands:[{...snapshot.commands[1]!,usage:{useCount:0,lastUsedAt:null,pinned:false,alias:'late'}}]}});await settled();expect(f.controller.session.getSnapshot()).toBe(before);expect(f.api.setLauncherAlias).toHaveBeenCalledTimes(1);
    if(kind==='back'||kind==='cancel'){expect(top(f.controller).view.actions?.some(value=>value.id==='launcher:retry')).toBe(true);await openAlias(f.controller);expect(top(f.controller).view.kind).toBe('list');}
  });
  it('retains paged applications after an alias acknowledgement and exact-searches the changed app',async()=>{
    const apps=Array.from({length:110},(_,i)=>({id:`application:${i.toString(16).padStart(64,'0')}`,provider:'applications' as const,title:`Public App ${i}`,aliases:[],keywords:[],enabled:true,usage:null}));const all=[...snapshot.commands,...apps];const f=setup({getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async request=>({ok:true,value:{...snapshot,commands:request?.cursor?all.slice(100):all.slice(0,100),nextCursor:request?.cursor?null:'1:100'}})),setLauncherAlias:vi.fn<LauncherApi['setLauncherAlias']>(async request=>({ok:true,value:{...snapshot,updateOnly:true,commands:[{...apps[109]!,usage:{pinned:false,useCount:0,lastUsedAt:null,alias:request.alias}}]}}))});await settled();f.controller.query('Public App 109');await settled();await openAlias(f.controller,apps[109]!.id);await formAction(f.controller,'launcher:save-alias','my app');f.controller.query('my app');await settled();expect(items(f.controller)[0]?.id).toBe(apps[109]!.id);f.controller.query('Public App 108');await settled();expect(items(f.controller)[0]?.id).toBe(apps[108]!.id);
  });
});

it.each(['invalid-request','capability-unavailable'] as const)('L1-01 %s alias failure offers explicit Reload from retained Form without replay',async code=>{
  const f=setup({setLauncherAlias:vi.fn<LauncherApi['setLauncherAlias']>(async()=>({ok:false,error:{code,message:'synthetic private detail',retryable:false}}))});await settled();await openAlias(f.controller);await formAction(f.controller,'launcher:save-alias','retained');expect(top(f.controller).view).toMatchObject({kind:'form',fields:[{value:'retained',error:expect.any(String)}]});expect(top(f.controller).view.actions?.some(action=>action.id==='launcher:retry')).toBe(true);await formAction(f.controller,'launcher:retry');expect(top(f.controller).view.kind).toBe('list');expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(2);expect(f.api.setLauncherAlias).toHaveBeenCalledTimes(1);
});

it.each(['recorded-use','cleared-usage'] as const)('L1-01 alias acknowledgement accepts current owner totals after %s without a refresh',async mode=>{
  const owner=structuredClone(snapshot),command=owner.commands[0]!;
  command.usage={useCount:4,lastUsedAt:'2026-10-25T00:00:00Z',pinned:true,alias:null};
  const f=setup({
    getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value:structuredClone(owner)})),
    executeLauncherCommand:vi.fn<LauncherApi['executeLauncherCommand']>(async()=>{
      command.usage!.useCount++;command.usage!.lastUsedAt='2026-10-25T01:00:00Z';
      return {ok:true,value:{outcome:'completed'}};
    }),
    setLauncherAlias:vi.fn<LauncherApi['setLauncherAlias']>(async request=>{
      command.usage!.alias=request.alias;
      return {ok:true,value:{...structuredClone(owner),updateOnly:true,commands:[structuredClone(command)]}};
    }),
  });
  await settled();
  if(mode==='recorded-use')await invoke(f.controller,'linuxcast:open-local-data');
  else {command.usage!.useCount=0;command.usage!.lastUsedAt=null;}
  await openAlias(f.controller,'linuxcast:open-local-data');await formAction(f.controller,'launcher:save-alias','my-data');
  expect(top(f.controller).view.kind).toBe('list');expect(top(f.controller).view.status).toBeUndefined();
  f.controller.query('my-data');await settled();expect(items(f.controller)).toMatchObject([{id:'linuxcast:open-local-data',accessories:[{text:'Pinned'}]}]);
  expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(1);expect(f.api.setLauncherAlias).toHaveBeenCalledExactlyOnceWith({commandId:'linuxcast:open-local-data',revision:1,alias:'my-data'});
  expect(f.api.executeLauncherCommand).toHaveBeenCalledTimes(mode==='recorded-use'?1:0);expect(command.usage).toEqual({useCount:mode==='recorded-use'?5:0,lastUsedAt:mode==='recorded-use'?'2026-10-25T01:00:00Z':null,pinned:true,alias:'my-data'});
});

const urlSnapshot:LauncherCommandsSnapshot={...snapshot,commands:[...snapshot.commands,{id:'linuxcast:open-url',title:'Open URL',aliases:['url'],keywords:['browser'],enabled:true,usage:null}]};
function setupUrl(overrides:Partial<LauncherApi>={}){
  const saved=structuredClone(urlSnapshot);
  const update=(id:string)=>saved.commands.find(command=>command.id===id)!;
  return setup({
    getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async()=>({ok:true,value:structuredClone(saved)})),
    setLauncherPinned:vi.fn<LauncherApi['setLauncherPinned']>(async request=>{const command=update(request.commandId);command.usage={useCount:0,lastUsedAt:null,alias:null,...command.usage,pinned:request.pinned};return {ok:true,value:{...structuredClone(saved),updateOnly:true,commands:[structuredClone(command)]}};}),
    setLauncherAlias:vi.fn<LauncherApi['setLauncherAlias']>(async request=>{const command=update(request.commandId);command.usage={useCount:0,lastUsedAt:null,pinned:false,...command.usage,alias:request.alias};return {ok:true,value:{...structuredClone(saved),updateOnly:true,commands:[structuredClone(command)]}};}),
    ...overrides,
  });
}
describe('L1-02 explicit Open URL form',()=>{
  it('matches a valid root URL locally, visibly prefills canonical address and only dispatches on explicit form submit',async()=>{
    const f=setupUrl();await settled();const query='HTTPS://例え.example:443/public';f.controller.session.setQuery('linuxcast-launcher',query);f.controller.query(query);await settled();expect(items(f.controller).map(x=>x.id)).toEqual(['linuxcast:open-url']);await invoke(f.controller,'linuxcast:open-url');expect(top(f.controller).view).toMatchObject({kind:'form',title:'Open URL',fields:[{title:'URL',value:'https://xn--r8jz45g.example/public'}]});expect(f.api.openLauncherUrl).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
    await formAction(f.controller,'launcher:submit-url','https://xn--r8jz45g.example/public');expect(f.api.openLauncherUrl).toHaveBeenCalledExactlyOnceWith({revision:1,url:'https://xn--r8jz45g.example/public'});expect(top(f.controller)).toMatchObject({query,selection:'linuxcast:open-url',primaryAction:'linuxcast:open-url'});expect(top(f.controller).view.status).toBeUndefined();expect(f.dismiss).toHaveBeenCalledTimes(1);expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
  });
  it.each(['javascript:alert(1)','file:///tmp/public','example.org','https://user:password@example.org','https://@example.org','https://example.org/white space','https://example.org/\\path','https://example.org/\ud800'])('keeps invalid URL %j as an editable draft without IPC',async url=>{
    const f=setupUrl();await settled();await invoke(f.controller,'linuxcast:open-url');await formAction(f.controller,'launcher:submit-url',url);expect(top(f.controller).view).toMatchObject({kind:'form',fields:[{value:url,error:expect.any(String)}]});expect(f.api.openLauncherUrl).not.toHaveBeenCalled();expect(f.dismiss).not.toHaveBeenCalled();
  });
  it('reaches an empty form by command name and cancels/back without dispatch while preserving root state',async()=>{
    const f=setupUrl();await settled();f.controller.session.setQuery('linuxcast-launcher','Open URL');f.controller.query('Open URL');await settled();await invoke(f.controller,'linuxcast:open-url');expect(top(f.controller).view).toMatchObject({fields:[{value:''}]});await formAction(f.controller,'launcher:cancel-url');expect(top(f.controller)).toMatchObject({query:'Open URL',selection:'linuxcast:open-url'});await invoke(f.controller,'linuxcast:open-url');f.controller.session.pop();expect(f.api.openLauncherUrl).not.toHaveBeenCalled();expect(f.dismiss).not.toHaveBeenCalled();
  });
  it('blocks duplicate submission, root execution/pins and refresh while browser handoff is pending',async()=>{
    let finish!:(reply:Awaited<ReturnType<LauncherApi['openLauncherUrl']>>)=>void;const f=setupUrl({openLauncherUrl:vi.fn<LauncherApi['openLauncherUrl']>(()=>new Promise(resolve=>{finish=resolve;}))});await settled();await invoke(f.controller,'linuxcast:open-url');const pending=formAction(f.controller,'launcher:submit-url','https://example.org/');await formAction(f.controller,'launcher:submit-url','https://example.org/duplicate');await invoke(f.controller);await pin(f.controller,true);await f.controller.refresh();expect(top(f.controller).view).toMatchObject({loading:true});expect(f.api.openLauncherUrl).toHaveBeenCalledTimes(1);expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.api.setLauncherPinned).not.toHaveBeenCalled();expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(1);finish({ok:true,value:{outcome:'dispatched'}});await pending;
  });
  it.each(['invalid-request','capability-unavailable'] as const)('keeps known %s failures actionable with correction and explicit Reload',async code=>{
    const f=setupUrl({openLauncherUrl:vi.fn<LauncherApi['openLauncherUrl']>(async()=>({ok:false,error:{code,message:'private synthetic detail',retryable:false}}))});await settled();await invoke(f.controller,'linuxcast:open-url');await formAction(f.controller,'launcher:submit-url','https://example.org/');expect(top(f.controller).view).toMatchObject({fields:[{value:'https://example.org/'}]});if(code==='invalid-request')expect(top(f.controller).view).toMatchObject({fields:[{error:expect.any(String)}]});else expect(top(f.controller).view.status?.message).toContain('Check your default browser settings');expect(top(f.controller).view.actions?.some(action=>action.id==='launcher:retry')).toBe(true);expect(JSON.stringify(top(f.controller).view)).not.toContain('private synthetic');await formAction(f.controller,'launcher:retry');expect(top(f.controller).view.kind).toBe('list');expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(2);expect(f.api.openLauncherUrl).toHaveBeenCalledTimes(1);expect(f.dismiss).not.toHaveBeenCalled();
  });
  it.each(['deadline-exceeded','internal','malformed','rejected'] as const)('preserves %s uncertainty through cancel, later command and automatic refresh until explicit Reload',async mode=>{
    const open=vi.fn<LauncherApi['openLauncherUrl']>(async()=>{if(mode==='rejected')throw new Error('private synthetic detail');if(mode==='malformed')return {ok:true,value:{outcome:'completed'}} as never;return {ok:false,error:{code:mode,message:'private synthetic detail',retryable:false}};});const f=setupUrl({openLauncherUrl:open});await settled();await invoke(f.controller,'linuxcast:open-url');await formAction(f.controller,'launcher:submit-url','https://example.org/');expect(top(f.controller).view.status?.message).toContain('Check your browser');await formAction(f.controller,'launcher:submit-url','https://example.org/repeat');expect(open).toHaveBeenCalledTimes(1);await formAction(f.controller,'launcher:cancel-url');await invoke(f.controller);f.controller.setVisible(false);f.controller.setVisible(true);await settled();await invoke(f.controller,'linuxcast:open-url');expect(top(f.controller).view.actions?.find(action=>action.id==='launcher:submit-url')?.disabledReason).toContain('Check your browser');await formAction(f.controller,'launcher:retry');await invoke(f.controller,'linuxcast:open-url');expect(top(f.controller).view.actions?.find(action=>action.id==='launcher:submit-url')?.disabledReason).toBeUndefined();expect(open).toHaveBeenCalledTimes(1);
  });
  it.each(['back','cancel','hide','dispose'] as const)('ignores a late URL acknowledgement after %s and never opens automatically',async mode=>{
    let finish!:(reply:Awaited<ReturnType<LauncherApi['openLauncherUrl']>>)=>void;const f=setupUrl({openLauncherUrl:vi.fn<LauncherApi['openLauncherUrl']>(()=>new Promise(resolve=>{finish=resolve;}))});await settled();await invoke(f.controller,'linuxcast:open-url');const pending=formAction(f.controller,'launcher:submit-url','https://example.org/');if(mode==='back')f.controller.session.pop();if(mode==='cancel')await formAction(f.controller,'launcher:cancel-url');if(mode==='hide')f.controller.setVisible(false);if(mode==='dispose')f.controller.dispose();await pending;const before=f.controller.session.getSnapshot();finish({ok:true,value:{outcome:'dispatched'}});await settled();expect(f.controller.session.getSnapshot()).toBe(before);expect(f.api.openLauncherUrl).toHaveBeenCalledTimes(1);expect(f.dismiss).not.toHaveBeenCalled();
  });
  it('rejects obsolete URL form revisions and actions targeting a hidden root',async()=>{
    const f=setupUrl();await settled();const root=top(f.controller);await invoke(f.controller,'linuxcast:open-url');const first=top(f.controller);await f.controller.execute({viewId:root.view.viewId,revision:root.view.revision,actionId:'linuxcast:hide',itemId:'linuxcast:hide'});await formAction(f.controller,'launcher:cancel-url');await invoke(f.controller,'linuxcast:open-url');await f.controller.execute({viewId:first.view.viewId,revision:first.view.revision,actionId:'launcher:submit-url',values:{url:'https://example.org/'}});expect(f.api.openLauncherUrl).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
  });
  it('keeps dispatched acknowledgement separate from a subsequent Hide failure',async()=>{
    const f=setupUrl();await settled();vi.mocked(f.dismiss).mockRejectedValue(new Error('synthetic hide failure'));await invoke(f.controller,'linuxcast:open-url');await formAction(f.controller,'launcher:submit-url','https://example.org/');expect(top(f.controller).view.kind).toBe('list');expect(top(f.controller).view.status?.message).toBe('Linuxcast could not hide this window. Try again.');await invoke(f.controller,'linuxcast:open-url');expect(top(f.controller).view.actions?.find(action=>action.id==='launcher:submit-url')?.disabledReason).toBeUndefined();expect(f.api.openLauncherUrl).toHaveBeenCalledTimes(1);
  });
  it('retains pin and alias administration for Open URL without dispatching a browser effect',async()=>{
    const f=setupUrl();await settled();f.controller.session.select('linuxcast-launcher','linuxcast:open-url');await pin(f.controller,true);await openAlias(f.controller,'linuxcast:open-url');await formAction(f.controller,'launcher:save-alias','browse');f.controller.query('browse');await settled();expect(items(f.controller)).toMatchObject([{id:'linuxcast:open-url',accessories:[{text:'Pinned'}]}]);expect(items(f.controller)[0]!.actions![0]!.title).toBe('Open URL');expect(f.api.openLauncherUrl).not.toHaveBeenCalled();expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
  });
});

it('L1-02 known browser unavailability permits deliberate unchanged-value retry after settings are fixed',async()=>{
  const open=vi.fn<LauncherApi['openLauncherUrl']>().mockResolvedValueOnce({ok:false,error:{code:'capability-unavailable',message:'synthetic private detail',retryable:false}}).mockResolvedValueOnce({ok:true,value:{outcome:'dispatched'}});const f=setupUrl({openLauncherUrl:open});await settled();await invoke(f.controller,'linuxcast:open-url');await formAction(f.controller,'launcher:submit-url','https://example.org/public');expect(top(f.controller).view).toMatchObject({kind:'form',fields:[{value:'https://example.org/public'}]});const unavailable=top(f.controller).view;if(unavailable.kind!=='form')throw new Error();expect(unavailable.fields[0]!.error).toBeUndefined();await formAction(f.controller,'launcher:submit-url','https://example.org/public');expect(top(f.controller).view.kind).toBe('list');expect(open).toHaveBeenCalledTimes(2);expect(open.mock.calls[0]).toEqual(open.mock.calls[1]);expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(1);expect(f.dismiss).toHaveBeenCalledTimes(1);
});

const managedId=`application:${'4'.repeat(64)}`;
function visibilitySetup(count=0){
  const saved:LauncherCommandsSnapshot={...structuredClone(snapshot),visibilityAvailable:true,commands:[...structuredClone(snapshot.commands),{id:managedId,provider:'applications',title:'Public Hidden Notes',aliases:['notes'],keywords:[],enabled:false,unavailableReason:'Synthetic unavailable application.',hidden:true,usage:{pinned:true,useCount:3,lastUsedAt:'2026-10-25T00:00:00Z',alias:'public-hidden'}},...Array.from({length:count},(_,index)=>({id:`application:${(index+100).toString(16).padStart(64,'0')}`,provider:'applications' as const,title:`Public Tool ${String(index).padStart(3,'0')}`,aliases:[],keywords:[],enabled:true,usage:null}))]};
  const page=(cursor?:string)=>{const offset=cursor?Number(cursor.split(':')[1]):0;return structuredClone({...saved,commands:saved.commands.slice(offset,offset+100),nextCursor:offset+100<saved.commands.length?`${saved.revision}:${offset+100}`:null});};
  const f=setup({getLauncherCommands:vi.fn<LauncherApi['getLauncherCommands']>(async request=>({ok:true,value:page(request?.cursor)})),setLauncherHidden:vi.fn<NonNullable<LauncherApi['setLauncherHidden']>>(async request=>{saved.commands.find(command=>command.id===request.commandId)!.hidden=request.hidden;saved.revision++;return {ok:true,value:page()};})});
  return {...f,saved,page};
}
function topView(controller:LauncherController){return controller.session.getSnapshot().frames.at(-1)!.view;}
function topItems(controller:LauncherController){const view=topView(controller);if(view.kind!=='list')throw new Error();return view.sections.flatMap(section=>section.items);}
function managementAction(controller:LauncherController,actionId:string,itemId?:string,extra={}){const view=topView(controller);return controller.execute({viewId:view.viewId,revision:view.revision,actionId,...(itemId?{itemId}:{}),...extra});}
async function manage(controller:LauncherController){await managementAction(controller,'launcher:manage');expect(topView(controller).title).toBe('Manage commands');}
function managedQuery(controller:LauncherController,query:string){controller.session.setQuery(topView(controller).viewId,query);controller.host.queryChanged?.(topView(controller).viewId,query,1);}
function visibility(controller:LauncherController,id:string,hidden:boolean){controller.session.select(topView(controller).viewId,id);return managementAction(controller,hidden?'launcher:hide-command':'launcher:show-command',id);}
describe('bounded command visibility management',()=>{
  it('offers Manage commands from empty root results and locally queries hidden/unavailable metadata without execution',async()=>{
    const f=visibilitySetup();await settled();f.controller.query('no root match');await settled();expect(items(f.controller)).toHaveLength(0);expect(topView(f.controller).actions?.some(action=>action.title==='Manage commands')).toBe(true);await manage(f.controller);
    managedQuery(f.controller,'public-hidden');expect(topItems(f.controller).map(item=>item.id)).toEqual([managedId]);expect(topItems(f.controller)[0]).toMatchObject({accessories:[{text:'Hidden'},{text:'Unavailable',tooltip:'Synthetic unavailable application.'}],actions:[{title:'Show command'}]});
    await managementAction(f.controller,managedId,managedId);expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(1);expect(f.api.setLauncherHidden).not.toHaveBeenCalled();
    await managementAction(f.controller,'launcher:back-manage');expect((topView(f.controller) as Extract<ReturnType<typeof topView>,{kind:'list'}>).search.query).toBe('no root match');
  });
  it('appends Hide after pin/alias, protects recovery commands, and never turns management primary into execution',async()=>{
    const f=visibilitySetup();await settled();expect(items(f.controller)[0]?.actions?.map(action=>action.title)).toEqual(['Open','Pin command','Edit search alias','Hide command']);
    for(const id of ['linuxcast:hide','linuxcast:quit']){expect(items(f.controller).find(item=>item.id===id)?.actions?.at(-1)?.disabledReason).toContain('Always shown for recovery');await visibility(f.controller,id,true);}
    expect(f.api.setLauncherHidden).not.toHaveBeenCalled();await manage(f.controller);expect(topItems(f.controller).find(item=>item.id==='linuxcast:quit')?.actions).toHaveLength(1);expect(topItems(f.controller).find(item=>item.id==='linuxcast:quit')?.accessories).toContainEqual({text:'Always shown for recovery'});
  });
  it.each(['missing-api','missing-availability','false-availability'] as const)('keeps %s visible and actionable without sending metadata writes',async kind=>{
    const f=visibilitySetup();if(kind==='missing-api')delete f.api.setLauncherHidden;else if(kind==='missing-availability')delete f.saved.visibilityAvailable;else f.saved.visibilityAvailable=false;await settled();await f.controller.refresh();await manage(f.controller);expect(topItems(f.controller).find(item=>item.id===managedId)?.actions?.[0]?.disabledReason).toContain('unavailable');expect(topView(f.controller).actions?.some(action=>action.title==='Reload commands')).toBe(true);await visibility(f.controller,managedId,false);if(f.api.setLauncherHidden)expect(f.api.setLauncherHidden).not.toHaveBeenCalled();
  });
  it('hides only after a complete new-revision catalogue and preserves root query, other pages, pins, aliases and usage',async()=>{
    const f=visibilitySetup(110);await settled();f.controller.query('data');await settled();await manage(f.controller);managedQuery(f.controller,'data');await visibility(f.controller,'linuxcast:open-local-data',true);expect(f.api.setLauncherHidden).toHaveBeenCalledExactlyOnceWith({commandId:'linuxcast:open-local-data',revision:1,hidden:true});expect(topItems(f.controller)[0]?.accessories).toContainEqual({text:'Hidden'});expect(topView(f.controller).status?.message).not.toMatch(/saved|success|copied/);
    managedQuery(f.controller,'Public Tool 109');expect(topItems(f.controller)).toHaveLength(1);await visibility(f.controller,topItems(f.controller)[0]!.id,true);expect(f.api.getLauncherCommands).toHaveBeenCalledWith({cursor:'2:100'});expect(f.api.getLauncherCommands).toHaveBeenCalledWith({cursor:'3:100'});
    managedQuery(f.controller,'public-hidden');await visibility(f.controller,managedId,false);expect(f.saved.commands.find(command=>command.id===managedId)?.usage).toEqual({pinned:true,useCount:3,lastUsedAt:'2026-10-25T00:00:00Z',alias:'public-hidden'});await managementAction(f.controller,'launcher:back-manage');expect((topView(f.controller) as Extract<ReturnType<typeof topView>,{kind:'list'}>).search.query).toBe('data');expect(items(f.controller)).toHaveLength(0);expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();
  });
  it('preserves root selected identity and primary after management Back without changes',async()=>{
    const f=visibilitySetup();await settled();f.controller.query('hide');await settled();f.controller.session.select('linuxcast-launcher','linuxcast:hide');await manage(f.controller);managedQuery(f.controller,'notes');await managementAction(f.controller,'launcher:back-manage');expect(f.controller.session.getSnapshot().frames[0]).toMatchObject({selection:'linuxcast:hide',primaryAction:'linuxcast:hide'});expect((topView(f.controller) as Extract<ReturnType<typeof topView>,{kind:'list'}>).search.query).toBe('hide');
  });
  it('bounds management at 100 while allowing local search of later-page identities',async()=>{
    const f=visibilitySetup(110);await settled();await manage(f.controller);expect(topItems(f.controller)).toHaveLength(100);expect(topView(f.controller).status?.message).toContain('100');managedQuery(f.controller,'Public Tool 109');expect(topItems(f.controller)[0]?.title).toBe('Public Tool 109');managedQuery(f.controller,'x'.repeat(513));expect(topItems(f.controller)).toHaveLength(0);expect(topView(f.controller).status?.message).toContain('512');expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(2);
  });
  it('rejects obsolete revisions, unselected targets, extra values, root Show and protected IDs',async()=>{
    const f=visibilitySetup();await settled();await manage(f.controller);const old=topView(f.controller);managedQuery(f.controller,'data');await f.controller.execute({viewId:old.viewId,revision:old.revision,actionId:'launcher:hide-command',itemId:'linuxcast:open-local-data'});await managementAction(f.controller,'launcher:hide-command','linuxcast:quit');await managementAction(f.controller,'launcher:hide-command','linuxcast:open-local-data',{values:{hidden:true}});await managementAction(f.controller,'launcher:hide-command','linuxcast:open-local-data',{path:'/synthetic'});await managementAction(f.controller,'launcher:back-manage');await managementAction(f.controller,'launcher:show-command',managedId);expect(f.api.setLauncherHidden).not.toHaveBeenCalled();
  });
  it('does not optimistically hide and blocks duplicate/different-target mutations and execution while pending',async()=>{
    const f=visibilitySetup();await settled();let finish!:(value:Awaited<ReturnType<NonNullable<LauncherApi['setLauncherHidden']>>>)=>void;vi.mocked(f.api.setLauncherHidden!).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await manage(f.controller);const pending=visibility(f.controller,'linuxcast:open-local-data',true);expect(topItems(f.controller).find(item=>item.id==='linuxcast:open-local-data')?.accessories).toContainEqual({text:'Shown'});await visibility(f.controller,managedId,false);await managementAction(f.controller,'linuxcast:quit','linuxcast:quit');await f.controller.refresh();expect(f.api.setLauncherHidden).toHaveBeenCalledTimes(1);expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.api.getLauncherCommands).toHaveBeenCalledTimes(1);
    f.saved.commands[0]!.hidden=true;f.saved.revision++;finish({ok:true,value:f.page()});await pending;expect(topItems(f.controller).find(item=>item.id==='linuxcast:open-local-data')?.accessories).toContainEqual({text:'Hidden'});
  });
  it.each(['wrong-revision','wrong-state','missing-target','changed-alias','malformed','later-page-failure'] as const)('rejects %s acknowledgements without partial replacement or automatic replay',async kind=>{
    const f=visibilitySetup(kind==='later-page-failure'?110:0);await settled();vi.mocked(f.api.setLauncherHidden!).mockImplementation(async()=>{const next=structuredClone(f.saved);next.revision+=kind==='wrong-revision'?0:1;next.commands[0]!.hidden=kind!=='wrong-state';if(kind==='missing-target')next.commands.shift();if(kind==='changed-alias')next.commands[0]!.usage={pinned:false,alias:'changed',useCount:0,lastUsedAt:null};if(kind==='malformed')return {ok:true,value:{...next,unexpected:true}} as never;if(kind==='later-page-failure'){vi.mocked(f.api.getLauncherCommands).mockRejectedValue(new Error('private fixture detail'));return {ok:true,value:{...next,commands:next.commands.slice(0,100),nextCursor:'2:100'}};}return {ok:true,value:next};});await visibility(f.controller,'linuxcast:open-local-data',true);expect(items(f.controller).some(item=>item.id==='linuxcast:open-local-data')).toBe(true);expect(topView(f.controller).status?.message).toContain('Visibility may have changed');await visibility(f.controller,'linuxcast:open-local-data',true);expect(f.api.setLauncherHidden).toHaveBeenCalledTimes(1);
  });
  it.each(['capability-unavailable','invalid-request','internal'] as const)('shows fixed %s remediation and permits explicit Reload without replay',async code=>{
    const f=visibilitySetup();await settled();vi.mocked(f.api.setLauncherHidden!).mockResolvedValue({ok:false,error:{code,message:'private fixture detail',retryable:false}});await manage(f.controller);await visibility(f.controller,'linuxcast:open-local-data',true);expect(topView(f.controller).status?.message).toContain('Reload commands');expect(topView(f.controller).status?.message).not.toContain('private');await managementAction(f.controller,'launcher:retry');expect(topItems(f.controller).find(item=>item.id==='linuxcast:open-local-data')?.actions?.[0]?.disabledReason).toBeUndefined();expect(f.api.setLauncherHidden).toHaveBeenCalledTimes(1);
  });
  it.each(['back','escape','hide','dispose'] as const)('invalidates %s pending presentation; automatic reopening cannot clear the Reload gate',async how=>{
    const f=visibilitySetup();await settled();let finish!:(value:Awaited<ReturnType<NonNullable<LauncherApi['setLauncherHidden']>>>)=>void;vi.mocked(f.api.setLauncherHidden!).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await manage(f.controller);const pending=visibility(f.controller,'linuxcast:open-local-data',true);
    if(how==='back')await managementAction(f.controller,'launcher:back-manage');else if(how==='escape')f.controller.session.pop();else if(how==='hide')f.controller.setVisible(false);else f.controller.dispose();await pending;finish({ok:true,value:{...f.page(),revision:2,commands:f.saved.commands.map(command=>command.id==='linuxcast:open-local-data'?{...command,hidden:true}:command)}});await settled();
    if(how==='dispose')return;f.controller.setVisible(false);f.controller.setVisible(true);await settled();expect(items(f.controller).some(item=>item.id==='linuxcast:open-local-data')).toBe(true);expect(topView(f.controller).status?.message).toContain('Visibility may have changed');await pin(f.controller,true);await openAlias(f.controller);expect(f.api.setLauncherPinned).not.toHaveBeenCalled();expect(topView(f.controller).kind).toBe('list');await manage(f.controller);await visibility(f.controller,'linuxcast:open-local-data',true);expect(f.api.setLauncherHidden).toHaveBeenCalledTimes(1);await managementAction(f.controller,'launcher:retry');expect(topItems(f.controller).find(item=>item.id==='linuxcast:open-local-data')?.actions?.[0]?.disabledReason).toBeUndefined();
  });
  it('waits for every acknowledgement page and bounds an unsettled reply without replay or a saved claim',async()=>{
    const f=visibilitySetup(110);await settled();let finish!:(value:Awaited<ReturnType<LauncherApi['getLauncherCommands']>>)=>void;
    vi.mocked(f.api.setLauncherHidden!).mockImplementation(async()=>{f.saved.commands[0]!.hidden=true;f.saved.revision++;vi.mocked(f.api.getLauncherCommands).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));return {ok:true,value:f.page()};});
    vi.useFakeTimers();try{const pending=visibility(f.controller,'linuxcast:open-local-data',true);await Promise.resolve();await Promise.resolve();expect(items(f.controller).some(item=>item.id==='linuxcast:open-local-data')).toBe(true);await vi.advanceTimersByTimeAsync(5001);await pending;expect(topView(f.controller).status?.message).toContain('Visibility may have changed');finish({ok:true,value:f.page('2:100')});await Promise.resolve();await visibility(f.controller,'linuxcast:open-local-data',true);expect(items(f.controller).some(item=>item.id==='linuxcast:open-local-data')).toBe(true);expect(f.api.setLauncherHidden).toHaveBeenCalledTimes(1);}finally{vi.useRealTimers();}
  });
  it('keeps unconfirmed visibility blocked when explicit Reload fails',async()=>{
    const f=visibilitySetup();await settled();vi.mocked(f.api.setLauncherHidden!).mockRejectedValue(new Error('fixture'));await visibility(f.controller,'linuxcast:open-local-data',true);vi.mocked(f.api.getLauncherCommands).mockRejectedValue(new Error('fixture'));await f.controller.refresh();await visibility(f.controller,'linuxcast:open-local-data',true);expect(f.api.setLauncherHidden).toHaveBeenCalledTimes(1);expect(topView(f.controller).status?.message).toContain('could not be loaded');
  });
  it('blocks hidden registered primary, calculator, URL, alias and pin entry points',async()=>{
    const f=visibilitySetup();f.saved.commands.push(...['calculator','open-url'].map(name=>({id:`linuxcast:${name}`,title:name,aliases:[],keywords:[],enabled:true,hidden:true,usage:null})));f.saved.commands[0]!.hidden=true;await settled();await f.controller.refresh();for(const id of ['linuxcast:open-local-data','linuxcast:calculator','linuxcast:open-url']){await invoke(f.controller,id);await managementAction(f.controller,'launcher:alias',id);await managementAction(f.controller,'launcher:pin',id);}expect(topView(f.controller).kind).toBe('list');expect(f.api.executeLauncherCommand).not.toHaveBeenCalled();expect(f.api.openLauncherUrl).not.toHaveBeenCalled();expect(f.api.setLauncherPinned).not.toHaveBeenCalled();expect(items(f.controller).map(item=>item.id)).toEqual(['linuxcast:hide','linuxcast:quit']);
  });
});
