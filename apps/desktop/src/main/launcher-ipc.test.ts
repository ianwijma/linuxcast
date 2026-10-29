import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationsUnavailable } from '@linuxcast/applications';
import { LAUNCHER_CHANNELS } from '../../../../packages/contracts/src/launcher.ts';
import type { LauncherCommandsReply } from '@linuxcast/contracts';
import { APP_URL } from './assets.ts';
import { createWorkflowDraft } from '../../../../packages/workflows/src/registry.ts';
import { registerLauncherIpc } from './launcher-ipc.ts';
import type { WorkflowCommandSelection } from './workflow-commands.ts';
import type { LauncherActions } from './launcher-ipc.ts';
function fixture(overrides: Partial<LauncherActions> = {}, localData = true, files = true) {
  const frame={url:APP_URL}, contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>APP_URL} as unknown as WebContents;
  const event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const actions={contents:()=>contents,quitting:()=>false,hide:vi.fn(),quit:vi.fn(),openUrl:vi.fn(async()=>'dispatched' as const),openDataSettings:vi.fn(async()=>{}),openFileSearch:vi.fn(async()=>{}),
    getUsage:vi.fn(async(commandId:string)=>({commandId,useCount:4,lastUsedAt:'2026-10-25T00:00:00.000Z',pinned:false,alias:null})),recordUse:vi.fn(async()=>{}),setAlias:vi.fn(async(commandId:string,alias:string|null)=>({commandId,alias,useCount:4,lastUsedAt:'2026-10-25T00:00:00.000Z',pinned:false})),setPinned:vi.fn(async(commandId:string,pinned:boolean)=>({commandId,pinned,useCount:4,lastUsedAt:'2026-10-25T00:00:00.000Z',alias:null})),...overrides};
  const registered:LauncherActions=actions;if(!files)delete registered.openFileSearch;
  const remove=registerLauncherIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},localData ? actions : (({openDataSettings,...rest})=>{void openDataSettings;return rest;})(actions));
  const invoke=(channel:string,payload:unknown={protocolVersion:1},sender=event)=>handlers.get(channel)!(sender,payload);
  const execute=(commandId='linuxcast:open-local-data',revision=1)=>invoke(LAUNCHER_CHANNELS.execute,{protocolVersion:1,commandId,revision});
  return {actions,frame,event,handlers,remove,invoke,execute};
}
describe('trusted launcher registry and action dispatch',()=>{
  it('projects only registered fixed commands and allowlisted usage, with no query IPC',async()=>{
    const f=fixture();
    expect([...f.handlers.keys()].sort()).toEqual(Object.values(LAUNCHER_CHANNELS).sort());
    const reply=await f.invoke(LAUNCHER_CHANNELS.getCommands);
    expect(reply).toMatchObject({ok:true,value:{revision:1,rankingAvailable:true,commands:[{id:'linuxcast:open-local-data',usage:{useCount:4}},{id:'linuxcast:hide'},{id:'linuxcast:quit'},{id:'linuxcast:open-url'},{id:'linuxcast:open-notes',enabled:false},{id:'linuxcast:quick-note',enabled:false},{id:'linuxcast:open-file-search'},{id:'linuxcast:calculator'}]}});
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
    expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:true,value:{revision:2,commands:[{enabled:false,unavailableReason:expect.any(String)},{enabled:true},{enabled:true},{enabled:true},{enabled:false},{enabled:false},{enabled:true},{enabled:true}]}});
    expect(await f.execute('linuxcast:open-local-data',2)).toMatchObject({ok:false,error:{code:'permission-denied'}});
    const stopped=fixture({quitting:()=>true});
    expect(await stopped.execute()).toMatchObject({ok:false,error:{code:'cancelled'}});
  });
});


it('pin writes require the own frame, schema and current revision and never execute the command',async()=>{
  const f=fixture(), payload={protocolVersion:1,commandId:'linuxcast:hide',revision:1,pinned:true};
  expect(await f.invoke(LAUNCHER_CHANNELS.setPinned,payload,{sender:{},senderFrame:f.frame} as never)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  for(const request of [{...payload,revision:2},{...payload,commandId:'unknown:command'},{...payload,pinned:1},{...payload,query:'SYNTHETIC_PRIVATE'}])expect(await f.invoke(LAUNCHER_CHANNELS.setPinned,request)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(f.actions.setPinned).not.toHaveBeenCalled();
  expect(await f.invoke(LAUNCHER_CHANNELS.setPinned,payload)).toMatchObject({ok:true,value:{updateOnly:true,commands:[{id:'linuxcast:hide',usage:{pinned:true,useCount:4}}]}});
  expect(f.actions.setPinned).toHaveBeenCalledExactlyOnceWith('linuxcast:hide',true);
  expect(f.actions.hide).not.toHaveBeenCalled();expect(f.actions.quit).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('blocks overlapping mutations/execution and reports unconfirmed pin changes without replay',async()=>{
  let finish!:(value:Awaited<ReturnType<NonNullable<LauncherActions['setPinned']>>>)=>void;
  const setPinned=vi.fn(()=>new Promise<Awaited<ReturnType<NonNullable<LauncherActions['setPinned']>>>>(resolve=>{finish=resolve;}));
  const f=fixture({setPinned}),payload={protocolVersion:1,commandId:'linuxcast:hide',revision:1,pinned:true};
  const pending=f.invoke(LAUNCHER_CHANNELS.setPinned,payload);
  expect(await f.execute()).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.setPinned,payload)).toMatchObject({ok:false,error:{code:'cancelled'}});
  finish({commandId:'linuxcast:hide',pinned:true,useCount:0,lastUsedAt:null,alias:null});expect((await pending as {ok:boolean}).ok).toBe(true);
  setPinned.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));
  const reply=await f.invoke(LAUNCHER_CHANNELS.setPinned,payload);
  expect(reply).toMatchObject({ok:false,error:{code:'internal',retryable:false,message:expect.stringContaining('could not be confirmed')}});
  expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(setPinned).toHaveBeenCalledTimes(2);
});

const applicationFixture=(index:number)=>({desktopId:`fixture-${String(index).padStart(3,'0')}.desktop`,title:`Fixture application ${index}`,description:'Public synthetic application',fingerprint:'a'.repeat(64)});
const applicationWithActions=()=>({...applicationFixture(0),actions:{available:true,actions:[{id:'NewWindow',title:'New window'},{id:'Compose',title:'Compose public note'}]}});
async function actionFixture(overrides:Partial<LauncherActions>={}){
  const launchApplicationAction=vi.fn(async({actionId}:{actionId:string})=>({outcome:'requested' as const,actionId}));
  const f=fixture({listApplications:async()=>[applicationWithActions()],launchApplicationAction,...overrides}),current=await catalogue(f),command=current.commands.find(command=>command.provider==='applications')!;
  return {...f,current,command,payload:{protocolVersion:1,commandId:command.id,revision:current.revision,actionId:'NewWindow'}};
}
it('projects only declared application action IDs/titles and requests one typed action without hiding or running primary Open',async()=>{
  const launchApplication=vi.fn(async()=>'dispatched' as const),f=await actionFixture({launchApplication});
  expect(f.command.applicationActions).toEqual(applicationWithActions().actions);expect(f.command.id).toMatch(/^application:[a-f0-9]{64}$/u);
  const text=JSON.stringify(f.current);for(const privateField of ['desktopId','fingerprint','Exec','argv'])expect(text).not.toContain(privateField);
  expect(f.actions.launchApplicationAction).not.toHaveBeenCalled();
  expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload)).toEqual({ok:true,value:{outcome:'requested',actionId:'NewWindow'}});
  expect(f.actions.launchApplicationAction).toHaveBeenCalledExactlyOnceWith({desktopId:'fixture-000.desktop',fingerprint:'a'.repeat(64),actionId:'NewWindow'});
  expect(f.actions.hide).not.toHaveBeenCalled();expect(launchApplication).not.toHaveBeenCalled();expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith(f.command.id);
});
it('rejects foreign frames, stale revisions, extra authority and undeclared or foreign action identities before native effects',async()=>{
  const f=await actionFixture();
  expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload,{sender:{},senderFrame:f.frame} as never)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  for(const request of [{...f.payload,revision:0},{...f.payload,revision:f.current.revision+1},{...f.payload,commandId:'linuxcast:quit'},{...f.payload,actionId:'../private'},{...f.payload,argv:['SYNTHETIC_PRIVATE']},{...f.payload,fingerprint:'a'.repeat(64)}])expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,request)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  for(const request of [{...f.payload,actionId:'Absent'},{...f.payload,commandId:`application:${'f'.repeat(64)}`}])expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,request)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  expect(f.actions.launchApplicationAction).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('keeps primary Open independent of missing or unavailable action capability',async()=>{
  for(const actions of [undefined,{available:false,actions:[]},{available:true,actions:[]}]){
    const launchApplication=vi.fn(async()=>'dispatched' as const),f=await actionFixture({listApplications:async()=>[{...applicationFixture(0),...(actions?{actions}:{})}],launchApplication});
    expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload)).toMatchObject({ok:false});
    expect(f.actions.launchApplicationAction).not.toHaveBeenCalled();expect(await f.execute(f.command.id,f.current.revision)).toMatchObject({ok:true,value:{outcome:'dispatched'}});expect(launchApplication).toHaveBeenCalledOnce();
  }
  const f=await actionFixture();delete f.actions.launchApplicationAction;expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload)).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
});
it('freshly rejects hidden, failed visibility and replaced frames before requesting an application action',async()=>{
  let hidden:string[]=[],rejectRead=false,finish!:(value:string[])=>void;
  const listHidden=vi.fn(async()=>{if(rejectRead)throw new Error('SYNTHETIC_PRIVATE');return hidden;});
  const f=await actionFixture({listHidden});hidden=[f.command.id];
  expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  const next=await catalogue(f);expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,{...f.payload,revision:next.revision})).toMatchObject({ok:false,error:{code:'permission-denied'}});
  hidden=[];const shown=await catalogue(f);rejectRead=true;
  expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,{...f.payload,revision:shown.revision})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
  rejectRead=false;const ready=await catalogue(f);listHidden.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=f.invoke(LAUNCHER_CHANNELS.applicationAction,{...f.payload,revision:ready.revision});await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  Object.assign(f.event.sender,{mainFrame:{url:APP_URL}});finish([]);
  expect(await pending).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(f.actions.launchApplicationAction).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('retains the native action slot until the backend settles, fences metadata and does not replay',async()=>{
  let finish!:(value:{outcome:'requested';actionId:string})=>void;const launchApplicationAction=vi.fn(()=>new Promise<{outcome:'requested';actionId:string}>(resolve=>{finish=resolve;}));
  const f=await actionFixture({launchApplicationAction}),pending=f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload);
  expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload)).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.execute('linuxcast:hide',f.current.revision)).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.setPinned,{protocolVersion:1,revision:f.current.revision,commandId:f.command.id,pinned:true})).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:false,error:{code:'cancelled'}});
  finish({outcome:'requested',actionId:'NewWindow'});expect(await pending).toMatchObject({ok:true});expect(launchApplicationAction).toHaveBeenCalledOnce();expect(f.actions.hide).not.toHaveBeenCalled();
});
it('never confirms mismatched or untruthful native action receipts and does not count or hide on failure',async()=>{
  for(const receipt of [{outcome:'requested',actionId:'Compose'},{outcome:'dispatched',actionId:'NewWindow'},{outcome:'completed',actionId:'NewWindow'},{outcome:'requested',actionId:'NewWindow',private:'SYNTHETIC_PRIVATE'}]){
    const launchApplicationAction=vi.fn(async()=>receipt as {outcome:'requested';actionId:string}),f=await actionFixture({launchApplicationAction}),reply=await f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload);
    expect(reply).toMatchObject({ok:false,error:{code:'deadline-exceeded',retryable:false,message:expect.stringContaining('unknown')}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(launchApplicationAction).toHaveBeenCalledOnce();expect(f.actions.hide).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
  }
});
it.each([['stale-application','not-dispatched','conflict'],['unavailable','not-dispatched','capability-unavailable'],['deadline-exceeded','unknown','deadline-exceeded']] as const)('distinguishes native action %s/%s and never automatically replays',async(reason,outcome,code)=>{
  const launchApplicationAction=vi.fn(async()=>{throw new ApplicationsUnavailable(reason,outcome);}),f=await actionFixture({launchApplicationAction});
  expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload)).toMatchObject({ok:false,error:{code,retryable:false}});expect(launchApplicationAction).toHaveBeenCalledOnce();expect(f.actions.hide).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('revises the catalogue when declared action metadata or its fingerprint changes',async()=>{
  const applications=[applicationWithActions()],f=await actionFixture({listApplications:async()=>applications});
  applications[0]={...applications[0]!,fingerprint:'b'.repeat(64),actions:{available:true,actions:[{id:'Compose',title:'Compose changed note'}]}};
  const next=await catalogue(f);expect(next.revision).toBe(f.current.revision+1);expect(next.commands.find(command=>command.id===f.command.id)?.applicationActions?.actions).toEqual([{id:'Compose',title:'Compose changed note'}]);
  expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(f.actions.launchApplicationAction).not.toHaveBeenCalled();
});
it('fences a metadata read admitted before an application action even when the action settles first',async()=>{
  let hold=false,finish!:(value:null)=>void;
  const f=await actionFixture({getUsage:async id=>hold&&id.startsWith('application:')?new Promise<null>(resolve=>{finish=resolve;}):null});
  hold=true;const reading=f.invoke(LAUNCHER_CHANNELS.getCommands);await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  expect(await f.invoke(LAUNCHER_CHANNELS.applicationAction,f.payload)).toMatchObject({ok:true,value:{outcome:'requested'}});
  hold=false;finish(null);expect(await reading).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.actions.launchApplicationAction).toHaveBeenCalledOnce();
});
function visibilityFixture(overrides:Partial<LauncherActions>={}){
  let hidden:string[]=[];
  return fixture({listHidden:vi.fn(async()=>hidden),setHidden:vi.fn(async(commandId:string,value:boolean)=>{hidden=hidden.filter(id=>id!==commandId);if(value)hidden.push(commandId);hidden.sort();return {commandId,hidden:value};}),...overrides});
}
it('acknowledges only stored visibility at exactly the next revision with a full catalogue and no command use',async()=>{
  const f=visibilityFixture(),before=await catalogue(f),commandId='linuxcast:open-local-data';
  const reply=await f.invoke(LAUNCHER_CHANNELS.setHidden,{protocolVersion:1,revision:before.revision,commandId,hidden:true}) as LauncherCommandsReply;
  expect(reply).toMatchObject({ok:true,value:{revision:before.revision+1,visibilityAvailable:true,nextCursor:null}});
  if(!reply.ok)throw new Error('Missing acknowledgement.');expect(reply.value.updateOnly).toBeUndefined();expect(reply.value.commands).toHaveLength(8);
  expect(reply.value.commands.find(row=>row.id===commandId)).toEqual({...before.commands.find(row=>row.id===commandId),hidden:true});
  expect(f.actions.setHidden).toHaveBeenCalledExactlyOnceWith(commandId,true);expect(f.actions.recordUse).not.toHaveBeenCalled();expect(f.actions.openDataSettings).not.toHaveBeenCalled();
  expect(await f.execute(commandId,before.revision)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(await f.execute(commandId,reply.value.revision)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  const shown=await f.invoke(LAUNCHER_CHANNELS.setHidden,{protocolVersion:1,revision:reply.value.revision,commandId,hidden:false}) as LauncherCommandsReply;
  if(!shown.ok)throw new Error('Missing show acknowledgement.');expect(shown.value.revision).toBe(before.revision+2);
  expect(await f.execute(commandId,shown.value.revision)).toMatchObject({ok:true});expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith(commandId);
});
it('bounds visibility writes to the own frame, current registered non-recovery IDs and strict boolean payload',async()=>{
  const f=visibilityFixture(),{revision}=await catalogue(f),payload={protocolVersion:1,revision,commandId:'linuxcast:calculator',hidden:true};
  expect(await f.invoke(LAUNCHER_CHANNELS.setHidden,payload,{sender:{},senderFrame:f.frame} as never)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  for(const request of [{...payload,revision:0},{...payload,revision:revision+1},{...payload,commandId:'linuxcast:hide'},{...payload,commandId:'linuxcast:quit',hidden:false},{...payload,commandId:'arbitrary:run'},{...payload,hidden:1},{...payload,query:'SYNTHETIC_PRIVATE'}])expect(await f.invoke(LAUNCHER_CHANNELS.setHidden,request)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.setHidden,{...payload,commandId:`application:${'f'.repeat(64)}`})).toMatchObject({ok:false,error:{code:'permission-denied'}});
  expect(f.actions.setHidden).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('returns all pages after a later-page mutation and invalidates every old cursor',async()=>{
  const f=visibilityFixture({listApplications:async()=>Array.from({length:130},(_,i)=>applicationFixture(i))}),before=await catalogue(f);
  const page2=await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:before.nextCursor}) as LauncherCommandsReply;
  if(!page2.ok)throw new Error('Expected page2.');const target=page2.value.commands.at(-1)!.id;
  const changed=await f.invoke(LAUNCHER_CHANNELS.setHidden,{protocolVersion:1,revision:before.revision,commandId:target,hidden:true}) as LauncherCommandsReply;
  if(!changed.ok)throw new Error('Expected acknowledgement.');expect(changed.value.revision).toBe(before.revision+1);expect(changed.value.commands).toHaveLength(100);expect(changed.value.updateOnly).toBeUndefined();
  expect(await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:before.nextCursor})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  const final=await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:changed.value.nextCursor}) as LauncherCommandsReply;
  expect(final).toMatchObject({ok:true,value:{revision:changed.value.revision,visibilityAvailable:true,nextCursor:null}});
  if(!final.ok)throw new Error('Expected final page.');expect(final.value.commands.find(row=>row.id===target)?.hidden).toBe(true);
});
it('does not allow visibility writes or metadata reload to overtake an unresolved write',async()=>{
  let finish!:(value:{commandId:string;hidden:boolean})=>void;const commandId='linuxcast:calculator';let hidden:string[]=[];
  const f=visibilityFixture({listHidden:async()=>hidden,setHidden:vi.fn(()=>new Promise<{commandId:string;hidden:boolean}>(resolve=>{finish=resolve;}))}),{revision}=await catalogue(f),payload={protocolVersion:1,revision,commandId,hidden:true};
  const pending=f.invoke(LAUNCHER_CHANNELS.setHidden,payload);
  expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.setHidden,payload)).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.execute('linuxcast:open-local-data',revision)).toMatchObject({ok:false,error:{code:'cancelled'}});
  hidden=[commandId];finish({commandId,hidden:true});expect(await pending).toMatchObject({ok:true,value:{revision:revision+1}});expect(f.actions.setHidden).toHaveBeenCalledTimes(1);
});
it('discards registry changes and mismatched or unconfirmed visibility receipts without replay',async()=>{
  for(const setHidden of [vi.fn(async()=>({commandId:'linuxcast:open-url',hidden:true})),vi.fn(async()=>({commandId:'linuxcast:calculator',hidden:false})),vi.fn(async()=>{throw new Error('SYNTHETIC_PRIVATE');})]){
    const f=visibilityFixture({setHidden}),{revision}=await catalogue(f),reply=await f.invoke(LAUNCHER_CHANNELS.setHidden,{protocolVersion:1,revision,commandId:'linuxcast:calculator',hidden:true});
    expect(reply).toMatchObject({ok:false,error:{code:'internal',message:expect.stringContaining('could not be confirmed'),retryable:false}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(setHidden).toHaveBeenCalledTimes(1);expect(f.actions.recordUse).not.toHaveBeenCalled();
  }
  let finish!:(value:{commandId:string;hidden:boolean})=>void,apps=[applicationFixture(0)];
  const f=visibilityFixture({listApplications:async()=>apps,setHidden:()=>new Promise(resolve=>{finish=resolve;})}),{revision}=await catalogue(f),pending=f.invoke(LAUNCHER_CHANNELS.setHidden,{protocolVersion:1,revision,commandId:'linuxcast:calculator',hidden:true});
  apps=[];expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:false});finish({commandId:'linuxcast:calculator',hidden:true});expect(await pending).toMatchObject({ok:false,error:{code:'internal'}});
});
it('keeps Hide and Quit available through preference-store failure while other effects remain unavailable',async()=>{
  const f=visibilityFixture({listHidden:async()=>{throw new Error('SYNTHETIC_PRIVATE');}}),snapshot=await catalogue(f);
  expect(snapshot.visibilityAvailable).toBe(false);expect(snapshot.rankingAvailable).toBe(true);
  for(const row of snapshot.commands){expect(row.hidden).toBe(false);expect(row.enabled).toBe(['linuxcast:hide','linuxcast:quit'].includes(row.id));if(!row.enabled)expect(row.unavailableReason).toContain('Reload');}
  expect(await f.execute('linuxcast:open-local-data',snapshot.revision)).toMatchObject({ok:false});expect(f.actions.openDataSettings).not.toHaveBeenCalled();
  expect(await f.invoke(LAUNCHER_CHANNELS.setHidden,{protocolVersion:1,revision:snapshot.revision,commandId:'linuxcast:calculator',hidden:true})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
  expect(await f.execute('linuxcast:hide',snapshot.revision)).toMatchObject({ok:true});expect(await f.execute('linuxcast:quit',snapshot.revision)).toMatchObject({ok:true});await vi.waitFor(()=>expect(f.actions.quit).toHaveBeenCalledOnce());
});
it.each(['linuxcast:calculator','linuxcast:open-url','linuxcast:open-local-data'])('freshly enforces hidden state before typed effects: %s',async commandId=>{
  let hidden:string[]=[];const copy=vi.fn(async()=>'written' as const),f=visibilityFixture({listHidden:async()=>hidden,copyCalculatorResult:copy}),{revision}=await catalogue(f);
  hidden=[commandId];
  const invoke=()=>commandId==='linuxcast:calculator'?f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision,expression:'2+2'}):commandId==='linuxcast:open-url'?f.invoke(LAUNCHER_CHANNELS.openUrl,{protocolVersion:1,revision,url:'https://example.invalid'}):f.execute(commandId,revision);
  expect(await invoke()).toMatchObject({ok:false,error:{code:'invalid-request'}});const latest=await catalogue(f);
  const payload={protocolVersion:1,revision:latest.revision};
  const denied=commandId==='linuxcast:calculator'?await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{...payload,expression:'2+2'}):commandId==='linuxcast:open-url'?await f.invoke(LAUNCHER_CHANNELS.openUrl,{...payload,url:'https://example.invalid'}):await f.execute(commandId,latest.revision);
  expect(denied).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(copy).not.toHaveBeenCalled();expect(f.actions.openUrl).not.toHaveBeenCalled();expect(f.actions.openDataSettings).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it.each(['linuxcast:calculator','linuxcast:open-url','linuxcast:open-local-data'])('rejects a replaced invoking frame after visibility preflight: %s',async commandId=>{
  let finish!:(ids:string[])=>void;const listHidden=vi.fn(async()=>[] as string[]),copy=vi.fn(async()=>'written' as const),f=visibilityFixture({listHidden,copyCalculatorResult:copy}),{revision}=await catalogue(f);
  listHidden.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=commandId==='linuxcast:calculator'?f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision,expression:'2+2'}):commandId==='linuxcast:open-url'?f.invoke(LAUNCHER_CHANNELS.openUrl,{protocolVersion:1,revision,url:'https://example.invalid'}):f.execute(commandId,revision);
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  Object.assign(f.event.sender,{mainFrame:{url:APP_URL}});finish([]);
  expect(await pending).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(copy).not.toHaveBeenCalled();expect(f.actions.openUrl).not.toHaveBeenCalled();expect(f.actions.openDataSettings).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('recomputes numeric calculator text in main and records only a confirmed explicit copy',async()=>{
  const copyCalculatorResult=vi.fn(async()=>'written' as const),f=fixture({copyCalculatorResult});
  expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression:'1 + 2 * 3'})).toEqual({ok:true,value:{outcome:'copied',text:'7'}});
  expect(copyCalculatorResult).toHaveBeenCalledExactlyOnceWith('7');expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith('linuxcast:calculator');expect(f.actions.hide).not.toHaveBeenCalled();
  expect(await f.execute('linuxcast:calculator')).toMatchObject({ok:false,error:{code:'invalid-request'}});
});
it('recomputes unit conversions and copies only a canonical numeric value with its closed unit',async()=>{
  const copyCalculatorResult=vi.fn(async()=>'written' as const),f=fixture({copyCalculatorResult});
  expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression:'1 km to m'})).toEqual({ok:true,value:{outcome:'copied',text:'1000',unit:'m'}});
  expect(copyCalculatorResult).toHaveBeenCalledExactlyOnceWith('1000 m');expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith('linuxcast:calculator');
  for(const expression of ['1 m to kg','1 gal to L','1 KB to B','-1 K to degC'])expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression:'1 km to m',unit:'m'})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(copyCalculatorResult).toHaveBeenCalledTimes(1);
});
it('rejects forged, stale, content-bearing and non-arithmetic calculator copy requests before clipboard access',async()=>{
  const copyCalculatorResult=vi.fn(async()=>'written' as const),f=fixture({copyCalculatorResult}),request={protocolVersion:1,revision:1,expression:'2 + 2'};
  for(const payload of [{...request,text:'arbitrary'},{...request,revision:2},{...request,expression:'process.exit()'},{...request,expression:'1/0'},{...request,expression:'x'.repeat(513)}])expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,request,{sender:{},senderFrame:f.frame} as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  expect(copyCalculatorResult).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('keeps an uncertain clipboard write serialized while Hide remains usable and never replays it',async()=>{
  let finish!:(value:'written')=>void;const copyCalculatorResult=vi.fn(()=>new Promise<'written'>(resolve=>{finish=resolve;})),f=fixture({copyCalculatorResult}),request={protocolVersion:1,revision:1,expression:'2+2'};
  vi.useFakeTimers();try {
    const pending=f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,request);await vi.advanceTimersByTimeAsync(4001);
    expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});
    expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,request)).toMatchObject({ok:false,error:{code:'cancelled'}});
    expect(await f.execute('linuxcast:hide')).toEqual({ok:true,value:{outcome:'completed'}});expect(f.actions.hide).toHaveBeenCalledOnce();
    finish('written');await vi.advanceTimersByTimeAsync(1);expect(copyCalculatorResult).toHaveBeenCalledTimes(1);expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith('linuxcast:hide');
  }finally{vi.useRealTimers();}
});
it('distinguishes unavailable clipboard copying from unknown backend outcomes without exposing content',async()=>{
  const request={protocolVersion:1,revision:1,expression:'2+2'};
  for(const f of [fixture(),fixture({copyCalculatorResult:async()=>'unsupported'})])expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,request)).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
  const f=fixture({copyCalculatorResult:async()=>{throw new Error('SYNTHETIC_PRIVATE');}}),reply=await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,request);expect(reply).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('opens File search through its registered command and records usage only after the workspace opens',async()=>{
  let finish=()=>{};const f=fixture({openFileSearch:()=>new Promise<void>(resolve=>{finish=resolve;})});
  const pending=f.execute('linuxcast:open-file-search');expect(f.actions.recordUse).not.toHaveBeenCalled();expect(f.actions.hide).not.toHaveBeenCalled();
  finish();expect(await pending).toEqual({ok:true,value:{outcome:'completed'}});expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith('linuxcast:open-file-search');expect(f.actions.hide).not.toHaveBeenCalled();
  const unavailable=fixture({},true,false);expect(await unavailable.execute('linuxcast:open-file-search')).toMatchObject({ok:false,error:{code:'permission-denied'}});
});
async function catalogue(f:ReturnType<typeof fixture>){const value=await f.invoke(LAUNCHER_CHANNELS.getCommands) as LauncherCommandsReply;if(!value.ok)throw new Error();return value.value;}
it('pages a complete registered application catalogue and rejects obsolete cursors/forged launch IDs',async()=>{
  const records=Array.from({length:130},(_,i)=>applicationFixture(i)),launchApplication=vi.fn(async()=>'dispatched' as const);
  const f=fixture({listApplications:async()=>records,launchApplication}),first=await catalogue(f);
  expect(first.commands).toHaveLength(100);expect(first.nextCursor).toBe(`${first.revision}:100`);
  const second=await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:first.nextCursor}) as LauncherCommandsReply;
  expect(second).toMatchObject({ok:true,value:{revision:first.revision,nextCursor:null}});if(!second.ok)throw new Error();expect(second.value.commands).toHaveLength(38);
  const selected=first.commands.find(command=>command.provider==='applications')!;
  expect(await f.execute(`application:${'f'.repeat(64)}`,first.revision)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  expect(await f.execute(selected.id,first.revision)).toEqual({ok:true,value:{outcome:'dispatched'}});
  expect(launchApplication).toHaveBeenCalledExactlyOnceWith({desktopId:records[0]!.desktopId,fingerprint:records[0]!.fingerprint});
  expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith(selected.id);
  records.pop();await catalogue(f);
  expect(await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:first.nextCursor})).toMatchObject({ok:false,error:{code:'invalid-request'}});
});
it('caps public page bytes and keeps paginating large saved aliases without dropping commands',async()=>{
  const f=fixture({listApplications:async()=>Array.from({length:130},(_,i)=>applicationFixture(i)),getUsage:async commandId=>({commandId,useCount:0,lastUsedAt:null,pinned:false,alias:'x'.repeat(15000)})});
  let page=await catalogue(f);const ids:string[]=[];
  for(let index=0;index<5;index++){
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(1024*1024);ids.push(...page.commands.map(command=>command.id));
    if(!page.nextCursor)break;
    const next=await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:page.nextCursor}) as LauncherCommandsReply;
    if(!next.ok)throw new Error();page=next.value;
  }
  expect(ids).toHaveLength(138);expect(new Set(ids).size).toBe(138);
});
it('returns a one-command authoritative pin acknowledgement for an application beyond page one',async()=>{
  const f=fixture({listApplications:async()=>Array.from({length:130},(_,i)=>applicationFixture(i))}),first=await catalogue(f);
  const next=await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:first.nextCursor}) as LauncherCommandsReply;if(!next.ok)throw new Error();
  const id=next.value.commands.at(-1)!.id;
  expect(await f.invoke(LAUNCHER_CHANNELS.setPinned,{protocolVersion:1,commandId:id,revision:first.revision,pinned:true})).toMatchObject({ok:true,value:{updateOnly:true,nextCursor:null,commands:[{id,usage:{pinned:true}}]}});
  expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('keeps built-in recovery usable when application discovery fails and disables stale cached app entries',async()=>{
  const listApplications=vi.fn(async()=>[applicationFixture(0)]),f=fixture({listApplications});const first=await catalogue(f);
  listApplications.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));const failed=await catalogue(f);
  expect(failed.applicationState).toBe('unavailable');expect(failed.commands.find(command=>command.provider==='applications')).toMatchObject({enabled:false,unavailableReason:expect.stringContaining('Reload')});
  expect(await f.execute('linuxcast:hide',failed.revision)).toEqual({ok:true,value:{outcome:'completed'}});
  expect(await f.execute(first.commands.at(-1)!.id,failed.revision)).toMatchObject({ok:false,error:{code:'permission-denied'}});
});

it.each([['stale-application','not-dispatched','conflict'],['launch-failed','unknown','deadline-exceeded']] as const)('preserves %s launch outcome without reporting completion or recording usage',async(reason,outcome,code)=>{
  const f=fixture({listApplications:async()=>[applicationFixture(0)],launchApplication:async()=>{throw new ApplicationsUnavailable(reason,outcome);}}),value=await catalogue(f);
  expect(await f.execute(value.commands.at(-1)!.id,value.revision)).toMatchObject({ok:false,error:{code,retryable:false}});
  expect(f.actions.recordUse).not.toHaveBeenCalled();expect(f.actions.hide).not.toHaveBeenCalled();
});

it('never acknowledges an empty pin after concurrent catalogue removal during the storage write',async()=>{
  let finish!:(value:Awaited<ReturnType<NonNullable<LauncherActions['setPinned']>>>)=>void;
  const records=[applicationFixture(0)],f=fixture({listApplications:async()=>records,setPinned:()=>new Promise(resolve=>{finish=resolve;})});
  const first=await catalogue(f),id=first.commands.at(-1)!.id;
  const pending=f.invoke(LAUNCHER_CHANNELS.setPinned,{protocolVersion:1,commandId:id,revision:first.revision,pinned:true});
  records.pop();expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:false,error:{code:'cancelled'}});
  finish({commandId:id,pinned:true,useCount:0,lastUsedAt:null,alias:null});
  expect(await pending).toMatchObject({ok:false,error:{code:'internal',message:expect.stringContaining('could not be confirmed')}});
  expect(f.actions.recordUse).not.toHaveBeenCalled();
});


it('alias edits validate sender/identity/revision and persist metadata without execution',async()=>{
  const f=fixture(),payload={protocolVersion:1,commandId:'linuxcast:hide',revision:1,alias:'my-hide'};
  expect(await f.invoke(LAUNCHER_CHANNELS.setAlias,payload,{sender:{},senderFrame:f.frame} as never)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  for(const invalid of [{...payload,commandId:'unknown:command'},{...payload,revision:2},{...payload,alias:'bad\nvalue'},{...payload,alias:'x'.repeat(65)},{...payload,path:'SYNTHETIC_PRIVATE'}])expect(await f.invoke(LAUNCHER_CHANNELS.setAlias,invalid)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(f.actions.setAlias).not.toHaveBeenCalled();
  expect(await f.invoke(LAUNCHER_CHANNELS.setAlias,payload)).toMatchObject({ok:true,value:{updateOnly:true,nextCursor:null,commands:[{id:'linuxcast:hide',usage:{alias:'my-hide',pinned:false,useCount:4}}]}});
  expect(f.actions.setAlias).toHaveBeenCalledExactlyOnceWith('linuxcast:hide','my-hide');
  expect(f.actions.hide).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('rejects normalized collisions with declared and stored aliases while allowing own alias/removal',async()=>{
  const f=fixture({getUsage:async commandId=>({commandId,useCount:0,lastUsedAt:null,pinned:false,alias:commandId==='linuxcast:quit'?'Public   Alias':'own'})});
  const payload={protocolVersion:1,commandId:'linuxcast:hide',revision:1,alias:'ＱＵＩＴ'};
  expect(await f.invoke(LAUNCHER_CHANNELS.setAlias,payload)).toMatchObject({ok:false,error:{code:'conflict'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.setAlias,{...payload,alias:'public alias'})).toMatchObject({ok:false,error:{code:'conflict'}});
  expect(f.actions.setAlias).not.toHaveBeenCalled();
  const own=fixture({getUsage:async commandId=>({commandId,useCount:0,lastUsedAt:null,pinned:false,alias:commandId==='linuxcast:hide'?'own':null})});
  expect(await own.invoke(LAUNCHER_CHANNELS.setAlias,{...payload,alias:'own'})).toMatchObject({ok:true});
  expect(await own.invoke(LAUNCHER_CHANNELS.setAlias,{...payload,alias:null})).toMatchObject({ok:true,value:{commands:[{usage:{alias:null}}]}});
});
it('checks aliases beyond page100 and blocks concurrent effects until acknowledgement',async()=>{
  let finish!:(value:Awaited<ReturnType<NonNullable<LauncherActions['setAlias']>>>)=>void;
  let collisionId='';const readIds:string[]=[];
  const f=fixture({listApplications:async()=>Array.from({length:130},(_,i)=>applicationFixture(i)),getUsage:async commandId=>{readIds.push(commandId);return {commandId,useCount:0,lastUsedAt:null,pinned:false,alias:commandId===collisionId?'existing':null};},setAlias:()=>new Promise(resolve=>{finish=resolve;})});
  const first=await catalogue(f),payload={protocolVersion:1,commandId:'linuxcast:hide',revision:first.revision,alias:'existing'};
  const second=await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:first.nextCursor}) as LauncherCommandsReply;
  if(!second.ok)throw new Error('Second page unavailable.');collisionId=second.value.commands.at(-1)!.id;
  expect(first.commands.some(command=>command.id===collisionId)).toBe(false);readIds.splice(0);
  expect(await f.invoke(LAUNCHER_CHANNELS.setAlias,payload)).toMatchObject({ok:false,error:{code:'conflict'}});expect(readIds).toContain(collisionId);
  const pending=f.invoke(LAUNCHER_CHANNELS.setAlias,{...payload,alias:'new'});
  await vi.waitFor(()=>expect(finish).toBeDefined());
  expect(await f.execute('linuxcast:hide',first.revision)).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.setPinned,{protocolVersion:1,commandId:'linuxcast:hide',revision:first.revision,pinned:true})).toMatchObject({ok:false});
  finish({commandId:'linuxcast:hide',alias:'new',pinned:false,useCount:0,lastUsedAt:null});expect(await pending).toMatchObject({ok:true});
});
it('distinguishes pre-write storage unavailability from uncertain alias write and never replays',async()=>{
  const before=fixture({getUsage:async()=>{throw new Error('SYNTHETIC_PRIVATE');}}),payload={protocolVersion:1,commandId:'linuxcast:hide',revision:1,alias:'new'};
  expect(await before.invoke(LAUNCHER_CHANNELS.setAlias,payload)).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(before.actions.setAlias).not.toHaveBeenCalled();
  const after=fixture({setAlias:async()=>{throw new Error('SYNTHETIC_PRIVATE');}});
  const reply=await after.invoke(LAUNCHER_CHANNELS.setAlias,payload);expect(reply).toMatchObject({ok:false,error:{code:'internal',message:expect.stringContaining('could not be confirmed'),retryable:false}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');
});
it('never acknowledges an alias for an application removed during the write',async()=>{
  let finish!:(value:Awaited<ReturnType<NonNullable<LauncherActions['setAlias']>>>)=>void;
  const records=[applicationFixture(0)],f=fixture({listApplications:async()=>records,setAlias:()=>new Promise(resolve=>{finish=resolve;})});
  const first=await catalogue(f),id=first.commands.find(command=>command.provider==='applications')!.id;
  const pending=f.invoke(LAUNCHER_CHANNELS.setAlias,{protocolVersion:1,commandId:id,revision:first.revision,alias:'new'});
  await vi.waitFor(()=>expect(finish).toBeDefined());records.splice(0);expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:false,error:{code:'cancelled'}});
  finish({commandId:id,alias:'new',pinned:false,useCount:0,lastUsedAt:null});expect(await pending).toMatchObject({ok:false,error:{code:'internal'}});
});

it('does not write after a slow alias collision preflight reaches its deadline',async()=>{
  const now=Date.now();const clock=vi.spyOn(Date,'now').mockReturnValue(now);
  try{
    const f=fixture({getUsage:async commandId=>{clock.mockReturnValue(now+2500);return {commandId,useCount:0,lastUsedAt:null,pinned:false,alias:null};}});
    expect(await f.invoke(LAUNCHER_CHANNELS.setAlias,{protocolVersion:1,commandId:'linuxcast:hide',revision:1,alias:'public'})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
    expect(f.actions.setAlias).not.toHaveBeenCalled();
  }finally{clock.mockRestore();}
});

it('does not let Reload confirm old metadata while an alias write is pending',async()=>{
  let finish!:()=>void,saved:string|null=null;
  const f=fixture({getUsage:async commandId=>({commandId,useCount:0,lastUsedAt:null,pinned:false,alias:commandId==='linuxcast:hide'?saved:null}),setAlias:(commandId,alias)=>new Promise(resolve=>{finish=()=>{saved=alias;resolve({commandId,alias,useCount:0,lastUsedAt:null,pinned:false});};})});
  const pending=f.invoke(LAUNCHER_CHANNELS.setAlias,{protocolVersion:1,commandId:'linuxcast:hide',revision:1,alias:'public'});
  await vi.waitFor(()=>expect(finish).toBeDefined());
  expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:false,error:{code:'cancelled'}});
  finish();expect(await pending).toMatchObject({ok:true});
  expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:true,value:{commands:expect.arrayContaining([expect.objectContaining({id:'linuxcast:hide',usage:expect.objectContaining({alias:'public'})})])}});
});
it('rejects a catalogue read that started before a metadata edit, even if the edit already finished',async()=>{
  let finish!:()=>void;const blocked=new Promise<void>(resolve=>{finish=resolve;});
  const f=fixture({getUsage:async commandId=>{await blocked;return {commandId,useCount:0,lastUsedAt:null,pinned:false,alias:null};}});
  const pending=f.invoke(LAUNCHER_CHANNELS.getCommands);
  expect(await f.invoke(LAUNCHER_CHANNELS.setAlias,{protocolVersion:1,commandId:'linuxcast:hide',revision:1,alias:null})).toMatchObject({ok:true});
  finish();expect(await pending).toMatchObject({ok:false,error:{code:'cancelled'}});
});


it('opens only an explicitly submitted canonical HTTP URL from the own current shell frame',async()=>{
  const f=fixture(),payload={protocolVersion:1,revision:1,url:'HTTPS://EXAMPLE.invalid:443/路径?public=%24%28literal%29'};
  expect(await f.invoke(LAUNCHER_CHANNELS.openUrl,payload,{sender:{},senderFrame:f.frame} as never)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  for(const invalid of [{...payload,revision:2},{...payload,url:'file:///private'},{...payload,url:'https://user:pass@example.invalid'},{...payload,commandId:'linuxcast:hide'},{...payload,query:'SYNTHETIC_PRIVATE'}])expect(await f.invoke(LAUNCHER_CHANNELS.openUrl,invalid)).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(f.actions.openUrl).not.toHaveBeenCalled();
  expect(await f.execute('linuxcast:open-url')).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(f.actions.hide).not.toHaveBeenCalled();
  expect(await f.invoke(LAUNCHER_CHANNELS.openUrl,payload)).toEqual({ok:true,value:{outcome:'dispatched'}});
  expect(f.actions.openUrl).toHaveBeenCalledExactlyOnceWith('https://example.invalid/%E8%B7%AF%E5%BE%84?public=%24%28literal%29');
  expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith('linuxcast:open-url');
  expect(f.actions.hide).not.toHaveBeenCalled();
});
it('does not confirm a pending URL handoff through Reload or overlap browser/metadata effects',async()=>{
  let finish!:(value:'dispatched')=>void;const openUrl=vi.fn(()=>new Promise<'dispatched'>(resolve=>{finish=resolve;}));
  const f=fixture({openUrl}),payload={protocolVersion:1,revision:1,url:'http://example.invalid/'};
  const pending=f.invoke(LAUNCHER_CHANNELS.openUrl,payload);
  expect(await f.invoke(LAUNCHER_CHANNELS.openUrl,payload)).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.execute('linuxcast:hide')).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.setAlias,{protocolVersion:1,commandId:'linuxcast:hide',revision:1,alias:'public'})).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(f.actions.recordUse).not.toHaveBeenCalled();finish('dispatched');
  expect(await pending).toMatchObject({ok:true});expect(openUrl).toHaveBeenCalledTimes(1);
  expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:true});
});
it.each([['unavailable','not-dispatched','capability-unavailable'],['launch-failed','unknown','deadline-exceeded'],['invalid-reply','unknown','deadline-exceeded']] as const)('reports browser %s honestly without storing the URL or replaying',async(reason,effectOutcome,code)=>{
  const f=fixture({openUrl:async()=>{throw new ApplicationsUnavailable(reason,effectOutcome);}});
  const reply=await f.invoke(LAUNCHER_CHANNELS.openUrl,{protocolVersion:1,revision:1,url:'https://example.invalid/?public=fixture'});
  expect(reply).toMatchObject({ok:false,error:{code,retryable:false}});expect(JSON.stringify(reply)).not.toContain('example.invalid');expect(f.actions.recordUse).not.toHaveBeenCalled();expect(f.actions.hide).not.toHaveBeenCalled();
});
it('keeps browser capability visibly unavailable while other commands remain usable',async()=>{
  const f=fixture({openUrl:undefined} as unknown as Partial<LauncherActions>);
  expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:true,value:{commands:expect.arrayContaining([expect.objectContaining({id:'linuxcast:open-url',enabled:false,unavailableReason:expect.any(String)})])}});
  expect(await f.invoke(LAUNCHER_CHANNELS.openUrl,{protocolVersion:1,revision:1,url:'https://example.invalid/'})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
  expect(await f.execute('linuxcast:hide')).toMatchObject({ok:true});
});

it('recomputes closed local colour results and rejects forged colour/text authority before native copying',async()=>{
  const copyCalculatorResult=vi.fn(async()=>'written' as const),f=fixture({copyCalculatorResult});
  for(const [expression,text,colour] of [['#f00 to rgb','rgb(255 0 0)','rgb'],['rgb(255 128 0 / 50%) to hex','#ff800080','hex'],['hsl(210 100% 50%) to hsl','hsl(210 100% 50%)','hsl']]){
    expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression})).toEqual({ok:true,value:{outcome:'copied',text,colour}});expect(copyCalculatorResult).toHaveBeenLastCalledWith(text);
  }
  for(const expression of ['rgb(256 0 0) to hex','hsl(0 101% 50%) to rgb','var(--private) to hex','#fff to url','rgba(1,2,3,4) to hex'])expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  for(const extra of [{text:'url(private)'},{colour:'hex'},{unit:'m'}])expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression:'#fff to rgb',...extra})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(copyCalculatorResult).toHaveBeenCalledTimes(3);expect(f.actions.recordUse).toHaveBeenCalledTimes(3);
});

it('releases the Quit dispatch latch after a cancelled editor preflight and permits later commands/Quit',async()=>{
  const quit=vi.fn(async()=>false),f=fixture({quit});await f.invoke(LAUNCHER_CHANNELS.getCommands);
  expect(await f.execute('linuxcast:quit')).toMatchObject({ok:true,value:{outcome:'dispatched'}});
  await vi.waitFor(()=>expect(quit).toHaveBeenCalledTimes(1));await new Promise(resolve=>setImmediate(resolve));
  expect(await f.execute('linuxcast:hide')).toMatchObject({ok:true});expect(f.actions.hide).toHaveBeenCalledTimes(1);
  expect(await f.execute('linuxcast:quit')).toMatchObject({ok:true,value:{outcome:'dispatched'}});
  await vi.waitFor(()=>expect(quit).toHaveBeenCalledTimes(2));
});

function savedWorkflow(){const definition=createWorkflowDraft();definition.name='Public launcher workflow';definition.nodes=[{id:'entry',type:'input.keyword',typeVersion:1,config:{keyword:'public-entry',argument:'required',trimQuery:false}}];return {revision:1,draft:structuredClone(definition),saved:definition,updatedAt:'2026-10-27T00:00:00.000Z'};}
it('opens the exact freshly saved Keyword without receiving a graph, input, grant or Run request',async()=>{
 const saved=savedWorkflow(),openWorkflowEntry=vi.fn(async(selection:WorkflowCommandSelection,trusted:()=>boolean)=>{void selection;void trusted;}),f=fixture({loadWorkflowCommands:async()=>saved,openWorkflowEntry,openWorkflowEditor:async()=>{}}),current=await catalogue(f),row=current.commands.find(command=>command.id.startsWith('workflow:'))!;
 expect(row).toMatchObject({aliases:['public-entry'],enabled:true,usage:{useCount:4}});expect(await f.execute(row.id,current.revision)).toMatchObject({ok:true,value:{outcome:'completed'}});expect(openWorkflowEntry).toHaveBeenCalledOnce();expect(openWorkflowEntry.mock.calls[0]![0]).toMatchObject({commandId:row.id,editorRevision:1,triggerNodeId:'entry',definitionHash:expect.stringMatching(/^[a-f0-9]{64}$/u)});
 for(const extra of [{input:'private'},{definition:saved.saved},{grants:['clipboard.write']},{run:true}])expect(await f.invoke(LAUNCHER_CHANNELS.execute,{protocolVersion:1,commandId:row.id,revision:current.revision,...extra})).toMatchObject({ok:false,error:{code:'invalid-request'}});
 expect(openWorkflowEntry).toHaveBeenCalledOnce();expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith(row.id);
 saved.saved.name='Changed without catalogue refresh';expect(await f.execute(row.id,current.revision)).toMatchObject({ok:false,error:{code:'conflict'}});expect(openWorkflowEntry).toHaveBeenCalledOnce();
});
it('keeps builtin recovery and previous workflow rows visible but disabled when saved metadata fails',async()=>{
 const saved=savedWorkflow();saved.saved.name='😀'.repeat(1000);let broken=false;const f=fixture({loadWorkflowCommands:async()=>{if(broken)throw new Error('PRIVATE');return saved;},openWorkflowEntry:async()=>{},openWorkflowEditor:async()=>{}}),first=await catalogue(f);expect(first.commands.find(command=>command.id.startsWith('workflow:'))?.title.length).toBeLessThan(256);
 broken=true;const next=await catalogue(f);expect(next.commands.find(command=>command.id.startsWith('workflow:'))).toMatchObject({enabled:false,unavailableReason:expect.stringContaining('Reload')});expect(next.commands.find(command=>command.id==='linuxcast:open-workflow-editor')).toMatchObject({enabled:true});expect(next.commands.find(command=>command.id==='linuxcast:quit')).toMatchObject({enabled:true});expect(JSON.stringify(next)).not.toContain('PRIVATE');
});
it('fences delayed workflow opening after sender navigation, hiding and disposal',async()=>{
 for(const lose of ['frame','hidden','disposed'] as const){const saved=savedWorkflow();let resolve!:(value:typeof saved)=>void,slow=false;let hidden:string[]=[];const opened=vi.fn(async()=>{}),f=fixture({loadWorkflowCommands:async()=>slow?new Promise(done=>{resolve=done;}):saved,openWorkflowEntry:opened,listHidden:async()=>hidden}),current=await catalogue(f),row=current.commands.find(command=>command.id.startsWith('workflow:'))!;
  slow=true;const pending=f.execute(row.id,current.revision);await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));if(lose==='frame')f.frame.url='https://example.test';if(lose==='disposed')f.remove();if(lose==='hidden'){hidden=[row.id];slow=false;await catalogue(f);}resolve(saved);expect(await pending).toMatchObject({ok:false});expect(opened).not.toHaveBeenCalled();
 }
});

it('recomputes exact zoned date/time text and exclusive receipts before native copying',async()=>{
 const copyCalculatorResult=vi.fn(async()=>'written' as const),f=fixture({copyCalculatorResult}),expression='2024-11-03T01:30-05:00[America/New_York] to UTC',text='2024-11-03T06:30:00+00:00[UTC]';
 expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression})).toEqual({ok:true,value:{outcome:'copied',dateTime:'zoned',text}});expect(copyCalculatorResult).toHaveBeenCalledExactlyOnceWith(text);expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith('linuxcast:calculator');
 for(const extra of [{text:'arbitrary'},{dateTime:'zoned'},{unit:'m'},{colour:'hex'}])expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression,...extra})).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(copyCalculatorResult).toHaveBeenCalledTimes(1);
});
it('refuses ambiguous, nonexistent and mismatched-zone date/time before clipboard or usage effects',async()=>{
 const copyCalculatorResult=vi.fn(async()=>'written' as const),f=fixture({copyCalculatorResult});for(const expression of ['2024-03-10T02:30[America/New_York] to UTC','2024-11-03T01:30[America/New_York] to UTC','2024-11-03T01:30-06:00[America/New_York] to UTC','2023-02-29T00:00[UTC] to UTC'])expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression})).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(copyCalculatorResult).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('recomputes calendar and elapsed date arithmetic into the existing exclusive copy receipt',async()=>{
 const copyCalculatorResult=vi.fn(async()=>'written' as const),f=fixture({copyCalculatorResult});
 for(const [expression,text] of [['2024-03-09T12:00[America/New_York] + P1D to America/New_York','2024-03-10T12:00:00-04:00[America/New_York]'],['2024-03-09T12:00[America/New_York] + PT24H to America/New_York','2024-03-10T13:00:00-04:00[America/New_York]'],['2024-01-01T00:00[UTC] - PT0.000000001S to UTC','2023-12-31T23:59:59.999999999+00:00[UTC]']]){expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression})).toEqual({ok:true,value:{outcome:'copied',dateTime:'zoned',text}});expect(copyCalculatorResult).toHaveBeenLastCalledWith(text);}
 expect(copyCalculatorResult).toHaveBeenCalledTimes(3);expect(f.actions.recordUse).toHaveBeenCalledTimes(3);
});
it('refuses malformed duration or invalid calendar result before any copy or use',async()=>{
 const copyCalculatorResult=vi.fn(async()=>'written' as const),f=fixture({copyCalculatorResult});for(const expression of ['2024-01-31T12:00[UTC] + P1M to UTC','2024-02-29T12:00[UTC] + P1Y to UTC','2024-03-09T02:30[America/New_York] + P1D to UTC','2024-11-02T01:30-04:00[America/New_York] + P1D to UTC','2024-01-01T00:00[UTC] + P1000000D to UTC','2024-01-01T00:00[UTC] + PT1.5H to UTC'])expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression})).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(copyCalculatorResult).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});

it('registers Notes as a real fixed command and awaits its workspace before recording use',async()=>{const openNotes=vi.fn(async()=>{}),f=fixture({openNotes});const current=await catalogue(f);expect(current.commands.find(row=>row.id==='linuxcast:open-notes')).toMatchObject({enabled:true,title:'Notes'});expect(await f.execute('linuxcast:open-notes',current.revision)).toMatchObject({ok:true,value:{outcome:'completed'}});expect(openNotes).toHaveBeenCalledTimes(1);expect(f.actions.recordUse).toHaveBeenCalledWith('linuxcast:open-notes');});

it('registers actual Quick note and records usage only after confirmed workspace creation',async()=>{const openQuickNote=vi.fn(async()=>{}),f=fixture({openQuickNote}),current=await catalogue(f);expect(current.commands.find(row=>row.id==='linuxcast:quick-note')).toMatchObject({enabled:true,title:'Quick note'});expect(await f.execute('linuxcast:quick-note',current.revision)).toMatchObject({ok:true,value:{outcome:'completed'}});expect(openQuickNote).toHaveBeenCalledTimes(1);expect(f.actions.recordUse).toHaveBeenCalledWith('linuxcast:quick-note');openQuickNote.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));vi.mocked(f.actions.recordUse!).mockClear();expect(await f.execute('linuxcast:quick-note',current.revision)).toMatchObject({ok:false});expect(f.actions.recordUse).not.toHaveBeenCalled();});

it('registers Dictionary for the local named flow and rejects generic execution without read, copy, hide or usage',async()=>{
 const dictionary={languages:vi.fn(async()=>({languages:[],truncated:false})),search:vi.fn()},copyCalculatorResult=vi.fn(async()=>'written' as const),f=fixture({dictionary,copyCalculatorResult}),current=await catalogue(f);
 expect(current.commands.find(row=>row.id==='linuxcast:dictionary')).toMatchObject({enabled:true,title:'Dictionary'});
 expect(await f.execute('linuxcast:dictionary',current.revision)).toMatchObject({ok:false,error:{code:'invalid-request'}});
 expect(dictionary.languages).not.toHaveBeenCalled();expect(dictionary.search).not.toHaveBeenCalled();expect(copyCalculatorResult).not.toHaveBeenCalled();expect(f.actions.hide).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();f.remove();expect(f.handlers.size).toBe(0);
});
