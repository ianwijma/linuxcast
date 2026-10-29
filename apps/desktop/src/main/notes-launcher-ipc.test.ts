import {afterEach,expect,it,vi} from 'vitest';
import type {IpcMainInvokeEvent,WebContents} from 'electron';
import {NOTES_LAUNCHER_CHANNELS as C,type LauncherNoteOpenReply,type NotesRootSearch} from '../../../../packages/contracts/src/notes-launcher.ts';
import {emptyNoteDocument,type NoteRecord} from '../../../../packages/contracts/src/notes.ts';
import {registerLauncherNotesIpc} from './notes-launcher-ipc.ts';
import {NotesOpenUnavailable} from './notes-open-ipc.ts';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',time='2026-10-29T00:00:00.000Z';
const selection={id,revision:3},summary={...selection,title:'Public note',excerpt:'Public body',pinned:false,hasDraft:true,updatedAt:time};
const record:NoteRecord={...selection,documentVersion:1,pinned:false,archived:false,trashed:false,draft:{title:summary.title,document:emptyNoteDocument()},saved:null,createdAt:time,updatedAt:time};
const cleanups:(()=>void)[]=[];
afterEach(()=>{for(const cleanup of cleanups.splice(0))cleanup();vi.useRealTimers();vi.restoreAllMocks();});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function fixture(){
 const frame={url:'linuxcast://app/index.html'},owner={mainFrame:frame} as unknown as WebContents,event={sender:owner,senderFrame:frame} as IpcMainInvokeEvent;
 const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>(),state={active:true,busy:false,revision:7,generation:0};
 const actions={search:vi.fn(async(query:string):Promise<NotesRootSearch>=>({query,records:[summary],hasMore:false})),get:vi.fn(async(_id:string):Promise<NoteRecord|null>=>{void _id;return record;}),open:vi.fn(async(_selection:typeof selection,_current:()=>boolean)=>{void _selection;void _current;})};
 const release=vi.fn(()=>{state.busy=false;});
 const context={trusted:(sender:IpcMainInvokeEvent)=>sender.sender===owner&&sender.senderFrame===frame,active:()=>state.active,busy:()=>state.busy,revision:()=>state.revision,generation:()=>state.generation,authorize:vi.fn(async(_sender:IpcMainInvokeEvent,_revision:number):Promise<Extract<LauncherNoteOpenReply,{ok:false}>|undefined>=>{void _sender;void _revision;return undefined;}),acquire:vi.fn(()=>{state.busy=true;state.generation++;return release;}),recordUse:vi.fn(async()=>{})};
 const remove=registerLauncherNotesIpc({handle:(channel,handler)=>handlers.set(channel,handler),removeHandler:channel=>handlers.delete(channel)},actions,context,40,80);cleanups.push(remove);
 const invoke=(channel:string,payload:unknown,sender=event)=>Promise.resolve(handlers.get(channel)!(sender,payload));
 const search=(query='Public')=>invoke(C.search,{protocolVersion:1,revision:7,query});
 const open=(value=selection)=>invoke(C.open,{protocolVersion:1,revision:7,selection:value});
 return {actions,context,state,event,handlers,release,remove,invoke,search,open};
}
it('issues exact current results, deliberately opens once, and records only fixed parent use',async()=>{
 const f=fixture();expect(await f.search()).toEqual({ok:true,value:{query:'Public',records:[summary],hasMore:false,revision:7}});
 expect(await f.open()).toEqual({ok:true,value:{outcome:'opened',selection}});expect(f.actions.get).toHaveBeenCalledExactlyOnceWith(id);expect(f.actions.open).toHaveBeenCalledWith(selection,expect.any(Function));expect(f.context.recordUse).toHaveBeenCalledExactlyOnceWith();expect(f.release).toHaveBeenCalledTimes(1);
 expect(await f.open()).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.actions.open).toHaveBeenCalledTimes(1);
});
it('denies forged senders, subframes and caller authority before any source access',async()=>{
 const f=fixture();for(const channel of [C.search,C.open])for(const sender of [{...f.event,sender:{}},{...f.event,senderFrame:{url:'linuxcast://app/index.html'}}])expect(await f.invoke(channel,{protocolVersion:1,revision:7,query:'Public',selection},sender as IpcMainInvokeEvent)).toMatchObject({ok:false,error:{code:'permission-denied'}});
 for(const payload of [{protocolVersion:1,revision:7,query:'Public',path:'/tmp/public'},{protocolVersion:1,revision:6,query:'Public'},{protocolVersion:1,revision:7,query:'x'.repeat(513)},{protocolVersion:1,revision:7,query:'x\0'}])expect(await f.invoke(C.search,payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
 for(const payload of [{protocolVersion:1,revision:7,selection:{...selection,path:'/tmp/public'}},{protocolVersion:1,revision:7,selection,content:'caller'},{protocolVersion:1,revision:7,selection:{id:'note:'+id,revision:3}}])expect(await f.invoke(C.open,payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
 expect(f.actions.search).not.toHaveBeenCalled();expect(f.actions.get).not.toHaveBeenCalled();expect(f.context.acquire).not.toHaveBeenCalled();
});
it('publishes only the newest search and never admits an old-query selection',async()=>{
 const f=fixture(),old=deferred<NotesRootSearch>();f.actions.search.mockReturnValueOnce(old.promise);const first=f.search('old');await Promise.resolve();await Promise.resolve();f.actions.search.mockResolvedValueOnce({query:'new',records:[{...summary,id:other}],hasMore:false});expect(await f.search('new')).toMatchObject({ok:true});old.resolve({query:'old',records:[summary],hasMore:false});expect(await first).toMatchObject({ok:false});expect(await f.open()).toMatchObject({ok:false,error:{code:'conflict'}});expect(await f.open({id:other,revision:99})).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.actions.open).not.toHaveBeenCalled();
});
it.each(['echo','duplicate','order','more'] as const)('rejects malformed source %s without issuing navigation authority',async mode=>{
 const f=fixture(),result=mode==='echo'?{query:'wrong',records:[summary],hasMore:false}:mode==='duplicate'?{query:'Public',records:[summary,summary],hasMore:false}:mode==='order'?{query:'Public',records:[summary,{...summary,id:other,pinned:true}],hasMore:false}:{query:'Public',records:[summary],hasMore:true};f.actions.search.mockResolvedValueOnce(result);expect(await f.search()).toMatchObject({ok:false});expect(await f.open()).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.actions.open).not.toHaveBeenCalled();
});
it('holds four timed-out actual search slots until their underlying reads settle',async()=>{
 vi.useFakeTimers();const f=fixture(),read=deferred<NotesRootSearch>();f.actions.search.mockReturnValue(read.promise);const pending:Promise<unknown>[]=[];for(let n=0;n<4;n++){pending.push(f.search('Public'));await Promise.resolve();await Promise.resolve();}await vi.advanceTimersByTimeAsync(41);for(const reply of await Promise.all(pending))expect(reply).toMatchObject({ok:false});expect(f.actions.search).toHaveBeenCalledTimes(4);expect(await f.search()).toMatchObject({ok:false});expect(f.actions.search).toHaveBeenCalledTimes(4);read.resolve({query:'Public',records:[summary],hasMore:false});await Promise.resolve();await Promise.resolve();await Promise.resolve();f.actions.search.mockResolvedValue({query:'Public',records:[summary],hasMore:false});expect(await f.search()).toMatchObject({ok:true});
});
it('rechecks visibility after search and refuses publication after context changes',async()=>{
 const f=fixture();f.context.authorize.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ok:false,error:{code:'permission-denied',message:'Public denied',retryable:false}});expect(await f.search()).toMatchObject({ok:false,error:{code:'permission-denied'}});expect(await f.open()).toMatchObject({ok:false,error:{code:'conflict'}});
 const read=deferred<NotesRootSearch>();f.actions.search.mockReturnValueOnce(read.promise);const pending=f.search();await Promise.resolve();await Promise.resolve();f.state.generation++;read.resolve({query:'Public',records:[summary],hasMore:false});expect(await pending).toMatchObject({ok:false});
});
it.each(['missing','id','revision','archived','trashed'] as const)('denies a fresh %s source before opening',async mode=>{
 const f=fixture();await f.search();f.actions.get.mockResolvedValueOnce(mode==='missing'?null:{...record,...(mode==='id'?{id:other}:mode==='revision'?{revision:4}:mode==='archived'?{archived:true}:{trashed:true})});expect(await f.open()).toMatchObject({ok:false,error:{code:'conflict'}});expect(f.actions.open).not.toHaveBeenCalled();expect(f.context.recordUse).not.toHaveBeenCalled();expect(f.release).toHaveBeenCalledTimes(1);
});
it('checks final visibility and invoking context after asynchronous source preflight',async()=>{
 const f=fixture();await f.search();const gate=deferred<Extract<LauncherNoteOpenReply,{ok:false}>|undefined>();f.context.authorize.mockResolvedValueOnce(undefined).mockReturnValueOnce(gate.promise);const pending=f.open();await Promise.resolve();await Promise.resolve();await Promise.resolve();f.state.active=false;gate.resolve(undefined);expect(await pending).toMatchObject({ok:false,error:{code:'cancelled'}});expect(f.actions.open).not.toHaveBeenCalled();expect(f.context.recordUse).not.toHaveBeenCalled();
});
it('retains timed-out Open preflight until settlement and never dispatches its late source result',async()=>{
 vi.useFakeTimers();const f=fixture();await f.search();const get=deferred<NoteRecord|null>();f.actions.get.mockReturnValueOnce(get.promise);const pending=f.open();await vi.advanceTimersByTimeAsync(81);expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.release).not.toHaveBeenCalled();expect(await f.search()).toMatchObject({ok:false});expect(await f.open()).toMatchObject({ok:false});get.resolve(record);await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(f.actions.open).not.toHaveBeenCalled();expect(f.release).toHaveBeenCalledTimes(1);expect(f.context.recordUse).not.toHaveBeenCalled();
});
it('holds a delivered unknown Open until actual completion and records no late success or replay',async()=>{
 vi.useFakeTimers();const f=fixture();await f.search();const opened=deferred<void>();f.actions.open.mockReturnValueOnce(opened.promise);const pending=f.open();await vi.advanceTimersByTimeAsync(81);expect(await pending).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.actions.open).toHaveBeenCalledTimes(1);expect(f.release).not.toHaveBeenCalled();opened.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();expect(f.context.recordUse).not.toHaveBeenCalled();expect(f.release).toHaveBeenCalledTimes(1);expect(await f.open()).toMatchObject({ok:false,error:{code:'conflict'}});
});
it.each(['not-opened','unknown'] as const)('distinguishes fixed %s refusal and sanitizes errors without retry',async outcome=>{
 const f=fixture();await f.search();f.actions.open.mockRejectedValueOnce(new NotesOpenUnavailable(outcome));expect(await f.open()).toMatchObject({ok:false,error:{code:outcome==='not-opened'?'capability-unavailable':'deadline-exceeded'}});expect(f.actions.open).toHaveBeenCalledTimes(1);expect(f.context.recordUse).not.toHaveBeenCalled();await f.search();f.actions.open.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));expect(JSON.stringify(await f.open())).not.toContain('SYNTHETIC_PRIVATE');
});
it('invalidates issued choices across a completed context generation change',async()=>{
 const f=fixture();await f.search();f.state.generation++;expect(await f.open()).toMatchObject({ok:false});expect(f.actions.open).not.toHaveBeenCalled();
});
it('does not publish search after monotonic expiry before a delayed timer callback',async()=>{
 vi.useFakeTimers();let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock);const f=fixture(),gate=deferred<Extract<LauncherNoteOpenReply,{ok:false}>|undefined>();f.context.authorize.mockReturnValueOnce(gate.promise);const pending=f.search();await Promise.resolve();clock=41;gate.resolve(undefined);expect(await pending).toMatchObject({ok:false});expect(f.actions.search).not.toHaveBeenCalled();
});
it('does not dispatch Open after monotonic preflight expiry before its timer fires',async()=>{
 vi.useFakeTimers();let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock);const f=fixture();await f.search();const get=deferred<NoteRecord|null>();f.actions.get.mockReturnValueOnce(get.promise);const pending=f.open();await Promise.resolve();await Promise.resolve();clock=81;get.resolve(record);expect(await pending).toMatchObject({ok:false});expect(f.actions.open).not.toHaveBeenCalled();expect(f.context.recordUse).not.toHaveBeenCalled();
});
it('removes only fixed handlers and cancels in-flight publication on disposal',async()=>{
 const f=fixture(),read=deferred<NotesRootSearch>();f.actions.search.mockReturnValueOnce(read.promise);const pending=f.search();await Promise.resolve();await Promise.resolve();f.remove();read.resolve({query:'Public',records:[summary],hasMore:false});expect(await pending).toMatchObject({ok:false});expect(f.handlers.size).toBe(0);
});
