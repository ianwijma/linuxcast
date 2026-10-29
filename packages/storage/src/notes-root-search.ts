import type Database from 'better-sqlite3';
import {notesRootSearchInputSchema,notesRootSearchSchema,type NotesRootSearch} from '../../contracts/src/notes-launcher.ts';
import {noteContentKey,notePlainText} from '../../contracts/src/notes.ts';
import {getNote} from './notes.ts';
import {StorageError} from './errors.ts';

const normalize=(value:string)=>value.normalize('NFKC').toLowerCase();

/** Runs synchronously inside the sole owner's result-validated transaction. */
export function searchRootNotes(db:Database.Database,value:unknown):NotesRootSearch{
 const input=notesRootSearchInputSchema.parse(value),query=normalize(input.query.trim());
 const pattern='%'+query.replace(/[\\%_]/gu,'\\$&')+'%';
 const candidates=db.prepare(`SELECT id FROM notes
  WHERE archived=0 AND trashed=0 AND (?='' OR title_key LIKE ? ESCAPE '\\' OR text_key LIKE ? ESCAPE '\\')
  ORDER BY pinned DESC,updated_at DESC,id DESC LIMIT 21`).all(query,pattern,pattern) as {id:string}[];
 // Validate the lookahead too: a corrupt source must not become a false hasMore.
 const records=candidates.map(candidate=>{
  const note=getNote(db,candidate.id);
  if(!note||note.archived||note.trashed)throw new StorageError('corrupt-database');
  const text=notePlainText(note.draft.document);
  if(query&&!normalize(note.draft.title).includes(query)&&!normalize(text).includes(query))throw new StorageError('corrupt-database');
  return {id:note.id,revision:note.revision,title:note.draft.title,
   excerpt:Array.from(text).slice(0,160).join(''),pinned:note.pinned,
   hasDraft:note.saved===null||noteContentKey(note.draft)!==noteContentKey(note.saved),updatedAt:note.updatedAt};
 });
 try{return notesRootSearchSchema.parse({query:input.query,records:records.slice(0,20),hasMore:records.length>20});}
 catch{throw new StorageError('corrupt-database');}
}
