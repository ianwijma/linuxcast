import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {StorageOwner} from '../src/owner.ts';
import {createStorageClient} from '../src/client.ts';
import type {StorageMethod,StorageMethods} from '../src/repositories.ts';
import {canonicalEmojiId,parseEmojiFrecencySetting} from '../../contracts/src/emoji.ts';
const directories:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function open(directory?:string){const dir=directory??await mkdtemp(join(tmpdir(),'linuxcast-emoji-frecency-'));if(!directory)directories.push(dir);const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:'public-emoji-ranking-test'});owners.push(owner);return{owner,dir};}
function ask<M extends StorageMethod>(owner:StorageOwner,method:M,params:StorageMethods[M]['params']){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result as StorageMethods[M]['result'];}
const id=canonicalEmojiId('🥛'),state={enabled:true,entries:[{id,useCount:3,lastUsedAt:'2026-10-29T00:00:00.000Z'}]},value=JSON.stringify(state);
it('persists pause and reset with exact CAS through restart using only existing settings',async()=>{
 const {owner,dir}=await open();expect(ask(owner,'settings.get',{id:'emoji.frecency'})).toBeNull();
 const theme=ask(owner,'settings.set',{id:'ui.theme',expectedRevision:0,value:'dark'}),saved=ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:0,value});expect(saved).toMatchObject({revision:1,value});expect(parseEmojiFrecencySetting(saved.value)).toEqual(state);
 const paused=JSON.stringify({...state,enabled:false});expect(ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:1,value:paused})).toMatchObject({revision:2,value:paused});
 await owner.confirmSuccessfulLaunch();await owner.close();const next=(await open(dir)).owner;expect(ask(next,'settings.get',{id:'emoji.frecency'})).toMatchObject({revision:2,value:paused});
 expect(()=>ask(next,'settings.set',{id:'emoji.frecency',expectedRevision:1,value})).toThrow('conflict');
 const cleared=JSON.stringify({enabled:false,entries:[]});ask(next,'settings.set',{id:'emoji.frecency',expectedRevision:2,value:cleared});await next.close();const reopened=(await open(dir)).owner;expect(ask(reopened,'settings.get',{id:'emoji.frecency'})).toMatchObject({revision:3,value:cleared});expect(ask(reopened,'settings.get',{id:'ui.theme'})).toEqual(theme);
 const db=new Database(join(dir,'linuxcast.db'),{readonly:true});try{expect(db.pragma('user_version',{simple:true})).toBe(18);expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%emoji%'").all()).toEqual([]);}finally{db.close();}
});
it('rejects malformed aggregate values and stale writes without changing stored ranking',async()=>{
 const {owner}=await open(),saved=ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:0,value});
 for(const invalid of [true,'null',JSON.stringify(state,null,2),JSON.stringify({entries:state.entries,enabled:true}),JSON.stringify({...state,entries:[...state.entries,...state.entries]}),JSON.stringify({...state,entries:[{...state.entries[0],useCount:0}]}),JSON.stringify({...state,entries:[{...state.entries[0],useCount:1_000_000_001}]}),JSON.stringify({...state,entries:[{...state.entries[0],lastUsedAt:'2026-10-29T00:00:00Z'}]}),JSON.stringify({...state,entries:[{...state.entries[0],query:'PRIVATE_QUERY'}]}),' '.repeat(524321)])expect(()=>ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:1,value:invalid})).toThrow();
 expect(ask(owner,'settings.get',{id:'emoji.frecency'})).toEqual(saved);
});
it('omits private per-emoji usage from exports and clears it with global or selected Emoji command usage while preserving pause and preferences',async()=>{
 const {owner}=await open();const paused=JSON.stringify({...state,enabled:false});ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:0,value:paused});ask(owner,'settings.set',{id:'emoji.keywords',expectedRevision:0,value:JSON.stringify([{id,keywords:['public phrase']}])});ask(owner,'commands.recordUse',{commandId:'linuxcast:emoji'});
 const exports={settings:ask(owner,'dataControls.export',{category:'settings'}),usage:ask(owner,'dataControls.export',{category:'command-usage'})};for(const token of ['emoji.frecency',id,'lastUsedAt":"2026-10-29T00:00:00.000Z'])expect(JSON.stringify(exports)).not.toContain(token);
 expect(()=>ask(owner,'dataControls.export',{category:'settings',ids:['emoji.frecency']} as never)).toThrow();
 ask(owner,'dataControls.clear',{category:'command-usage',ids:['linuxcast:calculator']});expect(ask(owner,'settings.get',{id:'emoji.frecency'})).toMatchObject({revision:1,value:paused});
 expect(ask(owner,'dataControls.clear',{category:'command-usage',ids:['linuxcast:emoji']})).toEqual({category:'command-usage',removed:2,complete:true});const empty=JSON.stringify({enabled:false,entries:[]});expect(ask(owner,'settings.get',{id:'emoji.frecency'})).toMatchObject({revision:2,value:empty});expect(ask(owner,'settings.get',{id:'emoji.keywords'})).toMatchObject({revision:1});
 expect(()=>ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:1,value})).toThrow('conflict');ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:2,value});expect(ask(owner,'dataControls.clear',{category:'command-usage'})).toMatchObject({removed:1,complete:true});expect(ask(owner,'settings.get',{id:'emoji.frecency'})).toMatchObject({revision:4,value:JSON.stringify({enabled:true,entries:[]})});
});
it('advances absent and already-empty reset epochs so pending old writes cannot repopulate cleared usage',async()=>{
 const {owner}=await open();expect(ask(owner,'dataControls.clear',{category:'command-usage'})).toMatchObject({removed:0,complete:true});
 expect(ask(owner,'settings.get',{id:'emoji.frecency'})).toMatchObject({revision:1,value:'{"enabled":true,"entries":[]}'});expect(()=>ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:0,value})).toThrow('conflict');
 ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:1,value:'{"enabled":false,"entries":[]}'});expect(ask(owner,'dataControls.clear',{category:'command-usage',ids:['linuxcast:emoji']})).toMatchObject({removed:0,complete:true});
 expect(ask(owner,'settings.get',{id:'emoji.frecency'})).toMatchObject({revision:3,value:'{"enabled":false,"entries":[]}'});expect(()=>ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:2,value})).toThrow('conflict');
});
it('rolls back a global clear if corrupt private ranking prevents complete removal',async()=>{
 const {owner,dir}=await open();ask(owner,'settings.set',{id:'emoji.frecency',expectedRevision:0,value});ask(owner,'commands.recordUse',{commandId:'linuxcast:emoji'});await owner.confirmSuccessfulLaunch();await owner.close();
 const db=new Database(join(dir,'linuxcast.db'));try{db.prepare("UPDATE settings SET value=? WHERE id='emoji.frecency'").run(JSON.stringify('invalid'));}finally{db.close();}
 const next=(await open(dir)).owner;expect(()=>ask(next,'dataControls.clear',{category:'command-usage'})).toThrow();expect(ask(next,'commands.getUsage',{commandId:'linuxcast:emoji'})).toMatchObject({useCount:1});expect(()=>ask(next,'settings.get',{id:'emoji.frecency'})).toThrow();
});
// Synthetic client transport; it proves receipt validation, not actual storage effects.
function fixture(){let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[],client=createStorageClient({send:message=>sent.push(message),onMessage:listener=>{receive=listener;return()=>{};}});return{client,sent,reply(result:unknown){const message=sent[0] as {request:{requestId:string;method:string}};receive({kind:'response',response:{schemaVersion:1,requestId:message.request.requestId,method:message.request.method,outcome:'completed',result}});}};}
it('accepts only exact private-ranking CAS receipts and never replays an uncertain write',async()=>{
 const params={id:'emoji.frecency' as const,expectedRevision:4,value},receipt={id:'emoji.frecency',revision:5,value,modifiedAt:'2026-10-29T00:00:00.000Z'};
 for(const result of [receipt,{...receipt,revision:6},{...receipt,value:JSON.stringify({enabled:false,entries:[]})},{...receipt,id:'ui.theme',value:'dark'}]){const f=fixture(),pending=f.client.request('settings.set',params);f.reply(result);if(result===receipt)expect(await pending).toEqual(receipt);else{await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});await expect(f.client.request('settings.set',params)).rejects.toMatchObject({effectOutcome:'not-dispatched'});}expect(f.sent).toHaveLength(1);f.client.disconnect();}
});
