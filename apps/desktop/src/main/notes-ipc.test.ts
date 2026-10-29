import {afterEach,expect,it,vi} from 'vitest';
import type {IpcMainInvokeEvent,WebContents} from 'electron';
import {randomUUID} from 'node:crypto';
import {NOTES_CHANNELS,emptyNoteDocument} from '../../../../packages/contracts/src/notes.ts';
import type {NoteRecord,NoteWrite,NotesList} from '../../../../packages/contracts/src/notes.ts';
import {registerNotesIpc} from './notes-ipc.ts';
import {NOTES_URL} from './assets.ts';
const time='2026-10-29T00:00:00.000Z',content={title:'Public note',document:emptyNoteDocument()};
const input=():NoteWrite=>({id:randomUUID(),expectedRevision:0,action:'draft',content});
const row=(request:NoteWrite):NoteRecord=>({id:request.id,documentVersion:1,revision:request.expectedRevision+1,draft:request.content,saved:request.action==='save'?request.content:null,createdAt:time,updatedAt:time});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function fixture(){
 const frame={url:NOTES_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>frame.url} as unknown as WebContents,event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
 const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
 const actions={contents:()=>contents,active:()=>true,ready:()=>true,appearance:()=>'dark' as const,close:vi.fn(),get:vi.fn(async(id:string)=>{void id;return null as NoteRecord|null;}),list:vi.fn(async(request:{query:string}):Promise<NotesList>=>({query:request.query,records:[],nextCursor:null})),write:vi.fn(async(request:NoteWrite)=>row(request))};
 const ipc=registerNotesIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},actions);
 const invoke=(channel:string,payload:unknown={protocolVersion:1},sender=event)=>Promise.resolve(handlers.get(channel)!(sender,payload));
 return {actions,frame,event,invoke,ipc,handlers};
}
afterEach(()=>vi.useRealTimers());
it('denies foreign owners, subframes, navigation and unsupported authority before owner access',async()=>{
 const f=fixture();for(const channel of Object.values(NOTES_CHANNELS))for(const event of [{...f.event,sender:{}},{...f.event,senderFrame:{url:NOTES_URL}}])expect(await f.invoke(channel,{protocolVersion:1},event as IpcMainInvokeEvent)).toMatchObject({ok:false});
 for(const payload of [{protocolVersion:2,id:randomUUID()},{protocolVersion:1,id:randomUUID(),path:'/tmp/public'},{protocolVersion:1,input:{...input(),action:'execute'}}])expect(await f.invoke(NOTES_CHANNELS.write,payload)).toMatchObject({ok:false,error:{code:'invalid-request'}});
 f.frame.url='https://example.invalid';expect(await f.invoke(NOTES_CHANNELS.list,{protocolVersion:1,query:''})).toMatchObject({ok:false});expect(f.actions.get).not.toHaveBeenCalled();expect(f.actions.list).not.toHaveBeenCalled();expect(f.actions.write).not.toHaveBeenCalled();
 f.ipc.remove();expect(f.handlers.size).toBe(0);
});
it('creates a real draft only after exact owner preflight and returns the matching acknowledgement',async()=>{
 const f=fixture(),request=input();expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toEqual({ok:true,value:row(request)});expect(f.actions.get).toHaveBeenCalledExactlyOnceWith(request.id);expect(f.actions.write).toHaveBeenCalledExactlyOnceWith(request);
});
it('refuses stale preflight revisions and mismatched note identities before mutation',async()=>{
 const f=fixture(),request=input();f.actions.get.mockResolvedValueOnce(row(request));expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'conflict'}});
 f.actions.get.mockResolvedValueOnce({...row(request),id:randomUUID()});expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(f.actions.write).not.toHaveBeenCalled();
});
it('cannot initiate a late write after an elapsed preflight and keeps the actual slot until settlement',async()=>{
 vi.useFakeTimers();const f=fixture(),request=input(),read=deferred<NoteRecord|null>();f.actions.get.mockReturnValueOnce(read.promise);const pending=f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request});await vi.advanceTimersByTimeAsync(4001);expect(await pending).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
 expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});read.resolve(null);await f.ipc.drain();expect(f.actions.write).not.toHaveBeenCalled();
});
it('retains an unknown mutation slot, never replays it and requires a fresh read after settlement',async()=>{
 vi.useFakeTimers();const f=fixture(),request=input(),write=deferred<NoteRecord>();f.actions.write.mockReturnValueOnce(write.promise);const pending=f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request});await vi.advanceTimersByTimeAsync(0);expect(f.actions.write).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(4001);expect(await pending).toMatchObject({ok:false,error:{code:'internal'}});
 await f.invoke(NOTES_CHANNELS.get,{protocolVersion:1,id:request.id});expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false});write.resolve(row(request));await f.ipc.drain();expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'internal'}});
 f.actions.get.mockResolvedValue(row(request));expect(await f.invoke(NOTES_CHANNELS.get,{protocolVersion:1,id:request.id})).toMatchObject({ok:true});const next={...request,expectedRevision:1};f.actions.write.mockResolvedValueOnce({...row(next),createdAt:time});expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:next})).toMatchObject({ok:true});expect(f.actions.write).toHaveBeenCalledTimes(2);
});
it.each(['id','revision','content','saved','created'] as const)('rejects forged %s write receipts and blocks another attempt without replay',async mode=>{
 const f=fixture(),request={...input(),expectedRevision:1},before={...row(request),revision:1,saved:content};f.actions.get.mockResolvedValue(before);const correct={...row(request),saved:content},wrong={...correct,...(mode==='id'?{id:randomUUID()}:mode==='revision'?{revision:99}:mode==='content'?{draft:{...content,title:'Wrong'}}:mode==='saved'?{saved:null}:{createdAt:'2026-10-28T00:00:00.000Z'})};f.actions.write.mockResolvedValueOnce(wrong);
 expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'internal'}});expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false});expect(f.actions.write).toHaveBeenCalledTimes(1);
});
it('checks initial saved-null and explicit Save exact-content receipts',async()=>{
 const f=fixture(),request=input();f.actions.write.mockResolvedValueOnce({...row(request),saved:content});expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'internal'}});
 const save={...input(),action:'save' as const};f.actions.write.mockResolvedValueOnce({...row(save),saved:null});expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:save})).toMatchObject({ok:false,error:{code:'internal'}});
});
it('redacts thrown data and treats known CAS failures as not accepted',async()=>{
 const f=fixture();for(const reasonCode of ['conflict','invalid-request']){f.actions.write.mockRejectedValueOnce({reasonCode,message:'SYNTHETIC_PRIVATE'});expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:input()})).toMatchObject({ok:false,error:{code:reasonCode}});}
 f.actions.write.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));const reply=await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:input()});expect(reply).toMatchObject({ok:false,error:{code:'internal'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');
});
it('rejects late publication and deferred Close from a navigated or replacement owner',async()=>{
 const f=fixture(),request=input(),read=deferred<NoteRecord|null>();f.actions.get.mockReturnValueOnce(read.promise);const pending=f.invoke(NOTES_CHANNELS.get,{protocolVersion:1,id:request.id});f.frame.url='https://example.invalid';read.resolve(row(request));expect(await pending).toMatchObject({ok:false});
 f.frame.url=NOTES_URL;expect(await f.invoke(NOTES_CHANNELS.close)).toEqual({ok:true});f.frame.url='https://example.invalid';await new Promise(resolve=>setImmediate(resolve));expect(f.actions.close).not.toHaveBeenCalled();
 f.frame.url=NOTES_URL;await f.invoke(NOTES_CHANNELS.close);f.actions.contents=()=>({mainFrame:{url:NOTES_URL},getURL:()=>NOTES_URL,isDestroyed:()=>false}) as unknown as WebContents;await new Promise(resolve=>setImmediate(resolve));expect(f.actions.close).not.toHaveBeenCalled();
});
it('bounds simultaneous reads and rejects unordered or wrong-query pages',async()=>{
 const f=fixture(),read=deferred<NoteRecord|null>(),id=randomUUID();f.actions.get.mockReturnValue(read.promise);const reads=Array.from({length:4},()=>f.invoke(NOTES_CHANNELS.get,{protocolVersion:1,id}));expect(await f.invoke(NOTES_CHANNELS.get,{protocolVersion:1,id})).toMatchObject({ok:false});read.resolve(null);await Promise.all(reads);
 f.actions.list.mockResolvedValueOnce({query:'wrong',records:[],nextCursor:null});expect(await f.invoke(NOTES_CHANNELS.list,{protocolVersion:1,query:'public'})).toMatchObject({ok:false});
 const summary={id,revision:1,title:content.title,excerpt:'',hasDraft:true,updatedAt:time};f.actions.list.mockResolvedValueOnce({query:'',records:[summary,{...summary,id:randomUUID(),updatedAt:'2026-10-30T00:00:00.000Z'}],nextCursor:null});expect(await f.invoke(NOTES_CHANNELS.list,{protocolVersion:1,query:''})).toMatchObject({ok:false});
});
it('returns failures that satisfy the frozen named Notes API schema, including known conflict',async()=>{
 const {notesWriteReplySchema,notesListReplySchema}=await import('../../../../packages/contracts/src/notes.ts');const f=fixture();expect(notesWriteReplySchema.safeParse(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:2})).success).toBe(true);f.actions.ready=()=>false;expect(notesListReplySchema.safeParse(await f.invoke(NOTES_CHANNELS.list,{protocolVersion:1,query:''})).success).toBe(true);f.actions.ready=()=>true;const request=input();f.actions.get.mockResolvedValueOnce(row(request));expect(notesWriteReplySchema.parse(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request}))).toMatchObject({ok:false,error:{code:'conflict',retryable:false}});f.actions.get.mockResolvedValueOnce(null);f.actions.write.mockRejectedValueOnce(new Error('private'));expect(notesWriteReplySchema.parse(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request}))).toMatchObject({ok:false,error:{code:'internal',retryable:false}});
});

it('retains independent uncertain-write fences for two notes until each is explicitly reconciled',async()=>{const f=fixture(),a=input(),b=input();f.actions.write.mockRejectedValue(new Error('private'));for(const request of [a,b])expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'internal'}});expect(f.actions.write).toHaveBeenCalledTimes(2);for(const request of [a,b])expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'internal'}});expect(f.actions.write).toHaveBeenCalledTimes(2);await f.invoke(NOTES_CHANNELS.get,{protocolVersion:1,id:b.id});f.actions.write.mockImplementation(async request=>row(request));expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:b})).toMatchObject({ok:true});expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:a})).toMatchObject({ok:false,error:{code:'internal'}});expect(f.actions.write).toHaveBeenCalledTimes(3);});

it('cannot reconcile uncertainty using a read admitted before its actual write settled',async()=>{vi.useFakeTimers();const f=fixture(),request=input(),write=deferred<NoteRecord>(),read=deferred<NoteRecord|null>();f.actions.write.mockReturnValueOnce(write.promise);const pending=f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request});await vi.advanceTimersByTimeAsync(4001);expect(await pending).toMatchObject({ok:false,error:{code:'internal'}});f.actions.get.mockReturnValueOnce(read.promise);const oldGet=f.invoke(NOTES_CHANNELS.get,{protocolVersion:1,id:request.id});write.resolve(row(request));await vi.advanceTimersByTimeAsync(0);read.resolve(row(request));await oldGet;await f.ipc.drain();expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'internal'}});expect(f.actions.write).toHaveBeenCalledTimes(1);});

it('cannot use a Get predating a later admitted write to clear its newer uncertainty',async()=>{const f=fixture(),request=input(),read=deferred<NoteRecord|null>();f.actions.get.mockReturnValueOnce(read.promise);const oldGet=f.invoke(NOTES_CHANNELS.get,{protocolVersion:1,id:request.id});f.actions.write.mockRejectedValueOnce(new Error('private'));expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'internal'}});read.resolve(null);await oldGet;expect(await f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'internal'}});expect(f.actions.write).toHaveBeenCalledTimes(1);});

it('refuses close while an export is pending and rechecks the deferred close dispatch',async()=>{const f=fixture();let exporting=true;Object.assign(f.actions,{exportBusy:()=>exporting});expect(await f.invoke(NOTES_CHANNELS.close)).toMatchObject({ok:false});exporting=false;expect(await f.invoke(NOTES_CHANNELS.close)).toEqual({ok:true});exporting=true;await new Promise(resolve=>setImmediate(resolve));expect(f.actions.close).not.toHaveBeenCalled();});
