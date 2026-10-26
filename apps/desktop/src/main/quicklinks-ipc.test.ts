import { compileQuicklinkCommands } from './quicklink-commands.ts';
import { expect,it,vi } from 'vitest';
import type { IpcMainInvokeEvent,WebContents } from 'electron';
import { LAUNCHER_CHANNELS,QUICKLINK_CHANNELS,WEB_SEARCH_TEMPLATE } from '@linuxcast/contracts';
import type { LauncherCommandsReply,QuicklinkRecord } from '@linuxcast/contracts';
import { StorageRequestError } from '@linuxcast/storage';
import { ApplicationsUnavailable } from '@linuxcast/applications';
import { APP_URL } from './assets.ts';
import { registerLauncherIpc } from './launcher-ipc.ts';
import type { LauncherActions } from './launcher-ipc.ts';
const record:QuicklinkRecord={id:'00000000-0000-4000-8000-000000000001',revision:1,name:'Public docs',url:'https://example.invalid/docs?public=literal',createdAt:'2026-10-26T00:00:00.000Z',updatedAt:'2026-10-26T00:00:00.000Z'};
const selection={id:record.id,revision:record.revision};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function fixture(overrides:Partial<LauncherActions>={}){
  const frame={url:APP_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>APP_URL} as unknown as WebContents,event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
  const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
  const backend={list:vi.fn(async()=>[{id:record.id,revision:1,name:record.name,host:new URL(record.url).host}]),get:vi.fn(async()=>({...record} as QuicklinkRecord|null)),save:vi.fn(async()=>({...record})),remove:vi.fn(async()=>({...selection})),confirmRemove:vi.fn(async()=>true)};
  const actions={contents:()=>contents,quitting:()=>false,hide:vi.fn(),quit:vi.fn(),openDataSettings:async()=>{},listHidden:vi.fn(async()=>[] as string[]),openUrl:vi.fn(async()=>'dispatched' as const),recordUse:vi.fn(async()=>{}),quicklinks:backend,...overrides};
  const remove=registerLauncherIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},actions);
  const invoke=async(channel:string,payload:unknown={protocolVersion:1},sender=event)=>handlers.get(channel)!(sender,payload);
  const version=async()=>{const reply=await invoke(LAUNCHER_CHANNELS.getCommands) as LauncherCommandsReply;if(!reply.ok)throw new Error('Catalogue unavailable.');return reply.value.revision;};
  return {actions,backend,frame,event,invoke,version,remove,handlers};
}
it('registers the seventh real command and named methods; generic execution cannot bypass its flow',async()=>{
  const f=fixture(),revision=await f.version(),reply=await f.invoke(LAUNCHER_CHANNELS.getCommands) as Extract<LauncherCommandsReply,{ok:true}>;
  expect(reply.value.commands.find(command=>command.id==='linuxcast:open-quicklinks')).toMatchObject({enabled:true,title:'Quicklinks'});
  expect(await f.invoke(LAUNCHER_CHANNELS.execute,{protocolVersion:1,commandId:'linuxcast:open-quicklinks',revision})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(f.actions.openUrl).not.toHaveBeenCalled();f.remove();expect(f.handlers.size).toBe(0);
});
it('lists complete bounded summaries without targets and gets only an exact fresh record',async()=>{
  const f=fixture();expect(await f.invoke(QUICKLINK_CHANNELS.list)).toEqual({ok:true,value:{records:[{...selection,name:record.name,host:'example.invalid'}]}});
  expect(await f.invoke(QUICKLINK_CHANNELS.get,{protocolVersion:1,...selection})).toEqual({ok:true,value:{record}});
  f.backend.get.mockResolvedValueOnce(null);expect(await f.invoke(QUICKLINK_CHANNELS.get,{protocolVersion:1,...selection})).toMatchObject({ok:false,error:{code:'conflict'}});
});
it('denies foreign windows, subframes and navigated senders before accessing data or native effects',async()=>{
  const f=fixture();for(const channel of Object.values(QUICKLINK_CHANNELS)){
    expect(await f.invoke(channel,{protocolVersion:1,...selection},{sender:{},senderFrame:f.frame} as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});
    expect(await f.invoke(channel,{protocolVersion:1,...selection},{sender:f.event.sender,senderFrame:{url:APP_URL}} as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  }
  f.frame.url='https://example.invalid/';expect(await f.invoke(QUICKLINK_CHANNELS.list)).toMatchObject({ok:false,error:{code:'permission-denied'}});
  expect(f.backend.list).not.toHaveBeenCalled();expect(f.backend.get).not.toHaveBeenCalled();expect(f.backend.save).not.toHaveBeenCalled();expect(f.actions.openUrl).not.toHaveBeenCalled();
});
it('rejects injected target authority, unsupported templates, extras and stale launcher versions',async()=>{
  const f=fixture(),launcherRevision=await f.version();
  for(const extra of [{url:record.url},{argv:['public']},{query:'public'}])expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision,...extra})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  for(const url of ['file:///tmp/public','https://example.invalid/{query}','https://user@example.invalid/'])expect(await f.invoke(QUICKLINK_CHANNELS.save,{protocolVersion:1,expectedRevision:0,name:record.name,url})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision:launcherRevision+1})).toMatchObject({ok:false});
  expect(f.backend.save).not.toHaveBeenCalled();expect(f.actions.openUrl).not.toHaveBeenCalled();
});
it('saves canonical targets only on explicit Save and never opens or logs their URL',async()=>{
  const f=fixture();await f.version();const url='HTTPS://EXAMPLE.invalid:443/docs?public=literal';
  expect(await f.invoke(QUICKLINK_CHANNELS.save,{protocolVersion:1,expectedRevision:0,name:record.name,url})).toEqual({ok:true,value:{record}});
  expect(f.backend.save).toHaveBeenCalledExactlyOnceWith({expectedRevision:0,name:record.name,url:record.url});expect(f.actions.openUrl).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it.each(['quicklink-name-conflict','quicklink-limit-reached','conflict'] as const)('returns fixed actionable known owner failures without private data or replay: %s',async reason=>{
  const f=fixture();await f.version();f.backend.save.mockRejectedValueOnce(new StorageRequestError('not-dispatched','SYNTHETIC_PRIVATE',reason));
  const reply=await f.invoke(QUICKLINK_CHANNELS.save,{protocolVersion:1,expectedRevision:0,name:record.name,url:record.url});expect(reply).toMatchObject({ok:false,error:{code:'conflict'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(f.backend.save).toHaveBeenCalledTimes(1);
});
it('rejects mismatched mutation receipts as unknown instead of installing optimistic state',async()=>{
  const f=fixture();await f.version();f.backend.save.mockResolvedValueOnce({...record,revision:2});
  expect(await f.invoke(QUICKLINK_CHANNELS.save,{protocolVersion:1,expectedRevision:0,name:record.name,url:record.url})).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});
  f.backend.remove.mockResolvedValueOnce({...selection,revision:2});expect(await f.invoke(QUICKLINK_CHANNELS.remove,{protocolVersion:1,...selection})).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});
});
it('fresh-loads the exact stored target, dispatches only it and records aggregate command use without hiding',async()=>{
  const f=fixture(),launcherRevision=await f.version();
  expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision})).toEqual({ok:true,value:{...selection,outcome:'dispatched'}});
  expect(f.backend.get).toHaveBeenCalledExactlyOnceWith(selection);expect(f.actions.openUrl).toHaveBeenCalledExactlyOnceWith(record.url);expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith('linuxcast:open-quicklinks');expect(f.actions.hide).not.toHaveBeenCalled();
});
it('denies missing/stale records and never changes browser target based on an old summary',async()=>{
  const f=fixture(),launcherRevision=await f.version();
  for(const row of [null,{...record,revision:2},{...record,id:'00000000-0000-4000-8000-000000000002'}]){f.backend.get.mockResolvedValueOnce(row);expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision})).toMatchObject({ok:false,error:{code:'conflict'}});}
  expect(f.actions.openUrl).not.toHaveBeenCalled();
});
it('revalidates navigation and fresh visibility after awaiting storage',async()=>{
  const f=fixture(),launcherRevision=await f.version(),pending=deferred<QuicklinkRecord|null>();f.backend.get.mockImplementationOnce(()=>pending.promise);
  const work=f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision});await vi.waitFor(()=>expect(f.backend.get).toHaveBeenCalled());
  vi.mocked(f.actions.listHidden).mockResolvedValue(['linuxcast:open-quicklinks']);pending.resolve(record);expect(await work).toMatchObject({ok:false});expect(f.actions.openUrl).not.toHaveBeenCalled();
  vi.mocked(f.actions.listHidden).mockResolvedValue([]);const nextRevision=await f.version(),again=deferred<QuicklinkRecord|null>();f.backend.get.mockImplementationOnce(()=>again.promise);const next=f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision:nextRevision});await vi.waitFor(()=>expect(f.backend.get).toHaveBeenCalledTimes(2));f.frame.url='https://example.invalid/';again.resolve(record);expect(await next).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(f.actions.openUrl).not.toHaveBeenCalled();
});
it('honours native cancellation, then removes only an exactly confirmed version',async()=>{
  const f=fixture();await f.version();f.backend.confirmRemove.mockResolvedValueOnce(false);
  expect(await f.invoke(QUICKLINK_CHANNELS.remove,{protocolVersion:1,...selection})).toEqual({ok:true,value:{...selection,outcome:'cancelled'}});expect(f.backend.remove).not.toHaveBeenCalled();
  expect(await f.invoke(QUICKLINK_CHANNELS.remove,{protocolVersion:1,...selection})).toEqual({ok:true,value:{...selection,outcome:'removed'}});expect(f.backend.confirmRemove).toHaveBeenLastCalledWith(record);expect(f.backend.remove).toHaveBeenCalledExactlyOnceWith(selection);
});
it('does not show a stale native Remove prompt after the invoking frame navigates during its fresh read',async()=>{
  const f=fixture();await f.version();const pending=deferred<QuicklinkRecord|null>();f.backend.get.mockImplementationOnce(()=>pending.promise);
  const work=f.invoke(QUICKLINK_CHANNELS.remove,{protocolVersion:1,...selection});await vi.waitFor(()=>expect(f.backend.get).toHaveBeenCalled());
  f.frame.url='https://example.invalid/';pending.resolve(record);expect(await work).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(f.backend.confirmRemove).not.toHaveBeenCalled();expect(f.backend.remove).not.toHaveBeenCalled();
});
it('holds the existing effect slot through human confirmation and revalidates the sender after it',async()=>{
  const f=fixture(),revision=await f.version(),confirmation=deferred<boolean>();f.backend.confirmRemove.mockImplementationOnce(()=>confirmation.promise);
  const work=f.invoke(QUICKLINK_CHANNELS.remove,{protocolVersion:1,...selection});await vi.waitFor(()=>expect(f.backend.confirmRemove).toHaveBeenCalled());
  for(const channel of [QUICKLINK_CHANNELS.list,QUICKLINK_CHANNELS.get,LAUNCHER_CHANNELS.getCommands])expect(await f.invoke(channel,channel===QUICKLINK_CHANNELS.get?{protocolVersion:1,...selection}:{protocolVersion:1})).toMatchObject({ok:false,error:{code:'cancelled'}});
  expect(await f.invoke(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision,expression:'2+2'})).toMatchObject({ok:false,error:{code:'cancelled'}});
  f.frame.url='https://example.invalid/';confirmation.resolve(true);expect(await work).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(f.backend.remove).not.toHaveBeenCalled();
});
it('fences a list read that overlaps a mutation, even when the mutation has already settled',async()=>{
  const f=fixture();await f.version();const pending=deferred<Awaited<ReturnType<typeof f.backend.list>>>();f.backend.list.mockImplementationOnce(()=>pending.promise);const read=f.invoke(QUICKLINK_CHANNELS.list);
  await f.invoke(QUICKLINK_CHANNELS.save,{protocolVersion:1,expectedRevision:0,name:record.name,url:record.url});pending.resolve([{...selection,name:record.name,host:'example.invalid'}]);expect(await read).toMatchObject({ok:false,error:{code:'cancelled'}});
});
it('retains the slot until an actual Open settles and returns truthful known/unknown failures without replay',async()=>{
  const pending=deferred<'dispatched'>(),openUrl=vi.fn(()=>pending.promise),f=fixture({openUrl}),launcherRevision=await f.version();const work=f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision});await vi.waitFor(()=>expect(openUrl).toHaveBeenCalled());
  expect(await f.invoke(QUICKLINK_CHANNELS.list)).toMatchObject({ok:false,error:{code:'cancelled'}});expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision})).toMatchObject({ok:false,error:{code:'cancelled'}});pending.resolve('dispatched');expect(await work).toMatchObject({ok:true});expect(openUrl).toHaveBeenCalledTimes(1);
  openUrl.mockRejectedValueOnce(new ApplicationsUnavailable('unavailable'));expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
  openUrl.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));const reply=await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision});expect(reply).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(openUrl).toHaveBeenCalledTimes(3);expect(f.actions.recordUse).toHaveBeenCalledTimes(1);
});
const webSearch={queryParameter:'q',template:WEB_SEARCH_TEMPLATE};
it('builds a fresh saved search query component only on explicit Open and returns the exact transient query/target receipt',async()=>{
  const f=fixture(),launcherRevision=await f.version(),query='public & other=literal / 路径 #frag {{context.clipboard}}';
  const saved={...record,url:'https://example.invalid/search?lang=en&q=old&q=duplicate#public',webSearch};f.backend.get.mockResolvedValue(saved);
  const url='https://example.invalid/search?lang=en&q=public+%26+other%3Dliteral+%2F+%E8%B7%AF%E5%BE%84+%23frag+%7B%7Bcontext.clipboard%7D%7D#public';
  expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision,query})).toEqual({ok:true,value:{...selection,outcome:'dispatched',webSearch:{query,url}}});
  expect(f.actions.openUrl).toHaveBeenCalledExactlyOnceWith(url);expect(f.actions.recordUse).toHaveBeenCalledExactlyOnceWith('linuxcast:open-quicklinks');expect(f.actions.hide).not.toHaveBeenCalled();
});
it('rejects missing search arguments, arguments for literal links and changed definition kinds before browser dispatch',async()=>{
  const f=fixture(),launcherRevision=await f.version();f.backend.get.mockResolvedValueOnce({...record,webSearch});
  expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision})).toMatchObject({ok:false,error:{code:'invalid-request'}});
  expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision,query:'public'})).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(f.actions.openUrl).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
});
it('rejects overlong constructed targets with a known non-dispatch failure, without logging argument content',async()=>{
  const f=fixture(),launcherRevision=await f.version(),query='PRIVATE_QUERY_NOT_LOGGED';f.backend.get.mockResolvedValue({...record,url:'https://example.invalid/'+'x'.repeat(8192-'https://example.invalid/'.length),webSearch});
  const reply=await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision,query});expect(reply).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(JSON.stringify(reply)).not.toContain(query);expect(f.actions.openUrl).not.toHaveBeenCalled();
});
it('requires exact saved search configuration, including explicit removal when converting back to a literal',async()=>{
  const f=fixture();await f.version();const request={protocolVersion:1,expectedRevision:0,name:record.name,url:record.url,webSearch};
  expect(await f.invoke(QUICKLINK_CHANNELS.save,request)).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});
  f.backend.save.mockResolvedValueOnce({...record,webSearch});expect(await f.invoke(QUICKLINK_CHANNELS.save,request)).toMatchObject({ok:true,value:{record:{webSearch}}});
  f.backend.save.mockResolvedValueOnce({...record,webSearch});const {webSearch:unused,...literal}=request;void unused;
  expect(await f.invoke(QUICKLINK_CHANNELS.save,literal)).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.actions.openUrl).not.toHaveBeenCalled();
});

it('canonicalizes tag labels at Save, preserves exact receipts and never treats labels as browser authority',async()=>{
 const f=fixture();await f.version();f.backend.save.mockResolvedValueOnce({...record,tags:['Work','猫']});expect(await f.invoke(QUICKLINK_CHANNELS.save,{protocolVersion:1,expectedRevision:0,name:record.name,url:record.url,tags:[' Ｗｏｒｋ ','猫']})).toMatchObject({ok:true,value:{record:{tags:['Work','猫']}}});expect(f.backend.save).toHaveBeenCalledExactlyOnceWith({expectedRevision:0,name:record.name,url:record.url,tags:['Work','猫']});expect(f.actions.openUrl).not.toHaveBeenCalled();
 f.backend.save.mockResolvedValueOnce({...record,tags:['Other']});expect(await f.invoke(QUICKLINK_CHANNELS.save,{protocolVersion:1,expectedRevision:0,name:record.name,url:record.url,tags:['Work']})).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.backend.save).toHaveBeenCalledTimes(2);
 for(const tags of [['Work','ｗｏｒｋ'],['bad,tag'],['\nlabel'],Array.from({length:9},(_,i)=>`tag${i}`)])expect(await f.invoke(QUICKLINK_CHANNELS.save,{protocolVersion:1,expectedRevision:0,name:record.name,url:record.url,tags})).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(f.backend.save).toHaveBeenCalledTimes(2);expect(f.actions.openUrl).not.toHaveBeenCalled();
});

it('acknowledges only exact presentation preferences without external effects',async()=>{
 const f=fixture();await f.version();const request={protocolVersion:1,expectedRevision:0,name:record.name,url:record.url,pinned:true,hidden:true};f.backend.save.mockResolvedValueOnce({...record,pinned:true,hidden:true});expect(await f.invoke(QUICKLINK_CHANNELS.save,request)).toMatchObject({ok:true,value:{record:{pinned:true,hidden:true}}});
 for(const receipt of [{...record,pinned:true},{...record,hidden:true},{...record,pinned:false,hidden:false}]){f.backend.save.mockResolvedValueOnce(receipt);expect(await f.invoke(QUICKLINK_CHANNELS.save,request)).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});}expect(f.backend.save).toHaveBeenCalledTimes(4);expect(f.actions.openUrl).not.toHaveBeenCalled();expect(f.actions.hide).not.toHaveBeenCalled();
});
it('refuses freshly loaded hidden literal and search targets even if a renderer invokes Open directly',async()=>{
 const f=fixture(),launcherRevision=await f.version();for(const config of [undefined,webSearch]){f.backend.get.mockResolvedValueOnce({...record,hidden:true,...(config?{webSearch:config}:{})});expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision,...(config?{query:'Public search'}:{})})).toMatchObject({ok:false,error:{code:'permission-denied',message:expect.stringContaining('Show')}});}expect(f.actions.openUrl).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
 f.backend.get.mockResolvedValueOnce({...record,hidden:false});expect(await f.invoke(QUICKLINK_CHANNELS.open,{protocolVersion:1,...selection,launcherRevision})).toMatchObject({ok:true,value:{outcome:'dispatched'}});expect(f.actions.openUrl).toHaveBeenCalledExactlyOnceWith(record.url);
});

it('registers current shown saved IDs and bounded name/host/tags without URL or native authority',async()=>{
 const f=fixture();f.backend.list.mockResolvedValue([{...selection,name:record.name,host:'example.invalid',tags:['Work','猫']},{id:'00000000-0000-4000-8000-000000000002',revision:1,name:'Hidden fixture',host:'example.invalid',hidden:true}] as never);
 const reply=await f.invoke(LAUNCHER_CHANNELS.getCommands) as Extract<LauncherCommandsReply,{ok:true}>,row=reply.value.commands.find(row=>row.id===`quicklink:${record.id}`);expect(row).toMatchObject({title:record.name,quicklink:selection,keywords:['quicklink','bookmark','Work','猫'],enabled:true});expect(reply.value.commands.some(row=>row.title==='Hidden fixture')).toBe(false);expect(JSON.stringify(reply)).not.toContain(record.url);expect(f.actions.openUrl).not.toHaveBeenCalled();expect(f.actions.recordUse).not.toHaveBeenCalled();
 for(const [channel,extra] of [[LAUNCHER_CHANNELS.execute,{}],[LAUNCHER_CHANNELS.setPinned,{pinned:true}],[LAUNCHER_CHANNELS.setAlias,{alias:'public'}],[LAUNCHER_CHANNELS.setHidden,{hidden:true}]] as const)expect(await f.invoke(channel,{protocolVersion:1,commandId:row!.id,revision:reply.value.revision,...extra})).toMatchObject({ok:false});expect(f.actions.openUrl).not.toHaveBeenCalled();expect(f.backend.save).not.toHaveBeenCalled();expect(f.actions.hide).not.toHaveBeenCalled();
});
it('pages all500 saved entries and invalidates old cursors after a definition changes or becomes hidden',async()=>{
 const f=fixture(),rows=Array.from({length:500},(_,i)=>({id:`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`,revision:1,name:`Public link ${i}`,host:'example.invalid'}));f.backend.list.mockResolvedValue(rows);let page=await f.invoke(LAUNCHER_CHANNELS.getCommands) as Extract<LauncherCommandsReply,{ok:true}>;const first=page.value,commands=[...page.value.commands];while(page.value.nextCursor){page=await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:page.value.nextCursor}) as typeof page;expect(page.ok).toBe(true);commands.push(...page.value.commands);}expect(commands.filter(row=>row.quicklink)).toHaveLength(500);expect(new Set(commands.map(row=>row.id)).size).toBe(commands.length);
 f.backend.list.mockResolvedValue(rows.map((row,index)=>index===499?{...row,revision:2,hidden:true}:row));const next=await f.invoke(LAUNCHER_CHANNELS.getCommands) as typeof page;expect(next.value.revision).toBeGreaterThan(first.revision);expect(await f.invoke(LAUNCHER_CHANNELS.getCommands,{protocolVersion:1,cursor:first.nextCursor})).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(f.actions.openUrl).not.toHaveBeenCalled();
});
it('fails old saved entries closed on unavailable storage and restores current metadata only after Reload',async()=>{
 const f=fixture();const before=await f.version();f.backend.list.mockRejectedValueOnce(new Error('PRIVATE_BACKEND_BODY'));const failed=await f.invoke(LAUNCHER_CHANNELS.getCommands) as Extract<LauncherCommandsReply,{ok:true}>;expect(failed.value.revision).toBeGreaterThan(before);expect(failed.value.commands.find(row=>row.quicklink)).toMatchObject({enabled:false,unavailableReason:expect.stringContaining('unavailable')});expect(failed.value.commands.find(row=>row.id==='linuxcast:open-quicklinks')).toMatchObject({enabled:true,subtitle:expect.stringContaining('reload')});expect(JSON.stringify(failed)).not.toContain('PRIVATE_BACKEND_BODY');
 const recovered=await f.invoke(LAUNCHER_CHANNELS.getCommands) as typeof failed;expect(recovered.value.commands.find(row=>row.quicklink)).toMatchObject({enabled:true,quicklink:selection});expect(f.actions.openUrl).not.toHaveBeenCalled();
});
it('retains parent visibility and rejects a replaced frame after awaiting saved-link metadata',async()=>{
 const f=fixture();vi.mocked(f.actions.listHidden).mockResolvedValue(['linuxcast:open-quicklinks']);const hidden=await f.invoke(LAUNCHER_CHANNELS.getCommands) as Extract<LauncherCommandsReply,{ok:true}>;expect(hidden.value.commands.find(row=>row.id==='linuxcast:open-quicklinks')).toMatchObject({hidden:true});expect(await f.invoke(LAUNCHER_CHANNELS.execute,{protocolVersion:1,commandId:`quicklink:${record.id}`,revision:hidden.value.revision})).toMatchObject({ok:false});
 const wait=deferred<{id:string;revision:number;name:string;host:string}[]>();f.backend.list.mockImplementationOnce(()=>wait.promise);const work=f.invoke(LAUNCHER_CHANNELS.getCommands);await vi.waitFor(()=>expect(f.backend.list).toHaveBeenCalledTimes(2));f.frame.url='https://example.invalid/';wait.resolve([{...selection,name:record.name,host:'example.invalid'}]);expect(await work).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(f.actions.openUrl).not.toHaveBeenCalled();
});
it('rejects corrupt duplicate/overflow summary sources and bounds the maximum Unicode launcher projection',()=>{
 const rows=Array.from({length:500},(_,i)=>({id:`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`,revision:Number.MAX_SAFE_INTEGER,name:'😀'.repeat(64),host:'x'.repeat(320),tags:Array.from({length:8},(_,n)=>'😀'.repeat(15)+n)}));const before=JSON.stringify(rows),commands=compileQuicklinkCommands(rows,true);expect(commands).toHaveLength(500);expect(JSON.stringify(rows)).toBe(before);expect(compileQuicklinkCommands(rows,false).every(row=>!row.enabled)).toBe(true);
 for(const value of [[...rows,rows[0]],[rows[0],rows[0]],rows.toReversed(),[{...rows[0],url:record.url}]])expect(()=>compileQuicklinkCommands(value,true)).toThrow();
});

it('starts a new authoritative list when post-mutation Reload joins a discarded older read',async()=>{
 const f=fixture();await f.version();const old=deferred<{id:string;revision:number;name:string;host:string}[]>();f.backend.list.mockImplementationOnce(()=>old.promise);const before=f.invoke(LAUNCHER_CHANNELS.getCommands);await vi.waitFor(()=>expect(f.backend.list).toHaveBeenCalledTimes(2));
 f.backend.save.mockResolvedValueOnce({...record,revision:2,hidden:true});expect(await f.invoke(QUICKLINK_CHANNELS.save,{protocolVersion:1,id:record.id,expectedRevision:1,name:record.name,url:record.url,hidden:true})).toMatchObject({ok:true});f.backend.list.mockResolvedValue([{...selection,revision:2,name:record.name,host:'example.invalid',hidden:true}] as never);
 const after=f.invoke(LAUNCHER_CHANNELS.getCommands);await new Promise(resolve=>setImmediate(resolve));expect(f.backend.list).toHaveBeenCalledTimes(2);old.resolve([{...selection,name:record.name,host:'example.invalid'}]);expect(await before).toMatchObject({ok:false,error:{code:'cancelled'}});const fresh=await after as Extract<LauncherCommandsReply,{ok:true}>;expect(fresh.ok).toBe(true);expect(f.backend.list).toHaveBeenCalledTimes(3);expect(fresh.value.commands.some(row=>row.quicklink)).toBe(false);expect(f.actions.openUrl).not.toHaveBeenCalled();
});

it('changes only the parent visibility descriptor so existing exact visibility acknowledgements remain usable',async()=>{
 let hidden:string[]=[];const f=fixture({listHidden:vi.fn(async()=>hidden),setHidden:vi.fn(async(commandId,value)=>{hidden=value?[commandId]:[];return {commandId,hidden:value};})}),before=await f.invoke(LAUNCHER_CHANNELS.getCommands) as Extract<LauncherCommandsReply,{ok:true}>;
 const after=await f.invoke(LAUNCHER_CHANNELS.setHidden,{protocolVersion:1,commandId:'linuxcast:open-quicklinks',revision:before.value.revision,hidden:true}) as typeof before;expect(after.ok).toBe(true);expect(after.value.revision).toBe(before.value.revision+1);expect(after.value.commands.find(row=>row.id==='linuxcast:open-quicklinks')).toMatchObject({hidden:true});for(const row of before.value.commands.filter(row=>row.id!=='linuxcast:open-quicklinks'))expect(after.value.commands.find(next=>next.id===row.id)).toEqual(row);expect(f.actions.openUrl).not.toHaveBeenCalled();
});
