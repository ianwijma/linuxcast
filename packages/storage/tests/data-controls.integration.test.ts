import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { StorageOwner } from '../src/owner.ts';
import type { DataExportResult, DataClearResult } from '@linuxcast/platform-contracts/data-controls';
const dirs:string[]=[], owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function directory(){const dir=await mkdtemp(join(tmpdir(),'linuxcast-data-controls-'));dirs.push(dir);return dir;}
async function open(dir?:string){const owner=await StorageOwner.open({dataDirectory:dir??await directory(),applicationBuild:'synthetic-controls'});owners.push(owner);return owner;}
const request=(owner:StorageOwner,method:string,params:unknown)=>owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result;
const time='2026-01-01T00:00:00.000Z';
function conversation(){return {schemaVersion:1,id:randomUUID(),revision:1,title:'Synthetic conversation',projectId:null,pinned:false,archived:false,trashedAt:null,createdAt:time,modifiedAt:time};}
function message(conversationId:string,text='Synthetic fixture'){return {schemaVersion:1,id:randomUUID(),revision:1,conversationId,messageId:randomUUID(),branchId:randomUUID(),parentRevisionId:null,createdAt:time,modifiedAt:time,message:{role:'user',parts:[{type:'text',text}]}};}
function populate(owner:StorageOwner){
  request(owner,'settings.set',{id:'ui.theme',value:'dark',expectedRevision:0});
  request(owner,'commands.recordUse',{commandId:'builtin.fixture'});
  const ref={id:randomUUID(),ownerKind:'provider',ownerId:'fixture-provider',createdAt:time,updatedAt:time};request(owner,'secretRefs.put',{record:ref});
  const grant={schemaVersion:1,id:randomUUID(),principal:{kind:'builtin',id:'builtin.fixture'},declarationHash:'a'.repeat(64),permissionId:'files.read',scope:{kind:'resource',resourceId:'fixture-root'},decision:'allow',createdAt:time,updatedAt:time};request(owner,'permissions.put',{record:grant});
  return {ref,grant};
}
it('exports only allowlisted categories and selected records, never service references or grants',async()=>{
  const owner=await open(),{ref,grant}=populate(owner),a=conversation(),b=conversation();
  for(const c of [a,b]){request(owner,'ai.conversations.put',{record:c,expectedRevision:0});request(owner,'ai.messages.appendRevision',{record:message(c.id)});}
  const settings=request(owner,'dataControls.export',{category:'settings'}) as DataExportResult;
  expect(settings).toMatchObject({category:'settings',records:[{id:'ui.theme',value:'dark'}]});
  const exported=request(owner,'dataControls.export',{category:'ai-conversations',ids:[a.id]}) as Extract<DataExportResult,{category:'ai-conversations'}>;
  expect(exported.conversations).toEqual([a]);expect(exported.messageRevisions).toHaveLength(1);expect(exported.messageRevisions[0]!.conversationId).toBe(a.id);
  for(const category of ['settings','command-usage','ai-conversations']){
    const text=JSON.stringify(request(owner,'dataControls.export',{category}));expect(text).not.toContain(ref.id);expect(text).not.toContain(grant.id);
  }
  expect(request(owner,'dataControls.export',{category:'settings',ids:[]})).toEqual({category:'settings',records:[]});
  for(const params of [{category:'secretRefs'},{category:'permissions'},{category:'settings',ids:['provider.apiKey']},{category:'ai-conversations',ids:[a.id,a.id]}])expect(()=>request(owner,'dataControls.export',params)).toThrow();
});
it('deletes only selected conversations and their revision graph; other categories survive',async()=>{
  const owner=await open(),{ref}=populate(owner),a=conversation(),b=conversation();
  for(const c of [a,b])request(owner,'ai.conversations.put',{record:c,expectedRevision:0});
  const first=message(a.id);request(owner,'ai.messages.appendRevision',{record:first});
  request(owner,'ai.messages.appendRevision',{record:{...first,id:randomUUID(),revision:2,parentRevisionId:first.id}});
  request(owner,'ai.messages.appendRevision',{record:message(b.id)});
  expect(request(owner,'dataControls.clear',{category:'ai-conversations',ids:[]})).toEqual({category:'ai-conversations',removed:0,complete:true});
  expect(request(owner,'dataControls.clear',{category:'ai-conversations',ids:[a.id]})).toEqual({category:'ai-conversations',removed:1,complete:true});
  expect(request(owner,'ai.conversations.get',{id:a.id})).toBeNull();expect(request(owner,'ai.messages.list',{conversationId:a.id,limit:10})).toEqual([]);
  expect(request(owner,'ai.conversations.get',{id:b.id})).toEqual(b);expect(request(owner,'ai.messages.list',{conversationId:b.id,limit:10})).toHaveLength(1);
  expect(request(owner,'secretRefs.get',{id:ref.id})).toEqual(ref);expect(request(owner,'settings.get',{id:'ui.theme'})).toMatchObject({value:'dark'});
});
it('clears usage counters and timestamps while retaining user pins and aliases',async()=>{
  const first=await open();populate(first);request(first,'commands.recordUse',{commandId:'builtin.other'});await first.close();
  const db=new Database(join(first.directory,'linuxcast.db'));db.prepare('UPDATE command_usage SET pinned=1,alias=? WHERE command_id=?').run('fixture-alias','builtin.fixture');db.close();
  const owner=await open(first.directory);
  expect(request(owner,'dataControls.clear',{category:'command-usage',ids:['builtin.fixture']})).toEqual({category:'command-usage',removed:1,complete:true});
  expect(request(owner,'commands.getUsage',{commandId:'builtin.fixture'})).toEqual({commandId:'builtin.fixture',useCount:0,lastUsedAt:null,pinned:true,alias:'fixture-alias'});
  expect(request(owner,'commands.getUsage',{commandId:'builtin.other'})).toMatchObject({useCount:1});
  expect(request(owner,'dataControls.clear',{category:'command-usage',ids:['builtin.fixture']})).toMatchObject({removed:0});
  expect(request(owner,'dataControls.export',{category:'command-usage',ids:['builtin.fixture']})).toMatchObject({records:[{useCount:0,lastUsedAt:null,pinned:true}]});
});
it('clears derived file rows in bounded transactions, invalidates late batches and preserves selected roots and originals',async()=>{
  const owner=await open(),source=await directory();await writeFile(join(source,'original.txt'),'synthetic source');
  const root={id:randomUUID(),path:source,includeHidden:false,excludeGlobs:[],excludedDirectories:[],maxFileBytes:null},scanId=randomUUID();
  request(owner,'files.roots.put',{config:root});request(owner,'files.scan.begin',{rootId:root.id,scanId});
  for(let start=0;start<600;start+=200)request(owner,'files.scan.batch',{rootId:root.id,scanId,entries:Array.from({length:200},(_,i)=>({path:`synthetic${start+i}.txt`,kind:'file',size:0,modifiedMs:0,device:'1',inode:String(start+i)}))});
  request(owner,'files.scan.finish',{rootId:root.id,scanId,progress:{visited:600,indexed:600,excluded:0,denied:0,vanished:0,unsupported:0,watchFailures:0}});
  const next=randomUUID();request(owner,'files.scan.begin',{rootId:root.id,scanId:next});
  expect(request(owner,'dataControls.clear',{category:'file-index',ids:[root.id]}) as DataClearResult).toEqual({category:'file-index',removed:512,complete:false});
  expect(request(owner,'files.search',{query:'synthetic',limit:10})).toEqual([]);
  expect(()=>request(owner,'files.scan.batch',{rootId:root.id,scanId:next,entries:[]})).toThrow('conflict');
  expect(request(owner,'dataControls.clear',{category:'file-index',ids:[root.id]})).toEqual({category:'file-index',removed:88,complete:true});
  expect(request(owner,'files.roots.list',{})).toMatchObject([{config:root,state:'idle',generation:null}]);
  expect(await readFile(join(source,'original.txt'),'utf8')).toBe('synthetic source');
});
it('rejects oversized complete exports without returning a truncated conversation or mutating content',async()=>{
  const owner=await open(),large=conversation(),small=conversation();for(const c of [large,small])request(owner,'ai.conversations.put',{record:c,expectedRevision:0});
  for(let i=0;i<20;i++)request(owner,'ai.messages.appendRevision',{record:message(large.id,'x'.repeat(60_000))});
  expect(()=>request(owner,'dataControls.export',{category:'ai-conversations'})).toThrow('export-too-large');
  expect(request(owner,'dataControls.export',{category:'ai-conversations',ids:[small.id]})).toEqual({category:'ai-conversations',conversations:[small],messageRevisions:[]});
  expect(request(owner,'ai.conversations.get',{id:large.id})).toEqual(large);
});
