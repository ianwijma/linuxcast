import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationsUnavailable } from '@linuxcast/applications';
import { LAUNCHER_CHANNELS } from '../../../../packages/contracts/src/launcher.ts';
import type { LauncherCommandsReply } from '@linuxcast/contracts';
import { APP_URL } from './assets.ts';
import { registerLauncherIpc } from './launcher-ipc.ts';
import type { LauncherActions } from './launcher-ipc.ts';
function fixture(overrides: Partial<LauncherActions> = {}, localData = true) {
  const frame={url:APP_URL}, contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>APP_URL} as unknown as WebContents;
  const event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const actions={contents:()=>contents,quitting:()=>false,hide:vi.fn(),quit:vi.fn(),openUrl:vi.fn(async()=>'dispatched' as const),openDataSettings:vi.fn(async()=>{}),
    getUsage:vi.fn(async(commandId:string)=>({commandId,useCount:4,lastUsedAt:'2026-10-25T00:00:00.000Z',pinned:false,alias:null})),recordUse:vi.fn(async()=>{}),setAlias:vi.fn(async(commandId:string,alias:string|null)=>({commandId,alias,useCount:4,lastUsedAt:'2026-10-25T00:00:00.000Z',pinned:false})),setPinned:vi.fn(async(commandId:string,pinned:boolean)=>({commandId,pinned,useCount:4,lastUsedAt:'2026-10-25T00:00:00.000Z',alias:null})),...overrides};
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
    expect(reply).toMatchObject({ok:true,value:{revision:1,rankingAvailable:true,commands:[{id:'linuxcast:open-local-data',usage:{useCount:4}},{id:'linuxcast:hide'},{id:'linuxcast:quit'},{id:'linuxcast:open-url'}]}});
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
    expect(await f.invoke(LAUNCHER_CHANNELS.getCommands)).toMatchObject({ok:true,value:{revision:2,commands:[{enabled:false,unavailableReason:expect.any(String)},{enabled:true},{enabled:true},{enabled:true}]}});
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
async function catalogue(f:ReturnType<typeof fixture>){const value=await f.invoke(LAUNCHER_CHANNELS.getCommands) as LauncherCommandsReply;if(!value.ok)throw new Error();return value.value;}
it('pages a complete registered application catalogue and rejects obsolete cursors/forged launch IDs',async()=>{
  const records=Array.from({length:130},(_,i)=>applicationFixture(i)),launchApplication=vi.fn(async()=>'dispatched' as const);
  const f=fixture({listApplications:async()=>records,launchApplication}),first=await catalogue(f);
  expect(first.commands).toHaveLength(100);expect(first.nextCursor).toBe(`${first.revision}:100`);
  const second=await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:first.nextCursor}) as LauncherCommandsReply;
  expect(second).toMatchObject({ok:true,value:{revision:first.revision,nextCursor:null}});if(!second.ok)throw new Error();expect(second.value.commands).toHaveLength(34);
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
  expect(ids).toHaveLength(134);expect(new Set(ids).size).toBe(134);
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
