import { afterEach,expect,it } from 'vitest';
import { mkdtemp,rm,readdir,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { StorageOwner } from '../src/owner.ts';
import { foundationMigrations } from '../src/migrations.ts';
import { createStorageClient } from '../src/client.ts';
import { WEB_SEARCH_TEMPLATE } from '@linuxcast/contracts';
import type { StorageMethod,StorageMethods } from '../src/repositories.ts';
const directories:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function open(dir?:string,migrations?:Awaited<ReturnType<typeof foundationMigrations>>){const directory=dir??await mkdtemp(join(tmpdir(),'linuxcast-web-search-owner-'));if(!dir)directories.push(directory);const owner=await StorageOwner.open({dataDirectory:directory,applicationBuild:'synthetic-web-search',...(migrations?{migrations}:{})});owners.push(owner);return {owner,dir:directory};}
function request<M extends StorageMethod>(owner:StorageOwner,method:M,params:StorageMethods[M]['params']){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result as StorageMethods[M]['result'];}
const config={queryParameter:'q',template:WEB_SEARCH_TEMPLATE},time='2026-10-26T00:00:00.000Z';
it('upgrades a real version6 definition to7 with a consistent recovery snapshot and preserves literal identity/content',async()=>{
  const migrations=await foundationMigrations(),{owner,dir}=await open(undefined,migrations.slice(0,6));await owner.confirmSuccessfulLaunch();await owner.close();
  // Seed the historical schema only after releasing its sole owner. Current
  // feature repositories are deliberately not run against an older schema.
  const id=randomUUID(),db=new Database(join(dir,'linuxcast.db'));try{db.prepare('INSERT INTO quicklinks(id,revision,name,name_key,url,created_at,updated_at) VALUES(?,3,?,?,?,?,?)').run(id,'Public literal','public literal','https://example.invalid/literal',time,time);}finally{db.close();}
  let next=(await open(dir,migrations.slice(0,7))).owner;expect(next.version).toBe(7);const literal=request(next,'quicklinks.get',{id,revision:3});expect(literal).toEqual({id,revision:3,name:'Public literal',url:'https://example.invalid/literal',createdAt:time,updatedAt:time});
  const backupDir=join(dir,'backups'),journals=await Promise.all((await readdir(backupDir)).filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await readFile(join(backupDir,name),'utf8')) as {id:string;fromVersion:number;toVersion:number;state:string})),journal=journals.find(value=>value.fromVersion===6&&value.toVersion===7)!;
  expect(journal.state).toBe('awaiting-confirmation');const snapshot=new Database(join(backupDir,`${journal.id}.db`),{readonly:true});try{expect(snapshot.pragma('user_version',{simple:true})).toBe(6);expect((snapshot.pragma('table_info(quicklinks)') as {name:string}[]).map(value=>value.name)).not.toContain('web_search');expect(snapshot.prepare('SELECT revision,url FROM quicklinks WHERE id=?').get(id)).toEqual({revision:3,url:'https://example.invalid/literal'});}finally{snapshot.close();}
  await next.confirmSuccessfulLaunch();await next.close();next=(await open(dir)).owner;
  const updated=request(next,'quicklinks.save',{id,expectedRevision:3,name:'Public search',url:'https://example.invalid/search?lang=en',webSearch:config});expect(updated).toMatchObject({id,revision:4,createdAt:time,webSearch:config});
  request(next,'dataControls.clear',{category:'command-usage'});request(next,'dataControls.clear',{category:'file-index'});await next.confirmSuccessfulLaunch();await next.close();const final=(await open(dir)).owner;
  expect(request(final,'quicklinks.get',{id,revision:4})).toEqual(updated);expect(request(final,'quicklinks.list',{})).toEqual([{id,revision:4,name:'Public search',host:'example.invalid',webSearch:true}]);
  const restored=request(final,'quicklinks.save',{id,expectedRevision:4,name:'Public literal again',url:'https://example.invalid/literal'});expect(restored).not.toHaveProperty('webSearch');expect(restored.revision).toBe(5);
});
it.each([undefined,{queryParameter:'other',template:WEB_SEARCH_TEMPLATE}])('rejects missing or mismatched config in storage acknowledgements without replay: %j',async webSearch=>{
  let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[];const client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}}),input={expectedRevision:0,name:'Public search',url:'https://example.invalid/search',webSearch:config};
  const pending=client.request('quicklinks.save',input),envelope=sent[0] as {request:{requestId:string;method:string}},record={id:randomUUID(),revision:1,name:input.name,url:input.url,createdAt:time,updatedAt:time,...(webSearch?{webSearch}:{})};
  receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result:record}});await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(sent).toHaveLength(1);
});
