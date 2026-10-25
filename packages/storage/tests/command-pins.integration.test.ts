import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { StorageOwner } from '../src/owner.ts';
const directories:string[]=[], owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function open(directory?:string){const dir=directory??await mkdtemp(join(tmpdir(),'linuxcast-command-pins-'));if(!directory)directories.push(dir);const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:'synthetic-command-pins'});owners.push(owner);return {owner,dir};}
function request(owner:StorageOwner,method:string,params:unknown){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result;}
describe('L1-01 atomic command pin persistence',()=>{
  it('pins an unused command without recording a run and persists across owner restart',async()=>{
    const {owner,dir}=await open();
    expect(request(owner,'commands.setPinned',{commandId:'linuxcast:hide',pinned:true})).toEqual({commandId:'linuxcast:hide',pinned:true,useCount:0,lastUsedAt:null,alias:null});
    await owner.confirmSuccessfulLaunch();await owner.close();const next=await open(dir);
    expect(request(next.owner,'commands.getUsage',{commandId:'linuxcast:hide'})).toMatchObject({pinned:true,useCount:0,lastUsedAt:null});
    expect(request(next.owner,'commands.setPinned',{commandId:'linuxcast:hide',pinned:false})).toMatchObject({pinned:false,useCount:0,lastUsedAt:null});
  });
  it('preserves aliases and usage while pinning, unpinning and clearing only usage',async()=>{
    const {owner,dir}=await open();request(owner,'commands.recordUse',{commandId:'linuxcast:hide'});await owner.confirmSuccessfulLaunch();await owner.close();
    // Offline synthetic fixture only. Production updates still use the sole owner.
    const fixture=new Database(join(dir,'linuxcast.db'));fixture.prepare('UPDATE command_usage SET alias=? WHERE command_id=?').run('fixture-hide','linuxcast:hide');fixture.close();
    const next=(await open(dir)).owner,before=request(next,'commands.getUsage',{commandId:'linuxcast:hide'});
    expect(request(next,'commands.setPinned',{commandId:'linuxcast:hide',pinned:true})).toEqual({...before as object,pinned:true});
    request(next,'commands.recordUse',{commandId:'linuxcast:hide'});
    request(next,'dataControls.clear',{category:'command-usage',ids:['linuxcast:hide']});
    expect(request(next,'commands.getUsage',{commandId:'linuxcast:hide'})).toMatchObject({pinned:true,useCount:0,lastUsedAt:null,alias:'fixture-hide'});
    expect(request(next,'commands.setPinned',{commandId:'linuxcast:hide',pinned:false})).toMatchObject({pinned:false,useCount:0,lastUsedAt:null,alias:'fixture-hide'});
  });
  it('serializes repeated pins with usage writes without losing count or changing other commands',async()=>{
    const {owner}=await open();request(owner,'commands.recordUse',{commandId:'linuxcast:quit'});
    for(let index=0;index<20;index++){request(owner,'commands.recordUse',{commandId:'linuxcast:hide'});request(owner,'commands.setPinned',{commandId:'linuxcast:hide',pinned:index%2===1});}
    expect(request(owner,'commands.getUsage',{commandId:'linuxcast:hide'})).toMatchObject({pinned:true,useCount:20});
    expect(request(owner,'commands.getUsage',{commandId:'linuxcast:quit'})).toMatchObject({pinned:false,useCount:1});
  });
  it('rejects coerced booleans, invalid identities and extra fields before mutation',async()=>{
    const {owner}=await open();
    for(const params of [{commandId:'linuxcast:hide',pinned:1},{commandId:'linuxcast:hide',pinned:'true'},{commandId:'../private',pinned:true},{commandId:'linuxcast:hide',pinned:true,useCount:900}])expect(()=>request(owner,'commands.setPinned',params)).toThrow();
    expect(request(owner,'commands.getUsage',{commandId:'linuxcast:hide'})).toBeNull();
  });
});
