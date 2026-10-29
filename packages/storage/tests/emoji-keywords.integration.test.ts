import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {StorageOwner} from '../src/owner.ts';
import {createStorageClient} from '../src/client.ts';
import type {StorageMethod,StorageMethods} from '../src/repositories.ts';
import {STORAGE_SCHEMA_VERSION,STORAGE_MIGRATION_ASSETS} from '../src/schema-version.ts';
import {canonicalEmojiId,parseEmojiKeywordSetting} from '../../contracts/src/emoji.ts';
// Real SQLite owner checks below. Synthetic client-transport checks are marked separately.
const directories:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function open(directory?:string){const dir=directory??await mkdtemp(join(tmpdir(),'linuxcast-emoji-keywords-'));if(!directory)directories.push(dir);const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:'public-keywords-test'});owners.push(owner);return{owner,dir};}
function ask<M extends StorageMethod>(owner:StorageOwner,method:M,params:StorageMethods[M]['params']){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result as StorageMethods[M]['result'];}
const id=canonicalEmojiId('👩🏽‍💻'),entries=[{id,keywords:['public café','team 👩🏽‍💻']}],value=JSON.stringify(entries);
it('stores private canonical keyword JSON in the existing settings CAS, preserving unrelated preferences and explicit clear across restart',async()=>{
 const {owner,dir}=await open();expect(STORAGE_SCHEMA_VERSION).toBe(18);expect(STORAGE_MIGRATION_ASSETS.at(-1)).toBe('018-quicklink-clock.sql');expect(ask(owner,'settings.get',{id:'emoji.keywords'})).toBeNull();
 const theme=ask(owner,'settings.set',{id:'ui.theme',expectedRevision:0,value:'dark'}),saved=ask(owner,'settings.set',{id:'emoji.keywords',expectedRevision:0,value});expect(saved).toMatchObject({id:'emoji.keywords',revision:1,value});expect(parseEmojiKeywordSetting(saved.value)).toEqual(entries);
 const db=new Database(join(dir,'linuxcast.db'),{readonly:true});try{expect(db.pragma('user_version',{simple:true})).toBe(18);expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%emoji%'").all()).toEqual([]);}finally{db.close();}
 expect((await stat(dir)).mode&0o777).toBe(0o700);expect((await stat(join(dir,'linuxcast.db'))).mode&0o777).toBe(0o600);await owner.confirmSuccessfulLaunch();await owner.close();const next=(await open(dir)).owner;expect(ask(next,'settings.get',{id:'emoji.keywords'})).toEqual(saved);expect(ask(next,'settings.get',{id:'ui.theme'})).toEqual(theme);
 const cleared=ask(next,'settings.set',{id:'emoji.keywords',expectedRevision:1,value:'[]'});expect(cleared).toMatchObject({revision:2,value:'[]'});await next.close();const reopened=(await open(dir)).owner;expect(ask(reopened,'settings.get',{id:'emoji.keywords'})).toEqual(cleared);expect(ask(reopened,'settings.get',{id:'ui.theme'})).toEqual(theme);
});
it('refuses stale CAS, null, noncanonical, duplicate, oversized and invalid phrase writes atomically',async()=>{
 const {owner}=await open(),saved=ask(owner,'settings.set',{id:'emoji.keywords',expectedRevision:0,value}),theme=ask(owner,'settings.set',{id:'ui.theme',expectedRevision:0,value:'light'});expect(()=>ask(owner,'settings.set',{id:'emoji.keywords',expectedRevision:0,value:'[]'})).toThrow('conflict');
 for(const invalid of [null,true,[],'null','[ ]','{}',JSON.stringify(entries,null,2),JSON.stringify([{keywords:['public café'],id}]),JSON.stringify([{id,keywords:[]}]),JSON.stringify([...entries,...entries]),JSON.stringify([{id,keywords:['public','public']}]),JSON.stringify([{id,keywords:['public\u202e']}]),JSON.stringify([{id,keywords:['a'.repeat(65)]}]),' '.repeat(524289)])expect(()=>ask(owner,'settings.set',{id:'emoji.keywords',expectedRevision:1,value:invalid} as never)).toThrow();
 expect(ask(owner,'settings.get',{id:'emoji.keywords'})).toEqual(saved);expect(ask(owner,'settings.get',{id:'ui.theme'})).toEqual(theme);
});
it('keeps custom phrases and canonical IDs out of ordinary settings/usage exports and rejects explicit private-key export',async()=>{
 const {owner}=await open(),saved=ask(owner,'settings.set',{id:'emoji.keywords',expectedRevision:0,value});ask(owner,'settings.set',{id:'ui.theme',expectedRevision:0,value:'dark'});
 const settings=ask(owner,'dataControls.export',{category:'settings'}),usage=ask(owner,'dataControls.export',{category:'command-usage'});expect(settings).toMatchObject({records:[{id:'ui.theme'}]});expect(usage).toMatchObject({records:[]});for(const sensitive of ['emoji.keywords',id,'public café','team 👩🏽‍💻'])expect(JSON.stringify({settings,usage})).not.toContain(sensitive);
 expect(()=>ask(owner,'dataControls.export',{category:'settings',ids:['emoji.keywords']})).toThrow();ask(owner,'dataControls.clear',{category:'command-usage'});expect(ask(owner,'settings.get',{id:'emoji.keywords'})).toEqual(saved);
});
it('refuses corrupt existing JSON without pretending absence, clearing, repairing or exporting private data',async()=>{
 const {owner,dir}=await open();ask(owner,'settings.set',{id:'emoji.keywords',expectedRevision:0,value});await owner.confirmSuccessfulLaunch();await owner.close();const corrupt=JSON.stringify('[ ]'),db=new Database(join(dir,'linuxcast.db'));try{db.prepare("UPDATE settings SET value=? WHERE id='emoji.keywords'").run(corrupt);}finally{db.close();}
 const next=(await open(dir)).owner;expect(()=>ask(next,'settings.get',{id:'emoji.keywords'})).toThrow();expect(()=>ask(next,'settings.set',{id:'emoji.keywords',expectedRevision:1,value:'[]'})).toThrow();const read=new Database(join(dir,'linuxcast.db'),{readonly:true});try{expect(read.prepare("SELECT revision,value FROM settings WHERE id='emoji.keywords'").get()).toEqual({revision:1,value:corrupt});}finally{read.close();}
});
// Synthetic utility-process client transport: no storage or desktop success claim.
function clientFixture(){let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[],client=createStorageClient({send:message=>sent.push(message),onMessage:listener=>{receive=listener;return()=>{};}});const reply=(result:unknown)=>{const envelope=sent[0] as {request:{requestId:string;method:string}};receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result}});};return{client,sent,reply};}
const params={id:'emoji.keywords' as const,expectedRevision:4,value},receipt={id:'emoji.keywords',revision:5,value,modifiedAt:'2026-10-29T00:00:00.000Z'};
it('accepts exact keyword client receipts and distinguishes absent reads from an explicit empty saved setting',async()=>{
 for(const result of [null,{...receipt,value:'[]'}]){const f=clientFixture(),pending=f.client.request('settings.get',{id:'emoji.keywords'});f.reply(result);expect(await pending).toEqual(result);f.client.disconnect();}
 const f=clientFixture(),pending=f.client.request('settings.set',params);f.reply(receipt);expect(await pending).toEqual(receipt);expect(f.sent).toHaveLength(1);f.client.disconnect();
});
it.each(['id','revision','value','malformed','extra','null'] as const)('treats forged keyword client %s receipt as unknown with no replay',async mode=>{
 const f=clientFixture(),pending=f.client.request('settings.set',params);f.reply(mode==='null'?null:{...receipt,...(mode==='id'?{id:'ui.theme',value:'dark'}:mode==='revision'?{revision:6}:mode==='value'?{value:'[]'}:mode==='malformed'?{value:'[ ]'}:{query:'PUBLIC_PRIVATE_MARKER'})});await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(f.sent).toHaveLength(1);await expect(f.client.request('settings.set',params)).rejects.toMatchObject({effectOutcome:'not-dispatched',automaticReplay:false});expect(f.sent).toHaveLength(1);f.client.disconnect();
});
