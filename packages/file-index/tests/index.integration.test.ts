import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rename,rm,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import type Database from 'better-sqlite3';
import {RootIndexer,NativeIndexSession} from '../src/index.ts';
import type {IndexUpdate} from '../src/index.ts';
import {dispatchFileIndex,FILE_INDEX_SCHEMA_SQL,recoverFileIndex} from '../src/repository.ts';
import {fileIndexSchemas,rootConfigSchema} from '../src/contracts.ts';
import type {FileIndexMethod,FileIndexMethods,IndexStorage,RootConfig,ScanProgress} from '../src/contracts.ts';

const require=createRequire(new URL('../../storage/package.json',import.meta.url));
const Sqlite=require('better-sqlite3') as typeof Database;
const executable=resolve('target/debug/linuxcast-platform');
const dirs:string[]=[],databases:Database.Database[]=[],indexers:RootIndexer[]=[],sessions:NativeIndexSession[]=[];
beforeAll(() => {
  const result=spawnSync('cargo',['build','--locked','--offline','-p','linuxcast-platform'],{encoding:'utf8',timeout:60_000});
  expect(result.status,result.stderr).toBe(0);
},65_000);
afterEach(async () => {
  for(const indexer of indexers.splice(0)) await indexer.stop();
  for(const session of sessions.splice(0)) await session.close();
  for(const db of databases.splice(0)) db.close();
  for(const dir of dirs.splice(0)) await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  vi.restoreAllMocks();
});
afterAll(() => expect(indexers).toHaveLength(0));
async function directory() {const dir=await mkdtemp(join(tmpdir(),'linuxcast-index-'));dirs.push(dir);return dir;}
function config(path:string):RootConfig {return {id:randomUUID(),path,includeHidden:false,excludeGlobs:[],excludedDirectories:[],maxFileBytes:null};}
async function storage() {
  const dir=await directory(); const db=new Sqlite(join(dir,'index.db'));databases.push(db);
  db.pragma('foreign_keys=ON');db.pragma('journal_mode=WAL');db.pragma('synchronous=FULL');db.pragma('trusted_schema=OFF');
  db.exec(FILE_INDEX_SCHEMA_SQL);
  const adapter:IndexStorage={request:async <M extends FileIndexMethod>(method:M,params:FileIndexMethods[M]['params']) =>
    dispatchFileIndex(db,method,params) as FileIndexMethods[M]['result']};
  return {db,adapter};
}
async function index(root:RootConfig,adapter:IndexStorage,updates:IndexUpdate[]=[]) {
  const job=await RootIndexer.create(adapter,root,executable,u=>updates.push(u));indexers.push(job);return job;
}
const progress=(indexed:number):ScanProgress=>({visited:indexed,indexed,excluded:0,denied:0,vanished:0,unsupported:0,watchFailures:0});
describe('L2-01 native selected-root metadata and sole-owner repository',()=>{
  it('honours hidden/glob/size/excluded roots, refuses symlinks, and does not read file contents',async()=>{
    const dir=await directory();await mkdir(join(dir,'skip'));await mkdir(join(dir,'nested'));
    await Promise.all(['visible.txt','.hidden','ignored.tmp','skip/secret.txt','nested/ignored.tmp'].map(p=>writeFile(join(dir,p),'synthetic')));
    await writeFile(join(dir,'large.txt'),'x'.repeat(100));await symlink(dir,join(dir,'loop'));
    const root={...config(dir),excludeGlobs:['**/*.tmp'],excludedDirectories:['skip'],maxFileBytes:20};
    const {adapter,db}=await storage();const updates:IndexUpdate[]=[];await (await index(root,adapter,updates)).reconcile();
    const rows=db.prepare('SELECT path FROM file_index_entries ORDER BY path').all();
    expect(rows).toEqual([{path:'nested'},{path:'visible.txt'}]);
    expect(await adapter.request('files.search',{query:'visible',limit:20})).toMatchObject([{path:'visible.txt',rootId:root.id}]);
    expect(updates.at(-1)).toMatchObject({state:'settled',root:{state:'ready'}});
    expect(db.pragma('trusted_schema',{simple:true})).toBe(0);
  });
  it('a real unreadable subtree does not stall other files and recovers after access returns',async()=>{
    expect(process.getuid?.()).not.toBe(0);
    const dir=await directory();await mkdir(join(dir,'denied'));await writeFile(join(dir,'denied/private.txt'),'synthetic');await writeFile(join(dir,'okay.txt'),'synthetic');
    await chmod(join(dir,'denied'),0o000);
    const {adapter}=await storage();const root=config(dir);const updates:IndexUpdate[]=[];const job=await index(root,adapter,updates);
    try {
      await job.reconcile();
      expect(await adapter.request('files.search',{query:'okay',limit:20})).toHaveLength(1);
      expect(await adapter.request('files.search',{query:'private',limit:20})).toHaveLength(0);
      expect(updates.at(-1)).toMatchObject({state:'settled',root:{state:'degraded',progress:{denied:1}}});
    } finally {await chmod(join(dir,'denied'),0o700);}
    await job.reconcile();expect(await adapter.request('files.search',{query:'private',limit:20})).toHaveLength(1);
  });
  it('inotify detects rename/deletion and reconciliation returns only their actual current paths',async()=>{
    const dir=await directory();await writeFile(join(dir,'before.txt'),'synthetic');await writeFile(join(dir,'deleted.txt'),'synthetic');
    const {adapter}=await storage();const root=config(dir);const job=await index(root,adapter);await job.reconcile();
    job.startWatching({pollMs:100,reconcileMs:10_000});
    await rename(join(dir,'before.txt'),join(dir,'after.txt'));await rm(join(dir,'deleted.txt'));
    await expect.poll(async()=> (await adapter.request('files.search',{query:'after',limit:20})).length,{timeout:5000}).toBe(1);
    expect(await adapter.request('files.search',{query:'before deleted',limit:20})).toHaveLength(0);
    expect(await adapter.request('files.search',{query:'deleted',limit:20})).toHaveLength(0);
  });
  it('cancellation discards staging, preserves the last published generation, and stops the child',async()=>{
    const dir=await directory();await writeFile(join(dir,'keep.txt'),'synthetic');const {adapter}=await storage();const root=config(dir);
    const job=await index(root,adapter);await job.reconcile();const previous=(await adapter.request('files.roots.list',{}))[0]!.generation;
    await Promise.all(Array.from({length:300},(_,i)=>writeFile(join(dir,`extra${i}.txt`),'')));
    const cancel=new AbortController();const cancelled=await RootIndexer.create(adapter,root,executable,u=>{if(u.state==='scanning')cancel.abort();});indexers.push(cancelled);
    await cancelled.reconcile(cancel.signal);
    expect((await adapter.request('files.roots.list',{}))[0]!.generation).toBe(previous);
    expect(await adapter.request('files.search',{query:'extra',limit:20})).toHaveLength(0);
    await cancelled.stop();
  });
  it('root removal hides old results and a safe explicit retry indexes its replacement',async()=>{
    const dir=await directory();const selected=join(dir,'selected');await mkdir(selected);await writeFile(join(selected,'old.txt'),'');
    const {adapter}=await storage();const root=config(selected);const updates:IndexUpdate[]=[];const job=await index(root,adapter,updates);await job.reconcile();
    await rename(selected,join(dir,'moved'));await mkdir(selected);await writeFile(join(selected,'new.txt'),'');
    await job.reconcile();expect(updates.at(-1)).toEqual({state:'unavailable'});
    expect(await adapter.request('files.search',{query:'old',limit:20})).toHaveLength(0);
    const retry=randomUUID();await adapter.request('files.scan.begin',{rootId:root.id,scanId:retry});
    expect(await adapter.request('files.search',{query:'old',limit:20})).toHaveLength(0);
    await adapter.request('files.scan.abort',{rootId:root.id,scanId:retry,unavailable:false});
    await job.reconcile();expect(await adapter.request('files.search',{query:'new',limit:20})).toHaveLength(1);
  });
  it('actual inotify queue overflow is detected and a full rescan recovers current names',async()=>{
    const dir=await directory();await writeFile(join(dir,'before.txt'),'');
    const {adapter}=await storage();const root=config(dir);const job=await index(root,adapter);await job.reconcile();
    const session=await NativeIndexSession.open(executable,root);sessions.push(session);
    for await (const event of session.scan(randomUUID())) expect(['batch','finished']).toContain(event.kind);
    // Public kernel limit only; never mutate it. Distinct synthetic names avoid
    // inotify's adjacent-identical-event coalescing.
    const queueSize=Number(await readFile('/proc/sys/fs/inotify/max_queued_events','utf8'));
    expect(queueSize).toBeGreaterThan(0);expect(queueSize).toBeLessThanOrEqual(262_144);
    const count=Math.ceil(queueSize/2)+100;
    for(let start=0;start<count;start+=100) await Promise.all(Array.from({length:Math.min(100,count-start)},(_,n)=>writeFile(join(dir,`overflow${start+n}.txt`),'')));
    await rename(join(dir,'before.txt'),join(dir,'after.txt'));
    expect(await session.poll()).toMatchObject({dirty:true,overflow:true});
    job.startWatching({pollMs:100,reconcileMs:60_000});
    await expect.poll(async()=> (await adapter.request('files.search',{query:'after',limit:20})).length,{timeout:15_000}).toBe(1);
    expect(await adapter.request('files.search',{query:'before',limit:20})).toHaveLength(0);
  },60_000);
  it('schema and generation guards reject unsafe input and interrupted scans never publish',async()=>{
    const root=config(await directory());const {db,adapter}=await storage();await adapter.request('files.roots.put',{config:root});
    const scanId=randomUUID();await adapter.request('files.scan.begin',{rootId:root.id,scanId});
    await expect(adapter.request('files.scan.batch',{rootId:root.id,scanId:randomUUID(),entries:[]})).rejects.toThrow();
    await expect(adapter.request('files.scan.finish',{rootId:root.id,scanId,progress:progress(1)})).rejects.toThrow();
    expect(()=>rootConfigSchema.parse({...root,path:root.path+'/../outside'})).toThrow();
    expect(()=>rootConfigSchema.parse({...root,excludeGlobs:['[abc]']})).toThrow();
    expect(()=>fileIndexSchemas['files.scan.batch'].params.parse({rootId:root.id,scanId,entries:[{path:'../escape'}]})).toThrow();
    recoverFileIndex(db);expect((await adapter.request('files.roots.list',{}))[0]).toMatchObject({generation:null,state:'idle'});
    await adapter.request('files.scan.begin',{rootId:root.id,scanId:randomUUID()});
  });
  it('large multibyte candidates remain useful and byte bounded; abort retains degraded state',async()=>{
    const {adapter,db}=await storage();const root=config('/'+Array.from({length:500},()=> 'segment').join('/'));await adapter.request('files.roots.put',{config:root});
    const scanId=randomUUID();await adapter.request('files.scan.begin',{rootId:root.id,scanId});
    const entries=Array.from({length:100},(_,i)=>({path:`match${i}/${Array.from({length:16},()=> '界'.repeat(80)).join('/')}`,kind:'file' as const,size:0,modifiedMs:0,device:'1',inode:String(i)}));
    await adapter.request('files.scan.batch',{rootId:root.id,scanId,entries});
    await adapter.request('files.scan.finish',{rootId:root.id,scanId,progress:{...progress(100),denied:1}});
    const hits=await adapter.request('files.search',{query:'match',limit:100});
    expect(hits.length).toBeGreaterThan(0);expect(hits.length).toBeLessThan(100);
    expect(Buffer.byteLength(JSON.stringify(hits))).toBeLessThanOrEqual(1024*1024-8192);
    const aborted=randomUUID();await adapter.request('files.scan.begin',{rootId:root.id,scanId:aborted});
    await adapter.request('files.scan.abort',{rootId:root.id,scanId:aborted,unavailable:false});
    expect((await adapter.request('files.roots.list',{}))[0]!.state).toBe('degraded');
    const crash=randomUUID();await adapter.request('files.scan.begin',{rootId:root.id,scanId:crash});recoverFileIndex(db);
    const next=randomUUID();await adapter.request('files.scan.begin',{rootId:root.id,scanId:next});await adapter.request('files.scan.abort',{rootId:root.id,scanId:next,unavailable:false});
    expect((await adapter.request('files.roots.list',{}))[0]!.state).toBe('degraded');
  });
  it('duplicate batches roll back metadata and FTS together, and removal only prunes derived rows',async()=>{
    const dir=await directory();await writeFile(join(dir,'original.txt'),'synthetic private contents');const {adapter,db}=await storage();const root=config(dir);
    const job=await index(root,adapter);await job.reconcile();const scanId=randomUUID();await adapter.request('files.scan.begin',{rootId:root.id,scanId});
    const entry={path:'duplicate.txt',kind:'file' as const,size:0,modifiedMs:0,device:'1',inode:'1'};
    await expect(adapter.request('files.scan.batch',{rootId:root.id,scanId,entries:[entry,entry]})).rejects.toThrow();
    expect(db.prepare('SELECT path FROM file_index_entries WHERE generation=?').all(scanId)).toEqual([]);
    db.prepare("INSERT INTO file_index_fts(file_index_fts,rank) VALUES('integrity-check',1)").run();
    await adapter.request('files.roots.remove',{rootId:root.id});
    expect(await adapter.request('files.search',{query:'original',limit:20})).toEqual([]);
    await adapter.request('files.scan.prune',{rootId:root.id});
    expect(await readFile(join(dir,'original.txt'),'utf8')).toBe('synthetic private contents');
    expect(await adapter.request('files.roots.list',{})).toEqual([]);
  });
  it('storage abort failure still awaits real native child teardown and preserves the error',async()=>{
    const dir=await directory();await writeFile(join(dir,'fixture.txt'),'');const {adapter}=await storage();
    const failure=new Error('Synthetic storage unavailable.');
    const broken:IndexStorage={request:async(method,params)=>{
      if(method==='files.scan.finish'||method==='files.scan.abort') throw failure;
      return adapter.request(method,params);
    }};
    const close=vi.spyOn(NativeIndexSession.prototype,'close');
    const job=await index(config(dir),broken);
    await expect(job.reconcile()).rejects.toBe(failure);
    expect(close).toHaveBeenCalled();await Promise.all(close.mock.results.map(result=>result.value));
    await job.stop();
  });
  it('stop closes an existing native session when the next storage begin rejects',async()=>{
    const dir=await directory();await writeFile(join(dir,'fixture.txt'),'');const {adapter}=await storage();
    const failure=new Error('Synthetic storage unavailable.');let broken=false;
    const connection:IndexStorage={request:async(method,params)=>{
      if(broken&&method==='files.scan.begin') throw failure;
      return adapter.request(method,params);
    }};
    const job=await index(config(dir),connection);await job.reconcile();
    const close=vi.spyOn(NativeIndexSession.prototype,'close');broken=true;
    const run=job.reconcile();const stopped=job.stop();
    await expect(run).rejects.toBe(failure);await expect(stopped).rejects.toBe(failure);
    expect(close).toHaveBeenCalled();await Promise.all(close.mock.results.map(result=>result.value));
  });
  it('storage prune failure after publication also closes the retained watcher',async()=>{
    const dir=await directory();await writeFile(join(dir,'fixture.txt'),'');const {adapter}=await storage();
    const failure=new Error('Synthetic storage unavailable.');
    const broken:IndexStorage={request:async(method,params)=>{
      if(method==='files.scan.prune') throw failure;
      return adapter.request(method,params);
    }};
    const close=vi.spyOn(NativeIndexSession.prototype,'close');const job=await index(config(dir),broken);
    await expect(job.reconcile()).rejects.toBe(failure);
    expect(close).toHaveBeenCalled();await Promise.all(close.mock.results.map(result=>result.value));
  });
  it('100,000 real generated files remain current after rename/delete and complete reconciliation',async()=>{
    const dir=await directory();
    // Fixed private synthetic corpus: 100 directories x 1,000 actual files.
    for(let group=0;group<100;group++) {
      const folder=join(dir,`group${group}`);await mkdir(folder);
      for(let start=0;start<1000;start+=100) await Promise.all(Array.from({length:100},(_,n)=>writeFile(join(folder,`record${group}_${start+n}.txt`),'')));
    }
    const {adapter,db}=await storage();const root=config(dir);const job=await index(root,adapter);
    await job.reconcile();
    expect((db.prepare("SELECT count(*) AS n FROM file_index_entries WHERE kind='file'").get() as {n:number}).n).toBe(100_000);
    for(let group=0;group<100;group++) {
      await rename(join(dir,`group${group}/record${group}_0.txt`),join(dir,`group${group}/renamed${group}.txt`));
      await rm(join(dir,`group${group}/record${group}_1.txt`));
    }
    await job.reconcile();
    const expected:string[]=[];
    for(let group=0;group<100;group++) for(const name of await readdir(join(dir,`group${group}`))) expected.push(`group${group}/${name}`);
    const current=(db.prepare("SELECT path FROM file_index_entries WHERE kind='file'").all() as {path:string}[]).map(r=>r.path);
    expect(current.sort()).toEqual(expected.sort());expect(current).toHaveLength(99_900);
    for(let group=0;group<50;group++) {
      const hits=await adapter.request('files.search',{query:`renamed${group}`,limit:100});
      expect(hits.some(h=>h.path===`group${group}/renamed${group}.txt`)).toBe(true);
      expect(hits.every(h=>expected.includes(h.path))).toBe(true);
    }
    expect(await adapter.request('files.search',{query:'" OR * NOT',limit:100})).toEqual([]);
  },180_000);
});
