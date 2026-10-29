import type {IpcMain,IpcMainInvokeEvent,WebContents} from 'electron';
import {NOTES_LAUNCHER_CHANNELS,notesOpenFinishedSchema,notesLauncherSelectionSchema} from '../../../../packages/contracts/src/notes-launcher.ts';
import {notesRequestSchema} from '../../../../packages/contracts/src/notes.ts';
import type {NotesLauncherSelection} from '../../../../packages/contracts/src/notes-launcher.ts';
import type {NoteRecord} from '../../../../packages/contracts/src/notes.ts';
import {trustedAppSender} from './ipc.ts';
import {NOTES_URL} from './assets.ts';
export class NotesOpenUnavailable extends Error{
 readonly outcome:'not-opened'|'unknown';
 constructor(outcome:'not-opened'|'unknown'){super('The selected note could not be confirmed. Review Notes and reload launcher results before trying again.');this.outcome=outcome;}
}
interface Actions{contents():WebContents|undefined;active():boolean;ready():boolean;closeBusy():boolean;exportBusy():boolean;quickBusy():boolean;open():Promise<void>}
type Attempt={id:number;selection:NotesLauncherSelection;current():boolean;owner?:WebContents;sent:boolean;expired:boolean;expires:number;observed:boolean;timer:ReturnType<typeof setTimeout>;resolve():void;reject(error:Error):void};
/** One explicit selected-note navigation, acknowledged by a validated owner read
 * and the exact host callback. Readiness cannot replay a delivered operation. */
export function registerNotesOpenIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,actions:Actions,timeoutMs=15000){
 let disposed=false,sequence=0,pending:Attempt|undefined,readyOwner:WebContents|undefined;
 const active=()=>!disposed&&actions.active();
 const ownerValid=(owner:WebContents|undefined):owner is WebContents=>!!owner&&!owner.isDestroyed()&&actions.contents()===owner&&owner.getURL()===NOTES_URL;
 const trusted=(event:IpcMainInvokeEvent,owner:WebContents|undefined)=>active()&&ownerValid(owner)&&trustedAppSender(event,owner,NOTES_URL);
 const expire=(attempt:Attempt)=>{if(pending!==attempt||attempt.expired)return;attempt.expired=true;attempt.reject(new NotesOpenUnavailable(attempt.sent?'unknown':'not-opened'));if(!attempt.sent){clearTimeout(attempt.timer);pending=undefined;}};
 const finish=(attempt:Attempt,opened:boolean)=>{if(pending!==attempt)return;pending=undefined;clearTimeout(attempt.timer);if(!attempt.expired){if(opened&&attempt.observed&&attempt.current()&&performance.now()<attempt.expires)attempt.resolve();else attempt.reject(new NotesOpenUnavailable(attempt.observed?'unknown':'not-opened'));}};
 const send=(attempt:Attempt)=>{
  if(pending!==attempt||attempt.sent||attempt.expired)return;
  if(performance.now()>=attempt.expires){expire(attempt);return;}
  if(!active()||!attempt.current()||!ownerValid(attempt.owner)||actions.closeBusy()||actions.exportBusy()||actions.quickBusy()||!actions.ready()){finish(attempt,false);return;}
  if(readyOwner!==attempt.owner)return;
  attempt.sent=true;
  try{attempt.owner.send(NOTES_LAUNCHER_CHANNELS.requested,{protocolVersion:1,attemptId:attempt.id,selection:attempt.selection});}catch{attempt.expired=true;attempt.reject(new NotesOpenUnavailable('unknown'));}
 };
 ipc.handle(NOTES_LAUNCHER_CHANNELS.ready,(event,payload)=>{
  const owner=actions.contents();if(!notesRequestSchema.safeParse(payload).success||!trusted(event,owner))return {ok:false};
  readyOwner=owner;const attempt=pending;if(attempt&&attempt.owner===owner)send(attempt);return {ok:true};
 });
 ipc.handle(NOTES_LAUNCHER_CHANNELS.finished,(event,payload)=>{
  const attempt=pending,parsed=notesOpenFinishedSchema.safeParse(payload);
  if(!attempt||!attempt.sent||!parsed.success||parsed.data.attemptId!==attempt.id||!trusted(event,attempt.owner))return {ok:false};
  finish(attempt,parsed.data.opened);return {ok:true};
 });
 return {
  busy:()=>!!pending,
  request(input:NotesLauncherSelection,current:()=>boolean):Promise<void>{
   const parsed=notesLauncherSelectionSchema.safeParse(input);
   if(!parsed.success||!active()||!current()||!actions.ready()||pending||actions.closeBusy()||actions.exportBusy()||actions.quickBusy()||sequence>=Number.MAX_SAFE_INTEGER-1)return Promise.reject(new NotesOpenUnavailable('not-opened'));
   let resolve!:()=>void,reject!:(error:Error)=>void;const operation=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});
   const attempt:Attempt={id:++sequence,selection:parsed.data,current,sent:false,expired:false,expires:performance.now()+timeoutMs,observed:false,resolve,reject,timer:setTimeout(()=>expire(attempt),timeoutMs)};pending=attempt;
   void(async()=>{try{await actions.open();if(pending!==attempt)return;const owner=actions.contents();if(!active()||!ownerValid(owner)){finish(attempt,false);return;}attempt.owner=owner;send(attempt);}catch{finish(attempt,false);}})();
   return operation;
  },
  read(record:NoteRecord){const attempt=pending;if(attempt?.sent&&active()&&attempt.current()&&ownerValid(attempt.owner)&&record.id===attempt.selection.id&&record.revision===attempt.selection.revision&&!record.archived&&!record.trashed)attempt.observed=true;},
  ownerClosed(owner:WebContents){if(readyOwner===owner)readyOwner=undefined;if(pending?.owner===owner)finish(pending,false);},
  remove(){if(disposed)return;disposed=true;readyOwner=undefined;if(pending)finish(pending,false);ipc.removeHandler(NOTES_LAUNCHER_CHANNELS.ready);ipc.removeHandler(NOTES_LAUNCHER_CHANNELS.finished);},
 };
}
