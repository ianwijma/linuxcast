import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {StorageOwner} from '../src/owner.ts';
import type {StorageMethod,StorageMethods} from '../src/repositories.ts';
import {STORAGE_SCHEMA_VERSION,STORAGE_MIGRATION_ASSETS} from '../src/schema-version.ts';
import {canonicalEmojiId,parseEmojiFavouriteSetting} from '../../contracts/src/emoji.ts';
// Real SQLite owner/repository checks; no desktop, renderer or native clipboard claim.
const directories:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function open(directory?:string){const dir=directory??await mkdtemp(join(tmpdir(),'linuxcast-emoji-favourites-'));if(!directory)directories.push(dir);const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:'public-emoji-favourites-test'});owners.push(owner);return{owner,dir};}
function ask<M extends StorageMethod>(owner:StorageOwner,method:M,params:StorageMethods[M]['params']){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result as StorageMethods[M]['result'];}
const ids=[canonicalEmojiId('👩🏽‍💻'),canonicalEmojiId('🇦🇺')].sort(),value=JSON.stringify(ids);
it('persists favourites in the existing private revisioned settings table with no migration and preserves unrelated preferences across restart',async()=>{
 const {owner,dir}=await open();expect(STORAGE_SCHEMA_VERSION).toBe(17);expect(STORAGE_MIGRATION_ASSETS.at(-1)).toBe('017-note-trash.sql');expect(ask(owner,'settings.get',{id:'emoji.favourites'})).toBeNull();const theme=ask(owner,'settings.set',{id:'ui.theme',expectedRevision:0,value:'dark'}),saved=ask(owner,'settings.set',{id:'emoji.favourites',expectedRevision:0,value});expect(saved).toMatchObject({id:'emoji.favourites',revision:1,value});expect(parseEmojiFavouriteSetting(saved.value)).toEqual(ids);
 const read=new Database(join(dir,'linuxcast.db'),{readonly:true});try{expect(read.pragma('user_version',{simple:true})).toBe(17);expect(read.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%emoji%'").all()).toEqual([]);expect(read.prepare("SELECT revision,value FROM settings WHERE id='emoji.favourites'").get()).toEqual({revision:1,value:JSON.stringify(value)});}finally{read.close();}
 expect((await stat(dir)).mode&0o777).toBe(0o700);expect((await stat(join(dir,'linuxcast.db'))).mode&0o777).toBe(0o600);await owner.confirmSuccessfulLaunch();const backups=await readdir(join(dir,'backups'));await owner.close();const next=(await open(dir)).owner;expect(ask(next,'settings.get',{id:'emoji.favourites'})).toEqual(saved);expect(ask(next,'settings.get',{id:'ui.theme'})).toEqual(theme);expect(await readdir(join(dir,'backups'))).toEqual(backups);
 const empty=ask(next,'settings.set',{id:'emoji.favourites',expectedRevision:1,value:'[]'});expect(empty).toMatchObject({revision:2,value:'[]'});expect(ask(next,'settings.get',{id:'emoji.favourites'})).not.toBeNull();expect(ask(next,'settings.get',{id:'ui.theme'})).toEqual(theme);
});
it('refuses stale CAS and malformed/noncanonical/oversized values atomically without disturbing favourites or other settings',async()=>{
 const {owner}=await open(),theme=ask(owner,'settings.set',{id:'ui.theme',expectedRevision:0,value:'light'}),saved=ask(owner,'settings.set',{id:'emoji.favourites',expectedRevision:0,value});expect(()=>ask(owner,'settings.set',{id:'emoji.favourites',expectedRevision:0,value:'[]'})).toThrow('conflict');
 const over=Array.from({length:4097},(_,i)=>'emoji:'+i.toString(16).padStart(4,'0'));
 for(const invalid of [true,false,'',JSON.stringify(ids.toReversed()),JSON.stringify([ids[0],ids[0]]),'[ ]','null','{}','["emoji:23"]','["emoji:1F600"]',JSON.stringify(over)])expect(()=>ask(owner,'settings.set',{id:'emoji.favourites',expectedRevision:1,value:invalid})).toThrow();
 expect(()=>ask(owner,'settings.set',{id:'emoji.favourites',expectedRevision:1,value,query:'SYNTHETIC_PRIVATE_QUERY'} as never)).toThrow();expect(ask(owner,'settings.get',{id:'emoji.favourites'})).toEqual(saved);expect(ask(owner,'settings.get',{id:'ui.theme'})).toEqual(theme);
});
it('exports favourites only through explicit settings export and never as command usage or unrelated export content',async()=>{
 const {owner}=await open(),saved=ask(owner,'settings.set',{id:'emoji.favourites',expectedRevision:0,value});ask(owner,'settings.set',{id:'ui.theme',expectedRevision:0,value:'dark'});expect(ask(owner,'dataControls.export',{category:'settings',ids:['emoji.favourites']})).toMatchObject({category:'settings',records:[saved]});const all=ask(owner,'dataControls.export',{category:'settings'});expect(all).toMatchObject({records:expect.arrayContaining([saved])});const usage=ask(owner,'dataControls.export',{category:'command-usage'});expect(usage).toMatchObject({records:[]});expect(JSON.stringify(usage)).not.toContain('emoji.favourites');expect(JSON.stringify(usage)).not.toContain(ids[0]);expect(ask(owner,'dataControls.export',{category:'settings',ids:['ui.theme']})).toMatchObject({records:[{id:'ui.theme'}]});ask(owner,'dataControls.clear',{category:'command-usage'});expect(ask(owner,'settings.get',{id:'emoji.favourites'})).toEqual(saved);
});
it('does not reinterpret corrupt existing favourites as an absent or empty preference or repair the original record',async()=>{
 const {owner,dir}=await open();ask(owner,'settings.set',{id:'emoji.favourites',expectedRevision:0,value});await owner.confirmSuccessfulLaunch();await owner.close();const bad=JSON.stringify('["emoji:1F600"]'),db=new Database(join(dir,'linuxcast.db'));try{db.prepare("UPDATE settings SET value=? WHERE id='emoji.favourites'").run(bad);}finally{db.close();}const next=(await open(dir)).owner;expect(()=>ask(next,'settings.get',{id:'emoji.favourites'})).toThrow();expect(()=>ask(next,'settings.set',{id:'emoji.favourites',expectedRevision:1,value:'[]'})).toThrow();expect(()=>ask(next,'dataControls.export',{category:'settings',ids:['emoji.favourites']})).toThrow();const read=new Database(join(dir,'linuxcast.db'),{readonly:true});try{expect(read.prepare("SELECT revision,value FROM settings WHERE id='emoji.favourites'").get()).toEqual({revision:1,value:bad});}finally{read.close();}
});
