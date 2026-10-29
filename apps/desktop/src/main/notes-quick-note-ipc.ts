import type {IpcMain,IpcMainInvokeEvent,WebContents} from 'electron';
import {NOTES_QUICK_NOTE_READY,NOTES_QUICK_NOTE_REQUESTED,NOTES_QUICK_NOTE_FINISHED,notesRequestSchema,notesQuickNoteFinishedSchema,emptyNoteDocument,noteContentKey} from '../../../../packages/contracts/src/notes.ts';
import type {NoteWrite,NoteRecord} from '../../../../packages/contracts/src/notes.ts';
import {trustedAppSender} from './ipc.ts';
import {NOTES_URL} from './assets.ts';
interface Actions{contents():WebContents|undefined;active():boolean;ready():boolean;closeBusy():boolean;exportBusy():boolean;open():Promise<void>}
type Attempt={id:number;owner?:WebContents;sent:boolean;expired:boolean;expires:number;created:boolean;timer:ReturnType<typeof setTimeout>;resolve():void;reject(error:Error):void};
/** One explicit launcher intent. Readiness never replays a delivered request. */
export function registerQuickNoteIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,actions:Actions,timeoutMs=15000){
 let disposed=false,sequence=0,pending:Attempt|undefined,readyOwner:WebContents|undefined;
 const unavailable=()=>new Error('Quick note could not be confirmed. Review Notes before trying again.');
 const active=()=>!disposed&&actions.active();
 const ownerValid=(owner:WebContents|undefined):owner is WebContents=>!!owner&&!owner.isDestroyed()&&actions.contents()===owner&&owner.getURL()===NOTES_URL;
 const trusted=(event:IpcMainInvokeEvent,owner:WebContents|undefined)=>active()&&ownerValid(owner)&&trustedAppSender(event,owner,NOTES_URL);
 const expire=(attempt:Attempt)=>{if(pending!==attempt)return;if(!attempt.expired){attempt.expired=true;attempt.reject(unavailable());}if(!attempt.sent){clearTimeout(attempt.timer);pending=undefined;}};
 const finish=(attempt:Attempt,created:boolean)=>{if(pending!==attempt)return;pending=undefined;clearTimeout(attempt.timer);if(!attempt.expired){if(created&&performance.now()<attempt.expires)attempt.resolve();else attempt.reject(unavailable());}};
 const send=(attempt:Attempt)=>{
  if(pending!==attempt||attempt.sent||attempt.expired)return;
  if(performance.now()>=attempt.expires){expire(attempt);return;}
  if(!active()||!ownerValid(attempt.owner)||actions.closeBusy()||actions.exportBusy()||!actions.ready()){finish(attempt,false);return;}
  if(readyOwner!==attempt.owner)return;
  // Reserve before transport: a synchronous/reentrant READY cannot send twice.
  if(performance.now()>=attempt.expires){expire(attempt);return;}
  attempt.sent=true;
  try{attempt.owner.send(NOTES_QUICK_NOTE_REQUESTED,{protocolVersion:1,attemptId:attempt.id});}catch{attempt.expired=true;attempt.reject(unavailable());}
 };
 ipc.handle(NOTES_QUICK_NOTE_READY,(event,payload)=>{
  const owner=actions.contents();if(!notesRequestSchema.safeParse(payload).success||!trusted(event,owner))return {ok:false};
  readyOwner=owner;const attempt=pending;if(attempt&&attempt.owner===owner)send(attempt);return {ok:true};
 });
 ipc.handle(NOTES_QUICK_NOTE_FINISHED,(event,payload)=>{
  const attempt=pending,parsed=notesQuickNoteFinishedSchema.safeParse(payload);
  if(!attempt||!attempt.sent||!parsed.success||parsed.data.attemptId!==attempt.id||!trusted(event,attempt.owner))return {ok:false};
  // A renderer boolean is not a durable receipt. Observe the validated owner write.
  const created=parsed.data.created&&attempt.created;finish(attempt,created);return {ok:true};
 });
 return {
  busy:()=>!!pending,
  request():Promise<void>{
   if(!active()||!actions.ready()||pending||actions.closeBusy()||actions.exportBusy()||sequence>=Number.MAX_SAFE_INTEGER)return Promise.reject(unavailable());
   let resolve!:()=>void,reject!:(error:Error)=>void;const operation=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
   const attempt:Attempt={id:++sequence,sent:false,expired:false,expires:performance.now()+timeoutMs,created:false,resolve,reject,timer:setTimeout(()=>expire(attempt),timeoutMs)};
   pending=attempt;
   void(async()=>{try{await actions.open();if(pending!==attempt)return;const owner=actions.contents();if(!active()||!ownerValid(owner)){finish(attempt,false);return;}attempt.owner=owner;send(attempt);}catch{finish(attempt,false);}})();
   return operation;
  },
  committed(input:NoteWrite,record:NoteRecord){
   const attempt=pending;if(!attempt?.sent||!active()||!ownerValid(attempt.owner)||input.action!=='draft'||input.expectedRevision!==0||record.revision!==1||record.saved!==null||record.archived||record.trashed||record.pinned)return;
   if(noteContentKey(record.draft)!==noteContentKey({title:'Untitled note',document:emptyNoteDocument()}))return;
   attempt.created=true;
  },
  ownerClosed(owner:WebContents){if(readyOwner===owner)readyOwner=undefined;if(pending?.owner===owner)finish(pending,false);},
  remove(){if(disposed)return;disposed=true;readyOwner=undefined;if(pending)finish(pending,false);ipc.removeHandler(NOTES_QUICK_NOTE_READY);ipc.removeHandler(NOTES_QUICK_NOTE_FINISHED);},
 };
}
