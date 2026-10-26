import { afterEach,expect,it,vi } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileCandidate,IndexEntry } from '@linuxcast/file-index/contracts';
import type { FileSearchOptions } from '@linuxcast/contracts';
import { StorageOwner } from '../src/owner.ts';
import { createStorageClient } from '../src/client.ts';
const owners:StorageOwner[]=[],directories:string[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const path of directories.splice(0))await rm(path,{recursive:true,force:true});});
function request(owner:StorageOwner,method:string,params:unknown){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result;}
const progress=(n:number)=>({visited:n,indexed:n,excluded:0,denied:0,vanished:0,unsupported:0,watchFailures:0});
async function fixture(){
  const path=await mkdtemp(join(tmpdir(),'linuxcast-search-options-'));directories.push(path);const owner=await StorageOwner.open({dataDirectory:path,applicationBuild:'synthetic-search-options'});owners.push(owner);
  const rootId='11111111-1111-4111-8111-111111111111',generation='33333333-3333-4333-8333-333333333333';
  const put=(id:string,entries:IndexEntry[])=>{
    request(owner,'files.roots.put',{config:{id,path:'/public-fixture/'+id,includeHidden:false,excludeGlobs:[],excludedDirectories:[],maxFileBytes:null}});
    request(owner,'files.scan.begin',{rootId:id,scanId:generation});request(owner,'files.scan.batch',{rootId:id,scanId:generation,entries});request(owner,'files.scan.finish',{rootId:id,scanId:generation,progress:progress(entries.length)});
  };
  const entries=Array.from({length:130},(_,i):IndexEntry=>({path:`match${String(i).padStart(3,'0')}.txt`,kind:i%2===0?'file':'directory',size:i,modifiedMs:i-65,device:'1',inode:String(i+1)}));
  put(rootId,entries);
  const search=(options?:FileSearchOptions,limit=100)=>request(owner,'files.search',{query:'match',rootId,limit,...(options?{options}:{})}) as FileCandidate[];
  return {owner,rootId,generation,entries,put,search};
}
it('orders the entire matching set before LIMIT and keeps deterministic name/numeric ties',async()=>{
  const f=await fixture();expect(f.search()).toHaveLength(100);
  const newest=f.search({sort:'modified-desc'});expect(newest).toHaveLength(100);expect(newest[0]?.path).toBe('match129.txt');expect(newest.at(-1)?.path).toBe('match030.txt');
  expect(f.search({sort:'size-desc'},3).map(row=>row.path)).toEqual(['match129.txt','match128.txt','match127.txt']);
  expect(f.search({sort:'name'},3).map(row=>row.path)).toEqual(['match000.txt','match001.txt','match002.txt']);
  const other='22222222-2222-4222-8222-222222222222';f.put(other,[{path:'match000.txt',kind:'file',size:0,modifiedMs:-65,device:'1',inode:'999'}]);
  const ties=request(f.owner,'files.search',{query:'match000',limit:10,options:{sort:'name'}}) as FileCandidate[];expect(ties.map(row=>row.rootId)).toEqual([f.rootId,other]);
  expect(f.search({sort:'relevance'},3).map(row=>row.path)).toEqual(f.search(undefined,3).map(row=>row.path));
});
it('filters across the full set before LIMIT, with inclusive from/exclusive before, negative dates and epoch zero',async()=>{
  const f=await fixture();const options:FileSearchOptions={sort:'modified-desc',kind:'directory',modifiedFromMs:60,modifiedBeforeMs:65};
  expect(f.search(options).map(row=>[row.path,row.modifiedMs])).toEqual([['match129.txt',64],['match127.txt',62],['match125.txt',60]]);
  expect(f.search({sort:'name',modifiedFromMs:0,modifiedBeforeMs:1}).map(row=>row.modifiedMs)).toEqual([0]);
  expect(f.search({sort:'name',modifiedFromMs:-2,modifiedBeforeMs:0}).map(row=>row.modifiedMs)).toEqual([-2,-1]);
  expect(f.search({sort:'name',kind:'file',modifiedFromMs:60,modifiedBeforeMs:61})).toEqual([]);
  expect(f.search({sort:'size-desc',kind:'file'},3).map(row=>row.path)).toEqual(['match128.txt','match126.txt','match124.txt']);
});
it('rejects invalid/extra/injected option fields and keeps root/generation scope with staged data excluded',async()=>{
  const f=await fixture();for(const options of [{sort:'size DESC;DROP TABLE file_index_entries'},{sort:'name',where:'private'},{sort:'name',modifiedFromMs:2,modifiedBeforeMs:2},{sort:'name',modifiedFromMs:'0'},{sort:'name',modifiedBeforeMs:Number.MAX_SAFE_INTEGER+1},{sort:'name',kind:'symlink'}])expect(()=>request(f.owner,'files.search',{query:'match',limit:10,options})).toThrow();
  const next=randomUUID();request(f.owner,'files.scan.begin',{rootId:f.rootId,scanId:next});request(f.owner,'files.scan.batch',{rootId:f.rootId,scanId:next,entries:[{path:'match-future.txt',kind:'file',size:10000,modifiedMs:10000,device:'1',inode:'999'}]});
  expect(f.search({sort:'size-desc'},1)[0]?.path).toBe('match129.txt');expect(f.search({sort:'size-desc',modifiedFromMs:1000})).toEqual([]);
  request(f.owner,'files.scan.finish',{rootId:f.rootId,scanId:next,progress:progress(1)});expect(f.search({sort:'size-desc'},1)[0]?.path).toBe('match-future.txt');
});
it('rejects completed storage replies outside requested kind/date constraints without replay',async()=>{
  const rootId='11111111-1111-4111-8111-111111111111',generation='33333333-3333-4333-8333-333333333333';
  for(const mismatch of [{kind:'directory',modifiedMs:1},{kind:'file',modifiedMs:-1},{kind:'file',modifiedMs:2}] as const){
    let receive!:(value:unknown)=>void;const send=vi.fn(),client=createStorageClient({send,onMessage:listener=>{receive=listener;return()=>{};}});
    const pending=client.request('files.search',{query:'match',limit:10,options:{sort:'name',kind:'file',modifiedFromMs:0,modifiedBeforeMs:2}});
    const envelope=send.mock.calls[0]![0] as {request:{requestId:string;method:string}};receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result:[{rootId,rootPath:'/public-fixture',generation,id:rootId+':match.txt',path:'match.txt',size:1,device:'1',inode:'1',...mismatch}]}});
    await expect(pending).rejects.toMatchObject({automaticReplay:false});expect(send).toHaveBeenCalledTimes(1);client.disconnect();
  }
});

it('browses actual indexed direct children before LIMIT without treating wildcard names as SQL or reading sources',async()=>{
  const f=await fixture();
  const generation=randomUUID(),paths=['match folder','match folder/child.txt','match folder/nested','match folder/nested/deep.txt','match folders/sibling.txt','literal%_quote"/match.txt'];
  const entries=[...f.entries,...paths.map((path,i):IndexEntry=>({path,kind:path.includes('.')?'file':'directory',size:200+i,modifiedMs:100+i,device:'1',inode:String(500+i)}))];
  request(f.owner,'files.scan.begin',{rootId:f.rootId,scanId:generation});request(f.owner,'files.scan.batch',{rootId:f.rootId,scanId:generation,entries});request(f.owner,'files.scan.finish',{rootId:f.rootId,scanId:generation,progress:progress(entries.length)});
  const browse=(directory:string,query='',options:FileSearchOptions={sort:'name'})=>request(f.owner,'files.search',{rootId:f.rootId,directory,query,options,limit:100}) as FileCandidate[];
  expect(browse('match folder').map(row=>row.path)).toEqual(['match folder/child.txt','match folder/nested']);
  expect(browse('match folder','nested').map(row=>row.path)).toEqual(['match folder/nested']);
  expect(browse('match folder/nested').map(row=>row.path)).toEqual(['match folder/nested/deep.txt']);
  expect(browse('literal%_quote"').map(row=>row.path)).toEqual(['literal%_quote"/match.txt']);
  expect(browse('missing')).toEqual([]);expect(browse('match folder','!!!')).toEqual([]);
  const top=browse('','',{sort:'size-desc'});expect(top).toHaveLength(100);expect(top[0]?.path).toBe('match folder');expect(top.every(row=>!row.path.includes('/'))).toBe(true);
  expect(browse('match folder','',{sort:'name',kind:'file',modifiedFromMs:101,modifiedBeforeMs:102}).map(row=>row.path)).toEqual(['match folder/child.txt']);
  expect(()=>request(f.owner,'files.search',{query:'',directory:'',limit:100})).toThrow();
});
