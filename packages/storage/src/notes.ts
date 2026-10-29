import type Database from 'better-sqlite3';
import {noteRecordSchema,noteWriteSchema,notePinSchema,noteArchiveSchema,noteTrashSchema,noteDeleteSchema,noteDeletedSchema,noteHistoryRequestSchema,noteRevisionSelectionSchema,noteHistorySchema,noteRevisionReadSchema,noteSavedRevisionSchema,notesListRequestSchema,noteContentKey,notePlainText} from '../../contracts/src/notes.ts';
import type {NoteRecord,NotesList,NoteContent,NotesStorageMethods,NoteHistoryRequest,NoteHistory,NoteRevisionRead} from '../../contracts/src/notes.ts';
import {StorageError} from './errors.ts';
type Row={trashed:number;archived:number;pinned:number;id:string;revision:number;document_version:number;draft:string;saved:string|null;created_at:string;updated_at:string};
function record(row:Row):NoteRecord{
 try{if((row.pinned!==0&&row.pinned!==1)||(row.archived!==0&&row.archived!==1)||(row.trashed!==0&&row.trashed!==1))throw new Error('Invalid note metadata.');return noteRecordSchema.parse({id:row.id,revision:row.revision,documentVersion:row.document_version,pinned:row.pinned===1,archived:row.archived===1,trashed:row.trashed===1,draft:JSON.parse(row.draft),saved:row.saved===null?null:JSON.parse(row.saved),createdAt:row.created_at,updatedAt:row.updated_at});}catch{throw new StorageError('corrupt-database');}
}
export function getNote(db:Database.Database,id:string):NoteRecord|null{
 const row=db.prepare('SELECT id,revision,document_version,draft,saved,pinned,archived,trashed,created_at,updated_at FROM notes WHERE id=?').get(id) as Row|undefined;return row?record(row):null;
}
const normalize=(value:string)=>value.normalize('NFKC').toLowerCase();
export function listNotes(db:Database.Database,value:unknown):NotesList{
 const input=notesListRequestSchema.parse(value),query=normalize(input.query.trim()),pattern='%'+query.replace(/[\\%_]/gu,'\\$&')+'%';
 const cursor=input.cursor;
 const rows=db.prepare(`SELECT id,revision,document_version,draft,saved,pinned,archived,trashed,created_at,updated_at,excerpt FROM notes
 WHERE trashed=? AND (?=1 OR archived=?) AND (?=0 OR pinned=1) AND (?='' OR title_key LIKE ? ESCAPE '\\' OR text_key LIKE ? ESCAPE '\\')
 AND (? IS NULL OR updated_at<? OR (updated_at=? AND id<?)) ORDER BY updated_at DESC,id DESC LIMIT 101`)
 .all(input.trashed?1:0,input.trashed?1:0,input.archived?1:0,input.pinnedOnly?1:0,query,pattern,pattern,cursor?.updatedAt??null,cursor?.updatedAt??null,cursor?.updatedAt??null,cursor?.id??null) as (Row&{excerpt:string})[];
 const page=rows.slice(0,100),last=page.at(-1);
 return {query:input.query,pinnedOnly:input.pinnedOnly??false,archived:input.archived??false,trashed:input.trashed??false,records:page.map(row=>{const value=record(row);return {id:value.id,revision:value.revision,title:value.draft.title,pinned:value.pinned,archived:value.archived,trashed:value.trashed,excerpt:row.excerpt,hasDraft:value.saved===null||noteContentKey(value.draft)!==noteContentKey(value.saved),updatedAt:value.updatedAt};}),nextCursor:rows.length>100&&last?{updatedAt:last.updated_at,id:last.id}:null};
}
/** Caller runs this in the sole owner's schema/result-validated transaction. */
export function writeNote(db:Database.Database,value:unknown):NoteRecord{
 const input=noteWriteSchema.parse(value),current=getNote(db,input.id);
 if((current?.revision??0)!==input.expectedRevision)throw new StorageError('conflict');
 if(current?.archived||current?.trashed)throw new StorageError('invalid-request');
 const now=new Date().toISOString(),content:NoteContent=input.content,saved=input.action==='save'?content:current?.saved??null;
 const next=noteRecordSchema.parse({id:input.id,documentVersion:1,revision:input.expectedRevision+1,pinned:current?.pinned??false,archived:false,trashed:false,draft:content,saved,createdAt:current?.createdAt??now,updatedAt:now});
 const text=notePlainText(content.document),excerpt=Array.from(text).slice(0,160).join('');
 db.prepare(`INSERT INTO notes(id,revision,document_version,draft,saved,title,title_key,text_key,excerpt,created_at,updated_at) VALUES(?,?,1,?,?,?,?,?,?,?,?)
 ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,draft=excluded.draft,saved=excluded.saved,title=excluded.title,title_key=excluded.title_key,text_key=excluded.text_key,excerpt=excluded.excerpt,updated_at=excluded.updated_at`)
 .run(next.id,next.revision,noteContentKey(content),saved===null?null:noteContentKey(saved),content.title,normalize(content.title),normalize(text),excerpt,next.createdAt,now);
 if(input.action==='save'){
  const minute=Math.floor(Date.now()/60000);
  db.prepare('INSERT INTO note_saved_revisions(note_id,minute,revision,content,created_at) VALUES(?,?,?,?,?) ON CONFLICT(note_id,minute) DO UPDATE SET revision=excluded.revision,content=excluded.content,created_at=excluded.created_at').run(next.id,minute,next.revision,noteContentKey(content),now);
  db.prepare('DELETE FROM note_saved_revisions WHERE note_id=? AND minute NOT IN (SELECT minute FROM note_saved_revisions WHERE note_id=? ORDER BY revision DESC,minute DESC LIMIT 50)').run(next.id,next.id);
 }
 return next;
}
/** Metadata-only CAS. Content timestamps and saved history remain unchanged. */
export function setNotePinned(db:Database.Database,value:unknown):NoteRecord{
 const input=notePinSchema.parse(value),current=getNote(db,input.id);
 if(!current||current.revision!==input.expectedRevision)throw new StorageError('conflict');
 if(current.trashed)throw new StorageError('invalid-request');
 const next=noteRecordSchema.parse({...current,revision:current.revision+1,pinned:input.pinned});
 const result=db.prepare('UPDATE notes SET pinned=?,revision=? WHERE id=? AND revision=?').run(input.pinned?1:0,next.revision,input.id,input.expectedRevision);
 if(result.changes!==1)throw new StorageError('conflict');return next;
}
/** Archive/restore never changes content, pin state or content timestamps. */
export function setNoteArchived(db:Database.Database,value:unknown):NoteRecord{
 const input=noteArchiveSchema.parse(value),current=getNote(db,input.id);
 if(!current||current.revision!==input.expectedRevision)throw new StorageError('conflict');
 if(current.trashed)throw new StorageError('invalid-request');
 const next=noteRecordSchema.parse({...current,revision:current.revision+1,archived:input.archived});
 const result=db.prepare('UPDATE notes SET archived=?,revision=? WHERE id=? AND revision=?').run(input.archived?1:0,next.revision,input.id,input.expectedRevision);
 if(result.changes!==1)throw new StorageError('conflict');return next;
}
/** Recoverable metadata only. No source/history deletion or retention job. */
export function setNoteTrashed(db:Database.Database,value:unknown):NoteRecord{
 const input=noteTrashSchema.parse(value),current=getNote(db,input.id);
 if(!current||current.revision!==input.expectedRevision)throw new StorageError('conflict');
 const next=noteRecordSchema.parse({...current,revision:current.revision+1,trashed:input.trashed});
 const result=db.prepare('UPDATE notes SET trashed=?,revision=? WHERE id=? AND revision=?').run(input.trashed?1:0,next.revision,input.id,input.expectedRevision);
 if(result.changes!==1)throw new StorageError('conflict');return next;
}
/** Explicit single-note logical deletion; existing FK cascade removes its history.
 * The owner runs preflight/delete/result validation in one transaction. */
export function deleteNotePermanently(db:Database.Database,value:unknown){
 const input=noteDeleteSchema.parse(value),current=getNote(db,input.id);
 if(!current||current.revision!==input.expectedRevision)throw new StorageError('conflict');
 if(!current.trashed)throw new StorageError('invalid-request');
 const result=db.prepare('DELETE FROM notes WHERE id=? AND revision=? AND trashed=1').run(input.id,input.expectedRevision);
 if(result.changes!==1)throw new StorageError('conflict');
 return noteDeletedSchema.parse({id:input.id,deletedRevision:input.expectedRevision});
}
function historyCurrent(db:Database.Database,input:NoteHistoryRequest):NoteRecord{
 const current=getNote(db,input.id);if(!current||current.revision!==input.expectedRevision)throw new StorageError('conflict');return current;
}
/** Summaries only: do not put fifty complete bodies into a single RPC reply. */
export function noteHistory(db:Database.Database,value:unknown):NoteHistory{
 const input=noteHistoryRequestSchema.parse(value),current=historyCurrent(db,input);
 const revisions=db.prepare("SELECT revision,created_at AS createdAt,json_extract(content,'$.title') AS title FROM note_saved_revisions WHERE note_id=? ORDER BY revision DESC,minute DESC LIMIT 51").all(input.id);
 try{return noteHistorySchema.parse({id:input.id,currentRevision:current.revision,revisions});}catch{throw new StorageError('corrupt-database');}
}
export function readNoteRevision(db:Database.Database,value:unknown):NoteRevisionRead{
 const input=noteRevisionSelectionSchema.parse(value),current=historyCurrent(db,input);
 const rows=db.prepare('SELECT revision,created_at,content FROM note_saved_revisions WHERE note_id=? AND revision=? LIMIT 2').all(input.id,input.revision) as {revision:number;created_at:string;content:string}[];
 if(!rows.length)throw new StorageError('conflict');if(rows.length!==1)throw new StorageError('corrupt-database');const row=rows[0]!;
 try{const savedRevision=noteSavedRevisionSchema.parse({revision:row.revision,createdAt:row.created_at,content:JSON.parse(row.content)});return noteRevisionReadSchema.parse({id:input.id,currentRevision:current.revision,savedRevision});}catch{throw new StorageError('corrupt-database');}
}
/** Restore is an owner-derived draft write; Save and saved history stay separate. */
export function restoreNoteRevision(db:Database.Database,value:unknown):NoteRecord{
 const input=noteRevisionSelectionSchema.parse(value),current=historyCurrent(db,input);if(current.archived||current.trashed)throw new StorageError('invalid-request');
 const source=readNoteRevision(db,input);return writeNote(db,{id:input.id,expectedRevision:input.expectedRevision,action:'draft',content:source.savedRevision.content});
}
export function dispatchNotes(db:Database.Database,method:keyof NotesStorageMethods,value:unknown):unknown{
 if(method==='notes.deletePermanently')return deleteNotePermanently(db,value);
 if(method==='notes.history')return noteHistory(db,value);
 if(method==='notes.getRevision')return readNoteRevision(db,value);
 if(method==='notes.restoreRevision')return restoreNoteRevision(db,value);
 if(method==='notes.list')return listNotes(db,value);
 if(method==='notes.setTrashed')return setNoteTrashed(db,value);
 if(method==='notes.setArchived')return setNoteArchived(db,value);
 if(method==='notes.setPinned')return setNotePinned(db,value);
 if(method==='notes.get')return getNote(db,(value as {id:string}).id);
 return writeNote(db,value);
}
