import {registerQuickNoteIpc} from './notes-quick-note-ipc.ts';
import {registerNotesOpenIpc} from './notes-open-ipc.ts';
import {afterEach,expect,it,vi} from 'vitest';
import type {IpcMainInvokeEvent,WebContents} from 'electron';
import {randomUUID} from 'node:crypto';
import {NOTES_CHANNELS,emptyNoteDocument} from '../../../../packages/contracts/src/notes.ts';
import type {NoteRecord,NoteWrite,NoteDelete,NoteDeleted,NotePin,NoteArchive,NoteTrash,NoteHistoryRequest,NoteRevisionSelection,NoteHistory,NoteRevisionRead,NotesList} from '../../../../packages/contracts/src/notes.ts';
import {registerNotesIpc} from './notes-ipc.ts';
import {NOTES_URL} from './assets.ts';
const basis={count:103,fingerprint:'a'.repeat(64)},request={expectedCount:basis.count,expectedFingerprint:basis.fingerprint};
const time='2026-10-29T00:00:00.000Z',content={title:'Public note',document:emptyNoteDocument()};
const input=():NoteWrite=>({id:randomUUID(),expectedRevision:0,action:'draft',content});
const row=(request:NoteWrite):NoteRecord=>({id:request.id,documentVersion:1,pinned:false,archived:false,trashed:false,revision:request.expectedRevision+1,draft:request.content,saved:request.action==='save'?request.content:null,createdAt:time,updatedAt:time});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function baseFixture(){
 const frame={url:NOTES_URL},contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>frame.url} as unknown as WebContents,event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent;
 const handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
 const actions={trashSnapshot:vi.fn(async()=>({...basis})),emptyTrash:vi.fn(async(_input:unknown)=>{void _input;return {deletedCount:basis.count,fingerprint:basis.fingerprint};}),contents:()=>contents,active:()=>true,ready:()=>true,appearance:()=>'dark' as const,closeBusy:vi.fn(()=>false),exportBusy:vi.fn(()=>false),committed:vi.fn(),close:vi.fn(),get:vi.fn(async(id:string)=>{void id;return null as NoteRecord|null;}),list:vi.fn(async(request:{query:string}):Promise<NotesList>=>({query:request.query,records:[],nextCursor:null})),history:vi.fn<(request:NoteHistoryRequest)=>Promise<NoteHistory>>(async request=>{void request;throw new Error('Not configured.');}),getRevision:vi.fn<(request:NoteRevisionSelection)=>Promise<NoteRevisionRead>>(async request=>{void request;throw new Error('Not configured.');}),deletePermanently:vi.fn<(request:NoteDelete)=>Promise<NoteDeleted>>(async request=>({id:request.id,deletedRevision:request.expectedRevision})),restoreRevision:vi.fn<(request:NoteRevisionSelection)=>Promise<NoteRecord>>(async request=>{void request;throw new Error('Not configured.');}),setTrashed:vi.fn<(request:NoteTrash)=>Promise<NoteRecord>>(async request=>{void request;throw new Error('Not configured.');}),setArchived:vi.fn<(request:NoteArchive)=>Promise<NoteRecord>>(async request=>{void request;throw new Error('Not configured.');}),setPinned:vi.fn<(request:NotePin)=>Promise<NoteRecord>>(async request=>{void request;throw new Error('Not configured.');}),write:vi.fn(async(request:NoteWrite)=>row(request))};
 const ipc=registerNotesIpc({handle:(channel,handler)=>{handlers.set(channel,handler);},removeHandler:channel=>{handlers.delete(channel);}},actions);
 const invoke=(channel:string,payload:unknown={protocolVersion:1},sender=event)=>Promise.resolve(handlers.get(channel)!(sender,payload));
 return {actions,frame,event,invoke,ipc,handlers};
}
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('reads the whole scope without a deletion and dispatches exactly one matching confirmed basis',async()=>{
 const f=baseFixture();expect(await f.invoke(NOTES_CHANNELS.trashSnapshot)).toEqual({ok:true,value:basis});expect(f.actions.emptyTrash).not.toHaveBeenCalled();
 expect(await f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:request})).toEqual({ok:true,value:{deletedCount:103,fingerprint:basis.fingerprint}});expect(f.actions.emptyTrash).toHaveBeenCalledExactlyOnceWith(request);expect(f.actions.deletePermanently).not.toHaveBeenCalled();expect(f.actions.write).not.toHaveBeenCalled();
});
it('denies extra authority, stale scope, foreign frame and busy Close/export before any deletion',async()=>{
 const f=baseFixture();for(const extra of [{ids:[randomUUID()]},{query:'public'},{pinnedOnly:true},{expectedCount:0},{expectedFingerprint:'BAD'},{path:'/tmp/public'}])expect(await f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:{...request,...extra}})).toMatchObject({ok:false,error:{code:'invalid-request'}});
 expect(await f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:request},{...f.event,senderFrame:{url:NOTES_URL}} as IpcMainInvokeEvent)).toMatchObject({ok:false});
 f.actions.trashSnapshot.mockResolvedValueOnce({...basis,count:102});expect(await f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'conflict'}});
 f.actions.closeBusy.mockReturnValue(true);expect(await f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:request})).toMatchObject({ok:false});f.actions.closeBusy.mockReturnValue(false);f.actions.exportBusy.mockReturnValue(true);expect(await f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:request})).toMatchObject({ok:false});expect(f.actions.emptyTrash).not.toHaveBeenCalled();
});
it('revalidates the invoking frame after the read before the batch write',async()=>{
 const f=baseFixture(),held=deferred<typeof basis>();f.actions.trashSnapshot.mockReturnValueOnce(held.promise);const pending=f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:request});await vi.waitFor(()=>expect(f.actions.trashSnapshot).toHaveBeenCalledOnce());f.frame.url='https://example.invalid/';held.resolve(basis);expect(await pending).toMatchObject({ok:false});expect(f.actions.emptyTrash).not.toHaveBeenCalled();
});
it('retains an expired actual batch and global uncertainty until settlement plus a new scope read; Get/list cannot reconcile it',async()=>{
 vi.useFakeTimers();const f=baseFixture(),held=deferred<{deletedCount:number;fingerprint:string}>();f.actions.emptyTrash.mockReturnValueOnce(held.promise);const pending=f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:request});await vi.advanceTimersByTimeAsync(4001);expect(await pending).toMatchObject({ok:false,error:{code:'internal'}});expect(f.ipc.isWriting()).toBe(true);expect(await f.invoke(NOTES_CHANNELS.close)).toMatchObject({ok:false});expect(await f.invoke(NOTES_CHANNELS.trashSnapshot)).toMatchObject({ok:false,error:{code:'internal'}});
 held.resolve({deletedCount:103,fingerprint:basis.fingerprint});await f.ipc.drain();expect(f.ipc.isWriting()).toBe(true);expect(await f.invoke(NOTES_CHANNELS.get,{protocolVersion:1,id:randomUUID()})).toEqual({ok:true,value:null});expect(await f.invoke(NOTES_CHANNELS.list,{protocolVersion:1,query:''})).toMatchObject({ok:true});expect(f.ipc.isWriting()).toBe(true);expect(await f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:request})).toMatchObject({ok:false});
 f.actions.trashSnapshot.mockResolvedValueOnce({count:0,fingerprint:'b'.repeat(64)});expect(await f.invoke(NOTES_CHANNELS.trashSnapshot)).toEqual({ok:true,value:{count:0,fingerprint:'b'.repeat(64)}});expect(f.ipc.isWriting()).toBe(false);expect(f.actions.emptyTrash).toHaveBeenCalledTimes(1);expect(f.actions.close).not.toHaveBeenCalled();
});
it('refuses contradictory receipts without replay and cannot clear uncertainty with a read overlapping that write',async()=>{
 const f=baseFixture(),read=deferred<typeof basis>();f.actions.trashSnapshot.mockReturnValueOnce(read.promise);const overlapping=f.invoke(NOTES_CHANNELS.trashSnapshot);await Promise.resolve();f.actions.emptyTrash.mockResolvedValueOnce({deletedCount:102,fingerprint:basis.fingerprint});expect(await f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:request})).toMatchObject({ok:false,error:{code:'internal'}});read.resolve(basis);expect(await overlapping).toMatchObject({ok:false,error:{code:'internal'}});expect(f.ipc.isWriting()).toBe(true);await f.invoke(NOTES_CHANNELS.trashSnapshot);expect(f.ipc.isWriting()).toBe(false);expect(f.actions.emptyTrash).toHaveBeenCalledOnce();
});

it('keeps Quick note and selected-note navigation outside pending or uncertain batches without blocking normal Save queues',async()=>{
 const f=baseFixture(),open=vi.fn(async()=>{}),port={handle:(channel:string,handler:(event:IpcMainInvokeEvent,payload:unknown)=>unknown)=>{f.handlers.set(channel,handler);},removeHandler:(channel:string)=>{f.handlers.delete(channel);}},actions={contents:f.actions.contents,active:f.actions.active,ready:f.actions.ready,closeBusy:()=>f.ipc.isEmptyingTrash(),exportBusy:()=>false,open},quick=registerQuickNoteIpc(port,actions),selected=registerNotesOpenIpc(port,{...actions,quickBusy:()=>quick.busy()});
 const normal=input(),save=deferred<NoteRecord>();f.actions.write.mockReturnValueOnce(save.promise);const saving=f.invoke(NOTES_CHANNELS.write,{protocolVersion:1,input:normal});await vi.waitFor(()=>expect(f.actions.write).toHaveBeenCalledOnce());expect(f.ipc.isWriting()).toBe(true);expect(f.ipc.isEmptyingTrash()).toBe(false);save.resolve(row(normal));expect(await saving).toMatchObject({ok:true});
 const held=deferred<{deletedCount:number;fingerprint:string}>();f.actions.emptyTrash.mockReturnValueOnce(held.promise);const pending=f.invoke(NOTES_CHANNELS.emptyTrash,{protocolVersion:1,input:request});await vi.waitFor(()=>expect(f.actions.emptyTrash).toHaveBeenCalledOnce());expect(f.ipc.isEmptyingTrash()).toBe(true);
 await expect(quick.request()).rejects.toThrow();await expect(selected.request({id:randomUUID(),revision:1},()=>true)).rejects.toThrow();expect(open).not.toHaveBeenCalled();
 held.resolve({deletedCount:102,fingerprint:basis.fingerprint});expect(await pending).toMatchObject({ok:false});expect(f.ipc.isEmptyingTrash()).toBe(true);await f.invoke(NOTES_CHANNELS.get,{protocolVersion:1,id:randomUUID()});await expect(quick.request()).rejects.toThrow();await expect(selected.request({id:randomUUID(),revision:1},()=>true)).rejects.toThrow();expect(open).not.toHaveBeenCalled();
 await f.invoke(NOTES_CHANNELS.trashSnapshot);expect(f.ipc.isEmptyingTrash()).toBe(false);quick.remove();selected.remove();f.ipc.remove();
});
