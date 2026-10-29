import {afterEach,expect,it,vi} from 'vitest';
import type {IpcMainInvokeEvent,WebContents} from 'electron';
import {NOTES_LAUNCHER_CHANNELS as C} from '../../../../packages/contracts/src/notes-launcher.ts';
import {emptyNoteDocument,type NoteRecord} from '../../../../packages/contracts/src/notes.ts';
import {registerNotesOpenIpc} from './notes-open-ipc.ts';
import {NOTES_URL} from './assets.ts';
const selection={id:'11111111-1111-4111-8111-111111111111',revision:3};
const record:NoteRecord={...selection,documentVersion:1,pinned:false,archived:false,trashed:false,draft:{title:'Public note',document:emptyNoteDocument()},saved:null,createdAt:'2026-10-29T00:00:00.000Z',updatedAt:'2026-10-29T00:00:00.000Z'};
const cleanups:(()=>void)[]=[];
afterEach(()=>{for(const cleanup of cleanups.splice(0))cleanup();vi.useRealTimers();vi.restoreAllMocks();});
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
function fixture(){
 const frame={url:NOTES_URL},send=vi.fn(),contents={mainFrame:frame,isDestroyed:()=>false,getURL:()=>frame.url,send} as unknown as WebContents;let owner:WebContents|undefined=contents;
 const event={sender:contents,senderFrame:frame} as IpcMainInvokeEvent,handlers=new Map<string,(event:IpcMainInvokeEvent,payload:unknown)=>unknown>(),state={current:true};
 const actions={contents:()=>owner,active:()=>true,ready:()=>true,closeBusy:()=>false,exportBusy:()=>false,quickBusy:()=>false,open:vi.fn(async()=>{})};
 const api=registerNotesOpenIpc({handle:(channel,handler)=>handlers.set(channel,handler),removeHandler:channel=>handlers.delete(channel)},actions,100);cleanups.push(api.remove);
 const invoke=(channel:string,payload:unknown={protocolVersion:1},sender=event)=>Promise.resolve(handlers.get(channel)!(sender,payload));
 const request=()=>api.request(selection,()=>state.current),finish=(opened=true,attemptId=1)=>invoke(C.finished,{protocolVersion:1,attemptId,opened});
 return {api,actions,event,frame,contents,send,handlers,state,invoke,request,finish,replace:(value:WebContents|undefined)=>{owner=value;}};
}
it('waits for readiness and requires exact validated owner read plus renderer acknowledgement',async()=>{
 const f=fixture(),pending=f.request();await Promise.resolve();expect(f.send).not.toHaveBeenCalled();expect(f.api.busy()).toBe(true);await f.invoke(C.ready);expect(f.send).toHaveBeenCalledExactlyOnceWith(C.requested,{protocolVersion:1,attemptId:1,selection});await f.invoke(C.ready);f.api.read(record);expect(await f.finish()).toEqual({ok:true});await expect(pending).resolves.toBeUndefined();expect(f.api.busy()).toBe(false);
});
it('never accepts a boolean-only acknowledgement or a read observed before the sent attempt',async()=>{
 const f=fixture();f.api.read(record);await f.invoke(C.ready);const pending=f.request().catch(error=>error.outcome);await Promise.resolve();await f.finish();expect(await pending).toBe('not-opened');expect(f.api.busy()).toBe(false);
});
it.each(['id','revision','archived','trashed'] as const)('rejects mismatched or readonly %s owner-read evidence',async mode=>{
 const f=fixture();await f.invoke(C.ready);const pending=f.request().catch(error=>error.outcome);await Promise.resolve();f.api.read({...record,...(mode==='id'?{id:'22222222-2222-4222-8222-222222222222'}:mode==='revision'?{revision:4}:mode==='archived'?{archived:true}:{trashed:true})});await f.finish();expect(await pending).toBe('not-opened');
});
it('binds ready and finished to exact owner/frame/attempt and rejects payload authority',async()=>{
 const f=fixture();for(const sender of [{...f.event,sender:{}},{...f.event,senderFrame:{url:NOTES_URL}}])expect(await f.invoke(C.ready,undefined,sender as IpcMainInvokeEvent)).toEqual({ok:false});for(const payload of [{protocolVersion:2},{protocolVersion:1,path:'/tmp/public'}])expect(await f.invoke(C.ready,payload)).toEqual({ok:false});await f.invoke(C.ready);const pending=f.request().catch(()=>false);await Promise.resolve();f.api.read(record);
 for(const payload of [{protocolVersion:1,attemptId:2,opened:true},{protocolVersion:1,attemptId:1,opened:'true'},{protocolVersion:1,attemptId:1,opened:true,selection}])expect(await f.invoke(C.finished,payload)).toEqual({ok:false});
 expect(await f.invoke(C.finished,{protocolVersion:1,attemptId:1,opened:true},{...f.event,senderFrame:{url:NOTES_URL}} as IpcMainInvokeEvent)).toEqual({ok:false});f.replace({...f.contents} as WebContents);expect(await f.finish()).toEqual({ok:false});expect(f.api.busy()).toBe(true);f.api.ownerClosed(f.contents);expect(await pending).toBe(false);expect(f.api.busy()).toBe(false);
});
it('reserves before asynchronous window opening and synchronous READY reentry',async()=>{
 const f=fixture(),opening=deferred();f.actions.open.mockReturnValueOnce(opening.promise);const pending=f.request();await expect(f.request()).rejects.toMatchObject({outcome:'not-opened'});await f.invoke(C.ready);f.send.mockImplementation(()=>{void f.invoke(C.ready);});opening.resolve();await Promise.resolve();await Promise.resolve();expect(f.send).toHaveBeenCalledTimes(1);f.api.read(record);await f.finish();await pending;expect(f.actions.open).toHaveBeenCalledTimes(1);
});
it('retains a delivered timeout until exact completion, refuses duplicates and never replays READY',async()=>{
 vi.useFakeTimers();const f=fixture();await f.invoke(C.ready);const pending=f.request().catch(error=>error.outcome);await vi.advanceTimersByTimeAsync(101);expect(await pending).toBe('unknown');expect(f.api.busy()).toBe(true);await f.invoke(C.ready);await expect(f.request()).rejects.toMatchObject({outcome:'not-opened'});expect(f.send).toHaveBeenCalledTimes(1);f.api.read(record);await f.finish();expect(f.api.busy()).toBe(false);const next=f.request();await Promise.resolve();expect(f.send).toHaveBeenLastCalledWith(C.requested,{protocolVersion:1,attemptId:2,selection});f.api.read(record);await f.finish(true,2);await next;
});
it('does not deliver after timeout or launcher-context invalidation during window opening',async()=>{
 vi.useFakeTimers();for(const expired of [false,true]){const f=fixture(),opening=deferred();f.actions.open.mockReturnValueOnce(opening.promise);const pending=f.request().catch(error=>error.outcome);await f.invoke(C.ready);if(expired)await vi.advanceTimersByTimeAsync(101);else f.state.current=false;opening.resolve();expect(await pending).toBe('not-opened');expect(f.send).not.toHaveBeenCalled();expect(f.api.busy()).toBe(false);}
});
it('refuses Quick/export/Close and unavailable state before admission and after an await',async()=>{
 const f=fixture();for(const name of ['active','ready'] as const){f.actions[name]=()=>false;await expect(f.request()).rejects.toMatchObject({outcome:'not-opened'});f.actions[name]=()=>true;}
 for(const name of ['quickBusy','exportBusy','closeBusy'] as const){f.actions[name]=()=>true;await expect(f.request()).rejects.toMatchObject({outcome:'not-opened'});f.actions[name]=()=>false;}
 expect(f.actions.open).not.toHaveBeenCalled();const opening=deferred();f.actions.open.mockReturnValueOnce(opening.promise);const pending=f.request().catch(error=>error.outcome);await f.invoke(C.ready);f.actions.quickBusy=()=>true;opening.resolve();expect(await pending).toBe('not-opened');expect(f.send).not.toHaveBeenCalled();
});
it('refuses late context success and handles failed transport truthfully until owner loss',async()=>{
 const f=fixture();await f.invoke(C.ready);const pending=f.request().catch(error=>error.outcome);await Promise.resolve();f.api.read(record);f.state.current=false;await f.finish();expect(await pending).toBe('unknown');f.state.current=true;f.send.mockImplementation(()=>{throw new Error('SYNTHETIC_PRIVATE');});const next=f.request().catch(error=>String(error));await Promise.resolve();expect(await next).not.toContain('SYNTHETIC_PRIVATE');expect(f.api.busy()).toBe(true);await f.invoke(C.ready);expect(f.send).toHaveBeenCalledTimes(2);f.api.ownerClosed(f.contents);expect(f.api.busy()).toBe(false);
});
it('checks monotonic deadline before delivery and success even when timer callbacks are late',async()=>{
 vi.useFakeTimers();let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock);const f=fixture(),opening=deferred();f.actions.open.mockReturnValueOnce(opening.promise);const pending=f.request().catch(error=>error.outcome);await f.invoke(C.ready);clock=101;opening.resolve();expect(await pending).toBe('not-opened');expect(f.send).not.toHaveBeenCalled();clock=200;const next=f.request().catch(error=>error.outcome);await Promise.resolve();f.api.read(record);clock=301;await f.finish(true,2);expect(await next).toBe('unknown');
});
it('settles pending work and removes only its fixed handlers on disposal',async()=>{
 const f=fixture(),pending=f.request().catch(error=>error.outcome);f.api.remove();expect(await pending).toBe('not-opened');await Promise.resolve();expect(f.send).not.toHaveBeenCalled();expect(f.handlers.size).toBe(0);await expect(f.request()).rejects.toMatchObject({outcome:'not-opened'});
});
