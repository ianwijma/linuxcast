import type {IpcMain,IpcMainInvokeEvent,WebContents} from 'electron';
import {NOTES_EXPORT_CHANNEL,noteExportRequestSchema,noteExportReplySchema} from '../../../../packages/contracts/src/notes-export.ts';
import {noteRecordSchema,noteContentKey} from '../../../../packages/contracts/src/notes.ts';
import type {NoteRecord} from '../../../../packages/contracts/src/notes.ts';
import {exportNoteMarkdown} from '../../../../packages/notes/src/markdown.ts';
import {NoteExportFileError} from './notes-export-file.ts';
import {trustedAppSender} from './ipc.ts';
import {NOTES_URL} from './assets.ts';
interface Actions{
 contents():WebContents|undefined;active():boolean;ready():boolean;writeBusy():boolean;
 get(id:string):Promise<NoteRecord|null>;choose(record:NoteRecord):Promise<string|null>;
 publish(path:string,text:string,signal:AbortSignal):Promise<void>;
}
const failed=(code:'invalid-request'|'conflict'|'capability-unavailable'|'cancelled'|'deadline-exceeded')=>({ok:false as const,error:{code,retryable:false,message:{
 'invalid-request':'Select a stored note before exporting.',conflict:'The note changed, or the selected filename already exists. Reload the note or choose an unused filename.',
 'capability-unavailable':'Markdown export is unavailable. Keep your note and choose another location or reopen Notes.',cancelled:'Export was cancelled before publication.',
 'deadline-exceeded':'The export could not be confirmed. Check the selected file before trying again. Your note remains stored.',
}[code]}});
export function registerNotesExportIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,actions:Actions){
 let disposed=false,operation:Promise<unknown>|undefined;const aborts=new Set<AbortController>();
 ipc.handle(NOTES_EXPORT_CHANNEL,async(event:IpcMainInvokeEvent,payload:unknown)=>{
  const owner=actions.contents(),current=()=>!disposed&&actions.active()&&actions.contents()===owner&&trustedAppSender(event,owner,NOTES_URL);
  if(!current()||!actions.ready())return failed('capability-unavailable');const parsed=noteExportRequestSchema.safeParse(payload);if(!parsed.success)return failed('invalid-request');
  if(operation||actions.writeBusy())return failed('capability-unavailable');const {id,revision}=parsed.data;
  let publishing=false;let timeoutReply!:(value:ReturnType<typeof failed>)=>void;const timedOut=new Promise<ReturnType<typeof failed>>(resolve=>{timeoutReply=resolve;});
  const run=Promise.resolve().then(async()=>{
   try{
    if(!current()||!actions.ready()||actions.writeBusy())return failed('cancelled');
    const value=await actions.get(id);if(!current()||!actions.ready())return failed('cancelled');const before=noteRecordSchema.safeParse(value);
    if(!before.success||before.data.id!==id||before.data.revision!==revision)return failed('conflict');
    const text=exportNoteMarkdown(before.data.draft);if(!current()||!actions.ready()||actions.writeBusy())return failed('cancelled');
    const path=await actions.choose(before.data);if(path===null)return noteExportReplySchema.parse({ok:true,value:{id,revision,outcome:'cancelled'}});
    if(!current()||!actions.ready()||actions.writeBusy())return failed('cancelled');
    const fresh=noteRecordSchema.safeParse(await actions.get(id));if(!current()||!actions.ready()||actions.writeBusy())return failed('cancelled');
    if(!fresh.success||fresh.data.id!==id||fresh.data.revision!==revision||noteContentKey(fresh.data.draft)!==noteContentKey(before.data.draft))return failed('conflict');
    const controller=new AbortController();aborts.add(controller);const watcher=setInterval(()=>{if(!current())controller.abort();},25),deadline=setTimeout(()=>{controller.abort();timeoutReply(failed('deadline-exceeded'));},5000);publishing=true;
    try{await actions.publish(path,text,controller.signal);if(!current()||controller.signal.aborted)return failed('deadline-exceeded');}
    finally{clearInterval(watcher);clearTimeout(deadline);aborts.delete(controller);}
    return noteExportReplySchema.parse({ok:true,value:{id,revision,outcome:'exported'}});
   }catch(error){if(error instanceof NoteExportFileError){if(error.reason==='exists')return failed('conflict');if(error.effectOutcome==='not-dispatched')return failed('capability-unavailable');}return failed(publishing?'deadline-exceeded':'capability-unavailable');}
  });operation=run;void run.finally(()=>{if(operation===run)operation=undefined;});return await Promise.race([run,timedOut]);
 });
 return {busy:()=>!!operation,remove(){disposed=true;for(const controller of aborts)controller.abort();ipc.removeHandler(NOTES_EXPORT_CHANNEL);},async drain(){await operation;}};
}
