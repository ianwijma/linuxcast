import {noteExportReplySchema,notePinSchema,noteArchiveSchema,noteTrashSchema} from '@linuxcast/contracts';
import { emptyNoteDocument, noteContentKey, noteContentSchema, notesListReplySchema, notesListRequestSchema, notesReadReplySchema, notesWriteReplySchema } from '@linuxcast/contracts';
import type { NoteContent, NoteDocument, NoteRecord, NoteSummary, NotesApi, NotesList } from '@linuxcast/contracts';

type Pending={id:string;done:Promise<boolean>;finish:(ok:boolean)=>void;cancel:AbortController};
export interface NotesState {
 query:string; pinnedOnly:boolean; showArchived:boolean; showTrashed:boolean; rows:NoteSummary[]; cursor:NotesList['nextCursor']; listing:boolean; listError?:string|undefined;
 id?:string|undefined; content?:NoteContent|undefined; record?:NoteRecord|undefined; busy:boolean; reading:boolean; closing:boolean; exporting:boolean; pinning:boolean; archiving:boolean; trashing:boolean; trashConfirm:boolean;
 error?:string|undefined; message?:string|undefined; blocked:boolean; paused:boolean; reloadConfirm:boolean; closeFailed:boolean;
}
const copy=<T,>(value:T):T=>structuredClone(value);
const key=(value:NoteContent|null|undefined)=>value?(noteContentSchema.safeParse(value).success?noteContentKey(value):'invalid-local-content'):null;
const failed='The stored outcome is uncertain. Your local edits remain here. Confirm Reload stored note before another write; nothing will be replayed.';
async function bounded<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
 return await new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('deadline')),5000);const abort=()=>{clearTimeout(timer);reject(new Error('cancelled'));};signal?.addEventListener('abort',abort,{once:true});promise.then(value=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(value);},()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new Error('unavailable'));});if(signal?.aborted)abort();});
}
export class NotesController {
 #api:NotesApi; #state:NotesState={query:'',pinnedOnly:false,showArchived:false,showTrashed:false,rows:[],cursor:null,listing:false,busy:false,reading:false,closing:false,exporting:false,pinning:false,archiving:false,trashing:false,trashConfirm:false,blocked:false,paused:false,reloadConfirm:false,closeFailed:false};
 #listeners=new Set<()=>void>(); #active=true; #pending:Pending|undefined; #timer?:ReturnType<typeof setTimeout>; #searchTimer?:ReturnType<typeof setTimeout>; #listGeneration=0; #navigation=0; #save:Promise<boolean>|undefined; #close:Promise<boolean>|undefined; #new=false; #export:Promise<boolean>|undefined; #metadata:Promise<boolean>|undefined; #trashConfirmation:{id:string;revision:number;generation:number}|undefined;
 constructor(api:NotesApi){this.#api=api;}
 get snapshot(){return this.#state;} subscribe=(listener:()=>void)=>{this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};};
 #publish(patch:Partial<NotesState>){this.#state={...this.#state,...patch};for(const listener of this.#listeners)listener();}
 get #metadataBusy(){return this.#state.pinning||this.#state.archiving||this.#state.trashing||this.#state.trashConfirm;}
 get dirty(){return !!this.#state.content&&key(this.#state.content)!==key(this.#state.record?.draft);}
 get unsaved(){return !!this.#state.content&&key(this.#state.content)!==key(this.#state.record?.saved);}
 start(){void this.reloadList();}
 setQuery(query:string){if(!this.#active||this.#metadata||this.#metadataBusy)return;this.#listGeneration++;clearTimeout(this.#searchTimer);this.#publish({query,cursor:null});this.#searchTimer=setTimeout(()=>void this.reloadList(),150);}
 setPinnedOnly(pinnedOnly:boolean){if(!this.#active||this.#metadata||this.#metadataBusy||typeof pinnedOnly!=='boolean'||pinnedOnly===this.#state.pinnedOnly)return;clearTimeout(this.#searchTimer);++this.#listGeneration;this.#publish({pinnedOnly,rows:[],cursor:null,listError:undefined});void this.reloadList();}
 setShowArchived(showArchived:boolean){if(!this.#active||this.#metadata||this.#metadataBusy||typeof showArchived!=='boolean'||showArchived===this.#state.showArchived)return;clearTimeout(this.#searchTimer);++this.#listGeneration;this.#publish({showArchived,...(showArchived?{showTrashed:false}:{}),rows:[],cursor:null,listError:undefined});void this.reloadList();}
 setShowTrashed(showTrashed:boolean){if(!this.#active||this.#metadata||this.#metadataBusy||typeof showTrashed!=='boolean'||showTrashed===this.#state.showTrashed)return;clearTimeout(this.#searchTimer);++this.#listGeneration;this.#publish({showTrashed,...(showTrashed?{showArchived:false}:{}),rows:[],cursor:null,listError:undefined});void this.reloadList();}
 async reloadList(more=false){
  if(!this.#active)return;const query=this.#state.query,pinnedOnly=this.#state.pinnedOnly,archived=this.#state.showArchived,trashed=this.#state.showTrashed,cursor=more?this.#state.cursor:null;if(more&&!cursor)return;
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
  if(!this.#active||this.#metadata||this.#state.reading||this.#state.closing||this.#state.exporting||this.#metadataBusy||this.#new||id===this.#state.id)return;const generation=++this.#navigation;
  if(!await this.flush()||!this.#active||generation!==this.#navigation||this.#metadata||this.#metadataBusy||this.#state.exporting||this.#state.closing)return;
  this.#publish({reading:true,error:undefined});if(!this.#active||generation!==this.#navigation||this.#metadata||this.#metadataBusy||this.#state.exporting||this.#state.closing)return;
  try{const result=notesReadReplySchema.safeParse(await bounded(this.#api.get(id)));if(!this.#active||generation!==this.#navigation)return;
   if(!result.success||!result.data.ok||result.data.value?.id!==id)throw new Error('missing');const record=result.data.value;
   this.#publish({id,record,content:copy(record.draft),reading:false,blocked:false,paused:false,reloadConfirm:false,error:undefined,message:key(record.draft)!==key(record.saved)?'Recovered draft. Save explicitly to replace the last saved version.':undefined});
  }catch{if(this.#active&&generation===this.#navigation)this.#publish({reading:false,error:'This note is unavailable. Reload the list and choose the note again.'});}
 }
 async newNote():Promise<boolean>{
  if(!this.#active)return false;
  if(this.#metadata||this.#new||this.#close||this.#export||this.#state.reading||this.#state.closing||this.#state.exporting||this.#metadataBusy){if(!this.#state.error)this.#publish({error:'A new note was not created. Finish the current Notes operation, then request a new note again.'});return false;}
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
 #edit(content:NoteContent){if(!this.#active||(this.#state.record?.archived||this.#state.record?.trashed)||this.#metadata||this.#state.reading||this.#state.closing||this.#state.exporting||this.#metadataBusy||!this.#state.id)return;if(noteContentSchema.safeParse(content).success&&noteContentSchema.safeParse(this.#state.content).success&&key(content)===key(this.#state.content))return;clearTimeout(this.#timer);this.#publish({content:copy(content),error:this.#state.blocked?this.#state.error:undefined,message:undefined});if(!this.#active||this.#state.blocked||this.#state.paused)return;this.#timer=setTimeout(()=>void this.flush(),500);}
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
 async flush():Promise<boolean>{
  clearTimeout(this.#timer);if(!this.#active||this.#state.trashConfirm)return false;if(this.#pending&&!await this.#pending.done)return false;
  if(this.#state.blocked)return false;if(!this.dirty)return true;if(this.#state.record?.trashed){this.#publish({error:'Restore from Trash to review and store retained local edits before navigating or closing.'});return false;}if(this.#state.record?.archived){this.#publish({error:'Restore this note to review and store retained local edits before navigating or closing.'});return false;}
  if(!await this.#write('draft'))return false;return this.dirty?await this.flush():true;
 }
 save():Promise<boolean>{if(this.#save)return this.#save;this.#save=this.#saveNow().finally(()=>{this.#save=undefined;});return this.#save;}
 async #saveNow(){if(this.#new||(this.#state.record?.archived||this.#state.record?.trashed)||this.#metadata||this.#metadataBusy)return false;clearTimeout(this.#timer);if(this.#pending&&!await this.#pending.done)return false;if(!this.#active||this.#metadata||this.#state.blocked||this.#state.exporting||this.#metadataBusy||!this.#state.content)return false;if(!this.unsaved)return true;return await this.#write('save');}
 retry(){if(this.#active&&!this.#state.record?.archived&&!this.#state.record?.trashed&&!this.#metadata&&!this.#metadataBusy&&!this.#state.blocked){this.#publish({paused:false});return this.flush();}return Promise.resolve(false);}
 confirmReload(){if(this.#active&&!this.#metadata&&!this.#metadataBusy&&this.#state.id&&!this.#pending)this.#publish({reloadConfirm:true});}
 cancelReload(){if(this.#active)this.#publish({reloadConfirm:false});}
 async reconcile(){
  if(!this.#active||this.#metadata||!this.#state.reloadConfirm||!this.#state.id||this.#metadataBusy||this.#pending)return;const id=this.#state.id,generation=++this.#navigation;clearTimeout(this.#timer);this.#publish({reading:true,reloadConfirm:false});if(!this.#active||generation!==this.#navigation)return;
  try{const result=notesReadReplySchema.safeParse(await bounded(this.#api.get(id)));if(!this.#active||generation!==this.#navigation||this.#state.id!==id)return;
   if(!result.success||!result.data.ok||result.data.value&&result.data.value.id!==id||!result.data.value&&this.#state.record)throw new Error('read');
   this.#publish({record:result.data.value??undefined,reading:false,blocked:false,paused:true,error:undefined,message:'Stored state loaded. Your local edits are retained. Review them, then choose Retry draft or Save; no write was replayed.'});void this.reloadList();
  }catch{if(this.#active&&generation===this.#navigation)this.#publish({reading:false,error:'Stored state could not be confirmed. Local edits remain; try Reload stored note again.'});}
 }
 requestTrash(){
  if(!this.#active||this.#trashConfirmation||this.#metadata||this.#metadataBusy||this.#pending||this.#save||this.#new||this.#close||this.#export||this.#state.reading||this.#state.closing||this.#state.exporting||this.#state.blocked||this.#state.reloadConfirm||this.#state.closeFailed||!this.#state.record||this.#state.record.trashed)return;
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
  if(this.#trashConfirmation||kind!=='trash'&&this.#state.record?.trashed)return Promise.resolve(false);
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
 exportMarkdown():Promise<boolean>{if(this.#new)return Promise.resolve(false);if(this.#export)return this.#export;if(this.#metadata)return Promise.resolve(false);const operation=Promise.resolve().then(()=>this.#exportNow()).finally(()=>{if(this.#export===operation)this.#export=undefined;});this.#export=operation;return operation;}
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
 #beginClose(skip:boolean):Promise<boolean>{if(this.#new){if(this.#active)this.#publish({error:'Wait for the new note to finish before closing Notes.'});return Promise.resolve(false);}if(this.#close)return this.#close;let finish!:(ok:boolean)=>void;const operation=new Promise<boolean>(resolve=>{finish=resolve;});this.#close=operation;void this.#closeNow(skip).then(result=>{if(this.#close===operation)this.#close=undefined;finish(result);},()=>{if(this.#close===operation)this.#close=undefined;finish(false);});return operation;}
 async #closeNow(skip:boolean){if(!this.#active)return false;if(this.#new){this.#publish({error:'Wait for the new note to finish before closing Notes.'});return false;}if(this.#metadata||this.#metadataBusy){this.#publish({error:this.#state.trashing||this.#state.trashConfirm?'Finish or cancel the Trash operation before closing Notes.':this.#state.archiving?'Wait for the archive change to finish before closing Notes.':'Wait for the pin change to finish before closing Notes.'});return false;}if(this.#state.exporting){this.#publish({error:'Finish or cancel the Markdown export before closing Notes.'});return false;}if(!skip&&!await this.flush()){if(this.#active)this.#publish({closeFailed:true});return false;}if(!this.#active||this.#metadata||this.#metadataBusy||this.#state.exporting)return false;
  this.#publish({closing:true});if(!this.#active)return false;try{await bounded(this.#api.close());return true;}catch{if(this.#active)this.#publish({closing:false,closeFailed:true,error:'The Notes window could not close. Keep editing or retry closing.'});return false;}
 }
 keepEditing(){if(this.#active)this.#publish({closeFailed:false});}
 dispose(){if(!this.#active)return;this.#active=false;this.#trashConfirmation=undefined;++this.#navigation;++this.#listGeneration;clearTimeout(this.#timer);clearTimeout(this.#searchTimer);const pending=this.#pending;this.#pending=undefined;pending?.cancel.abort();pending?.finish(false);this.#listeners.clear();}
}
