import {noteExportReplySchema,notePinSchema,noteArchiveSchema,noteTrashSchema,noteHistoryReplySchema,noteRevisionReadReplySchema,notesLauncherSelectionSchema,notesDeleteReplySchema,notesTrashSnapshotReplySchema,notesEmptyTrashReplySchema} from '@linuxcast/contracts';
import { emptyNoteDocument, noteContentKey, noteContentSchema, notesListReplySchema, notesListRequestSchema, notesReadReplySchema, notesWriteReplySchema } from '@linuxcast/contracts';
import type { NotesLauncherSelection, NoteHistory, NoteRevisionRead, NoteContent, NoteDocument, NoteRecord, NoteSummary, NotesApi, NotesList, NotesTrashSnapshot } from '@linuxcast/contracts';

type TrashContext={id:string|undefined;revision:number|undefined;contentKey:string|null;trashed:boolean;generation:number;cancel:AbortController;basis?:NotesTrashSnapshot};
type Pending={id:string;done:Promise<boolean>;finish:(ok:boolean)=>void;cancel:AbortController};
export interface RevisionReview {loading:boolean;rows:NoteHistory['revisions'];preview?:NoteRevisionRead['savedRevision']|undefined;previewing?:number|undefined;error?:string|undefined;confirm:boolean;restoring:boolean}
type ReviewContext={id:string;generation:number;previewGeneration:number;record?:NoteRecord};
export interface NotesState {
 history?:RevisionReview|undefined;
 trashPreparing:boolean;emptyTrashConfirm:boolean;emptyingTrash:boolean;emptyTrashUncertain:boolean;trashReconciling:boolean;trashBasis?:NotesTrashSnapshot|undefined;
 query:string; pinnedOnly:boolean; showArchived:boolean; showTrashed:boolean; rows:NoteSummary[]; cursor:NotesList['nextCursor']; listing:boolean; listError?:string|undefined;
 id?:string|undefined; content?:NoteContent|undefined; record?:NoteRecord|undefined; busy:boolean; reading:boolean; closing:boolean; exporting:boolean; pinning:boolean; archiving:boolean; trashing:boolean; trashConfirm:boolean; deleting:boolean; deleteConfirm:boolean; deleteUncertain:boolean;
 error?:string|undefined; message?:string|undefined; blocked:boolean; paused:boolean; reloadConfirm:boolean; closeFailed:boolean;
}
const copy=<T,>(value:T):T=>structuredClone(value);
const key=(value:NoteContent|null|undefined)=>value?(noteContentSchema.safeParse(value).success?noteContentKey(value):'invalid-local-content'):null;
const failed='The stored outcome is uncertain. Your local edits remain here. Confirm Reload stored note before another write; nothing will be replayed.';
async function bounded<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
 return await new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('deadline')),5000);const abort=()=>{clearTimeout(timer);reject(new Error('cancelled'));};signal?.addEventListener('abort',abort,{once:true});promise.then(value=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(value);},()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new Error('unavailable'));});if(signal?.aborted)abort();});
}
export class NotesController {
 #api:NotesApi; #state:NotesState={trashPreparing:false,emptyTrashConfirm:false,emptyingTrash:false,emptyTrashUncertain:false,trashReconciling:false,query:'',pinnedOnly:false,showArchived:false,showTrashed:false,rows:[],cursor:null,listing:false,busy:false,reading:false,closing:false,exporting:false,pinning:false,archiving:false,trashing:false,trashConfirm:false,deleting:false,deleteConfirm:false,deleteUncertain:false,blocked:false,paused:false,reloadConfirm:false,closeFailed:false};
 #opening:{id:string|undefined;generation:number}|undefined; #listeners=new Set<()=>void>(); #active=true; #pending:Pending|undefined; #timer?:ReturnType<typeof setTimeout>; #searchTimer?:ReturnType<typeof setTimeout>; #listGeneration=0; #navigation=0; #save:Promise<boolean>|undefined; #close:Promise<boolean>|undefined; #new=false; #export:Promise<boolean>|undefined; #metadata:Promise<boolean>|undefined; #trashConfirmation:{id:string;revision:number;generation:number}|undefined; #review:ReviewContext|undefined; #revisionConfirmation:{context:ReviewContext;preview:NoteRevisionRead['savedRevision'];record:NoteRecord}|undefined; #restore:Promise<boolean>|undefined; #delete:Promise<boolean>|undefined; #deleteConfirmation:{id:string;revision:number;generation:number}|undefined; #deleteUncertainId:string|undefined; #emptyContext:TrashContext|undefined; #emptyCall:Promise<boolean>|undefined; #emptyActual:Promise<unknown>|undefined; #emptyRecovery:TrashContext|undefined;
 constructor(api:NotesApi){this.#api=api;}
 get snapshot(){return this.#state;} subscribe=(listener:()=>void)=>{this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};};
 #publish(patch:Partial<NotesState>){this.#state={...this.#state,...patch};for(const listener of this.#listeners)listener();}
 get #emptyBusy(){return !!(this.#emptyContext||this.#emptyCall||this.#emptyActual||this.#emptyRecovery||this.#state.emptyTrashUncertain);}
 get #metadataBusy(){return this.#emptyBusy||!!this.#delete||this.#state.deleting||this.#state.deleteConfirm||this.#state.pinning||this.#state.archiving||this.#state.trashing||this.#state.trashConfirm;}
 get dirty(){return !!this.#state.content&&key(this.#state.content)!==key(this.#state.record?.draft);}
 get unsaved(){return !!this.#state.content&&key(this.#state.content)!==key(this.#state.record?.saved);}
 start(){void this.reloadList();}
 setQuery(query:string){if(this.#deleteUncertainId||!this.#active||this.#opening||this.#review||this.#metadata||this.#metadataBusy)return;this.#listGeneration++;clearTimeout(this.#searchTimer);this.#publish({query,cursor:null});this.#searchTimer=setTimeout(()=>void this.reloadList(),150);}
 setPinnedOnly(pinnedOnly:boolean){if(this.#deleteUncertainId||!this.#active||this.#opening||this.#review||this.#metadata||this.#metadataBusy||typeof pinnedOnly!=='boolean'||pinnedOnly===this.#state.pinnedOnly)return;clearTimeout(this.#searchTimer);++this.#listGeneration;this.#publish({pinnedOnly,rows:[],cursor:null,listError:undefined});void this.reloadList();}
 setShowArchived(showArchived:boolean){if(this.#deleteUncertainId||!this.#active||this.#opening||this.#review||this.#metadata||this.#metadataBusy||typeof showArchived!=='boolean'||showArchived===this.#state.showArchived)return;clearTimeout(this.#searchTimer);++this.#listGeneration;this.#publish({showArchived,...(showArchived?{showTrashed:false}:{}),rows:[],cursor:null,listError:undefined});void this.reloadList();}
 setShowTrashed(showTrashed:boolean){if(this.#deleteUncertainId||!this.#active||this.#opening||this.#review||this.#metadata||this.#metadataBusy||typeof showTrashed!=='boolean'||showTrashed===this.#state.showTrashed)return;clearTimeout(this.#searchTimer);++this.#listGeneration;this.#publish({showTrashed,...(showTrashed?{showArchived:false}:{}),rows:[],cursor:null,listError:undefined});void this.reloadList();}
 async reloadList(more=false){
  if(!this.#active||this.#emptyBusy)return;const query=this.#state.query,pinnedOnly=this.#state.pinnedOnly,archived=this.#state.showArchived,trashed=this.#state.showTrashed,cursor=more?this.#state.cursor:null;if(more&&!cursor)return;
  const input={query,...(trashed?{trashed:true}:{}),...(archived?{archived:true}:{}),...(pinnedOnly?{pinnedOnly:true}:{}),...(cursor?{cursor}: {})};if(!notesListRequestSchema.safeParse(input).success){this.#publish({listing:false,listError:'Search is limited to 256 UTF-8 bytes.'});return;}
  const generation=++this.#listGeneration;this.#publish({listing:true,listError:undefined});if(!this.#active||generation!==this.#listGeneration)return;
  try{const parsed=notesListReplySchema.safeParse(await bounded(this.#api.list(input)));if(!this.#active||generation!==this.#listGeneration)return;
   if(!parsed.success||!parsed.data.ok||parsed.data.value.query!==query||(parsed.data.value.pinnedOnly??false)!==pinnedOnly||(parsed.data.value.archived??false)!==archived||(parsed.data.value.trashed??false)!==trashed||parsed.data.value.records.some(row=>row.trashed!==trashed||!trashed&&row.archived!==archived)||pinnedOnly&&parsed.data.value.records.some(row=>!row.pinned))throw new Error('invalid');const value=parsed.data.value;
   if(value.nextCursor){const last=value.records.at(-1);if(!last||last.id!==value.nextCursor.id||last.updatedAt!==value.nextCursor.updatedAt)throw new Error('cursor');}
   const rows=more?[...this.#state.rows,...value.records]:value.records;if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('duplicate');
   this.#publish({rows,cursor:value.nextCursor,listing:false,listError:undefined});
  }catch{if(this.#active&&generation===this.#listGeneration)this.#publish({listing:false,listError:'Notes could not be loaded. Retry the local search.'});}
 }
 async select(id:string){
  if(!this.#active||this.#opening||this.#review||this.#metadata||this.#state.reading||this.#state.closing||this.#state.exporting||this.#metadataBusy||this.#new||id===this.#state.id)return;const generation=++this.#navigation;
  if(!await this.flush()||!this.#active||generation!==this.#navigation||this.#metadata||this.#metadataBusy||this.#state.exporting||this.#state.closing)return;
  this.#publish({reading:true,error:undefined});if(!this.#active||generation!==this.#navigation||this.#metadata||this.#metadataBusy||this.#state.exporting||this.#state.closing)return;
  try{const result=notesReadReplySchema.safeParse(await bounded(this.#api.get(id)));if(!this.#active||generation!==this.#navigation)return;
   if(!result.success||!result.data.ok||result.data.value?.id!==id)throw new Error('missing');const record=result.data.value;
   this.#publish({id,record,content:copy(record.draft),reading:false,blocked:false,paused:false,reloadConfirm:false,error:undefined,message:key(record.draft)!==key(record.saved)?'Recovered draft. Save explicitly to replace the last saved version.':undefined});
  }catch{if(this.#active&&generation===this.#navigation)this.#publish({reading:false,error:'This note is unavailable. Reload the list and choose the note again.'});}
 }
 /** A launcher selection is an identity, never note content or a fallback choice. */
 async openSelected(selection:NotesLauncherSelection):Promise<boolean>{
  const parsed=notesLauncherSelectionSchema.safeParse(selection);
  if(!parsed.success||!this.#active)return false;
  if(this.#opening||this.#review||this.#metadata||this.#new||this.#close||this.#export||this.#state.reading||this.#state.closing||this.#state.exporting||this.#metadataBusy||this.#state.blocked||this.#state.paused||this.#state.reloadConfirm||this.#state.closeFailed||this.dirty&&(this.#state.record?.archived||this.#state.record?.trashed)){
   if(!this.#state.error)this.#publish({error:'The selected note was not opened. Finish the current operation or review and recover retained edits, then select it again.'});return false;
  }
  const target=parsed.data,saving=this.#save,context={id:this.#state.id,generation:++this.#navigation};this.#opening=context;clearTimeout(this.#timer);
  const current=()=>this.#active&&this.#opening===context&&this.#navigation===context.generation&&this.#state.id===context.id&&!this.#state.closing&&!this.#close&&!this.#export&&!this.#metadata&&!this.#review;
  this.#publish({reading:true,message:'Opening selected note…'});
  try{
   if(!current())return false;
   if(saving&&!await saving)return false;
   if(!current()||this.#state.blocked||this.#state.paused)return false;
   if(!await this.#flush()||!current())return false;
   this.#publish({reading:true,message:'Loading selected note…'});if(!current())return false;
   const reply=notesReadReplySchema.safeParse(await bounded(this.#api.get(target.id)));if(!current())return false;
   if(!reply.success||!reply.data.ok||!reply.data.value||reply.data.value.id!==target.id||reply.data.value.revision!==target.revision||reply.data.value.archived||reply.data.value.trashed)throw new Error('selection');
   const record=reply.data.value;this.#publish({id:record.id,record,content:copy(record.draft),reading:false,blocked:false,paused:false,reloadConfirm:false,error:undefined,message:key(record.draft)!==key(record.saved)?'Recovered draft. Save explicitly to replace the last saved version.':undefined});
   return this.#active&&this.#opening===context&&this.#navigation===context.generation&&this.#state.id===target.id&&this.#state.record?.revision===target.revision;
  }catch{if(current())this.#publish({error:'The selected note is unavailable or changed. Reload the launcher and select it again. Your current note and local edits remain here.',message:undefined});return false;}
  finally{if(this.#opening===context){this.#opening=undefined;if(this.#active&&this.#state.reading)this.#publish({reading:false,...(this.#state.message==='Opening selected note…'||this.#state.message==='Loading selected note…'?{message:undefined}:{})});}}
 }
 async newNote():Promise<boolean>{
  if(!this.#active)return false;
  if(this.#opening||this.#review||this.#metadata||this.#new||this.#close||this.#export||this.#state.reading||this.#state.closing||this.#state.exporting||this.#metadataBusy){if(!this.#state.error)this.#publish({error:'A new note was not created. Finish the current Notes operation, then request a new note again.'});return false;}
  const outgoingId=this.#state.id,saving=this.#save;this.#new=true;const generation=++this.#navigation;
  try{
   if(saving&&!await saving)return false;
   if(!this.#active||generation!==this.#navigation||this.#state.id!==outgoingId||this.#close||this.#export||this.#metadata||this.#state.closing||this.#state.exporting)return false;
   if(!await this.flush()||!this.#active||generation!==this.#navigation||this.#state.id!==outgoingId||this.#close||this.#export||this.#metadata||this.#state.closing||this.#state.exporting)return false;
   const id=crypto.randomUUID();this.#publish({id,record:undefined,content:{title:'Untitled note',document:emptyNoteDocument()},blocked:false,paused:false,error:undefined,message:undefined});
   if(!this.#active||generation!==this.#navigation||this.#state.id!==id||this.#close||this.#export||this.#metadata||this.#state.closing||this.#state.exporting)return false;
   const confirmed=await this.#write('draft');return confirmed&&this.#active&&generation===this.#navigation&&this.#state.id===id&&this.#state.record?.id===id;
  }finally{this.#new=false;}
 }
 editTitle(title:string){if(this.#state.content)this.#edit({...this.#state.content,title});}
 editDocument(document:NoteDocument){if(this.#state.content)this.#edit({...this.#state.content,document});}
 inputError(message:string){if(this.#active)this.#publish({error:message});}
 #edit(content:NoteContent){if(!this.#active||this.#opening||this.#review||(this.#state.record?.archived||this.#state.record?.trashed)||this.#metadata||this.#state.reading||this.#state.closing||this.#state.exporting||this.#metadataBusy||!this.#state.id)return;if(noteContentSchema.safeParse(content).success&&noteContentSchema.safeParse(this.#state.content).success&&key(content)===key(this.#state.content))return;clearTimeout(this.#timer);this.#publish({content:copy(content),error:this.#state.blocked?this.#state.error:undefined,message:undefined});if(!this.#active||this.#state.blocked||this.#state.paused)return;this.#timer=setTimeout(()=>void this.flush(),500);}
 async #write(action:'draft'|'save'):Promise<boolean>{
  if(!this.#active||(this.#state.record?.archived||this.#state.record?.trashed)||this.#state.closing||this.#pending||this.#state.blocked||!this.#state.id||!this.#state.content)return false;
  const valid=noteContentSchema.safeParse(this.#state.content);if(!valid.success){this.#publish({error:'Use a nonblank title of at most 256 UTF-8 bytes and a supported note body of at most 64 KiB.',paused:true});return false;}
  const id=this.#state.id,content=copy(valid.data),record=this.#state.record,expectedRevision=record?.revision??0;
  let finish!:(ok:boolean)=>void;const done=new Promise<boolean>(resolve=>{finish=resolve;});const pending:Pending={id,done,finish,cancel:new AbortController()};this.#pending=pending;
  this.#publish({busy:true,error:undefined,message:action==='save'?'Saving note…':'Storing draft…'});
  if(!this.#current(pending)){if(this.#pending===pending)this.#pending=undefined;finish(false);if(this.#active)this.#publish({busy:false});return false;}
  try{const reply=notesWriteReplySchema.safeParse(await bounded(this.#api.write({id,expectedRevision,action,content}),pending.cancel.signal));if(!this.#current(pending))return false;
   if(!reply.success)throw new Error('receipt');if(!reply.data.ok){const code=reply.data.error.code;if(['invalid-request','capability-unavailable','permission-denied'].includes(code)){this.#publish({paused:true,error:'The note was not accepted. Check the title and body or restore the Notes capability, then retry explicitly.',message:undefined});return false;}throw new Error('unknown');}
   const value=reply.data.value;if(value.id!==id||value.revision!==expectedRevision+1||value.pinned!==(record?.pinned??false)||value.archived!==(record?.archived??false)||value.trashed!==(record?.trashed??false)||key(value.draft)!==key(content)||key(value.saved)!==(action==='save'?key(content):key(record?.saved))||record&&value.createdAt!==record.createdAt)throw new Error('receipt');
   this.#publish({record:value,paused:false,error:undefined,message:action==='save'?'Saved version updated.':undefined});void this.reloadList();return true;
  }catch{if(this.#current(pending))this.#publish({blocked:true,paused:true,error:failed,message:undefined});return false;}
  finally{const current=this.#pending===pending;if(current)this.#pending=undefined;const ok=this.#active&&!this.#state.blocked&&!this.#state.paused&&this.#state.id===id&&key(this.#state.record?.draft)===key(content);finish(ok);if(current&&this.#active)this.#publish({busy:false});}
 }
 #current(pending:Pending){return this.#active&&!this.#state.closing&&this.#pending===pending&&this.#state.id===pending.id&&!pending.cancel.signal.aborted;}
 flush():Promise<boolean>{return this.#review||this.#opening?Promise.resolve(false):this.#flush();}
 async #flush():Promise<boolean>{
  clearTimeout(this.#timer);if(!this.#active||this.#emptyBusy||this.#state.trashConfirm||this.#state.deleteConfirm||this.#state.deleting||this.#delete)return false;if(this.#pending&&!await this.#pending.done)return false;
  if(this.#state.blocked)return false;if(!this.dirty)return true;if(this.#state.record?.trashed){this.#publish({error:'Restore from Trash to review and store retained local edits before navigating or closing.'});return false;}if(this.#state.record?.archived){this.#publish({error:'Restore this note to review and store retained local edits before navigating or closing.'});return false;}
  if(!await this.#write('draft'))return false;return this.dirty?await this.#flush():true;
 }
 save():Promise<boolean>{if(this.#save)return this.#save;this.#save=this.#saveNow().finally(()=>{this.#save=undefined;});return this.#save;}
 async #saveNow(){if(this.#opening||this.#review||this.#new||(this.#state.record?.archived||this.#state.record?.trashed)||this.#metadata||this.#metadataBusy)return false;clearTimeout(this.#timer);if(this.#pending&&!await this.#pending.done)return false;if(!this.#active||this.#metadata||this.#state.blocked||this.#state.exporting||this.#metadataBusy||!this.#state.content)return false;if(!this.unsaved)return true;return await this.#write('save');}
 retry(){if(this.#active&&!this.#opening&&!this.#review&&!this.#state.record?.archived&&!this.#state.record?.trashed&&!this.#metadata&&!this.#metadataBusy&&!this.#state.blocked){this.#publish({paused:false});return this.flush();}return Promise.resolve(false);}
 confirmReload(){if(this.#active&&!this.#opening&&!this.#review&&!this.#metadata&&!this.#metadataBusy&&this.#state.id&&!this.#pending)this.#publish({reloadConfirm:true});}
 cancelReload(){if(this.#active)this.#publish({reloadConfirm:false});}
 async reconcile(){
  if(!this.#active||this.#opening||this.#review||this.#metadata||!this.#state.reloadConfirm||!this.#state.id||this.#metadataBusy||this.#pending)return;const id=this.#state.id,generation=++this.#navigation;clearTimeout(this.#timer);this.#publish({reading:true,reloadConfirm:false});if(!this.#active||generation!==this.#navigation)return;
  try{const result=notesReadReplySchema.safeParse(await bounded(this.#api.get(id)));if(!this.#active||generation!==this.#navigation||this.#state.id!==id)return;
   if(!result.success||!result.data.ok||result.data.value&&result.data.value.id!==id||!result.data.value&&this.#state.record&&this.#deleteUncertainId!==id)throw new Error('read');
   if(!result.data.value&&this.#deleteUncertainId===id){this.#deleteUncertainId=undefined;this.#publish({id:undefined,record:undefined,content:undefined,history:undefined,reading:false,deleteUncertain:false,blocked:false,paused:false,error:undefined,message:'The stored note no longer exists. The obsolete selection and retained local edits were cleared. The earlier deletion was not acknowledged; no write was replayed.'});void this.reloadList();return;}
   this.#deleteUncertainId=undefined;
   this.#publish({record:result.data.value??undefined,reading:false,deleteUncertain:false,blocked:false,paused:true,error:undefined,message:'Stored state loaded. Your local edits are retained. Review them, then choose Retry draft or Save; no write was replayed.'});void this.reloadList();
  }catch{if(this.#active&&generation===this.#navigation)this.#publish({reading:false,error:'Stored state could not be confirmed. Local edits remain; try Reload stored note again.'});}
 }
 #reviewCurrent(context:ReviewContext){return this.#active&&this.#review===context&&this.#navigation===context.generation&&this.#state.id===context.id&&(!context.record||this.#state.record?.revision===context.record.revision);}
 #reviewError(context:ReviewContext,message:string){if(this.#reviewCurrent(context)&&this.#state.history)this.#publish({paused:true,history:{...this.#state.history,loading:false,previewing:undefined,preview:undefined,error:message}});}
 async openHistory():Promise<boolean>{
  if(!this.#active||this.#opening||this.#review||!this.#state.record||this.#state.blocked||this.#metadata||this.#metadataBusy||this.#new||this.#close||this.#export||this.#state.reading||this.#state.closing||this.#state.exporting||this.#state.reloadConfirm||this.#state.closeFailed)return false;
  if(!this.#api.history||!this.#api.getRevision){if(!this.#state.error)this.#publish({error:'Saved revisions are unavailable. Reopen Notes to reconnect.'});return false;}
  const saving=this.#save,context:ReviewContext={id:this.#state.record.id,generation:++this.#navigation,previewGeneration:0};this.#review=context;clearTimeout(this.#timer);this.#publish({history:{loading:true,rows:[],confirm:false,restoring:false}});
  try{
   if(saving&&!await saving)throw new Error('save');if(!this.#reviewCurrent(context))return false;
   if(this.#state.blocked)throw new Error('blocked');
   if(this.#state.paused||this.#state.record?.archived||this.#state.record?.trashed){if(this.#pending&&!await this.#pending.done)throw new Error('pending');}else if(!await this.#flush())throw new Error('flush');
   if(!this.#reviewCurrent(context)||!this.#state.record||this.#state.blocked)return false;context.record=copy(this.#state.record);
   this.#publish({history:{loading:true,rows:[],confirm:false,restoring:false}});if(!this.#reviewCurrent(context))return false;
   const reply=noteHistoryReplySchema.safeParse(await bounded(this.#api.history({id:context.id,expectedRevision:context.record.revision})));if(!this.#reviewCurrent(context))return false;
   if(!reply.success||!reply.data.ok||reply.data.value.id!==context.id||reply.data.value.currentRevision!==context.record.revision)throw new Error('history');
   this.#publish({history:{loading:false,rows:reply.data.value.revisions,confirm:false,restoring:false}});return this.#reviewCurrent(context);
  }catch{this.#reviewError(context,'Saved revisions could not be loaded. Close this review, resolve draft recovery or Reload stored note, then reopen Saved revisions.');return false;}
 }
 closeHistory(){if(!this.#review||this.#restore)return;this.#review=undefined;this.#revisionConfirmation=undefined;this.#publish({history:undefined});}
 async selectRevision(revision:number):Promise<boolean>{
  const context=this.#review,state=this.#state.history,summary=state?.rows.find(row=>row.revision===revision);if(!context?.record||!this.#reviewCurrent(context)||!state||state.loading||state.restoring||state.confirm||!summary||!this.#api.getRevision)return false;
  const generation=++context.previewGeneration;this.#publish({history:{...state,preview:undefined,previewing:revision,error:undefined}});if(!this.#reviewCurrent(context)||context.previewGeneration!==generation)return false;
  try{const reply=noteRevisionReadReplySchema.safeParse(await bounded(this.#api.getRevision({id:context.id,expectedRevision:context.record.revision,revision})));if(!this.#reviewCurrent(context)||context.previewGeneration!==generation)return false;
   if(!reply.success||!reply.data.ok||reply.data.value.id!==context.id||reply.data.value.currentRevision!==context.record.revision||reply.data.value.savedRevision.revision!==revision||reply.data.value.savedRevision.createdAt!==summary.createdAt||reply.data.value.savedRevision.content.title!==summary.title)throw new Error('revision');
   this.#publish({history:{...this.#state.history!,preview:reply.data.value.savedRevision,previewing:undefined,error:undefined}});return this.#reviewCurrent(context);
  }catch{if(this.#reviewCurrent(context)&&context.previewGeneration===generation)this.#reviewError(context,'This saved revision is unavailable or changed. Close this review and Reload stored note before reopening Saved revisions; no other revision was substituted.');return false;}
 }
 requestRevisionRestore(){const context=this.#review,state=this.#state.history;if(!context?.record||!this.#reviewCurrent(context)||!state?.preview||state.loading||state.previewing||state.restoring||state.confirm||this.#state.blocked||context.record.archived||context.record.trashed||!this.#api.restoreRevision)return;this.#revisionConfirmation={context,record:copy(context.record),preview:copy(state.preview)};this.#publish({history:{...state,confirm:true}});}
 keepCurrentDraft(){if(this.#state.history&&!this.#restore){this.#revisionConfirmation=undefined;this.#publish({history:{...this.#state.history,confirm:false}});}}
 restoreSavedRevision():Promise<boolean>{if(this.#restore)return this.#restore;const confirmation=this.#revisionConfirmation;if(!confirmation)return Promise.resolve(false);this.#revisionConfirmation=undefined;const operation=Promise.resolve().then(()=>this.#restoreSavedRevision(confirmation)).finally(()=>{if(this.#restore===operation)this.#restore=undefined;});this.#restore=operation;return operation;}
 async #restoreSavedRevision({context,record,preview}:{context:ReviewContext;record:NoteRecord;preview:NoteRevisionRead['savedRevision']}):Promise<boolean>{
  if(!this.#reviewCurrent(context)||!this.#state.history?.confirm||record.archived||record.trashed||this.#state.blocked||!this.#api.restoreRevision)return false;
  let finish!:(ok:boolean)=>void;const done=new Promise<boolean>(resolve=>{finish=resolve;}),pending:Pending={id:record.id,done,finish,cancel:new AbortController()};this.#pending=pending;this.#publish({busy:true,history:{...this.#state.history,confirm:false,restoring:true,error:undefined}});let accepted=false;
  try{
   if(!this.#current(pending)||!this.#reviewCurrent(context))return false;
   const reply=notesWriteReplySchema.safeParse(await bounded(this.#api.restoreRevision({id:record.id,expectedRevision:record.revision,revision:preview.revision}),pending.cancel.signal));if(!this.#current(pending)||!this.#reviewCurrent(context))return false;
   if(!reply.success)throw new Error('receipt');if(!reply.data.ok){if(['invalid-request','capability-unavailable','permission-denied','cancelled'].includes(reply.data.error.code)){this.#publish({history:{...this.#state.history!,restoring:false,error:'The saved revision was not restored. Close and reopen Saved revisions or reconnect Notes, then retry explicitly.'}});return false;}throw new Error('unknown');}
   const value=reply.data.value;if(value.id!==record.id||value.revision!==record.revision+1||key(value.draft)!==key(preview.content)||key(value.saved)!==key(record.saved)||value.pinned!==record.pinned||value.archived!==record.archived||value.trashed!==record.trashed||value.createdAt!==record.createdAt)throw new Error('receipt');
   accepted=true;this.#review=undefined;this.#publish({history:undefined,record:value,content:copy(value.draft),blocked:false,paused:false,error:undefined,message:'Saved revision restored as a draft. The saved version is unchanged until you choose Save note.'});void this.reloadList();return this.#active;
  }catch{if(this.#active&&this.#review===context){this.#review=undefined;this.#publish({history:undefined,blocked:true,paused:true,error:'The restored draft could not be confirmed. It may already be stored. Confirm Reload stored note before another write; no restore will be replayed.',message:undefined});}return false;}
  finally{if(this.#pending===pending)this.#pending=undefined;finish(accepted&&this.#active);if(this.#active)this.#publish({busy:false});}
 }
 /** Whole-Trash scope is read explicitly, never inferred from filtered list pages. */
 get emptyTrashDisabledReason():string|undefined{
  if(!this.#active||!this.#state.showTrashed)return 'Show trashed notes before reviewing Empty Trash.';
  if(!this.#api.trashSnapshot||!this.#api.emptyTrash)return 'Empty Trash is unavailable. Reopen Notes to reconnect.';
  if(this.#state.emptyTrashUncertain)return 'Wait for settlement, then choose Reload Trash before another operation.';
  if(this.#emptyBusy||this.#opening||this.#review||this.#metadata||this.#metadataBusy||this.#pending||this.#save||this.#new||this.#close||this.#export||this.#state.busy||this.#state.listing||this.#state.reading||this.#state.closing||this.#state.exporting)return 'Wait for the current Notes operation before reviewing Empty Trash.';
  if(this.dirty||this.#state.blocked||this.#state.paused||this.#state.reloadConfirm||this.#state.closeFailed)return 'Wait for autosave or recover retained edits before reviewing Empty Trash. This action does not save or discard edits.';
  return undefined;
 }
 #trashContext():TrashContext{return{id:this.#state.id,revision:this.#state.record?.revision,contentKey:key(this.#state.content),trashed:!!this.#state.record?.trashed,generation:++this.#navigation,cancel:new AbortController()};}
 #trashCurrent(context:TrashContext){return this.#active&&!context.cancel.signal.aborted&&this.#navigation===context.generation&&this.#state.id===context.id&&this.#state.record?.revision===context.revision&&key(this.#state.content)===context.contentKey&&!this.#state.closing;}
 async requestEmptyTrash():Promise<boolean>{
  const reason=this.emptyTrashDisabledReason;if(reason){if(this.#active)this.#publish({error:reason});return false;}
  clearTimeout(this.#timer);clearTimeout(this.#searchTimer);const context=this.#trashContext();this.#emptyContext=context;this.#publish({trashPreparing:true,error:undefined,message:'Reading all notes in Trash…'});
  try{
   if(!this.#trashCurrent(context)||this.#emptyContext!==context)return false;
   const reply=notesTrashSnapshotReplySchema.safeParse(await bounded(this.#api.trashSnapshot!(),context.cancel.signal));
   if(!this.#trashCurrent(context)||this.#emptyContext!==context)return false;
   if(!reply.success||!reply.data.ok)throw new Error('read');
   if(reply.data.value.count===0){this.#emptyContext=undefined;this.#publish({trashPreparing:false,message:'Trash is empty. No notes were deleted.'});return true;}
   context.basis=copy(reply.data.value);this.#publish({trashPreparing:false,emptyTrashConfirm:true,trashBasis:copy(context.basis),message:undefined});return true;
  }catch{if(this.#trashCurrent(context)&&this.#emptyContext===context){this.#emptyContext=undefined;this.#publish({trashPreparing:false,error:'Trash could not be reviewed. Reopen Notes to reconnect, then choose Empty Trash again; no deletion was requested.',message:undefined});}return false;}
 }
 keepTrash(){if(!this.#active||!this.#state.emptyTrashConfirm||!this.#emptyContext||this.#emptyCall)return;this.#emptyContext.cancel.abort();this.#emptyContext=undefined;this.#publish({emptyTrashConfirm:false,trashBasis:undefined,message:'Empty Trash cancelled. All notes and saved revisions are unchanged.'});}
 confirmEmptyTrash():Promise<boolean>{
  if(this.#emptyCall)return this.#emptyCall;const context=this.#emptyContext;
  if(!context?.basis||!this.#state.emptyTrashConfirm||!this.#trashCurrent(context)||!this.#api.emptyTrash)return Promise.resolve(false);
  let accepted=false;const operation=Promise.resolve().then(()=>this.#emptyTrash(context)).then(ok=>{accepted=ok;return ok;}).finally(()=>{if(this.#emptyCall===operation){this.#emptyCall=undefined;if(this.#active){this.#publish({});if(accepted)void this.reloadList();}}});this.#emptyCall=operation;return operation;
 }
 async #emptyTrash(context:TrashContext):Promise<boolean>{
  if(!this.#trashCurrent(context)||this.#emptyContext!==context||!context.basis||!this.#api.emptyTrash)return false;
  let settled=true,finished=false;this.#publish({emptyTrashConfirm:false,emptyingTrash:true,busy:true,error:undefined,message:'Permanently emptying all Trash and its saved revisions…'});
  try{
   if(!this.#trashCurrent(context)||this.#emptyContext!==context)return false;
   const actual=this.#api.emptyTrash({expectedCount:context.basis.count,expectedFingerprint:context.basis.fingerprint});this.#emptyActual=actual;settled=false;
   const onSettled=()=>{settled=true;if(this.#emptyActual===actual)this.#emptyActual=undefined;if(finished&&this.#active)this.#publish({emptyingTrash:false,busy:false});};void actual.then(onSettled,onSettled);
   const reply=notesEmptyTrashReplySchema.safeParse(await bounded(actual,context.cancel.signal));if(!this.#trashCurrent(context)||this.#emptyContext!==context)return false;
   if(!reply.success)throw new Error('receipt');
   if(!reply.data.ok){if(['conflict','invalid-request','permission-denied','capability-unavailable','cancelled'].includes(reply.data.error.code)){this.#emptyContext=undefined;this.#publish({trashBasis:undefined,message:undefined,error:'Empty Trash was refused. The Trash set may have changed. Choose Empty Trash again to review the current whole set before confirming.'});return false;}throw new Error('unknown');}
   if(reply.data.value.deletedCount!==context.basis.count||reply.data.value.fingerprint!==context.basis.fingerprint)throw new Error('receipt');
   this.#emptyContext=undefined;const removed=context.trashed;
   this.#publish({...(removed?{id:undefined,record:undefined,content:undefined,history:undefined}:{}),trashBasis:undefined,emptyTrashUncertain:false,error:undefined,message:`All ${reply.data.value.deletedCount} trashed notes and their saved revisions were permanently deleted. Notes outside Trash are unchanged. Backups may retain content.`});return true;
  }catch{if(this.#trashCurrent(context)&&this.#emptyContext===context){this.#emptyContext=undefined;this.#publish({trashBasis:undefined,emptyTrashUncertain:true,message:undefined,error:'Empty Trash could not be confirmed. Trash may already be emptied. Your view is retained. Wait for settlement, then choose Reload Trash; deletion will not be replayed.'});}return false;}
  finally{finished=true;if(this.#active)this.#publish({emptyingTrash:!settled,busy:!settled});}
 }
 get reloadTrashDisabled(){return !this.#active||!this.#state.emptyTrashUncertain||!!(this.#emptyActual||this.#emptyCall||this.#emptyContext||this.#emptyRecovery);}
 async reloadTrash():Promise<boolean>{
  if(this.reloadTrashDisabled||!this.#api.trashSnapshot)return false;const context=this.#trashContext();this.#emptyRecovery=context;this.#publish({trashReconciling:true,error:undefined,message:'Reloading the whole Trash snapshot…'});
  try{
   const reply=notesTrashSnapshotReplySchema.safeParse(await bounded(this.#api.trashSnapshot(),context.cancel.signal));if(!this.#trashCurrent(context)||this.#emptyRecovery!==context)return false;
   if(!reply.success||!reply.data.ok)throw new Error('read');let record:NoteRecord|null|undefined;
   if(context.id){const result=notesReadReplySchema.safeParse(await bounded(this.#api.get(context.id),context.cancel.signal));if(!this.#trashCurrent(context)||this.#emptyRecovery!==context)return false;if(!result.success||!result.data.ok||result.data.value&&result.data.value.id!==context.id||!result.data.value&&!context.trashed)throw new Error('read');record=result.data.value;}
   if(!this.#trashCurrent(context)||this.#emptyRecovery!==context)return false;
   const missing=context.id&&record===null,retained=record&&key(record.draft)!==context.contentKey;
   this.#publish({...(missing?{id:undefined,record:undefined,content:undefined,history:undefined}:record?{record,paused:!!retained}:{}),emptyTrashUncertain:false,error:undefined,message:missing?'Trash reloaded. The selected note no longer exists. The earlier Empty Trash outcome was not acknowledged; no deletion was replayed.':`Trash reloaded: ${reply.data.value.count} notes were present at the read. The earlier Empty Trash outcome was not acknowledged; no deletion was replayed.${retained?' Retained editor content is unchanged; review recovery before writing.':''}`});return true;
  }catch{if(this.#trashCurrent(context)&&this.#emptyRecovery===context)this.#publish({message:undefined,error:'Trash could not be reconciled. The earlier Empty Trash outcome remains uncertain. Try Reload Trash again after settlement; no deletion was replayed.'});return false;}
  finally{if(this.#emptyRecovery===context){this.#emptyRecovery=undefined;if(this.#active){this.#publish({trashReconciling:false});if(!this.#state.emptyTrashUncertain)void this.reloadList();}}}
 }
 requestDeletePermanently(){
  if(!this.#active||this.#opening||this.#review||this.#metadata||this.#metadataBusy||this.#pending||this.#save||this.#new||this.#close||this.#export||this.#state.reading||this.#state.closing||this.#state.exporting||this.#state.blocked||this.#state.reloadConfirm||this.#state.closeFailed||!this.#state.record?.trashed)return;
  if(!this.#api.deletePermanently){if(!this.#state.error)this.#publish({error:'Permanent deletion is unavailable. Reopen Notes to reconnect.'});return;}
  clearTimeout(this.#timer);const generation=++this.#navigation;this.#deleteConfirmation={id:this.#state.record.id,revision:this.#state.record.revision,generation};this.#publish({deleteConfirm:true});
 }
 keepTrashedNote(){if(!this.#active||!this.#deleteConfirmation||this.#delete)return;this.#deleteConfirmation=undefined;this.#publish({deleteConfirm:false,message:'Permanent deletion cancelled. The note, saved revisions and retained local edits are unchanged.'});}
 confirmDeletePermanently():Promise<boolean>{
  if(this.#delete)return this.#delete;const target=this.#deleteConfirmation;
  if(!this.#active||!target||target.generation!==this.#navigation||this.#state.id!==target.id||this.#state.record?.revision!==target.revision||!this.#state.record.trashed||!this.#api.deletePermanently)return Promise.resolve(false);
  this.#deleteConfirmation=undefined;const operation=Promise.resolve().then(()=>this.#deletePermanently(target)).finally(()=>{if(this.#delete===operation)this.#delete=undefined;});this.#delete=operation;return operation;
 }
 async #deletePermanently(target:{id:string;revision:number;generation:number}):Promise<boolean>{
  const current=()=>this.#active&&this.#navigation===target.generation&&this.#state.id===target.id&&this.#state.record?.revision===target.revision&&this.#state.record.trashed&&!this.#state.closing;
  if(!current()||!this.#api.deletePermanently)return false;
  let finish!:(ok:boolean)=>void;const done=new Promise<boolean>(resolve=>{finish=resolve;}),pending:Pending={id:target.id,done,finish,cancel:new AbortController()};this.#pending=pending;
  let accepted=false,settled=false,finished=false;this.#publish({deleteConfirm:false,deleting:true,busy:true,error:undefined,message:'Deleting this note and its saved revisions…'});
  try{
   if(!current()||!this.#current(pending))return false;
   settled=true;const actual=this.#api.deletePermanently({id:target.id,expectedRevision:target.revision});settled=false;
   const onSettled=()=>{settled=true;if(finished&&this.#active)this.#publish({deleting:false,busy:false});};void actual.then(onSettled,onSettled);
   const reply=notesDeleteReplySchema.safeParse(await bounded(actual,pending.cancel.signal));if(!current()||!this.#current(pending))return false;
   if(!reply.success)throw new Error('receipt');if(!reply.data.ok){if(['invalid-request','capability-unavailable','permission-denied','cancelled','conflict'].includes(reply.data.error.code)){this.#publish({paused:true,message:undefined,error:'Permanent deletion was refused. The note and retained local edits remain here. Reload the stored note or reconnect Notes before a fresh confirmation.'});return false;}throw new Error('unknown');}
   if(reply.data.value.id!==target.id||reply.data.value.deletedRevision!==target.revision)throw new Error('receipt');
   accepted=true;this.#deleteUncertainId=undefined;this.#review=undefined;this.#revisionConfirmation=undefined;this.#publish({id:undefined,record:undefined,content:undefined,history:undefined,deleteUncertain:false,blocked:false,paused:false,reloadConfirm:false,error:undefined,message:'This note and its saved revisions were permanently deleted. Retained local edits were removed. Backups may still contain content.'});void this.reloadList();return this.#active;
  }catch{if(current()){this.#deleteUncertainId=target.id;this.#publish({deleteUncertain:true,blocked:true,paused:true,message:undefined,error:'Permanent deletion could not be confirmed. The note may already be removed. Retained local edits remain here. Wait for the operation to settle, then confirm Reload stored note; deletion will not be replayed.'});}return false;}
  finally{finished=true;if(this.#pending===pending)this.#pending=undefined;finish(accepted&&this.#active);if(this.#active)this.#publish({deleting:!settled,busy:!settled});}
 }
 requestTrash(){
  if(!this.#active||this.#opening||this.#review||this.#trashConfirmation||this.#metadata||this.#metadataBusy||this.#pending||this.#save||this.#new||this.#close||this.#export||this.#state.reading||this.#state.closing||this.#state.exporting||this.#state.blocked||this.#state.reloadConfirm||this.#state.closeFailed||!this.#state.record||this.#state.record.trashed)return;
  if(!this.#api.setTrashed){if(!this.#state.error)this.#publish({error:'Trash and restore are unavailable. Reopen Notes to reconnect.'});return;}
  clearTimeout(this.#timer);const generation=++this.#navigation;this.#trashConfirmation={id:this.#state.record.id,revision:this.#state.record.revision,generation};this.#publish({trashConfirm:true});
 }
 cancelTrash(){if(!this.#active||!this.#trashConfirmation)return;this.#trashConfirmation=undefined;this.#publish({trashConfirm:false,...(this.dirty?{paused:true}:{}),message:this.dirty?'Move to Trash cancelled. Local edits remain; choose Retry draft or Save to store them.':'Move to Trash cancelled. Your note is unchanged.'});}
 confirmTrash():Promise<boolean>{
  const target=this.#trashConfirmation;if(!this.#active||!target||target.generation!==this.#navigation||this.#state.id!==target.id||this.#state.record?.revision!==target.revision)return Promise.resolve(false);
  this.#trashConfirmation=undefined;const operation=this.#admitMetadata('trash',true);this.#publish({trashConfirm:false});return operation;
 }
 restoreFromTrash():Promise<boolean>{if(!this.#state.record?.trashed)return Promise.resolve(false);return this.#admitMetadata('trash',false);}
 setPinned(pinned:boolean):Promise<boolean>{return this.#admitMetadata('pin',pinned);}
 setArchived(archived:boolean):Promise<boolean>{return this.#admitMetadata('archive',archived);}
 #admitMetadata(kind:'pin'|'archive'|'trash',desired:boolean):Promise<boolean>{
  if(this.#emptyBusy||this.#delete||this.#state.deleteConfirm||this.#state.deleting||this.#opening||this.#review||this.#trashConfirmation||kind!=='trash'&&this.#state.record?.trashed)return Promise.resolve(false);
  if(this.#metadata)return this.#metadata;
  if(!this.#active||typeof desired!=='boolean'||!(kind==='pin'?this.#api.setPinned:kind==='archive'?this.#api.setArchived:this.#api.setTrashed)||!this.#state.record||this.#state.blocked||this.#state.reading||this.#state.closing||this.#state.exporting||this.#export||this.#close||this.#new)return Promise.resolve(false);
  const generation=++this.#navigation;const operation=Promise.resolve().then(()=>this.#changeMetadata(kind,desired,generation)).finally(()=>{if(this.#metadata===operation)this.#metadata=undefined;});this.#metadata=operation;return operation;
 }
 async #changeMetadata(kind:'pin'|'archive'|'trash',desired:boolean,generation:number):Promise<boolean>{
  if(!this.#active||generation!==this.#navigation||!(kind==='pin'?this.#api.setPinned:kind==='archive'?this.#api.setArchived:this.#api.setTrashed)||!this.#state.record||this.#state.blocked||this.#state.reading||this.#state.closing||this.#state.exporting||this.#metadataBusy||this.#new)return false;
  const id=this.#state.id,noun=kind==='pin'?'pin':kind==='archive'?'archive':'Trash';clearTimeout(this.#timer);this.#publish({pinning:kind==='pin',archiving:kind==='archive',trashing:kind==='trash',error:undefined,message:`Preparing ${noun} change…`});
  let pending:Pending|undefined,accepted=false;
  try{
   const needsFlush=!this.#state.record.archived&&!this.#state.record.trashed&&!(kind==='archive'&&!desired)&&!(kind==='trash'&&!desired);
   if(needsFlush){if(!await this.flush())return false;}else if(this.#pending&&!await this.#pending.done)return false;
   if(!this.#active||this.#state.closing||this.#state.id!==id||generation!==this.#navigation||!this.#state.record||needsFlush&&this.dirty)return false;
   const record=copy(this.#state.record),selection={id:record.id,expectedRevision:record.revision};
   const send=kind==='pin'?()=>this.#api.setPinned!(notePinSchema.parse({...selection,pinned:desired})):kind==='archive'?()=>this.#api.setArchived!(noteArchiveSchema.parse({...selection,archived:desired})):()=>this.#api.setTrashed!(noteTrashSchema.parse({...selection,trashed:desired}));
   let finish!:(ok:boolean)=>void;const done=new Promise<boolean>(resolve=>{finish=resolve;});pending={id:record.id,done,finish,cancel:new AbortController()};this.#pending=pending;
   this.#publish({busy:true,message:kind==='pin'?(desired?'Pinning note…':'Unpinning note…'):kind==='archive'?(desired?'Archiving note…':'Restoring note…'):(desired?'Moving note to Trash…':'Restoring note from Trash…')});if(!this.#current(pending)||generation!==this.#navigation||!this.#metadataBusy)return false;
   const result=notesWriteReplySchema.safeParse(await bounded(send(),pending.cancel.signal));if(!this.#current(pending)||generation!==this.#navigation||!this.#metadataBusy)return false;
   if(!result.success)throw new Error('receipt');if(!result.data.ok){if(['invalid-request','capability-unavailable','permission-denied','cancelled'].includes(result.data.error.code)){this.#publish({message:undefined,error:`The ${noun} change was not accepted. Reload the stored note or reconnect Notes, then retry explicitly.`});return false;}throw new Error('unknown');}
   const value=result.data.value;if(value.id!==record.id||value.revision!==record.revision+1||value.pinned!==(kind==='pin'?desired:record.pinned)||value.archived!==(kind==='archive'?desired:record.archived)||value.trashed!==(kind==='trash'?desired:record.trashed)||key(value.draft)!==key(record.draft)||key(value.saved)!==key(record.saved)||value.createdAt!==record.createdAt||value.updatedAt!==record.updatedAt)throw new Error('receipt');
   accepted=true;const retained=this.dirty;const message=kind==='pin'?(desired?'Note pinned.':'Note unpinned.'):kind==='archive'?(desired?'Note archived. Restore it before editing.':'Note restored.'):(desired?'Note moved to Trash. Restore it before editing.':value.archived?'Note restored from Trash. It is still archived; choose Restore note before editing.':'Note restored from Trash. Turn off Show trashed notes to find it.');
   this.#publish({record:value,...(retained?{paused:true}:{}),error:undefined,message:retained?`${message} Retained local edits are unchanged. ${value.trashed?'Restore from Trash before choosing Retry draft or Save.':value.archived?'Restore the note before choosing Retry draft or Save.':'Review them, then choose Retry draft or Save.'} No content was replayed.`:message});void this.reloadList();return this.#current(pending);
  }catch{if(this.#active&&this.#state.id===id)this.#publish({blocked:true,paused:true,message:undefined,error:`The ${noun} change could not be confirmed. It may already be stored. Confirm Reload stored note before another write; nothing will be replayed.`});return false;}
  finally{if(pending&&this.#pending===pending)this.#pending=undefined;pending?.finish(accepted&&this.#active);if(this.#active)this.#publish({pinning:false,archiving:false,trashing:false,busy:false});}
 }
 exportMarkdown():Promise<boolean>{if(this.#opening||this.#review||this.#new)return Promise.resolve(false);if(this.#export)return this.#export;if(this.#metadata)return Promise.resolve(false);const operation=Promise.resolve().then(()=>this.#exportNow()).finally(()=>{if(this.#export===operation)this.#export=undefined;});this.#export=operation;return operation;}
 async #exportNow():Promise<boolean>{
  if(!this.#active||this.#state.closing||this.#state.reading||this.#state.exporting||this.#metadataBusy||this.#state.blocked||this.#new||!this.#state.id||!this.#api.exportMarkdown)return false;
  this.#publish({exporting:true,error:undefined,message:'Preparing Markdown export…'});
  try{
   if(!this.#active||this.#state.closing||!await this.flush()||!this.#active||this.#state.closing||!this.#state.record||this.dirty)return false;
   const selection={id:this.#state.id!,revision:this.#state.record.revision};
   this.#publish({message:'Choose a location for the unencrypted Markdown file.'});if(!this.#active||this.#state.closing||this.#state.id!==selection.id)return false;
   const result=noteExportReplySchema.safeParse(await this.#api.exportMarkdown(selection));if(!this.#active||this.#state.id!==selection.id)return false;
   if(!result.success||result.data.ok&&(result.data.value.id!==selection.id||result.data.value.revision!==selection.revision))throw new Error('Unconfirmed export.');
   if(!result.data.ok){this.#publish({message:undefined,error:!['invalid-request','conflict','capability-unavailable','cancelled','permission-denied'].includes(result.data.error.code)?'The export could not be confirmed. Check the selected file before trying again. Your note remains stored.':result.data.error.code==='conflict'?'The note changed or the filename exists. Reload the note or choose an unused filename.':'Markdown export did not complete. Keep your note and choose another location or reopen Notes.'});return false;}
   this.#publish({error:undefined,message:result.data.value.outcome==='exported'?'Markdown exported. The file is unencrypted.':'Export cancelled. Your note remains stored.'});return true;
  }catch{if(this.#active)this.#publish({message:undefined,error:'The export could not be confirmed. Check the selected file before trying again. Your note remains stored.'});return false;}
  finally{if(this.#active)this.#publish({exporting:false});}
 }
 requestClose():Promise<boolean>{return this.#beginClose(false);}
 closeWithoutFlush():Promise<boolean>{return this.#beginClose(true);}
 #beginClose(skip:boolean):Promise<boolean>{if(this.#opening)return Promise.resolve(false);if(this.#review){if(this.#active&&!this.#state.error)this.#publish({error:'Close Saved revisions before closing Notes.'});return Promise.resolve(false);}if(this.#new){if(this.#active)this.#publish({error:'Wait for the new note to finish before closing Notes.'});return Promise.resolve(false);}if(this.#close)return this.#close;let finish!:(ok:boolean)=>void;const operation=new Promise<boolean>(resolve=>{finish=resolve;});this.#close=operation;void this.#closeNow(skip).then(result=>{if(this.#close===operation)this.#close=undefined;finish(result);},()=>{if(this.#close===operation)this.#close=undefined;finish(false);});return operation;}
 async #closeNow(skip:boolean){if(!this.#active)return false;if(this.#emptyBusy){this.#publish({error:this.#state.emptyTrashUncertain?'Empty Trash remains uncertain. Wait for settlement, then choose Reload Trash before closing Notes.':'Keep notes or finish the Empty Trash operation before closing Notes.'});return false;}if(this.#deleteUncertainId){this.#publish({error:'Permanent deletion remains uncertain. Wait for the operation to settle and Reload stored note before closing Notes.'});return false;}if(this.#new){this.#publish({error:'Wait for the new note to finish before closing Notes.'});return false;}if(this.#metadata||this.#metadataBusy){this.#publish({error:this.#state.deleting||this.#delete?'Wait for permanent deletion to finish before closing Notes.':this.#state.deleteConfirm?'Keep the note or finish permanent deletion confirmation before closing Notes.':this.#state.trashing||this.#state.trashConfirm?'Finish or cancel the Trash operation before closing Notes.':this.#state.archiving?'Wait for the archive change to finish before closing Notes.':'Wait for the pin change to finish before closing Notes.'});return false;}if(this.#state.exporting){this.#publish({error:'Finish or cancel the Markdown export before closing Notes.'});return false;}if(!skip&&!await this.flush()){if(this.#active)this.#publish({closeFailed:true});return false;}if(!this.#active||this.#metadata||this.#metadataBusy||this.#state.exporting)return false;
  this.#publish({closing:true});if(!this.#active)return false;try{await bounded(this.#api.close());return true;}catch{if(this.#active)this.#publish({closing:false,closeFailed:true,error:'The Notes window could not close. Keep editing or retry closing.'});return false;}
 }
 keepEditing(){if(this.#active)this.#publish({closeFailed:false});}
 dispose(){if(!this.#active)return;this.#active=false;this.#opening=undefined;this.#review=undefined;this.#revisionConfirmation=undefined;this.#trashConfirmation=undefined;this.#deleteConfirmation=undefined;this.#emptyContext?.cancel.abort();this.#emptyRecovery?.cancel.abort();this.#emptyContext=undefined;this.#emptyRecovery=undefined;++this.#navigation;++this.#listGeneration;clearTimeout(this.#timer);clearTimeout(this.#searchTimer);const pending=this.#pending;this.#pending=undefined;pending?.cancel.abort();pending?.finish(false);this.#listeners.clear();}
}
