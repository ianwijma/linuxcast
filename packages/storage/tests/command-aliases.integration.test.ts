import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStorageClient } from '../src/client.ts';
import { StorageOwner } from '../src/owner.ts';
const directories:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function open(directory?:string){const dir=directory??await mkdtemp(join(tmpdir(),'linuxcast-alias-'));if(!directory)directories.push(dir);const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:'synthetic-alias'});owners.push(owner);return {owner,dir};}
function request(owner:StorageOwner,method:string,params:unknown){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result;}
it('saves/removes alias across real owner restart without counting a use',async()=>{
  const {owner,dir}=await open();
  expect(request(owner,'commands.setAlias',{commandId:'linuxcast:hide',alias:'public alias'})).toEqual({commandId:'linuxcast:hide',alias:'public alias',pinned:false,useCount:0,lastUsedAt:null});
  await owner.confirmSuccessfulLaunch();await owner.close();const next=(await open(dir)).owner;
  expect(request(next,'commands.getUsage',{commandId:'linuxcast:hide'})).toMatchObject({alias:'public alias',useCount:0,lastUsedAt:null});
  expect(request(next,'commands.setAlias',{commandId:'linuxcast:hide',alias:null})).toMatchObject({alias:null,useCount:0,lastUsedAt:null});
});
it('preserves pins/usage and other commands; usage clearing retains alias',async()=>{
  const {owner}=await open();request(owner,'commands.recordUse',{commandId:'linuxcast:hide'});request(owner,'commands.setPinned',{commandId:'linuxcast:hide',pinned:true});
  request(owner,'commands.setAlias',{commandId:'linuxcast:quit',alias:'public quit'});
  const before=request(owner,'commands.getUsage',{commandId:'linuxcast:hide'});
  expect(request(owner,'commands.setAlias',{commandId:'linuxcast:hide',alias:'public hide'})).toEqual({...before as object,alias:'public hide'});
  request(owner,'dataControls.clear',{category:'command-usage',ids:['linuxcast:hide']});
  expect(request(owner,'commands.getUsage',{commandId:'linuxcast:hide'})).toMatchObject({alias:'public hide',pinned:true,useCount:0,lastUsedAt:null});
  expect(request(owner,'commands.getUsage',{commandId:'linuxcast:quit'})).toMatchObject({alias:'public quit',useCount:0});
});
it('refuses oversized/control/untrimmed/extra-field alias changes before writing',async()=>{
  const {owner}=await open();for(const alias of ['', ' leading','trailing ','x'.repeat(65),'private\ntext','\u0085','😀'.repeat(65), '\ud800'])expect(()=>request(owner,'commands.setAlias',{commandId:'linuxcast:hide',alias})).toThrow();
  expect(()=>request(owner,'commands.setAlias',{commandId:'linuxcast:hide',alias:'valid',pinned:true})).toThrow();
  expect(request(owner,'commands.getUsage',{commandId:'linuxcast:hide'})).toBeNull();
  expect(request(owner,'commands.setAlias',{commandId:'linuxcast:hide',alias:'😀'.repeat(64)})).toMatchObject({alias:'😀'.repeat(64)});
});
it.each([{commandId:'linuxcast:quit',alias:'public'},{commandId:'linuxcast:hide',alias:'different'}])('rejects mismatched alias acknowledgement without replay: %j',async result=>{
  let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[];const client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}});
  const pending=client.request('commands.setAlias',{commandId:'linuxcast:hide',alias:'public'}),envelope=sent[0] as {request:{requestId:string;method:string}};
  receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result:{...result,useCount:0,lastUsedAt:null,pinned:false}}});
  await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(sent).toHaveLength(1);
});
