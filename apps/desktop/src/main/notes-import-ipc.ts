import type {IpcMain,IpcMainInvokeEvent,WebContents} from 'electron';
import {NOTES_IMPORT_CHANNEL,noteImportRequestSchema,noteImportReplySchema} from '../../../../packages/contracts/src/notes-import.ts';
import type {NoteContent} from '../../../../packages/contracts/src/notes.ts';
import {trustedAppSender} from './ipc.ts';
import {NOTES_URL} from './assets.ts';
interface Actions{contents():WebContents|undefined;active():boolean;ready():boolean;writeBusy():boolean;choose():Promise<string|null>;read(path:string,signal:AbortSignal):Promise<string>;parse(text:string):NoteContent}
const failure=(code:'invalid-request'|'capability-unavailable'|'cancelled'|'deadline-exceeded')=>({ok:false as const,error:{code,retryable:false,message:{
 'invalid-request':'Choose a nonempty UTF-8 Markdown file up to 512 KiB with supported text and tasks. Raw HTML, links, images, tables and unsupported formatting cannot be imported. Your current note is unchanged.',
 'capability-unavailable':'Markdown import is unavailable. Finish the current Notes operation or reopen Notes, then choose the file again.',
 cancelled:'Import was cancelled. No note was created.',
 'deadline-exceeded':'The selected file could not be read in time. No note was created. Wait for the read to finish, then choose the file again.',
}[code]}});
/** Read-only preparation; creation uses the existing separately confirmed notes.write. */
export function registerNotesImportIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,actions:Actions){
 let disposed=false,operation:Promise<unknown>|undefined;const aborts=new Set<AbortController>();
 ipc.handle(NOTES_IMPORT_CHANNEL,async(event:IpcMainInvokeEvent,payload:unknown)=>{
  const owner=actions.contents(),current=()=>!disposed&&actions.active()&&actions.contents()===owner&&trustedAppSender(event,owner,NOTES_URL);
  if(!current()||!actions.ready())return failure('capability-unavailable');if(!noteImportRequestSchema.safeParse(payload).success)return failure('invalid-request');
  if(operation||actions.writeBusy())return failure('capability-unavailable');
  let timeoutReply!:(value:ReturnType<typeof failure>)=>void;const timedOut=new Promise<ReturnType<typeof failure>>(resolve=>{timeoutReply=resolve;});
  const run=Promise.resolve().then(async()=>{
   let controller:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined,expires:number|undefined;
   const expired=()=>{if(expires!==undefined&&(performance.now()>=expires||controller?.signal.aborted)){controller?.abort();return true;}return false;};
   try{
    if(!current()||!actions.ready()||actions.writeBusy())return failure('cancelled');
    const path=await actions.choose();if(!current()||!actions.ready()||actions.writeBusy())return failure('cancelled');
    if(path===null)return noteImportReplySchema.parse({ok:true,value:{outcome:'cancelled'}});
    controller=new AbortController();expires=performance.now()+5000;aborts.add(controller);timer=setTimeout(()=>{controller!.abort();timeoutReply(failure('deadline-exceeded'));},5000);
    const text=await actions.read(path,controller.signal);if(expired())return failure('deadline-exceeded');if(!current()||!actions.ready()||actions.writeBusy()||controller.signal.aborted)return failure('cancelled');
    const content=actions.parse(text);if(expired())return failure('deadline-exceeded');if(!current()||!actions.ready()||actions.writeBusy()||controller.signal.aborted)return failure('cancelled');
    return noteImportReplySchema.parse({ok:true,value:{outcome:'ready',content}});
   }catch{return failure(expired()?'deadline-exceeded':current()?'invalid-request':'cancelled');}
   finally{if(timer)clearTimeout(timer);if(controller)aborts.delete(controller);}
  });operation=run;void run.finally(()=>{if(operation===run)operation=undefined;});return await Promise.race([run,timedOut]);
 });
 return {busy:()=>!!operation,remove(){disposed=true;for(const controller of aborts)controller.abort();ipc.removeHandler(NOTES_IMPORT_CHANNEL);},async drain(){await operation;}};
}
