import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { createStorageClient } from '../src/client.ts';
import { StorageOwner } from '../src/owner.ts';
import { foundationMigrations } from '../src/migrations.ts';
const directories:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function open(directory?:string,migrations?:Awaited<ReturnType<typeof foundationMigrations>>){
  const dir=directory??await mkdtemp(join(tmpdir(),'linuxcast-visibility-'));if(!directory)directories.push(dir);
  const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:'synthetic-visibility',...(migrations?{migrations}:{})});owners.push(owner);return {owner,dir};
}
function request(owner:StorageOwner,method:string,params:unknown={}){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result;}
it('persists visibility independently of usage, pin and alias; clearing usage and restart retain it',async()=>{
  const {owner,dir}=await open(),commandId='linuxcast:open-local-data';
  request(owner,'commands.recordUse',{commandId});request(owner,'commands.setPinned',{commandId,pinned:true});request(owner,'commands.setAlias',{commandId,alias:'public settings'});
  const before=request(owner,'commands.getUsage',{commandId});
  expect(request(owner,'commands.setHidden',{commandId,hidden:true})).toEqual({commandId,hidden:true});
  expect(request(owner,'commands.getUsage',{commandId})).toEqual(before);
  const app=`application:${'a'.repeat(64)}`;request(owner,'commands.setHidden',{commandId:app,hidden:true});
  expect(request(owner,'commands.getUsage',{commandId:app})).toBeNull();
  expect(request(owner,'commands.listHidden')).toEqual([app,commandId]);
  request(owner,'dataControls.clear',{category:'command-usage'});
  expect(request(owner,'commands.getUsage',{commandId})).toMatchObject({pinned:true,alias:'public settings',useCount:0,lastUsedAt:null});
  await owner.confirmSuccessfulLaunch();await owner.close();const next=(await open(dir)).owner;
  expect(request(next,'commands.listHidden')).toEqual([app,commandId]);
  expect(request(next,'commands.setHidden',{commandId,hidden:false})).toEqual({commandId,hidden:false});
  expect(request(next,'commands.listHidden')).toEqual([app]);
  expect(request(next,'commands.getUsage',{commandId})).toMatchObject({pinned:true,alias:'public settings',useCount:0,lastUsedAt:null});
});
it('rejects recovery, arbitrary identities, coerced booleans and extra fields before writing',async()=>{
  const {owner}=await open();
  for(const params of [
    {commandId:'linuxcast:hide',hidden:true},{commandId:'linuxcast:quit',hidden:false},
    {commandId:'linuxcast:unknown',hidden:true},{commandId:'../private',hidden:true},
    {commandId:'linuxcast:calculator',hidden:1},{commandId:'linuxcast:calculator',hidden:'true'},
    {commandId:'linuxcast:calculator',hidden:true,query:'private'},
  ])expect(()=>request(owner,'commands.setHidden',params)).toThrow();
  expect(()=>request(owner,'commands.listHidden',{query:'private'})).toThrow();
  expect(request(owner,'commands.listHidden')).toEqual([]);
});
it('migrates a real version4 database with a consistent recovery snapshot and unchanged usage',async()=>{
  const migrations=await foundationMigrations(),{owner,dir}=await open(undefined,migrations.slice(0,4));
  const commandId='linuxcast:calculator';request(owner,'commands.recordUse',{commandId});request(owner,'commands.setPinned',{commandId,pinned:true});request(owner,'commands.setAlias',{commandId,alias:'public calc'});
  const before=request(owner,'commands.getUsage',{commandId});await owner.confirmSuccessfulLaunch();await owner.close();
  const next=(await open(dir)).owner;expect(next.version).toBe(5);
  expect(request(next,'commands.getUsage',{commandId})).toEqual(before);expect(request(next,'commands.listHidden')).toEqual([]);
  const backupDirectory=join(dir,'backups'),journals=await Promise.all((await readdir(backupDirectory)).filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await readFile(join(backupDirectory,name),'utf8')) as {id:string;fromVersion:number;toVersion:number;state:string}));
  const migrated=journals.find(row=>row.fromVersion===4&&row.toVersion===5);expect(migrated?.state).toBe('awaiting-confirmation');
  const snapshot=new Database(join(backupDirectory,`${migrated!.id}.db`),{readonly:true});
  try{expect(snapshot.pragma('user_version',{simple:true})).toBe(4);expect(snapshot.prepare('SELECT use_count,pinned,alias FROM command_usage WHERE command_id=?').get(commandId)).toEqual({use_count:1,pinned:1,alias:'public calc'});expect(snapshot.prepare("SELECT name FROM sqlite_master WHERE name='command_visibility'").get()).toBeUndefined();}finally{snapshot.close();}
  request(next,'commands.setHidden',{commandId,hidden:true});await next.confirmSuccessfulLaunch();await next.close();
  expect(request((await open(dir)).owner,'commands.listHidden')).toEqual([commandId]);
});
it.each([{commandId:'linuxcast:open-url',hidden:true},{commandId:'linuxcast:calculator',hidden:false}])('rejects mismatched visibility acknowledgements without replay: %j',async result=>{
  let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[];
  const client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}});
  const pending=client.request('commands.setHidden',{commandId:'linuxcast:calculator',hidden:true}),envelope=sent[0] as {request:{requestId:string;method:string}};
  receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result}});
  await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(sent).toHaveLength(1);
});
it.each([['linuxcast:calculator','linuxcast:calculator'],['linuxcast:open-url','linuxcast:calculator'],['linuxcast:hide']].map(result=>({result})))('rejects invalid hidden collections without accepting stale or protected identities: %j',async({result})=>{
  let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[];
  const client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}});
  const pending=client.request('commands.listHidden',{}),envelope=sent[0] as {request:{requestId:string;method:string}};
  receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result}});
  await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(sent).toHaveLength(1);
});
