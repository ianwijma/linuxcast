import type Database from 'better-sqlite3';
import {noteRecordSchema,noteWriteSchema,notesListRequestSchema,noteContentKey,notePlainText} from '../../contracts/src/notes.ts';
import type {NoteRecord,NotesList,NoteContent,NotesStorageMethods} from '../../contracts/src/notes.ts';
import {StorageError} from './errors.ts';
type Row={id:string;revision:number;document_version:number;draft:string;saved:string|null;created_at:string;updated_at:string};
function record(row:Row):NoteRecord{
 try{return noteRecordSchema.parse({id:row.id,revision:row.revision,documentVersion:row.document_version,draft:JSON.parse(row.draft),saved:row.saved===null?null:JSON.parse(row.saved),createdAt:row.created_at,updatedAt:row.updated_at});}catch{throw new StorageError('corrupt-database');}
}
export function getNote(db:Database.Database,id:string):NoteRecord|null{
 const row=db.prepare('SELECT id,revision,document_version,draft,saved,created_at,updated_at FROM notes WHERE id=?').get(id) as Row|undefined;return row?record(row):null;
}
const normalize=(value:string)=>value.normalize('NFKC').toLowerCase();
export function listNotes(db:Database.Database,value:unknown):NotesList{
 const input=notesListRequestSchema.parse(value),query=normalize(input.query.trim()),pattern='%'+query.replace(/[\\%_]/gu,'\\$&')+'%';
 const cursor=input.cursor;
 const rows=db.prepare(`SELECT id,revision,document_version,draft,saved,created_at,updated_at,excerpt FROM notes
 WHERE (?='' OR title_key LIKE ? ESCAPE '\\' OR text_key LIKE ? ESCAPE '\\')
 AND (? IS NULL OR updated_at<? OR (updated_at=? AND id<?)) ORDER BY updated_at DESC,id DESC LIMIT 101`)
 .all(query,pattern,pattern,cursor?.updatedAt??null,cursor?.updatedAt??null,cursor?.updatedAt??null,cursor?.id??null) as (Row&{excerpt:string})[];
 const page=rows.slice(0,100),last=page.at(-1);
 return {query:input.query,records:page.map(row=>{const value=record(row);return {id:value.id,revision:value.revision,title:value.draft.title,excerpt:row.excerpt,hasDraft:value.saved===null||noteContentKey(value.draft)!==noteContentKey(value.saved),updatedAt:value.updatedAt};}),nextCursor:rows.length>100&&last?{updatedAt:last.updated_at,id:last.id}:null};
}
/** Caller runs this in the sole owner's schema/result-validated transaction. */
export function writeNote(db:Database.Database,value:unknown):NoteRecord{
 const input=noteWriteSchema.parse(value),current=getNote(db,input.id);
 if((current?.revision??0)!==input.expectedRevision)throw new StorageError('conflict');
 const now=new Date().toISOString(),content:NoteContent=input.content,saved=input.action==='save'?content:current?.saved??null;
 const next=noteRecordSchema.parse({id:input.id,documentVersion:1,revision:input.expectedRevision+1,draft:content,saved,createdAt:current?.createdAt??now,updatedAt:now});
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
export function dispatchNotes(db:Database.Database,method:keyof NotesStorageMethods,value:unknown):unknown{
 if(method==='notes.list')return listNotes(db,value);
 if(method==='notes.get')return getNote(db,(value as {id:string}).id);
 return writeNote(db,value);
}
