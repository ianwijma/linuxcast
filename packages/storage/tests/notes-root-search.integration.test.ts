import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {StorageOwner} from '../src/owner.ts';
import type {StorageMethod,StorageMethods} from '../src/repositories.ts';
import {noteContentKey,type NoteRecord} from '../../contracts/src/notes.ts';

const directories:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{vi.useRealTimers();for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function open(directory?:string){const dir=directory??await mkdtemp(join(tmpdir(),'linuxcast-notes-root-owner-'));if(!directory)directories.push(dir);const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:'public-notes-root-test'});owners.push(owner);return {owner,dir};}
function ask<M extends StorageMethod>(owner:StorageOwner,method:M,params:StorageMethods[M]['params']){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result as StorageMethods[M]['result'];}
const doc=(text:string)=>({type:'doc' as const,content:[{type:'paragraph',content:[{type:'text',text}]}]});
function create(owner:StorageOwner,title:string,text:string,action:'save'|'draft'='draft'){return ask(owner,'notes.write',{id:randomUUID(),expectedRevision:0,action,content:{title,document:doc(text)}});}
function pin(owner:StorageOwner,note:NoteRecord){return ask(owner,'notes.setPinned',{id:note.id,expectedRevision:note.revision,pinned:true});}

it('filters active sources and orders pinned/modified/id before the twenty-result root limit',async()=>{
 const {owner}=await open(),active:NoteRecord[]=[];
 vi.useFakeTimers({toFake:['Date']});
 for(let n=0;n<25;n++){vi.setSystemTime(new Date(Date.UTC(2026,9,29,0,n)));active.push(create(owner,'Public row '+n,'Public searchable body '+(n===0?'unique oldest needle':'')));}
 active[0]=pin(owner,active[0]!);
 // Newer pinned readonly sources must not consume the bounded active page.
 vi.setSystemTime(new Date('2026-10-30T00:00:00.000Z'));
 for(let n=0;n<4;n++){let note=pin(owner,create(owner,'Public excluded '+n,'Public searchable body'));note=n%2===0?ask(owner,'notes.setArchived',{id:note.id,expectedRevision:note.revision,archived:true}):ask(owner,'notes.setTrashed',{id:note.id,expectedRevision:note.revision,trashed:true});expect(note.archived||note.trashed).toBe(true);}
 vi.useRealTimers();
 const page=ask(owner,'notes.searchRoot',{query:'searchable'});
 expect(page).toMatchObject({query:'searchable',hasMore:true});expect(page.records).toHaveLength(20);
 expect(page.records.map(row=>row.id)).toEqual([active[0]!.id,...active.slice(6).reverse().map(row=>row.id)]);
 expect(ask(owner,'notes.searchRoot',{query:'unique oldest needle'}).records.map(row=>row.id)).toEqual([active[0]!.id]);
 expect(ask(owner,'notes.searchRoot',{query:'excluded'})).toEqual({query:'excluded',records:[],hasMore:false});
});
it('finds full body text beyond the excerpt and treats Unicode, wildcard and backslash queries literally',async()=>{
 const {owner}=await open(),text='Public prefix '.repeat(30)+'100% _literal \\path ＣＡＦÉ 雪 two  spaces';
 const target=create(owner,'Public full-body target',text);create(owner,'Public distractor','100x aliteral /path cafe two spaces');
 for(const query of ['100%','_literal','\\path','café','ＣＡＦÉ','雪','two  spaces','  CAFÉ  ']){
  const page=ask(owner,'notes.searchRoot',{query});expect(page.query).toBe(query);expect(page.records.map(row=>row.id)).toEqual([target.id]);expect(page.hasMore).toBe(false);
 }
 const found=ask(owner,'notes.searchRoot',{query:'_literal'}).records[0]!;expect(found.excerpt).not.toContain('_literal');expect(Buffer.byteLength(found.excerpt)).toBeLessThanOrEqual(1024);
 expect(ask(owner,'notes.searchRoot',{query:'missing%'}).records).toEqual([]);
 expect(ask(owner,'notes.searchRoot',{query:'full-body'}).records[0]?.id).toBe(target.id);
});
it('distinguishes exactly twenty from more and uses stable id order for equal timestamps',async()=>{
 const {owner}=await open();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-29T00:00:00.000Z'));
 const records=Array.from({length:20},(_,n)=>create(owner,'Public equal '+n,'Public equal timestamp body'));
 const first=ask(owner,'notes.searchRoot',{query:''});expect(first.hasMore).toBe(false);expect(first.records.map(row=>row.id)).toEqual(records.map(row=>row.id).sort().reverse());
 const more=create(owner,'Public twenty-first','Public equal timestamp body');records.push(more);
 const second=ask(owner,'notes.searchRoot',{query:'  '});expect(second.query).toBe('  ');expect(second.hasMore).toBe(true);expect(second.records.map(row=>row.id)).toEqual(records.map(row=>row.id).sort().reverse().slice(0,20));
});
it('preserves saved/draft/history and pins through root queries, clearing and owner reopen without query history',async()=>{
 const {owner,dir}=await open(),saved=create(owner,'Public saved title','Public original saved body','save');
 const changed=ask(owner,'notes.write',{id:saved.id,expectedRevision:saved.revision,action:'draft',content:{title:'Public pending root title',document:doc('PUBLIC_ROOT_QUERY_SENTINEL pending body')}}),before=pin(owner,changed);
 const db=new Database(join(dir,'linuxcast.db'),{readonly:true});let original:unknown,history:unknown;
 try{original=db.prepare('SELECT * FROM notes WHERE id=?').get(before.id);history=db.prepare('SELECT * FROM note_saved_revisions WHERE note_id=?').all(before.id);}finally{db.close();}
 const page=ask(owner,'notes.searchRoot',{query:'PUBLIC_ROOT_QUERY_SENTINEL'});
 expect(page.records[0]).toEqual({id:before.id,revision:before.revision,title:before.draft.title,excerpt:'PUBLIC_ROOT_QUERY_SENTINEL pending body',pinned:true,hasDraft:true,updatedAt:before.updatedAt});
 expect(Object.keys(page.records[0]!).sort()).toEqual(['id','revision','title','excerpt','pinned','hasDraft','updatedAt'].sort());
 ask(owner,'dataControls.clear',{category:'command-usage'});ask(owner,'dataControls.clear',{category:'file-index'});
 expect(ask(owner,'notes.get',{id:before.id})).toEqual(before);await owner.confirmSuccessfulLaunch();await owner.close();
 const reopened=(await open(dir)).owner;expect(ask(reopened,'notes.searchRoot',{query:'pending'})).toEqual({...page,query:'pending'});expect(ask(reopened,'notes.get',{id:before.id})).toEqual(before);
 const read=new Database(join(dir,'linuxcast.db'),{readonly:true});try{expect(read.prepare('SELECT * FROM notes WHERE id=?').get(before.id)).toEqual(original);expect(read.prepare('SELECT * FROM note_saved_revisions WHERE note_id=?').all(before.id)).toEqual(history);}finally{read.close();}
 const usage=JSON.stringify(ask(reopened,'dataControls.export',{category:'command-usage'}));for(const literal of ['PUBLIC_ROOT_QUERY_SENTINEL','pending body','Public pending root title'])expect(usage).not.toContain(literal);
 expect(ask(reopened,'notes.searchRoot',{query:'original saved'}).records).toEqual([]);
 expect(noteContentKey(ask(reopened,'notes.get',{id:before.id})!.saved!)).toBe(noteContentKey(saved.saved!));
});
it('rejects malformed query authority before changing any source',async()=>{
 const {owner}=await open(),before=create(owner,'Public retained','Public retained body');
 for(const input of [{query:'x'.repeat(513)},{query:'Public\0'},{query:'\ud800'},{query:'Public',sql:'DELETE FROM notes'},{query:'Public',id:before.id}])expect(()=>ask(owner,'notes.searchRoot',input as never)).toThrow();
 expect(ask(owner,'notes.get',{id:before.id})).toEqual(before);expect(ask(owner,'notes.searchRoot',{query:'absent'})).toEqual({query:'absent',records:[],hasMore:false});
});
it('refuses corrupt actual sources including the lookahead and never repairs or deletes their data',async()=>{
 const {owner,dir}=await open();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-29T00:00:00.000Z'));
 const records=Array.from({length:21},(_,n)=>create(owner,'Public corruption '+n,'Public corruption body'));vi.useRealTimers();
 const last=records.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)[0]!;await owner.confirmSuccessfulLaunch();await owner.close();
 const invalid=JSON.stringify({title:'Public corrupt source',document:{type:'doc',content:[{type:'image',attrs:{src:'https://example.invalid'}}]}}),db=new Database(join(dir,'linuxcast.db'));
 try{db.prepare('UPDATE notes SET draft=? WHERE id=?').run(invalid,last.id);}finally{db.close();}
 const reopened=(await open(dir)).owner;expect(()=>ask(reopened,'notes.searchRoot',{query:'corruption'})).toThrow('corrupt-database');
 const read=new Database(join(dir,'linuxcast.db'),{readonly:true});try{expect(read.prepare('SELECT draft FROM notes WHERE id=?').get(last.id)).toEqual({draft:invalid});expect(read.prepare('SELECT COUNT(*) AS count FROM notes').get()).toEqual({count:21});}finally{read.close();}
});
