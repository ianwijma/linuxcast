import { emptyNoteDocument, noteContentKey, noteContentSchema, notesListReplySchema, notesListRequestSchema, notesReadReplySchema, notesWriteReplySchema } from '@linuxcast/contracts';
import type { NoteContent, NoteDocument, NoteRecord, NoteSummary, NotesApi, NotesList } from '@linuxcast/contracts';

type Pending={id:string;done:Promise<boolean>;finish:(ok:boolean)=>void;cancel:AbortController};
export interface NotesState {
 query:string; rows:NoteSummary[]; cursor:NotesList['nextCursor']; listing:boolean; listError?:string|undefined;
 id?:string|undefined; content?:NoteContent|undefined; record?:NoteRecord|undefined; busy:boolean; reading:boolean; closing:boolean;
 error?:string|undefined; message?:string|undefined; blocked:boolean; paused:boolean; reloadConfirm:boolean; closeFailed:boolean;
}
const copy=<T,>(value:T):T=>structuredClone(value);
const key=(value:NoteContent|null|undefined)=>value?(noteContentSchema.safeParse(value).success?noteContentKey(value):'invalid-local-content'):null;
const failed='The stored outcome is uncertain. Your local edits remain here. Confirm Reload stored note before another write; nothing will be replayed.';
async function bounded<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
 return await new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('deadline')),5000);const abort=()=>{clearTimeout(timer);reject(new Error('cancelled'));};signal?.addEventListener('abort',abort,{once:true});promise.then(value=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(value);},()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new Error('unavailable'));});if(signal?.aborted)abort();});
}
export class NotesController {
 #api:NotesApi; #state:NotesState={query:'',rows:[],cursor:null,listing:false,busy:false,reading:false,closing:false,blocked:false,paused:false,reloadConfirm:false,closeFailed:false};
 #listeners=new Set<()=>void>(); #active=true; #pending:Pending|undefined; #timer?:ReturnType<typeof setTimeout>; #searchTimer?:ReturnType<typeof setTimeout>; #listGeneration=0; #navigation=0; #save:Promise<boolean>|undefined; #close:Promise<boolean>|undefined; #new=false;
 constructor(api:NotesApi){this.#api=api;}
 get snapshot(){return this.#state;} subscribe=(listener:()=>void)=>{this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};};
 #publish(patch:Partial<NotesState>){this.#state={...this.#state,...patch};for(const listener of this.#listeners)listener();}
 get dirty(){return !!this.#state.content&&key(this.#state.content)!==key(this.#state.record?.draft);}
 get unsaved(){return !!this.#state.content&&key(this.#state.content)!==key(this.#state.record?.saved);}
 start(){void this.reloadList();}
 setQuery(query:string){if(!this.#active)return;this.#listGeneration++;clearTimeout(this.#searchTimer);this.#publish({query,cursor:null});this.#searchTimer=setTimeout(()=>void this.reloadList(),150);}
 async reloadList(more=false){
  if(!this.#active)return;const query=this.#state.query,cursor=more?this.#state.cursor:null;if(more&&!cursor)return;
  const input={query,...(cursor?{cursor}: {})};if(!notesListRequestSchema.safeParse(input).success){this.#publish({listing:false,listError:'Search is limited to 256 UTF-8 bytes.'});return;}
  const generation=++this.#listGeneration;this.#publish({listing:true,listError:undefined});if(!this.#active||generation!==this.#listGeneration)return;
  try{const parsed=notesListReplySchema.safeParse(await bounded(this.#api.list(input)));if(!this.#active||generation!==this.#listGeneration)return;
   if(!parsed.success||!parsed.data.ok||parsed.data.value.query!==query)throw new Error('invalid');const value=parsed.data.value;
   if(value.nextCursor){const last=value.records.at(-1);if(!last||last.id!==value.nextCursor.id||last.updatedAt!==value.nextCursor.updatedAt)throw new Error('cursor');}
   const rows=more?[...this.#state.rows,...value.records]:value.records;if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('duplicate');
   this.#publish({rows,cursor:value.nextCursor,listing:false,listError:undefined});
  }catch{if(this.#active&&generation===this.#listGeneration)this.#publish({listing:false,listError:'Notes could not be loaded. Retry the local search.'});}
 }
 async select(id:string){
  if(!this.#active||this.#state.reading||this.#state.closing||this.#new||id===this.#state.id)return;const generation=++this.#navigation;
  if(!await this.flush()||!this.#active||generation!==this.#navigation)return;
  this.#publish({reading:true,error:undefined});if(!this.#active||generation!==this.#navigation)return;
  try{const result=notesReadReplySchema.safeParse(await bounded(this.#api.get(id)));if(!this.#active||generation!==this.#navigation)return;
   if(!result.success||!result.data.ok||result.data.value?.id!==id)throw new Error('missing');const record=result.data.value;
   this.#publish({id,record,content:copy(record.draft),reading:false,blocked:false,paused:false,reloadConfirm:false,error:undefined,message:key(record.draft)!==key(record.saved)?'Recovered draft. Save explicitly to replace the last saved version.':undefined});
  }catch{if(this.#active&&generation===this.#navigation)this.#publish({reading:false,error:'This note is unavailable. Reload the list and choose the note again.'});}
 }
 async newNote(){
  if(!this.#active||this.#new||this.#state.reading||this.#state.closing)return;this.#new=true;const generation=++this.#navigation;
  try{if(!await this.flush()||!this.#active||generation!==this.#navigation)return;const id=crypto.randomUUID();this.#publish({id,record:undefined,content:{title:'Untitled note',document:emptyNoteDocument()},blocked:false,paused:false,error:undefined,message:undefined});if(this.#active&&generation===this.#navigation&&this.#state.id===id)await this.#write('draft');}finally{this.#new=false;}
 }
 editTitle(title:string){if(this.#state.content)this.#edit({...this.#state.content,title});}
 editDocument(document:NoteDocument){if(this.#state.content)this.#edit({...this.#state.content,document});}
 inputError(message:string){if(this.#active)this.#publish({error:message});}
 #edit(content:NoteContent){if(!this.#active||this.#state.reading||this.#state.closing||!this.#state.id)return;if(noteContentSchema.safeParse(content).success&&noteContentSchema.safeParse(this.#state.content).success&&key(content)===key(this.#state.content))return;clearTimeout(this.#timer);this.#publish({content:copy(content),error:this.#state.blocked?this.#state.error:undefined,message:undefined});if(!this.#active||this.#state.blocked||this.#state.paused)return;this.#timer=setTimeout(()=>void this.flush(),500);}
 async #write(action:'draft'|'save'):Promise<boolean>{
  if(!this.#active||this.#state.closing||this.#pending||this.#state.blocked||!this.#state.id||!this.#state.content)return false;
  const valid=noteContentSchema.safeParse(this.#state.content);if(!valid.success){this.#publish({error:'Use a nonblank title of at most 256 UTF-8 bytes and a supported note body of at most 64 KiB.',paused:true});return false;}
  const id=this.#state.id,content=copy(valid.data),record=this.#state.record,expectedRevision=record?.revision??0;
  let finish!:(ok:boolean)=>void;const done=new Promise<boolean>(resolve=>{finish=resolve;});const pending:Pending={id,done,finish,cancel:new AbortController()};this.#pending=pending;
  this.#publish({busy:true,error:undefined,message:action==='save'?'Saving note…':'Storing draft…'});
  if(!this.#current(pending)){if(this.#pending===pending)this.#pending=undefined;finish(false);if(this.#active)this.#publish({busy:false});return false;}
  try{const reply=notesWriteReplySchema.safeParse(await bounded(this.#api.write({id,expectedRevision,action,content}),pending.cancel.signal));if(!this.#current(pending))return false;
   if(!reply.success)throw new Error('receipt');if(!reply.data.ok){const code=reply.data.error.code;if(['invalid-request','capability-unavailable','permission-denied'].includes(code)){this.#publish({paused:true,error:'The note was not accepted. Check the title and body or restore the Notes capability, then retry explicitly.',message:undefined});return false;}throw new Error('unknown');}
   const value=reply.data.value;if(value.id!==id||value.revision!==expectedRevision+1||key(value.draft)!==key(content)||key(value.saved)!==(action==='save'?key(content):key(record?.saved))||record&&value.createdAt!==record.createdAt)throw new Error('receipt');
   this.#publish({record:value,paused:false,error:undefined,message:action==='save'?'Saved version updated.':undefined});void this.reloadList();return true;
  }catch{if(this.#current(pending))this.#publish({blocked:true,paused:true,error:failed,message:undefined});return false;}
  finally{const current=this.#pending===pending;if(current)this.#pending=undefined;const ok=this.#active&&!this.#state.blocked&&!this.#state.paused&&this.#state.id===id&&key(this.#state.record?.draft)===key(content);finish(ok);if(current&&this.#active)this.#publish({busy:false});}
 }
 #current(pending:Pending){return this.#active&&!this.#state.closing&&this.#pending===pending&&this.#state.id===pending.id&&!pending.cancel.signal.aborted;}
 async flush():Promise<boolean>{
  clearTimeout(this.#timer);if(!this.#active)return false;if(this.#pending&&!await this.#pending.done)return false;
  if(this.#state.blocked)return false;if(!this.dirty)return true;
  if(!await this.#write('draft'))return false;return this.dirty?await this.flush():true;
 }
 save():Promise<boolean>{if(this.#save)return this.#save;this.#save=this.#saveNow().finally(()=>{this.#save=undefined;});return this.#save;}
 async #saveNow(){clearTimeout(this.#timer);if(this.#pending&&!await this.#pending.done)return false;if(!this.#active||this.#state.blocked||!this.#state.content)return false;if(!this.unsaved)return true;return await this.#write('save');}
 retry(){if(this.#active&&!this.#state.blocked){this.#publish({paused:false});return this.flush();}return Promise.resolve(false);}
 confirmReload(){if(this.#active&&this.#state.id&&!this.#pending)this.#publish({reloadConfirm:true});}
 cancelReload(){if(this.#active)this.#publish({reloadConfirm:false});}
 async reconcile(){
  if(!this.#active||!this.#state.reloadConfirm||!this.#state.id||this.#pending)return;const id=this.#state.id,generation=++this.#navigation;clearTimeout(this.#timer);this.#publish({reading:true,reloadConfirm:false});if(!this.#active||generation!==this.#navigation)return;
  try{const result=notesReadReplySchema.safeParse(await bounded(this.#api.get(id)));if(!this.#active||generation!==this.#navigation||this.#state.id!==id)return;
   if(!result.success||!result.data.ok||result.data.value&&result.data.value.id!==id||!result.data.value&&this.#state.record)throw new Error('read');
   this.#publish({record:result.data.value??undefined,reading:false,blocked:false,paused:true,error:undefined,message:'Stored state loaded. Your local edits are retained. Review them, then choose Retry draft or Save; no write was replayed.'});
  }catch{if(this.#active&&generation===this.#navigation)this.#publish({reading:false,error:'Stored state could not be confirmed. Local edits remain; try Reload stored note again.'});}
 }
 requestClose():Promise<boolean>{if(this.#close)return this.#close;this.#close=this.#closeNow(false).finally(()=>{this.#close=undefined;});return this.#close;}
 closeWithoutFlush(){if(this.#close)return this.#close;this.#close=this.#closeNow(true).finally(()=>{this.#close=undefined;});return this.#close;}
 async #closeNow(skip:boolean){if(!this.#active)return false;if(!skip&&!await this.flush()){if(this.#active)this.#publish({closeFailed:true});return false;}if(!this.#active)return false;
  this.#publish({closing:true});if(!this.#active)return false;try{await bounded(this.#api.close());return true;}catch{if(this.#active)this.#publish({closing:false,closeFailed:true,error:'The Notes window could not close. Keep editing or retry closing.'});return false;}
 }
 keepEditing(){if(this.#active)this.#publish({closeFailed:false});}
 dispose(){if(!this.#active)return;this.#active=false;++this.#navigation;++this.#listGeneration;clearTimeout(this.#timer);clearTimeout(this.#searchTimer);const pending=this.#pending;this.#pending=undefined;pending?.cancel.abort();pending?.finish(false);this.#listeners.clear();}
}
