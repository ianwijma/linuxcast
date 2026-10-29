import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {StorageOwner} from '../src/owner.ts';
import {createStorageClient} from '../src/client.ts';
import type {StorageMethod,StorageMethods} from '../src/repositories.ts';
import {emptyNoteDocument,type NoteRecord} from '../../contracts/src/notes.ts';
const dirs:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function open(dir?:string){const directory=dir??await mkdtemp(join(tmpdir(),'linuxcast-empty-trash-'));if(!dir)dirs.push(directory);const owner=await StorageOwner.open({dataDirectory:directory,applicationBuild:'public-empty-trash-test'});owners.push(owner);return{owner,dir:directory};}
function ask<M extends StorageMethod>(owner:StorageOwner,method:M,params:StorageMethods[M]['params']){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result as StorageMethods[M]['result'];}
function create(owner:StorageOwner,title:string,flags:{pinned?:boolean;archived?:boolean;trashed?:boolean}={}):NoteRecord{
 let record=ask(owner,'notes.write',{id:randomUUID(),expectedRevision:0,action:'save',content:{title,document:emptyNoteDocument()}});if(flags.pinned)record=ask(owner,'notes.setPinned',{id:record.id,expectedRevision:record.revision,pinned:true});if(flags.archived)record=ask(owner,'notes.setArchived',{id:record.id,expectedRevision:record.revision,archived:true});if(flags.trashed)record=ask(owner,'notes.setTrashed',{id:record.id,expectedRevision:record.revision,trashed:true});return record;
}
const confirm=(basis:{count:number;fingerprint:string})=>({expectedCount:basis.count,expectedFingerprint:basis.fingerprint});
it('atomically deletes the whole reviewed Trash beyond100 pagination and current filters, cascades history and preserves all nontrashed notes across reopen',async()=>{
 const {owner,dir}=await open(),active=create(owner,'Public active',{pinned:true}),archived=create(owner,'Public archive',{archived:true});for(let n=0;n<105;n++)create(owner,`Public trash ${n}`,{trashed:true,pinned:n%3===0,archived:n%2===0});
 const page=ask(owner,'notes.list',{query:'',trashed:true});expect(page.records).toHaveLength(100);expect(page.nextCursor).not.toBeNull();expect(ask(owner,'notes.list',{query:'trash 104',pinnedOnly:true,trashed:true}).records.length).toBeLessThan(105);
 const basis=ask(owner,'notes.trashSnapshot',{});expect(basis.count).toBe(105);expect(ask(owner,'notes.trashSnapshot',{})).toEqual(basis);expect(ask(owner,'notes.emptyTrash',confirm(basis))).toEqual({deletedCount:105,fingerprint:basis.fingerprint});
 expect(ask(owner,'notes.get',{id:active.id})).toEqual(active);expect(ask(owner,'notes.get',{id:archived.id})).toEqual(archived);expect(ask(owner,'notes.trashSnapshot',{}).count).toBe(0);
 const db=new Database(join(dir,'linuxcast.db'),{readonly:true});try{expect(db.prepare('SELECT count(*) AS count FROM notes').get()).toEqual({count:2});expect(db.prepare('SELECT count(*) AS count FROM note_saved_revisions').get()).toEqual({count:2});}finally{db.close();}
 await owner.confirmSuccessfulLaunch();await owner.close();const next=(await open(dir)).owner;expect(ask(next,'notes.get',{id:active.id})).toEqual(active);expect(ask(next,'notes.get',{id:archived.id})).toEqual(archived);expect(ask(next,'notes.trashSnapshot',{}).count).toBe(0);expect(()=>ask(next,'notes.emptyTrash',confirm(basis))).toThrow('conflict');
});
it('refuses additions, removals and same-count revision changes before deleting anything; cancellation only reads',async()=>{
 const {owner}=await open(),first=create(owner,'Public retained first',{trashed:true}),initial=ask(owner,'notes.trashSnapshot',{});expect(ask(owner,'notes.get',{id:first.id})).toEqual(first);expect(ask(owner,'notes.history',{id:first.id,expectedRevision:first.revision}).revisions).toHaveLength(1);
 const second=create(owner,'Public retained second',{trashed:true});expect(()=>ask(owner,'notes.emptyTrash',confirm(initial))).toThrow('conflict');expect(ask(owner,'notes.get',{id:first.id})).toEqual(first);expect(ask(owner,'notes.get',{id:second.id})).toEqual(second);
 const before=ask(owner,'notes.trashSnapshot',{}),restored=ask(owner,'notes.setTrashed',{id:second.id,expectedRevision:second.revision,trashed:false});expect(()=>ask(owner,'notes.emptyTrash',confirm(before))).toThrow('conflict');const changed=ask(owner,'notes.setTrashed',{id:second.id,expectedRevision:restored.revision,trashed:true}),after=ask(owner,'notes.trashSnapshot',{});expect(after.count).toBe(before.count);expect(after.fingerprint).not.toBe(before.fingerprint);expect(()=>ask(owner,'notes.emptyTrash',confirm(before))).toThrow('conflict');expect(ask(owner,'notes.get',{id:changed.id})).toEqual(changed);expect(ask(owner,'notes.get',{id:first.id})).toEqual(first);
});
it('rolls the entire deletion back when a database trigger refuses one row, preserving all sources and retained revisions',async()=>{
 const {owner,dir}=await open(),first=create(owner,'Public rollback first',{trashed:true}),second=create(owner,'Public rollback second',{trashed:true}),basis=ask(owner,'notes.trashSnapshot',{}),db=new Database(join(dir,'linuxcast.db'));try{db.exec("CREATE TRIGGER public_refuse_delete BEFORE DELETE ON notes BEGIN SELECT RAISE(ABORT,'public deletion refused'); END");}finally{db.close();}
 expect(()=>ask(owner,'notes.emptyTrash',confirm(basis))).toThrow();expect(ask(owner,'notes.trashSnapshot',{})).toEqual(basis);for(const record of [first,second]){expect(ask(owner,'notes.get',{id:record.id})).toEqual(record);expect(ask(owner,'notes.history',{id:record.id,expectedRevision:record.revision}).revisions).toHaveLength(1);}
});
it('rejects contradictory owner deletion receipts without replaying the batch',async()=>{
 let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[],client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}}),input={expectedCount:2,expectedFingerprint:'a'.repeat(64)},pending=client.request('notes.emptyTrash',input),envelope=sent[0] as {request:{requestId:string;method:string}};
 receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result:{deletedCount:1,fingerprint:input.expectedFingerprint}}});await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(sent).toHaveLength(1);client.disconnect();
});
