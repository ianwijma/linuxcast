import type {IpcMain,IpcMainInvokeEvent,WebContents} from 'electron';
import {NOTES_CHANNELS,notesRequestSchema,notesGetRequestSchema,notesQueryRequestSchema,notesWriteRequestSchema,notesPinRequestSchema,notesArchiveRequestSchema,notesTrashRequestSchema,notesDeleteRequestSchema,notesDeleteReplySchema,notesHistoryRequestSchema,notesRevisionRequestSchema,noteHistoryReplySchema,noteRevisionReadReplySchema,noteRecordSchema,noteContentKey,notesReadReplySchema,notesWriteReplySchema,notesListReplySchema} from '../../../../packages/contracts/src/notes.ts';
import type {NoteRecord,NoteWrite,NotePin,NoteArchive,NoteTrash,NoteDelete,NoteDeleted,NotesList,NotesListRequest,NoteHistoryRequest,NoteRevisionSelection,NoteHistory,NoteRevisionRead} from '../../../../packages/contracts/src/notes.ts';
import {NOTES_URL} from './assets.ts';
import {trustedAppSender} from './ipc.ts';
export interface NotesActions{
 observedRead?(record:NoteRecord):void;
 exportBusy?():boolean;closeBusy?():boolean;committed?(input:NoteWrite,record:NoteRecord):void;
 contents():WebContents|undefined;active():boolean;ready():boolean;appearance():'dark'|'light';close():void;
 deletePermanently(input:NoteDelete):Promise<NoteDeleted>;
 list(input:NotesListRequest):Promise<NotesList>;get(id:string):Promise<NoteRecord|null>;write(input:NoteWrite):Promise<NoteRecord>;setPinned(input:NotePin):Promise<NoteRecord>;setArchived(input:NoteArchive):Promise<NoteRecord>;setTrashed(input:NoteTrash):Promise<NoteRecord>;history(input:NoteHistoryRequest):Promise<NoteHistory>;getRevision(input:NoteRevisionSelection):Promise<NoteRevisionRead>;restoreRevision(input:NoteRevisionSelection):Promise<NoteRecord>;
}
const failure=(code:'invalid-request'|'conflict'|'unavailable'|'unknown-outcome')=>({ok:false as const,error:{code:({'invalid-request':'invalid-request',conflict:'conflict',unavailable:'capability-unavailable','unknown-outcome':'internal'} as const)[code],retryable:false,message:{
 'invalid-request':'Review this note’s title and supported content before saving.',conflict:'This note changed. Reload before saving again.',unavailable:'Notes storage is unavailable. Keep your edits and try again.',
 'unknown-outcome':'The note write could not be confirmed. Keep your edits and reload before saving again.',
}[code]}});
/** Local Notes authority only. The actual owner operation retains its slot even if
 * the caller deadline expires; uncertain writes are never automatically replayed. */
export function registerNotesIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,actions:NotesActions){
 let disposed=false,write:Promise<unknown>|undefined,reads=0,writeGeneration=0;
 const uncertain=new Set<string>(),uncertainDeletes=new Set<string>();
 const pending=new Set<Promise<unknown>>();
 for(const channel of Object.values(NOTES_CHANNELS))ipc.handle(channel,async(event:IpcMainInvokeEvent,payload:unknown)=>{
  const owner=actions.contents(),valid=()=>!disposed&&actions.active()&&actions.contents()===owner&&trustedAppSender(event,owner,NOTES_URL);
  if(!valid())return failure('unavailable');
  const schema=channel===NOTES_CHANNELS.list?notesQueryRequestSchema:channel===NOTES_CHANNELS.get?notesGetRequestSchema:channel===NOTES_CHANNELS.write?notesWriteRequestSchema:channel===NOTES_CHANNELS.setPinned?notesPinRequestSchema:channel===NOTES_CHANNELS.setArchived?notesArchiveRequestSchema:channel===NOTES_CHANNELS.setTrashed?notesTrashRequestSchema:channel===NOTES_CHANNELS.deletePermanently?notesDeleteRequestSchema:channel===NOTES_CHANNELS.history?notesHistoryRequestSchema:channel===NOTES_CHANNELS.getRevision||channel===NOTES_CHANNELS.restoreRevision?notesRevisionRequestSchema:notesRequestSchema;
  if(!schema.safeParse(payload).success)return failure('invalid-request');
  if(channel===NOTES_CHANNELS.appearance)return actions.appearance();
  if(channel===NOTES_CHANNELS.close){if(write||uncertainDeletes.size||actions.exportBusy?.()||actions.closeBusy?.())return failure('unavailable');setImmediate(()=>{if(valid()&&!write&&!uncertainDeletes.size&&!actions.exportBusy?.()&&!actions.closeBusy?.())actions.close();});return {ok:true};}
  if(!actions.ready())return failure('unavailable');
  const mutating=channel===NOTES_CHANNELS.deletePermanently||channel===NOTES_CHANNELS.write||channel===NOTES_CHANNELS.setPinned||channel===NOTES_CHANNELS.setArchived||channel===NOTES_CHANNELS.setTrashed||channel===NOTES_CHANNELS.restoreRevision;
  if(mutating?!!write||uncertainDeletes.size>0||!!actions.exportBusy?.():reads>=4)return failure('unavailable');
  const deletion=channel===NOTES_CHANNELS.deletePermanently?notesDeleteRequestSchema.parse(payload).input:undefined;
  const input=channel===NOTES_CHANNELS.write?notesWriteRequestSchema.parse(payload).input:channel===NOTES_CHANNELS.setPinned?notesPinRequestSchema.parse(payload).input:channel===NOTES_CHANNELS.setArchived?notesArchiveRequestSchema.parse(payload).input:channel===NOTES_CHANNELS.setTrashed?notesTrashRequestSchema.parse(payload).input:channel===NOTES_CHANNELS.restoreRevision?notesRevisionRequestSchema.parse(payload).input:undefined;
  const mutation=deletion??input;
  const markUncertain=()=>{if(mutation){uncertain.add(mutation.id);if(deletion)uncertainDeletes.add(mutation.id);}};
  if(mutation&&(uncertain.has(mutation.id)||uncertain.size>=100))return failure('unknown-outcome');
  if(mutation)writeGeneration++;
  let dispatched=false,expired=false;
  const deadline=performance.now()+4000;
  const current=()=>!expired&&performance.now()<deadline&&valid()&&actions.ready()&&(channel!==NOTES_CHANNELS.deletePermanently||!actions.closeBusy?.());
  const operation=Promise.resolve().then(async()=>{
   try{
    if(!current())return failure('unavailable');
    if(mutation){
     const beforeRaw=await actions.get(mutation.id);
     const before=beforeRaw===null?null:noteRecordSchema.parse(beforeRaw);
     if(!current())return failure('unavailable');
     if(before&&before.id!==mutation.id)return failure('unavailable');
     if((before?.revision??0)!==mutation.expectedRevision||!(input&&'content'in input)&&!before)return failure('conflict');
     if(deletion){
      if(!before?.trashed)return failure('invalid-request');
      dispatched=true;
      const reply=notesDeleteReplySchema.safeParse({ok:true,value:await actions.deletePermanently(deletion)});
      if(!current()||!reply.success||!reply.data.ok||reply.data.value.id!==deletion.id||reply.data.value.deletedRevision!==deletion.expectedRevision){markUncertain();return failure('unknown-outcome');}
      return reply.data;
     }
     if(!input)return failure('invalid-request');
     if(before?.trashed&&!('trashed'in input))return failure('invalid-request');
     if(('content'in input||'revision'in input)&&before?.archived)return failure('invalid-request');
     let restoredContent:NoteRevisionRead|undefined;
     if('revision'in input){const selected=noteRevisionReadReplySchema.safeParse({ok:true,value:await actions.getRevision(input)});if(!current()||!selected.success||!selected.data.ok||selected.data.value.id!==input.id||selected.data.value.currentRevision!==input.expectedRevision||selected.data.value.savedRevision.revision!==input.revision)return failure('unavailable');restoredContent=selected.data.value;}
     dispatched=true;
     const value=await('content'in input?actions.write(input):'pinned'in input?actions.setPinned(input):'archived'in input?actions.setArchived(input):'trashed'in input?actions.setTrashed(input):'revision'in input?actions.restoreRevision(input):Promise.reject(new Error('Invalid note operation.'))),parsed=notesWriteReplySchema.safeParse({ok:true,value});
     if(!current()||!parsed.success||!parsed.data.ok){markUncertain();return failure('unknown-outcome');}
     const row=parsed.data.value;
     const content='content'in input?input.content:restoredContent?.savedRevision.content??before!.draft,saved='content'in input&&input.action==='save'?input.content:before?.saved??null,pinned='pinned'in input?input.pinned:before?.pinned??false,archived='archived'in input?input.archived:before?.archived??false,trashed='trashed'in input?input.trashed:before?.trashed??false;
     if(row.id!==input.id||row.revision!==input.expectedRevision+1||row.pinned!==pinned||row.archived!==archived||row.trashed!==trashed||noteContentKey(row.draft)!==noteContentKey(content)||
      (before&&row.createdAt!==before.createdAt)||!('content'in input)&&!('revision'in input)&&row.updatedAt!==before!.updatedAt||
      (saved?row.saved===null||noteContentKey(row.saved)!==noteContentKey(saved):row.saved!==null)){
      markUncertain();return failure('unknown-outcome');
     }
     if('content'in input)actions.committed?.(input,row);
     return parsed.data;
    }
    if(channel===NOTES_CHANNELS.history){
     const request=notesHistoryRequestSchema.parse(payload).input,reply=noteHistoryReplySchema.safeParse({ok:true,value:await actions.history(request)});
     if(!current()||!reply.success||!reply.data.ok||reply.data.value.id!==request.id||reply.data.value.currentRevision!==request.expectedRevision)return failure('unavailable');return reply.data;
    }
    if(channel===NOTES_CHANNELS.getRevision){
     const request=notesRevisionRequestSchema.parse(payload).input,reply=noteRevisionReadReplySchema.safeParse({ok:true,value:await actions.getRevision(request)});
     if(!current()||!reply.success||!reply.data.ok||reply.data.value.id!==request.id||reply.data.value.currentRevision!==request.expectedRevision||reply.data.value.savedRevision.revision!==request.revision)return failure('unavailable');return reply.data;
    }
    if(channel===NOTES_CHANNELS.get){
     const mayReconcile=!write,generation=writeGeneration,request=notesGetRequestSchema.parse(payload),value=await actions.get(request.id),reply=notesReadReplySchema.safeParse({ok:true,value});
     if(!current()||!reply.success||!reply.data.ok||reply.data.value&&reply.data.value.id!==request.id)return failure('unavailable');
     if(uncertain.has(request.id)&&(!mayReconcile||write||generation!==writeGeneration))return failure('unknown-outcome');
     // An explicit fresh read can reconcile only once the original write settled.
     if(mayReconcile&&!write&&generation===writeGeneration){uncertain.delete(request.id);uncertainDeletes.delete(request.id);if(reply.data.value)actions.observedRead?.(reply.data.value);}
     return reply.data;
    }
    const {protocolVersion:_,...request}=notesQueryRequestSchema.parse(payload);void _;
    const reply=notesListReplySchema.safeParse({ok:true,value:await actions.list(request)});
    if(!current()||!reply.success||!reply.data.ok)return failure('unavailable');
    const page=reply.data.value;let before=request.cursor;
    if(page.query!==request.query||!!page.pinnedOnly!==!!request.pinnedOnly||!!page.archived!==!!request.archived||!!page.trashed!==!!request.trashed||!page.records.every(row=>{const ordered=!before||row.updatedAt<before.updatedAt||row.updatedAt===before.updatedAt&&row.id<before.id;before={updatedAt:row.updatedAt,id:row.id};return ordered&&row.trashed===!!request.trashed&&(!!request.trashed||row.archived===!!request.archived)&&(!request.pinnedOnly||row.pinned);})||
     page.nextCursor!==null&&(page.records.length!==100||page.nextCursor.id!==page.records.at(-1)?.id||page.nextCursor.updatedAt!==page.records.at(-1)?.updatedAt))return failure('unavailable');
    return reply.data;
   }catch(error){
    const reason=error&&typeof error==='object'&&'reasonCode'in error?error.reasonCode:undefined;
    if(reason==='conflict'||reason==='invalid-request')return failure(reason);
    if(mutation&&dispatched){markUncertain();return failure('unknown-outcome');}
    return failure('unavailable');
   }
  });
  if(mutating)write=operation;else reads++;
  pending.add(operation);
  void operation.finally(()=>{pending.delete(operation);if(write===operation)write=undefined;if(!mutating)reads--;});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;if(mutation&&dispatched)markUncertain();resolve(failure(mutation&&dispatched?'unknown-outcome':'unavailable'));},4000);})]);}
  finally{clearTimeout(timer);}
 });
 return {isWriting:()=>!!write||uncertainDeletes.size>0,remove(){disposed=true;for(const channel of Object.values(NOTES_CHANNELS))ipc.removeHandler(channel);},async drain(){await Promise.allSettled([...pending]);}};
}
