import type {IpcMain,IpcMainInvokeEvent} from 'electron';
import {NOTES_LAUNCHER_CHANNELS,launcherNotesSearchRequestSchema,launcherNotesSearchReplySchema,launcherNoteOpenRequestSchema,launcherNoteOpenReplySchema,notesRootSearchSchema} from '../../../../packages/contracts/src/notes-launcher.ts';
import type {NotesRootSearch,NotesLauncherSelection,LauncherNoteOpenReply} from '../../../../packages/contracts/src/notes-launcher.ts';
import {noteRecordSchema} from '../../../../packages/contracts/src/notes.ts';
import type {NoteRecord} from '../../../../packages/contracts/src/notes.ts';
import {NotesOpenUnavailable} from './notes-open-ipc.ts';
interface Actions{
 search(query:string):Promise<NotesRootSearch>;get(id:string):Promise<NoteRecord|null>;
 open(selection:NotesLauncherSelection,current:()=>boolean):Promise<void>;
}
interface Context{
 trusted(event:IpcMainInvokeEvent):boolean;active():boolean;busy():boolean;revision():number;generation():number;
 authorize(event:IpcMainInvokeEvent,revision:number):Promise<Extract<LauncherNoteOpenReply,{ok:false}>|undefined>;
 acquire():()=>void;recordUse():Promise<void>;
}
const failure=(code:'invalid-request'|'permission-denied'|'capability-unavailable'|'cancelled'|'conflict'|'deadline-exceeded')=>({ok:false as const,error:{code,message:code==='deadline-exceeded'?'Opening the selected note could not be confirmed. Review Notes, then reload results before trying again.':code==='conflict'?'This note changed or is no longer in the current results. Reload results and select it again.':code==='cancelled'?'Finish the current launcher action before opening a note.':'Notes search is unavailable or changed. Reload commands or open Notes to reconnect.',retryable:false}});
/** Notes results are query-scoped navigation choices, never generic commands. */
export function registerLauncherNotesIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,actions:Actions,context:Context,timeoutMs=4000,openTimeoutMs=18000){
 let disposed=false,reads=0,sequence=0;
 let issued:{owner:IpcMainInvokeEvent['sender'];frame:IpcMainInvokeEvent['senderFrame'];revision:number;generation:number;records:Map<string,number>}|undefined;
 ipc.handle(NOTES_LAUNCHER_CHANNELS.search,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=launcherNotesSearchRequestSchema.safeParse(payload);
  if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');
  if(disposed||!context.active()||context.busy()||reads>=4)return failure('cancelled');
  const request=parsed.data,generation=context.generation(),query=++sequence,expires=performance.now()+timeoutMs;issued=undefined;reads++;let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&context.active()&&!context.busy()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation&&sequence===query;
  const operation=Promise.resolve().then(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return failure('cancelled');
   const result=notesRootSearchSchema.parse(await actions.search(request.query));if(!current()||result.query!==request.query)return failure('cancelled');
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   issued={owner:event.sender,frame:event.senderFrame,revision:request.revision,generation,records:new Map(result.records.map(row=>[row.id,row.revision]))};
   return launcherNotesSearchReplySchema.parse({ok:true,value:{...result,revision:request.revision}});
  }catch{return failure('capability-unavailable');}}).finally(()=>{reads--;});
  try{return await Promise.race([operation,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(failure('capability-unavailable'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 ipc.handle(NOTES_LAUNCHER_CHANNELS.open,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=launcherNoteOpenRequestSchema.safeParse(payload);
  if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');
  if(disposed||!context.active()||context.busy())return failure('cancelled');
  const request=parsed.data;if(!issued||issued.owner!==event.sender||issued.frame!==event.senderFrame||issued.revision!==request.revision||issued.generation!==context.generation()||issued.records.get(request.selection.id)!==request.selection.revision)return failure('conflict');
  issued=undefined;const release=context.acquire(),generation=context.generation(),expires=performance.now()+openTimeoutMs;let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&context.active()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation;
  const operation=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return failure('cancelled');
   const raw=await actions.get(request.selection.id),record=raw===null?null:noteRecordSchema.parse(raw);
   if(!current())return failure('cancelled');if(!record||record.id!==request.selection.id||record.revision!==request.selection.revision||record.archived||record.trashed)return failure('conflict');
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   await actions.open(request.selection,current);if(!current())return failure('deadline-exceeded');
   // Navigation is acknowledged before aggregate use. No note ID/query/body enters usage.
   await context.recordUse();if(!current())return failure('deadline-exceeded');
   return launcherNoteOpenReplySchema.parse({ok:true,value:{outcome:'opened',selection:request.selection}});
  }catch(error){return failure(error instanceof NotesOpenUnavailable&&error.outcome==='not-opened'?'capability-unavailable':'deadline-exceeded');}
  finally{release();}})();
  try{return await Promise.race([operation,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(failure('deadline-exceeded'));},openTimeoutMs);})]);}finally{clearTimeout(timer);}
 });
 return()=>{disposed=true;issued=undefined;sequence++;ipc.removeHandler(NOTES_LAUNCHER_CHANNELS.search);ipc.removeHandler(NOTES_LAUNCHER_CHANNELS.open);};
}
