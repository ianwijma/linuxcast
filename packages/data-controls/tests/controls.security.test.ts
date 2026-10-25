import { afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,rm,readdir,readFile,writeFile,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { LocalDiagnostics } from '../src/diagnostics.ts';
import { planRetention,RETENTION_DEFAULTS } from '../src/retention.ts';
const directories:string[]=[];const services:LocalDiagnostics[]=[];
afterEach(async()=>{for(const service of services.splice(0))await service.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function setup(){const directory=await mkdtemp(join(tmpdir(),'linuxcast-controls-'));directories.push(directory);const service=await LocalDiagnostics.open(directory);services.push(service);return {service,directory};}
const now=Date.parse('2026-10-25T00:00:00.000Z');
const item=(id:string,ageDays:number,sizeBytes:number,pinned=false)=>({id,createdAt:new Date(now-ageDays*86400000).toISOString(),sizeBytes,pinned});
describe('F2-02 retention policy',()=>{
  it('keeps pinned clipboard content and blocks admission when pinned bytes exhaust budget',()=>{
    const policy={maxAgeMs:7*86400000,maxUnpinnedItems:1000,maxBytes:100};
    expect(planRetention([item('pin',30,100,true),item('recent',0,10)],policy,now)).toEqual({removeIds:['recent'],retainedBytes:100,pinnedBudgetExhausted:true});
  });
  it('evicts expired then oldest eligible items for count and byte budgets',()=>{
    const result=planRetention([item('new',1,60),item('expired',8,1),item('old',5,50),item('pin',30,1,true)],{maxAgeMs:7*86400000,maxUnpinnedItems:1,maxBytes:100},now);
    expect(result).toEqual({removeIds:['expired','old'],retainedBytes:61,pinnedBudgetExhausted:false});
  });
  it('counts only unpinned items toward clipboard count while all bytes count',()=>{
    expect(planRetention([item('pin',30,1,true),item('new',0,1)],{maxAgeMs:null,maxUnpinnedItems:1,maxBytes:2},now).removeIds).toEqual([]);
  });
  it('retains durable content when no automatic policy is selected',()=>{
    expect(planRetention([item('conversation',1000,100)],{maxAgeMs:null,maxUnpinnedItems:null,maxBytes:null},now).removeIds).toEqual([]);
  });
  it('rejects invalid inventories and leaves input records untouched',()=>{
    const records=[item('one',1,1)];const before=structuredClone(records);planRetention(records,RETENTION_DEFAULTS.applicationLogs,now);expect(records).toEqual(before);
    expect(()=>planRetention([records[0]!,records[0]!],RETENTION_DEFAULTS.applicationLogs,now)).toThrow();expect(()=>planRetention([item('../escape',1,1)],RETENTION_DEFAULTS.applicationLogs,now)).toThrow();expect(()=>planRetention([item('bad',1,-1)],RETENTION_DEFAULTS.applicationLogs,now)).toThrow();
  });
});
describe('F2-02 real private diagnostics',()=>{
  it('persists only metadata in private files and exports selected category',async()=>{
    const f=await setup();expect(await f.service.append('application-logs',{component:'secrets',event:'unavailable',reason:'insecure-backend'})).toMatchObject({outcome:'completed'});
    expect(await f.service.append('tool-diagnostics',{component:'ai',event:'cancelled',reason:'interrupted'})).toMatchObject({outcome:'completed'});
    const result=await f.service.export('application-logs');expect(result.outcome).toBe('completed');if(result.outcome!=='completed')throw new Error();expect(result.result.records).toHaveLength(1);expect(result.result.records[0]).toMatchObject({component:'secrets'});
    expect((await stat(join(f.directory,'diagnostics'))).mode&0o777).toBe(0o700);for(const name of await readdir(join(f.directory,'diagnostics')))expect((await stat(join(f.directory,'diagnostics',name))).mode&0o777).toBe(0o600);
    await f.service.close();const reopened=await LocalDiagnostics.open(f.directory);services.push(reopened);expect(await reopened.export('tool-diagnostics')).toMatchObject({outcome:'completed',result:{records:[{component:'ai'}]}});
  });
  it('rejects secrets/content/raw errors rather than serializing arbitrary fields',async()=>{
    const f=await setup();const seeded=`synthetic-${randomBytes(24).toString('hex')}`;
    for(const invalid of [{component:'secrets',event:'failed',message:seeded},{component:seeded,event:'failed'},{component:'secrets',event:'failed',reason:seeded},{component:'ai',event:'failed',error:new Error(seeded)}])expect(await f.service.append('application-logs',invalid)).toMatchObject({outcome:'unavailable'});
    expect(await readdir(join(f.directory,'diagnostics'))).toEqual([]);expect(JSON.stringify(await f.service.export('application-logs'))).not.toContain(seeded);
  });
  it('clear deletes only its named category and leaves unrelated files untouched',async()=>{
    const f=await setup();await f.service.append('application-logs',{component:'main',event:'started'});await f.service.append('tool-diagnostics',{component:'ai',event:'completed'});await writeFile(join(f.directory,'diagnostics','unrelated.txt'),'fixture',{mode:0o600});
    expect(await f.service.clear('application-logs')).toEqual({outcome:'completed',result:{removed:1}});expect(await f.service.export('tool-diagnostics')).toMatchObject({outcome:'completed',result:{records:[{component:'ai'}]}});expect(await readFile(join(f.directory,'diagnostics','unrelated.txt'),'utf8')).toBe('fixture');
  });
  it('prunes application logs at14days and traces at30days independently',async()=>{
    const f=await setup();await f.service.append('application-logs',{component:'main',event:'completed'});await f.service.append('tool-diagnostics',{component:'ai',event:'completed'});
    const future=Date.now()+15*86400000;expect(await f.service.prune('application-logs',future)).toMatchObject({outcome:'completed',result:{removed:1}});expect(await f.service.prune('tool-diagnostics',future)).toMatchObject({outcome:'completed',result:{removed:0}});
  });
  it('fails closed on corrupted owned records, with explicit category reset recovery',async()=>{
    const f=await setup();await f.service.append('application-logs',{component:'main',event:'started'});const [filename]=await readdir(join(f.directory,'diagnostics'));await writeFile(join(f.directory,'diagnostics',filename!),'{"private":"fixture"}',{mode:0o600});
    expect(await f.service.export('application-logs')).toEqual({outcome:'unavailable',reason:'diagnostics-unavailable',remediationAction:'reset-diagnostics'});expect(await f.service.clear('application-logs')).toMatchObject({outcome:'completed',result:{removed:1}});expect(await f.service.export('application-logs')).toMatchObject({outcome:'completed',result:{records:[]}});
  });
});
