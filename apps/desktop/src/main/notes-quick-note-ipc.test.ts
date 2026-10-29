import {afterEach,expect,it,vi} from 'vitest';
import type {IpcMainInvokeEvent,WebContents} from 'electron';
import {randomUUID} from 'node:crypto';
import {NOTES_QUICK_NOTE_READY as READY,NOTES_QUICK_NOTE_REQUESTED as REQUESTED,NOTES_QUICK_NOTE_FINISHED as FINISHED,emptyNoteDocument} from '../../../../packages/contracts/src/notes.ts';
import type {NoteWrite,NoteRecord} from '../../../../packages/contracts/src/notes.ts';
import {registerQuickNoteIpc} from './notes-quick-note-ipc.ts';
import {NOTES_URL} from './assets.ts';
const cleanups:(()=>void)[]=[];
afterEach(()=>{for(const cleanup of cleanups.splice(0))cleanup();vi.useRealTimers();vi.restoreAllMocks();});
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes;});return {promise,resolve};}
function fixture(){
 const frame={url:NOTES_URL},send=vi.fn(),contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>frame.url,send} as unknown as WebContents;let owner:WebContents|undefined=contents;
 const event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent,handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>();
 const actions={contents:()=>owner,active:()=>true,ready:()=>true,closeBusy:()=>false,exportBusy:()=>false,open:vi.fn(async()=>{})};
 const api=registerQuickNoteIpc({handle:(channel,handler)=>handlers.set(channel,handler),removeHandler:channel=>handlers.delete(channel)},actions,100);cleanups.push(api.remove);
 const invoke=(channel:string,payload:unknown={protocolVersion:1},sender=event)=>Promise.resolve(handlers.get(channel)!(sender,payload));
 const committed=()=>{const input:NoteWrite={id:randomUUID(),expectedRevision:0,action:'draft',content:{title:'Untitled note',document:emptyNoteDocument()}};const record:NoteRecord={id:input.id,documentVersion:1,revision:1,pinned:false,archived:false,trashed:false,draft:input.content,saved:null,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z'};api.committed(input,record);return {input,record};};
 return {api,actions,frame,contents,event,send,handlers,invoke,committed,replace:(value:WebContents|undefined)=>{owner=value;}};
}
it('waits for the registered receiver, sends once, and confirms only an observed initial owner draft',async()=>{
 const f=fixture(),pending=f.api.request();await Promise.resolve();expect(f.api.busy()).toBe(true);expect(f.send).not.toHaveBeenCalled();await f.invoke(READY);expect(f.send).toHaveBeenCalledExactlyOnceWith(REQUESTED,{protocolVersion:1,attemptId:1});await f.invoke(READY);f.committed();expect(await f.invoke(FINISHED,{protocolVersion:1,attemptId:1,created:true})).toEqual({ok:true});await expect(pending).resolves.toBeUndefined();expect(f.api.busy()).toBe(false);
});
it('rejects unknown authority, foreign owners, subframes, wrong versions and navigation',async()=>{
 const f=fixture();for(const sender of [{...f.event,sender:{}},{...f.event,senderFrame:{url:NOTES_URL}}])expect(await f.invoke(READY,undefined,sender as IpcMainInvokeEvent)).toEqual({ok:false});for(const payload of [{protocolVersion:2},{protocolVersion:1,id:randomUUID()},{protocolVersion:1,path:'/tmp/public'}])expect(await f.invoke(READY,payload)).toEqual({ok:false});f.frame.url='https://example.invalid';expect(await f.invoke(READY)).toEqual({ok:false});expect(f.send).not.toHaveBeenCalled();
});
it('reserves before open and before synchronous transport reentry',async()=>{
 const f=fixture(),opening=deferred();f.actions.open.mockReturnValueOnce(opening.promise);const pending=f.api.request();await expect(f.api.request()).rejects.toThrow('could not be confirmed');await f.invoke(READY);f.send.mockImplementation(()=>{void f.invoke(READY);});opening.resolve();await Promise.resolve();await Promise.resolve();expect(f.send).toHaveBeenCalledTimes(1);f.committed();await f.invoke(FINISHED,{protocolVersion:1,attemptId:1,created:true});await pending;expect(f.actions.open).toHaveBeenCalledTimes(1);
});
it('never trusts a created boolean without the validated initial draft observer',async()=>{
 const f=fixture();await f.invoke(READY);const pending=f.api.request().catch(()=>false);await Promise.resolve();await f.invoke(FINISHED,{protocolVersion:1,attemptId:1,created:true});expect(await pending).toBe(false);expect(f.api.busy()).toBe(false);
});
it('ignores noninitial, saved, archived and changed-content writes for creation evidence',async()=>{
 const f=fixture();const {input,record}=f.committed();await f.invoke(READY);const pending=f.api.request().catch(()=>false);await Promise.resolve();for(const [write,value] of [[{...input,expectedRevision:1},{...record,revision:2}],[{...input,action:'save'},{...record,saved:record.draft}],[input,{...record,archived:true}],[input,{...record,pinned:true}],[input,{...record,draft:{...record.draft,title:'Different'}}]] as [NoteWrite,NoteRecord][])f.api.committed(write,value);await f.invoke(FINISHED,{protocolVersion:1,attemptId:1,created:true});expect(await pending).toBe(false);
});
it('holds a timed-out delivered request through settlement and never replays on readiness',async()=>{
 vi.useFakeTimers();const f=fixture();await f.invoke(READY);const pending=f.api.request().catch(()=>false);await vi.advanceTimersByTimeAsync(101);expect(await pending).toBe(false);expect(f.api.busy()).toBe(true);await f.invoke(READY);await expect(f.api.request()).rejects.toThrow();expect(f.send).toHaveBeenCalledTimes(1);f.committed();await f.invoke(FINISHED,{protocolVersion:1,attemptId:1,created:true});expect(f.api.busy()).toBe(false);const next=f.api.request();await Promise.resolve();expect(f.send).toHaveBeenLastCalledWith(REQUESTED,{protocolVersion:1,attemptId:2});f.committed();await f.invoke(FINISHED,{protocolVersion:1,attemptId:2,created:true});await next;
});
it('does not dispatch a late request after open/readiness deadline',async()=>{
 vi.useFakeTimers();const f=fixture(),opening=deferred();f.actions.open.mockReturnValueOnce(opening.promise);const pending=f.api.request().catch(()=>false);await vi.advanceTimersByTimeAsync(101);expect(await pending).toBe(false);expect(f.api.busy()).toBe(false);opening.resolve();await f.invoke(READY);await Promise.resolve();expect(f.send).not.toHaveBeenCalled();
});
it('rejects wrong or extra acknowledgement authority and retains exact owner identity',async()=>{
 const f=fixture();await f.invoke(READY);const pending=f.api.request().catch(()=>false);await Promise.resolve();f.committed();for(const payload of [{protocolVersion:1,attemptId:2,created:true},{protocolVersion:1,attemptId:1,created:true,id:randomUUID()},{protocolVersion:1,attemptId:1,created:'true'}])expect(await f.invoke(FINISHED,payload)).toEqual({ok:false});f.replace({...f.contents} as WebContents);expect(await f.invoke(FINISHED,{protocolVersion:1,attemptId:1,created:true})).toEqual({ok:false});expect(f.api.busy()).toBe(true);f.api.ownerClosed(f.contents);expect(await pending).toBe(false);expect(f.api.busy()).toBe(false);
});
it('refuses unavailable, exporting and closing work before open or after asynchronous opening',async()=>{
 const f=fixture();for(const name of ['active','ready'] as const){const original=f.actions[name];f.actions[name]=()=>false;await expect(f.api.request()).rejects.toThrow();f.actions[name]=original;}for(const name of ['closeBusy','exportBusy'] as const){f.actions[name]=()=>true;await expect(f.api.request()).rejects.toThrow();f.actions[name]=()=>false;}expect(f.actions.open).not.toHaveBeenCalled();const opening=deferred();f.actions.open.mockReturnValueOnce(opening.promise);const pending=f.api.request().catch(()=>false);f.actions.exportBusy=()=>true;await f.invoke(READY);opening.resolve();expect(await pending).toBe(false);expect(f.send).not.toHaveBeenCalled();
});
it('treats failed transport after admission as uncertain until owner loss',async()=>{
 const f=fixture();await f.invoke(READY);f.send.mockImplementation(()=>{throw new Error('SYNTHETIC_PRIVATE');});const pending=f.api.request().catch(error=>String(error));await Promise.resolve();expect(await pending).not.toContain('SYNTHETIC_PRIVATE');expect(f.api.busy()).toBe(true);await f.invoke(READY);expect(f.send).toHaveBeenCalledTimes(1);f.api.ownerClosed(f.contents);expect(f.api.busy()).toBe(false);
});
it('disposal settles the pending request and removes fixed handlers without replay',async()=>{
 const f=fixture(),pending=f.api.request().catch(()=>false);f.api.remove();expect(await pending).toBe(false);await Promise.resolve();expect(f.send).not.toHaveBeenCalled();expect(f.handlers.size).toBe(0);await expect(f.api.request()).rejects.toThrow();
});

it('checks the elapsed monotonic deadline before dispatch even if its timer callback has not run',async()=>{vi.useFakeTimers();let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock);const f=fixture(),opening=deferred();f.actions.open.mockReturnValueOnce(opening.promise);const pending=f.api.request().catch(()=>false);await f.invoke(READY);clock=101;opening.resolve();await Promise.resolve();expect(await pending).toBe(false);expect(f.send).not.toHaveBeenCalled();expect(f.api.busy()).toBe(false);});
it('cannot report creation after the elapsed deadline before the delayed timer fires',async()=>{vi.useFakeTimers();let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock);const f=fixture();await f.invoke(READY);const pending=f.api.request().catch(()=>false);await Promise.resolve();f.committed();clock=101;await f.invoke(FINISHED,{protocolVersion:1,attemptId:1,created:true});expect(await pending).toBe(false);expect(f.api.busy()).toBe(false);expect(f.send).toHaveBeenCalledTimes(1);});
