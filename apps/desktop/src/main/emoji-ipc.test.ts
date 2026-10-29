import {afterEach,expect,it,vi} from 'vitest';
import type {IpcMainInvokeEvent,WebContents} from 'electron';
import {registerEmojiIpc} from './emoji-ipc.ts';
import {registerLauncherIpc} from './launcher-ipc.ts';
import {APP_URL} from './assets.ts';
import {LAUNCHER_CHANNELS,launcherCommandsReplySchema} from '../../../../packages/contracts/src/launcher.ts';
import type {EmojiBackend} from './emoji-ipc.ts';
import {EMOJI_CHANNELS,canonicalEmojiId,emojiSearchReplySchema} from '../../../../packages/contracts/src/emoji.ts';
import type {EmojiCopyReply,EmojiRow,EmojiSearchValue} from '../../../../packages/contracts/src/emoji.ts';
// Synthetic transport, catalogue and clipboard backend; not desktop integration.
const row:EmojiRow={id:canonicalEmojiId('👩🏽‍💻'),value:'👩🏽‍💻',name:'woman technologist: medium skin tone',group:'People & Body',subgroup:'person-role',version:'4.0'};
const other:EmojiRow={id:canonicalEmojiId('😀'),value:'😀',name:'grinning face',group:'Smileys & Emotion',subgroup:'face-smiling',version:'1.0'};
const denied:Extract<EmojiCopyReply,{ok:false}>={ok:false,error:{code:'permission-denied',retryable:false,message:'Synthetic hidden command.'}};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function fixture(){
 const frame={url:'linuxcast://synthetic-shell'},owner={} as WebContents,event={sender:owner,senderFrame:frame} as unknown as IpcMainInvokeEvent;
 const state={active:true,busy:false,revision:5,generation:1};
 const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
 const backend={groups:[{id:row.group,name:row.group,count:2418},{id:other.group,name:other.group,count:171}],search:vi.fn<EmojiBackend['search']>(async()=>[row]),get:vi.fn<EmojiBackend['get']>(id=>id===row.id?row:id===other.id?other:undefined)};
 const released=vi.fn(()=>{state.busy=false;});
 const context:Parameters<typeof registerEmojiIpc>[2]={trusted:vi.fn(e=>e.sender===owner&&e.senderFrame===event.senderFrame&&frame.url==='linuxcast://synthetic-shell'),active:()=>state.active,busy:()=>state.busy,revision:()=>state.revision,generation:()=>state.generation,authorize:vi.fn(async()=>undefined),acquire:vi.fn(()=>{state.busy=true;state.generation++;return released;}),recordUse:vi.fn(async()=>{}),copy:vi.fn(async()=>'written' as const)};
 const remove=registerEmojiIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},backend,context);
 const invoke=(channel:string,payload:unknown,sender=event)=>Promise.resolve(handlers.get(channel)!(sender,payload));
 const search=(query='coder')=>invoke(EMOJI_CHANNELS.search,{protocolVersion:1,revision:state.revision,query});
 const issue=async(query='coder')=>{const reply=emojiSearchReplySchema.parse(await search(query));expect(reply.ok).toBe(true);if(!reply.ok)throw new Error('Synthetic issue failed');return reply.value;};
 const selection=(choice:EmojiSearchValue)=>({protocolVersion:1,revision:choice.revision,query:choice.query,searchId:choice.searchId,...(choice.group?{group:choice.group}:{}),id:row.id});
 return {state,frame,event,backend,context,released,handlers,remove,invoke,search,issue,selection};
}
afterEach(()=>vi.useRealTimers());
it('issues bounded metadata without a clipboard effect, then resolves canonical ID and permits deliberate repeated Copy',async()=>{
 const f=fixture(),choice=await f.issue('SYNTHETIC_PUBLIC_QUERY');expect(choice).toMatchObject({datasetVersion:'17.0',records:[row]});expect(f.context.copy).not.toHaveBeenCalled();expect(f.context.recordUse).not.toHaveBeenCalled();
 for(let n=0;n<2;n++){expect(await f.invoke(EMOJI_CHANNELS.copy,f.selection(choice))).toEqual({ok:true,value:{outcome:'copied',revision:5,searchId:choice.searchId,query:choice.query,group:null,id:row.id,value:row.value}});expect(f.state.busy).toBe(false);}
 expect(f.backend.get).toHaveBeenNthCalledWith(1,row.id);expect(f.backend.get).toHaveBeenCalledTimes(2);expect(f.context.copy).toHaveBeenNthCalledWith(1,row.value);expect(f.context.copy).toHaveBeenCalledTimes(2);expect(f.context.recordUse).toHaveBeenCalledWith();expect(f.context.recordUse).toHaveBeenCalledTimes(2);expect(JSON.stringify(vi.mocked(f.context.recordUse).mock.calls)).not.toContain('SYNTHETIC_PUBLIC_QUERY');expect(f.released).toHaveBeenCalledTimes(2);
});
it('refuses malformed/current-revision and foreign-frame requests before catalogue/clipboard access',async()=>{
 const f=fixture();for(const channel of Object.values(EMOJI_CHANNELS))expect(await f.invoke(channel,{}, {...f.event,senderFrame:{url:f.frame.url}} as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});
 for(const payload of [{protocolVersion:1,revision:4,query:'coder'},{protocolVersion:2,revision:5,query:'coder'},{protocolVersion:1,revision:5,query:'coder',provider:'hidden'},{protocolVersion:1,revision:5,query:'x'.repeat(513)},{protocolVersion:1,revision:5,query:'\u202e'}])expect(await f.invoke(EMOJI_CHANNELS.search,payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
 expect(f.backend.search).not.toHaveBeenCalled();expect(f.context.copy).not.toHaveBeenCalled();expect(f.context.authorize).not.toHaveBeenCalled();
});
it('denies unavailable/hidden contexts before search or canonical ID access',async()=>{
 const f=fixture();f.state.active=false;expect(await f.search()).toMatchObject({ok:false,error:{code:'cancelled'}});f.state.active=true;vi.mocked(f.context.authorize).mockResolvedValue(denied);expect(await f.search()).toEqual(denied);expect(f.backend.search).not.toHaveBeenCalled();expect(f.context.copy).not.toHaveBeenCalled();
});
it.each(['frame','visibility','revision','metadata','busy','disposal'] as const)('invalidates a search after %s changes during awaited authorization',async mode=>{
 const f=fixture(),auth=deferred<undefined>();vi.mocked(f.context.authorize).mockReturnValueOnce(auth.promise);const pending=f.search();
 if(mode==='frame')f.frame.url='https://example.invalid';else if(mode==='visibility')f.state.active=false;else if(mode==='revision')f.state.revision++;else if(mode==='metadata')f.state.generation++;else if(mode==='busy')f.state.busy=true;else f.remove();auth.resolve(undefined);
 expect(await pending).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.backend.search).not.toHaveBeenCalled();expect(f.context.copy).not.toHaveBeenCalled();
});
it('keeps only the newest completed search; stale release cannot cancel its replacement',async()=>{
 const f=fixture(),held=deferred<readonly EmojiRow[]>();f.backend.search.mockReturnValueOnce(held.promise);const older=f.search('old');await vi.waitFor(()=>expect(f.backend.search).toHaveBeenCalledTimes(1));const newest=await f.issue('new');
 held.resolve([row]);expect(await older).toMatchObject({ok:false,error:{code:'cancelled'}});expect(await f.invoke(EMOJI_CHANNELS.release,{protocolVersion:1,revision:5,searchId:newest.searchId-1})).toMatchObject({ok:true});expect(await f.invoke(EMOJI_CHANNELS.copy,f.selection(newest))).toMatchObject({ok:true,value:{value:row.value}});
});
it('retains four timed-out actual search slots until their authorization settles and does not queue a fifth',async()=>{
 vi.useFakeTimers();const f=fixture(),held=deferred<undefined>();vi.mocked(f.context.authorize).mockReturnValue(held.promise);const pending=Array.from({length:4},()=>f.search());await vi.advanceTimersByTimeAsync(4001);
 for(const result of await Promise.all(pending))expect(result).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(await f.search()).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.backend.search).not.toHaveBeenCalled();held.resolve(undefined);await vi.advanceTimersByTimeAsync(0);vi.mocked(f.context.authorize).mockResolvedValue(undefined);expect(await f.search()).toMatchObject({ok:true});expect(f.backend.search).toHaveBeenCalledTimes(1);
});
it('uses a monotonic search deadline before a late callback even if its timer has not run',async()=>{
 const f=fixture(),held=deferred<undefined>(),clock=vi.spyOn(performance,'now').mockReturnValue(0);vi.mocked(f.context.authorize).mockReturnValueOnce(held.promise);
 try{const pending=f.search();clock.mockReturnValue(4001);held.resolve(undefined);expect(await pending).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.backend.search).not.toHaveBeenCalled();}finally{clock.mockRestore();}
});
it('rejects malformed backend metadata/pages and does not issue choices that can Copy',async()=>{
 for(const rows of [[{...row,value:'👩‍💻'}],[row,row],Array.from({length:101},()=>row),[{...row,group:'Unknown'}]]){const f=fixture();f.backend.search.mockResolvedValueOnce(rows);expect(await f.search()).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(await f.invoke(EMOJI_CHANNELS.copy,{protocolVersion:1,revision:5,searchId:1,query:'coder',id:row.id})).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.context.copy).not.toHaveBeenCalled();}
});
it('binds Copy to the issued query, category, current catalogue generation, canonical choice and exact sender',async()=>{
 const f=fixture(),choice=await f.issue(),payload=f.selection(choice);
 for(const patch of [{searchId:choice.searchId+1},{query:'different'},{group:row.group},{id:other.id}])expect(await f.invoke(EMOJI_CHANNELS.copy,{...payload,...patch})).toMatchObject({ok:false,error:{code:'conflict'}});
 for(const patch of [{value:'caller text'},{path:'/tmp/public'},{provider:'hidden'},{ids:[row.id]}])expect(await f.invoke(EMOJI_CHANNELS.copy,{...payload,...patch})).toMatchObject({ok:false,error:{code:'invalid-request'}});
 f.state.generation++;expect(await f.invoke(EMOJI_CHANNELS.copy,payload)).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.backend.get).not.toHaveBeenCalled();expect(f.context.copy).not.toHaveBeenCalled();
});
it('checks canonical source again before the effect and refuses missing/wrong identity/value',async()=>{
 for(const source of [undefined,other,{...row,value:'👩‍💻'}]){const f=fixture(),choice=await f.issue();f.backend.get.mockReturnValueOnce(source);expect(await f.invoke(EMOJI_CHANNELS.copy,f.selection(choice))).toMatchObject({ok:false});expect(f.context.copy).not.toHaveBeenCalled();expect(f.released).toHaveBeenCalledTimes(1);expect(f.state.busy).toBe(false);}
});
it('rechecks authorization after source lookup before dispatch',async()=>{
 const f=fixture(),choice=await f.issue();vi.mocked(f.context.authorize).mockResolvedValueOnce(undefined).mockResolvedValueOnce(denied);expect(await f.invoke(EMOJI_CHANNELS.copy,f.selection(choice))).toEqual(denied);expect(f.backend.get).toHaveBeenCalledWith(row.id);expect(f.context.copy).not.toHaveBeenCalled();expect(f.released).toHaveBeenCalledTimes(1);
});
it('release during Copy authorization prevents the write while retaining its reserved slot until settlement',async()=>{
 const f=fixture(),choice=await f.issue(),auth=deferred<undefined>();vi.mocked(f.context.authorize).mockReturnValueOnce(auth.promise);const pending=f.invoke(EMOJI_CHANNELS.copy,f.selection(choice));expect(f.state.busy).toBe(true);expect(await f.invoke(EMOJI_CHANNELS.release,{protocolVersion:1,revision:5,searchId:choice.searchId})).toMatchObject({ok:true});expect(f.state.busy).toBe(true);expect(await f.search()).toMatchObject({ok:false,error:{code:'cancelled'}});
 auth.resolve(undefined);expect(await pending).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.context.copy).not.toHaveBeenCalled();expect(f.state.busy).toBe(false);expect(f.released).toHaveBeenCalledTimes(1);
});
it('retains an actual dispatched Copy through release/deadline; no queued write, success or replay follows',async()=>{
 vi.useFakeTimers();const f=fixture(),choice=await f.issue(),write=deferred<'written'>();vi.mocked(f.context.copy!).mockReturnValueOnce(write.promise);const payload=f.selection(choice),pending=f.invoke(EMOJI_CHANNELS.copy,payload);await vi.advanceTimersByTimeAsync(1);expect(f.context.copy).toHaveBeenCalledTimes(1);
 expect(await f.invoke(EMOJI_CHANNELS.copy,payload)).toMatchObject({ok:false,error:{code:'cancelled'}});await f.invoke(EMOJI_CHANNELS.release,{protocolVersion:1,revision:5,searchId:choice.searchId});await vi.advanceTimersByTimeAsync(4001);expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.state.busy).toBe(true);expect(f.released).not.toHaveBeenCalled();expect(await f.search()).toMatchObject({ok:false,error:{code:'cancelled'}});
 write.resolve('written');await vi.advanceTimersByTimeAsync(0);expect(f.released).toHaveBeenCalledTimes(1);expect(f.context.recordUse).not.toHaveBeenCalled();expect(f.state.busy).toBe(false);expect(await f.invoke(EMOJI_CHANNELS.copy,payload)).toMatchObject({ok:false,error:{code:'conflict'}});const fresh=await f.issue();expect(f.context.copy).toHaveBeenCalledTimes(1);expect(await f.invoke(EMOJI_CHANNELS.copy,f.selection(fresh))).toMatchObject({ok:true});expect(f.context.copy).toHaveBeenCalledTimes(2);
});
it('stale release cannot cancel a newer Copy that is already awaiting its actual clipboard writer',async()=>{
 const f=fixture(),old=await f.issue(),fresh=await f.issue(),held=deferred<'written'>();vi.mocked(f.context.copy!).mockReturnValueOnce(held.promise);const pending=f.invoke(EMOJI_CHANNELS.copy,f.selection(fresh));await vi.waitFor(()=>expect(f.context.copy).toHaveBeenCalledTimes(1));await f.invoke(EMOJI_CHANNELS.release,{protocolVersion:1,revision:5,searchId:old.searchId});held.resolve('written');expect(await pending).toMatchObject({ok:true,value:{searchId:fresh.searchId}});expect(f.released).toHaveBeenCalledTimes(1);
});
it('does not dispatch Copy after its monotonic authorization deadline',async()=>{
 const f=fixture(),choice=await f.issue(),auth=deferred<undefined>(),clock=vi.spyOn(performance,'now').mockReturnValue(0);vi.mocked(f.context.authorize).mockReturnValueOnce(auth.promise);
 try{const pending=f.invoke(EMOJI_CHANNELS.copy,f.selection(choice));clock.mockReturnValue(4001);auth.resolve(undefined);expect(await pending).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.context.copy).not.toHaveBeenCalled();expect(f.released).toHaveBeenCalledTimes(1);}finally{clock.mockRestore();}
});
it.each(['visibility','frame','revision','metadata','disposal'] as const)('rejects a late written outcome after %s invalidates the Copy context',async mode=>{
 const f=fixture(),choice=await f.issue(),held=deferred<'written'>();vi.mocked(f.context.copy!).mockReturnValueOnce(held.promise);const pending=f.invoke(EMOJI_CHANNELS.copy,f.selection(choice));await vi.waitFor(()=>expect(f.context.copy).toHaveBeenCalledTimes(1));
 if(mode==='visibility')f.state.active=false;else if(mode==='frame')f.frame.url='https://example.invalid';else if(mode==='revision')f.state.revision++;else if(mode==='metadata')f.state.generation++;else f.remove();held.resolve('written');expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.context.recordUse).not.toHaveBeenCalled();expect(f.released).toHaveBeenCalledTimes(1);expect(f.context.copy).toHaveBeenCalledTimes(1);if(mode==='disposal')expect(f.handlers.size).toBe(0);
});
it('reports known missing/unsupported/busy clipboard capability without claiming success or recording use',async()=>{
 for(const outcome of ['missing','unsupported','busy'] as const){const f=fixture(),choice=await f.issue();if(outcome==='missing')delete f.context.copy;else vi.mocked(f.context.copy!).mockResolvedValueOnce(outcome);expect(await f.invoke(EMOJI_CHANNELS.copy,f.selection(choice))).toMatchObject({ok:false,error:{code:outcome==='busy'?'cancelled':'capability-unavailable'}});expect(f.context.recordUse).not.toHaveBeenCalled();expect(f.state.busy).toBe(false);}
});
it.each(['throw','forged'] as const)('redacts an unknown %s clipboard outcome and requires a fresh search before another explicit Copy',async mode=>{
 const f=fixture(),choice=await f.issue();if(mode==='throw')vi.mocked(f.context.copy!).mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE_QUERY'));else vi.mocked(f.context.copy!).mockResolvedValueOnce('completed' as never);const payload=f.selection(choice),reply=await f.invoke(EMOJI_CHANNELS.copy,payload);expect(reply).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE_QUERY');expect(await f.invoke(EMOJI_CHANNELS.copy,payload)).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.context.copy).toHaveBeenCalledTimes(1);const fresh=await f.issue();expect(f.context.copy).toHaveBeenCalledTimes(1);expect(await f.invoke(EMOJI_CHANNELS.copy,f.selection(fresh))).toMatchObject({ok:true});
});
it('keeps the Copy reservation through a delayed usage checkpoint and rejects a late success after timeout',async()=>{
 vi.useFakeTimers();const f=fixture(),choice=await f.issue(),held=deferred<void>();vi.mocked(f.context.recordUse).mockReturnValueOnce(held.promise);const pending=f.invoke(EMOJI_CHANNELS.copy,f.selection(choice));await vi.advanceTimersByTimeAsync(4001);expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.state.busy).toBe(true);expect(f.context.copy).toHaveBeenCalledTimes(1);expect(await f.search()).toMatchObject({ok:false,error:{code:'cancelled'}});held.resolve();await vi.advanceTimersByTimeAsync(0);expect(f.state.busy).toBe(false);expect(f.released).toHaveBeenCalledTimes(1);
});
it('passes a category only to local search and binds its issued choices to that exact category',async()=>{
 const f=fixture(),reply=emojiSearchReplySchema.parse(await f.invoke(EMOJI_CHANNELS.search,{protocolVersion:1,revision:5,query:'coder',group:row.group}));expect(reply.ok).toBe(true);if(!reply.ok)throw new Error('Synthetic grouped search failed');expect(f.backend.search).toHaveBeenCalledExactlyOnceWith({query:'coder',group:row.group});expect(reply.value.group).toBe(row.group);
 const payload=f.selection(reply.value);expect(await f.invoke(EMOJI_CHANNELS.copy,{...payload,group:other.group})).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.context.copy).not.toHaveBeenCalled();expect(await f.invoke(EMOJI_CHANNELS.copy,payload)).toMatchObject({ok:true,value:{group:row.group,value:row.value}});
});
it('registers Emoji but refuses generic Execute without simulated completion, Hide, clipboard access or usage',async()=>{
 const frame={url:APP_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>APP_URL} as unknown as WebContents,event={sender:contents,senderFrame:frame} as unknown as IpcMainInvokeEvent,handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
 const search=vi.fn(async()=>[row]),get=vi.fn(()=>row),copy=vi.fn(async()=>'written' as const),hide=vi.fn(),recordUse=vi.fn(async()=>{});
 const remove=registerLauncherIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}}, {contents:()=>contents,quitting:()=>false,hide,quit:()=>{},openDataSettings:async()=>{},recordUse,copyCalculatorResult:copy,emojiVisible:()=>true,emoji:{groups:[{id:row.group,name:row.group,count:2418}],search,get}});
 try{const catalogue=launcherCommandsReplySchema.parse(await handlers.get(LAUNCHER_CHANNELS.getCommands)!(event,{protocolVersion:1}));expect(catalogue.ok).toBe(true);if(!catalogue.ok)throw new Error('Synthetic catalogue failed');expect(catalogue.value.commands.find(command=>command.id==='linuxcast:emoji')).toMatchObject({enabled:true});
  expect(await handlers.get(LAUNCHER_CHANNELS.execute)!(event,{protocolVersion:1,revision:catalogue.value.revision,commandId:'linuxcast:emoji'})).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(hide).not.toHaveBeenCalled();expect(recordUse).not.toHaveBeenCalled();expect(copy).not.toHaveBeenCalled();expect(search).not.toHaveBeenCalled();expect(get).not.toHaveBeenCalled();
 }finally{remove();}expect(handlers.size).toBe(0);
});
