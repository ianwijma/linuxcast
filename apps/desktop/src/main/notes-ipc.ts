import type {IpcMain,IpcMainInvokeEvent,WebContents} from 'electron';
import {NOTES_CHANNELS,notesRequestSchema,notesGetRequestSchema,notesQueryRequestSchema,notesWriteRequestSchema,noteRecordSchema,noteContentKey,notesReadReplySchema,notesWriteReplySchema,notesListReplySchema} from '../../../../packages/contracts/src/notes.ts';
import type {NoteRecord,NoteWrite,NotesList,NotesListRequest} from '../../../../packages/contracts/src/notes.ts';
import {NOTES_URL} from './assets.ts';
import {trustedAppSender} from './ipc.ts';
export interface NotesActions{
 exportBusy?():boolean;
 contents():WebContents|undefined;active():boolean;ready():boolean;appearance():'dark'|'light';close():void;
 list(input:NotesListRequest):Promise<NotesList>;get(id:string):Promise<NoteRecord|null>;write(input:NoteWrite):Promise<NoteRecord>;
}
const failure=(code:'invalid-request'|'conflict'|'unavailable'|'unknown-outcome')=>({ok:false as const,error:{code:({'invalid-request':'invalid-request',conflict:'conflict',unavailable:'capability-unavailable','unknown-outcome':'internal'} as const)[code],retryable:false,message:{
 'invalid-request':'Review this note’s title and supported content before saving.',conflict:'This note changed. Reload before saving again.',unavailable:'Notes storage is unavailable. Keep your edits and try again.',
 'unknown-outcome':'The note write could not be confirmed. Keep your edits and reload before saving again.',
}[code]}});
/** Local Notes authority only. The actual owner operation retains its slot even if
 * the caller deadline expires; uncertain writes are never automatically replayed. */
export function registerNotesIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,actions:NotesActions){
 let disposed=false,write:Promise<unknown>|undefined,reads=0,writeGeneration=0;
 const uncertain=new Set<string>();
 const pending=new Set<Promise<unknown>>();
 for(const channel of Object.values(NOTES_CHANNELS))ipc.handle(channel,async(event:IpcMainInvokeEvent,payload:unknown)=>{
  const owner=actions.contents(),valid=()=>!disposed&&actions.active()&&actions.contents()===owner&&trustedAppSender(event,owner,NOTES_URL);
  if(!valid())return failure('unavailable');
  const schema=channel===NOTES_CHANNELS.list?notesQueryRequestSchema:channel===NOTES_CHANNELS.get?notesGetRequestSchema:channel===NOTES_CHANNELS.write?notesWriteRequestSchema:notesRequestSchema;
  if(!schema.safeParse(payload).success)return failure('invalid-request');
  if(channel===NOTES_CHANNELS.appearance)return actions.appearance();
  if(channel===NOTES_CHANNELS.close){if(actions.exportBusy?.())return failure('unavailable');setImmediate(()=>{if(valid()&&!actions.exportBusy?.())actions.close();});return {ok:true};}
  if(!actions.ready())return failure('unavailable');
  const mutating=channel===NOTES_CHANNELS.write;
  if(mutating?!!write||!!actions.exportBusy?.():reads>=4)return failure('unavailable');
  const input=mutating?notesWriteRequestSchema.parse(payload).input:undefined;
  if(input&&(uncertain.has(input.id)||uncertain.size>=100))return failure('unknown-outcome');
  if(input)writeGeneration++;
  let dispatched=false,expired=false;
  const deadline=performance.now()+4000;
  const current=()=>!expired&&performance.now()<deadline&&valid()&&actions.ready();
  const operation=(async()=>{
   try{
    if(input){
     const beforeRaw=await actions.get(input.id);
     const before=beforeRaw===null?null:noteRecordSchema.parse(beforeRaw);
     if(!current())return failure('unavailable');
     if(before&&before.id!==input.id)return failure('unavailable');
     if((before?.revision??0)!==input.expectedRevision)return failure('conflict');
     dispatched=true;
     const value=await actions.write(input),parsed=notesWriteReplySchema.safeParse({ok:true,value});
     if(!current()||!parsed.success||!parsed.data.ok){uncertain.add(input.id);return failure('unknown-outcome');}
     const row=parsed.data.value;
     if(row.id!==input.id||row.revision!==input.expectedRevision+1||noteContentKey(row.draft)!==noteContentKey(input.content)||
      (before&&row.createdAt!==before.createdAt)||
      (input.action==='save'?row.saved===null||noteContentKey(row.saved)!==noteContentKey(input.content):
       before?.saved?row.saved===null||noteContentKey(row.saved)!==noteContentKey(before.saved):row.saved!==null)){
      uncertain.add(input.id);return failure('unknown-outcome');
     }
     return parsed.data;
    }
    if(channel===NOTES_CHANNELS.get){
     const mayReconcile=!write,generation=writeGeneration,request=notesGetRequestSchema.parse(payload),value=await actions.get(request.id),reply=notesReadReplySchema.safeParse({ok:true,value});
     if(!current()||!reply.success||!reply.data.ok||reply.data.value&&reply.data.value.id!==request.id)return failure('unavailable');
     // An explicit fresh read can reconcile only once the original write settled.
     if(mayReconcile&&!write&&generation===writeGeneration)uncertain.delete(request.id);
     return reply.data;
    }
    const {protocolVersion:_,...request}=notesQueryRequestSchema.parse(payload);void _;
    const reply=notesListReplySchema.safeParse({ok:true,value:await actions.list(request)});
    if(!current()||!reply.success||!reply.data.ok)return failure('unavailable');
    const page=reply.data.value;let before=request.cursor;
    if(page.query!==request.query||!page.records.every(row=>{const ordered=!before||row.updatedAt<before.updatedAt||row.updatedAt===before.updatedAt&&row.id<before.id;before={updatedAt:row.updatedAt,id:row.id};return ordered;})||
     page.nextCursor!==null&&(page.records.length!==100||page.nextCursor.id!==page.records.at(-1)?.id||page.nextCursor.updatedAt!==page.records.at(-1)?.updatedAt))return failure('unavailable');
    return reply.data;
   }catch(error){
    const reason=error&&typeof error==='object'&&'reasonCode'in error?error.reasonCode:undefined;
    if(reason==='conflict'||reason==='invalid-request')return failure(reason);
    if(input&&dispatched){uncertain.add(input.id);return failure('unknown-outcome');}
    return failure('unavailable');
   }
  })();
  if(mutating)write=operation;else reads++;
  pending.add(operation);
  void operation.finally(()=>{pending.delete(operation);if(write===operation)write=undefined;if(!mutating)reads--;});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;if(input&&dispatched)uncertain.add(input.id);resolve(failure(input&&dispatched?'unknown-outcome':'unavailable'));},4000);})]);}
  finally{clearTimeout(timer);}
 });
 return {isWriting:()=>!!write,remove(){disposed=true;for(const channel of Object.values(NOTES_CHANNELS))ipc.removeHandler(channel);},async drain(){await Promise.allSettled([...pending]);}};
}
