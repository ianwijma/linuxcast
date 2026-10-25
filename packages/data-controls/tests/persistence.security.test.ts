import { afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,rm,writeFile,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataControls } from '../src/controller.ts';
import { openFixtureOwner } from '../../secrets/tests/owner-fixture.ts';
const directories:string[]=[],owners:Awaited<ReturnType<typeof openFixtureOwner>>[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function setup(){const directory=await mkdtemp(join(tmpdir(),'linuxcast-data-controls-owner-'));directories.push(directory);const owner=await openFixtureOwner(directory);owners.push(owner);return {...owner,directory,controls:new DataControls(owner.client)};}
describe('F2-02 category controls with actual child owner',()=>{
  it('exports selected public settings and clears only selected usage while preserving settings, other usage and secret references',async()=>{
    const f=await setup(),id=randomUUID(),at=new Date().toISOString();await f.client.request('settings.set',{id:'ui.theme',expectedRevision:0,value:'dark'});
    await f.client.request('commands.recordUse',{commandId:'fixture.one'});await f.client.request('commands.recordUse',{commandId:'fixture.two'});
    await f.client.request('secretRefs.put',{record:{id,ownerKind:'provider',ownerId:'synthetic-provider',createdAt:at,updatedAt:at}});
    expect(await f.controls.export({category:'settings',ids:['ui.theme']})).toMatchObject({outcome:'exported',data:{category:'settings',records:[{id:'ui.theme',value:'dark'}]}});
    expect(await f.controls.clear({category:'command-usage',ids:['fixture.one']})).toEqual({outcome:'completed',category:'command-usage',removed:1});
    expect(await f.client.request('commands.getUsage',{commandId:'fixture.one'})).toMatchObject({useCount:0,lastUsedAt:null});expect(await f.client.request('commands.getUsage',{commandId:'fixture.two'})).toMatchObject({useCount:1});expect(await f.client.request('secretRefs.get',{id})).not.toBeNull();expect(await f.client.request('settings.get',{id:'ui.theme'})).toMatchObject({value:'dark'});
    expect(await f.controls.export({category:'command-usage',ids:[]})).toMatchObject({outcome:'exported',data:{records:[]}});
  });
  it('stops the registered producer, deletes multiple real index batches, invalidates late writes and preserves roots/source files',async()=>{
    const f=await setup(),rootId=randomUUID(),scanId=randomUUID(),source=join(f.directory,'synthetic-source.txt');await writeFile(source,'synthetic source');
    await f.client.request('files.roots.put',{config:{id:rootId,path:f.directory,includeHidden:false,excludeGlobs:[],excludedDirectories:[],maxFileBytes:null}});await f.client.request('files.scan.begin',{rootId,scanId});
    for(let offset=0;offset<600;offset+=200)await f.client.request('files.scan.batch',{rootId,scanId,entries:Array.from({length:200},(_,i)=>({path:`fixture-${offset+i}.txt`,kind:'file',size:1,modifiedMs:0,device:'1',inode:String(offset+i+1)}))});
    let stopped=false;f.controls.registerIndexJob(rootId,{stop:async()=>{stopped=true;}});
    expect(await f.controls.clear({category:'file-index',ids:[rootId]})).toEqual({outcome:'completed',category:'file-index',removed:600});expect(stopped).toBe(true);
    await expect(f.client.request('files.scan.batch',{rootId,scanId,entries:[{path:'late.txt',kind:'file',size:1,modifiedMs:0,device:'1',inode:'999'}]})).rejects.toMatchObject({reasonCode:'conflict'});
    expect(await f.client.request('files.search',{query:'fixture',rootId,limit:100})).toEqual([]);expect(await f.client.request('files.roots.list',{})).toMatchObject([{config:{id:rootId,path:f.directory},state:'idle',generation:null}]);expect(await readFile(source,'utf8')).toBe('synthetic source');
  });
  it('returns an explicit unknown-effect result on actual owner disconnect without replay',async()=>{
    const f=await setup();await f.close();expect(await f.controls.clear({category:'command-usage'})).toMatchObject({outcome:'unavailable',reason:'storage-unavailable',mayHaveChanged:true,automaticReplay:false});expect(await f.controls.export({category:'settings'})).toMatchObject({outcome:'unavailable',reason:'storage-unavailable'});
  });
});
