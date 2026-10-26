import { afterEach,expect,it } from 'vitest';
import { mkdtemp,rm,readdir,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { StorageOwner } from '../src/owner.ts';
import { foundationMigrations } from '../src/migrations.ts';
import { createStorageClient } from '../src/client.ts';
import type { StorageMethod,StorageMethods } from '../src/repositories.ts';
const directories:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
async function open(dir?:string,migrations?:Awaited<ReturnType<typeof foundationMigrations>>){const directory=dir??await mkdtemp(join(tmpdir(),'linuxcast-quicklink-owner-'));if(!dir)directories.push(directory);const owner=await StorageOwner.open({dataDirectory:directory,applicationBuild:'synthetic-quicklinks',...(migrations?{migrations}:{})});owners.push(owner);return {owner,dir:directory};}
function request<M extends StorageMethod>(owner:StorageOwner,method:M,params:StorageMethods[M]['params']){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result as StorageMethods[M]['result'];}
const input={expectedRevision:0,name:'Public docs',url:'HTTPS://EXAMPLE.invalid:443/docs'};
it('migrates a real version5 owner to6 using a consistent recovery snapshot and retains definitions through clear/restart',async()=>{
  const migrations=await foundationMigrations(),{owner,dir}=await open(undefined,migrations.slice(0,5));
  request(owner,'commands.setAlias',{commandId:'linuxcast:hide',alias:'public alias'});await owner.confirmSuccessfulLaunch();await owner.close();
  const next=(await open(dir,migrations.slice(0,6))).owner;expect(next.version).toBe(6);expect(request(next,'commands.getUsage',{commandId:'linuxcast:hide'})).toMatchObject({alias:'public alias'});
  const backupDir=join(dir,'backups'),journals=await Promise.all((await readdir(backupDir)).filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await readFile(join(backupDir,name),'utf8')) as {id:string;fromVersion:number;toVersion:number;state:string}));
  const journal=journals.find(value=>value.fromVersion===5&&value.toVersion===6)!;expect(journal.state).toBe('awaiting-confirmation');const snapshot=new Database(join(backupDir,`${journal.id}.db`),{readonly:true});
  try{expect(snapshot.pragma('user_version',{simple:true})).toBe(5);expect(snapshot.prepare("SELECT name FROM sqlite_master WHERE name='quicklinks'").get()).toBeUndefined();}finally{snapshot.close();}
  await next.confirmSuccessfulLaunch();await next.close();const current=(await open(dir)).owner;
  const record=request(current,'quicklinks.save',input);expect(record).toMatchObject({revision:1,name:input.name,url:'https://example.invalid/docs'});
  request(current,'commands.recordUse',{commandId:'linuxcast:open-quicklinks'});request(current,'dataControls.clear',{category:'command-usage'});request(current,'dataControls.clear',{category:'file-index'});
  await current.confirmSuccessfulLaunch();await current.close();const final=(await open(dir)).owner;
  expect(request(final,'quicklinks.get',{id:record.id,revision:1})).toEqual(record);expect(request(final,'quicklinks.list',{})).toEqual([{id:record.id,revision:1,name:record.name,host:'example.invalid'}]);
  const updated=request(final,'quicklinks.save',{...input,id:record.id,expectedRevision:1,name:'Public updated'});expect(updated).toMatchObject({id:record.id,revision:2,createdAt:record.createdAt});
  expect(()=>request(final,'quicklinks.remove',{id:record.id,revision:1})).toThrow('conflict');expect(request(final,'quicklinks.remove',{id:record.id,revision:2})).toEqual({id:record.id,revision:2});expect(request(final,'quicklinks.list',{})).toEqual([]);
});
it('checks canonical Save receipt identity and denies wrong records without replay',async()=>{
  let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[];
  const client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}});
  const record={id:randomUUID(),revision:1,name:input.name,url:'https://example.invalid/docs',createdAt:'2026-10-26T00:00:00.000Z',updatedAt:'2026-10-26T00:00:00.000Z'};
  const pending=client.request('quicklinks.save',input),envelope=sent[0] as {request:{requestId:string;method:string}};
  receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result:record}});await expect(pending).resolves.toEqual(record);client.disconnect();
});
it.each(['get','remove','save'] as const)('rejects mismatched %s acknowledgements without replay',async operation=>{
  let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[];const client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}});
  const id=randomUUID(),params={id,revision:1},record={id:randomUUID(),revision:operation==='save'?2:1,name:input.name,url:'https://example.invalid/docs',createdAt:'2026-10-26T00:00:00.000Z',updatedAt:'2026-10-26T00:00:00.000Z'};
  const pending=operation==='get'?client.request('quicklinks.get',params):operation==='remove'?client.request('quicklinks.remove',params):client.request('quicklinks.save',{...input,id,expectedRevision:1});
  const envelope=sent[0] as {request:{requestId:string;method:string}};receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result:operation==='remove'?{id:record.id,revision:1}:record}});
  await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(sent).toHaveLength(1);
});
