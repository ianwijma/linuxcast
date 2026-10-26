import {afterEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RootIndexer} from '@linuxcast/file-index';
import type {FileCandidate,IndexStorage,IndexUpdate,RootState} from '@linuxcast/file-index';
import {DataControls} from '@linuxcast/data-controls';
import type {FileSearchOptions} from '@linuxcast/contracts';
import {createFileSearchService,FileSearchUnavailable} from '../src/service.ts';
import type {FileSearchService} from '../src/service.ts';
const services:FileSearchService[]=[],directories:string[]=[];
afterEach(async()=>{for(const service of services.splice(0))await service.stop().catch(()=>{});vi.restoreAllMocks();vi.useRealTimers();for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
function deferred<T>() {let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function root(path='/synthetic/selected'):RootState {return {config:{id:randomUUID(),path,includeHidden:false,excludeGlobs:[],excludedDirectories:[],maxFileBytes:null},state:'ready',generation:randomUUID(),progress:null};}
function candidate(selected:RootState):FileCandidate {return {id:`${selected.config.id}:fixture.txt`,rootId:selected.config.id,rootPath:selected.config.path,generation:selected.generation!,path:'fixture.txt',kind:'file',size:7,modifiedMs:1,device:'1',inode:'1'};}
function harness(initial:RootState[]=[root()]) {
  let roots=structuredClone(initial),results:FileCandidate[]=[];
  const request=vi.fn(async(method:string,params:Record<string,unknown>)=>{
    if(method==='files.roots.list')return structuredClone(roots);
    if(method==='files.roots.put'){const config=params.config as RootState['config'];const value={config,state:'idle' as const,generation:null,progress:null};roots.push(value);return structuredClone(value);}
    if(method==='files.roots.remove'){roots=roots.filter(root=>root.config.id!==params.rootId);return {ok:true};}
    if(method==='files.scan.prune')return {removed:0};
    if(method==='files.search')return structuredClone(results);
    throw new Error('Synthetic unexpected operation.');
  });
  const controls=new DataControls({request:vi.fn(async()=>({category:'file-index',removed:0,complete:true}))} as unknown as ConstructorParameters<typeof DataControls>[0]);
  const service=createFileSearchService({repository:{request} as unknown as IndexStorage,controls,executable:'/synthetic/helper'});services.push(service);
  return {service,controls,request,get roots(){return roots;},set roots(value:RootState[]){roots=value;},set results(value:FileCandidate[]){results=value;}};
}
function indexer() {const reconcile=vi.fn(async()=>{}),stop=vi.fn(async()=>{}),startWatching=vi.fn();const job={reconcile,stop,startWatching} as unknown as RootIndexer;return {job,reconcile,stop,startWatching};}
async function directory() {const dir=await mkdtemp(join(tmpdir(),'linuxcast-search-unit-'));directories.push(dir);return dir;}
describe('L2-02 main-only file search service',()=>{
  it('starts saved roots paused and exposes display metadata without source identity authority',async()=>{
    const h=harness();h.results=[candidate(h.roots[0]!)];const listener=vi.fn();const unsubscribe=h.service.subscribe(listener);
    expect(await h.service.getState()).toMatchObject({roots:[{activity:'paused',displayPath:'/synthetic/selected'}]});
    const result=await h.service.search({query:'fixture'});expect(result.results).toHaveLength(1);expect(result.results[0]).not.toHaveProperty('rootPath');expect(result.results[0]).not.toHaveProperty('device');
    unsubscribe();const calls=listener.mock.calls.length;await h.service.pauseIndex(h.roots[0]!.config.id);expect(listener).toHaveBeenCalledTimes(calls);
  });
  it('validates native picker paths, canonicalizes aliases and serializes duplicate additions',async()=>{
    const selected=await directory();await mkdir(join(selected,'folder'));await symlink(join(selected,'folder'),join(selected,'alias'));await writeFile(join(selected,'file.txt'),'synthetic');const h=harness([]);
    const [first,second]=await Promise.all([h.service.addFolder(join(selected,'folder')),h.service.addFolder(join(selected,'alias'))]);expect(first).toEqual(second);expect(h.roots).toHaveLength(1);
    await expect(h.service.addFolder(join(selected,'file.txt'))).rejects.toMatchObject({reason:'root-unavailable'});
    for(const value of ['relative','/a/../b','/nul\0path','/'+ '界'.repeat(1400)])await expect(h.service.addFolder(value)).rejects.toBeInstanceOf(FileSearchUnavailable);
  });
  it('caps selected roots and rejects unknown or malformed roots before job admission',async()=>{
    const h=harness(Array.from({length:100},(_,i)=>root(`/synthetic/${i}`)));await expect(h.service.addFolder(await directory())).rejects.toMatchObject({reason:'busy'});
    await expect(h.service.startIndex(randomUUID())).rejects.toMatchObject({reason:'root-unavailable'});await expect(h.service.removeFolder('forged')).rejects.toMatchObject({reason:'invalid-request'});
  });
  it('registers before startup, returns after admission, suppresses duplicates and awaits pause',async()=>{
    const h=harness(),fake=indexer(),scanning=deferred<void>();fake.reconcile.mockReturnValue(scanning.promise);
    const registered=vi.spyOn(h.controls,'registerIndexJob');const create=vi.spyOn(RootIndexer,'create').mockImplementation(async()=>{expect(registered).toHaveBeenCalledTimes(1);return fake.job;});
    const id=h.roots[0]!.config.id;await h.service.startIndex(id);await h.service.startIndex(id);expect(create).toHaveBeenCalledTimes(1);
    let paused=false;fake.stop.mockImplementation(async()=>{await scanning.promise;});const pause=h.service.pauseIndex(id).then(()=>{paused=true;});await vi.waitFor(()=>expect(fake.stop).toHaveBeenCalledOnce());expect(paused).toBe(false);
    scanning.resolve();await pause;expect(fake.startWatching).not.toHaveBeenCalled();expect((await h.service.getState()).roots[0]!.activity).toBe('paused');
  });
  it('clear during startup bars admission and waits for the created native owner to stop',async()=>{
    const h=harness([root('/synthetic/one'),root('/synthetic/two')]),fake=indexer(),creating=deferred<RootIndexer>(),closing=deferred<void>();
    vi.spyOn(RootIndexer,'create').mockReturnValue(creating.promise);fake.stop.mockReturnValue(closing.promise);
    await h.service.startIndex(h.roots[0]!.config.id);const clear=h.controls.clear({category:'file-index'});
    await expect(h.service.startIndex(h.roots[1]!.config.id)).rejects.toMatchObject({reason:'busy'});
    creating.resolve(fake.job);await vi.waitFor(()=>expect(fake.stop).toHaveBeenCalledOnce());expect(fake.reconcile).not.toHaveBeenCalled();closing.resolve();expect(await clear).toMatchObject({outcome:'completed'});
    expect((await h.service.getState()).roots.every(root=>root.activity==='paused')).toBe(true);expect(fake.startWatching).not.toHaveBeenCalled();
  });
  it('admits at most eight active native jobs',async()=>{
    const h=harness(Array.from({length:9},(_,i)=>root(`/synthetic/${i}`)));vi.spyOn(RootIndexer,'create').mockImplementation(async()=>indexer().job);
    for(const root of h.roots.slice(0,8))await h.service.startIndex(root.config.id);
    await expect(h.service.startIndex(h.roots[8]!.config.id)).rejects.toMatchObject({reason:'busy'});
    await h.service.pauseIndex(h.roots[0]!.config.id);await h.service.startIndex(h.roots[8]!.config.id);
  });
  it('contains startup failure and never restarts an unavailable native job automatically',async()=>{
    const h=harness();vi.spyOn(RootIndexer,'create').mockRejectedValue(new Error('/private/path should never escape'));
    await h.service.startIndex(h.roots[0]!.config.id);await vi.waitFor(async()=>expect((await h.service.getState()).roots[0]!.activity).toBe('unavailable'));
    expect(await h.controls.clear({category:'file-index'})).toMatchObject({outcome:'completed'});
  });
  it('preserves failed stop ownership, denies removal/restart and reports uncertain closure',async()=>{
    const h=harness(),fake=indexer();fake.stop.mockRejectedValue(new Error('Synthetic closure unknown.'));vi.spyOn(RootIndexer,'create').mockResolvedValue(fake.job);const id=h.roots[0]!.config.id;
    await h.service.startIndex(id);await expect(h.service.pauseIndex(id)).rejects.toMatchObject({reason:'index-unavailable'});
    expect(await h.controls.clear({category:'file-index'})).toMatchObject({outcome:'unavailable',reason:'index-stop-failed'});
    await expect(h.service.removeFolder(id)).rejects.toMatchObject({reason:'index-unavailable'});await expect(h.service.startIndex(id)).rejects.toMatchObject({reason:'index-unavailable'});
    expect(h.roots).toHaveLength(1);await expect(h.service.stop()).rejects.toMatchObject({reason:'index-unavailable'});expect(h.service.terminate()).toBe(h.service.stop());
  });
  it('stops a failed watcher and ignores late callbacks after pause',async()=>{
    const h=harness(),fake=indexer();let update!:(event:IndexUpdate)=>void;vi.spyOn(RootIndexer,'create').mockImplementation(async(_storage,_config,_executable,listener)=>{update=listener!;return fake.job;});
    await h.service.startIndex(h.roots[0]!.config.id);await vi.waitFor(()=>expect(fake.startWatching).toHaveBeenCalledOnce());
    update({state:'scanning',progress:{visited:2,indexed:1,excluded:0,denied:0,vanished:0,unsupported:0,watchFailures:0}});update({state:'settled',root:h.roots[0]!});expect((await h.service.getState()).roots[0]!.activity).toBe('watching');
    update({state:'watch-degraded'});await vi.waitFor(()=>expect(fake.stop).toHaveBeenCalledOnce());expect((await h.service.getState()).roots[0]!.activity).toBe('unavailable');
    const previous=await h.service.getState();update({state:'scanning',progress:{visited:99,indexed:99,excluded:0,denied:0,vanished:0,unsupported:0,watchFailures:0}});expect(await h.service.getState()).toEqual(previous);
  });
  it('validates result identity, selected root path and published generation',async()=>{
    const h=harness(),original=candidate(h.roots[0]!);
    for(const patch of [{id:'forged'},{generation:randomUUID()},{rootPath:'/synthetic/forged'},{rootId:randomUUID()},{path:'../escape'},{path:'界'.repeat(1400)}]) {
      h.results=[{...original,...patch}];await expect(h.service.search({query:'fixture'})).rejects.toMatchObject({reason:'storage-unavailable'});
    }
    h.results=[original,original];await expect(h.service.search({query:'fixture'})).rejects.toMatchObject({reason:'storage-unavailable'});
    h.results=[original];expect((await h.service.search({query:'fixture',rootId:original.rootId})).results).toHaveLength(1);
    expect(await h.service.search({query:''})).toEqual({query:'',rootId:null,results:[]});await expect(h.service.search({query:'界'.repeat(171)})).rejects.toMatchObject({reason:'invalid-request'});
  });
  it('rejects results crossing a selection or generation change during search',async()=>{
    const h=harness(),read=deferred<FileCandidate[]>();const original=h.request.getMockImplementation()!;h.request.mockImplementation(async(method,params)=>method==='files.search'?read.promise:original(method,params));
    const pending=h.service.search({query:'fixture'});await vi.waitFor(()=>expect(h.request).toHaveBeenCalledWith('files.search',{query:'fixture',limit:100}));const prior=candidate(h.roots[0]!);h.roots=[{...h.roots[0]!,generation:randomUUID()}];read.resolve([prior]);await expect(pending).rejects.toMatchObject({reason:'busy'});
  });
  it('retries a state read when a newer job update arrives before its owner reply',async()=>{
    const h=harness(),fake=indexer();let update!:(event:IndexUpdate)=>void;
    vi.spyOn(RootIndexer,'create').mockImplementation(async(_storage,_config,_executable,listener)=>{update=listener!;return fake.job;});
    await h.service.startIndex(h.roots[0]!.config.id);await vi.waitFor(()=>expect(fake.startWatching).toHaveBeenCalledOnce());
    const old=structuredClone(h.roots),read=deferred<RootState[]>(),original=h.request.getMockImplementation()!;let delayed=false;
    h.request.mockImplementation(async(method,params)=>{if(method==='files.roots.list'&&!delayed){delayed=true;return read.promise;}return original(method,params);});
    const pending=h.service.getState();await vi.waitFor(()=>expect(delayed).toBe(true));h.roots=[{...h.roots[0]!,generation:randomUUID()}];update({state:'settled',root:h.roots[0]!});read.resolve(old);
    expect((await pending).roots[0]!.generation).toBe(h.roots[0]!.generation);
  });
  it('bounds searches and deadlines without releasing stalled owner slots',async()=>{
    vi.useFakeTimers();const h=harness(),wait=deferred<RootState[]>();h.request.mockImplementation(async()=>wait.promise);
    const first=h.service.search({query:'one'}),second=h.service.search({query:'two'});const handled=Promise.allSettled([first,second]);await expect(h.service.search({query:'three'})).rejects.toMatchObject({reason:'busy'});
    await vi.advanceTimersByTimeAsync(1001);expect((await handled).every(result=>result.status==='rejected')).toBe(true);await expect(h.service.search({query:'four'})).rejects.toMatchObject({reason:'busy'});wait.resolve([]);
  });
  it('uses bounded pruning after stopping and preserves errors from the owner',async()=>{
    const h=harness(),fake=indexer();vi.spyOn(RootIndexer,'create').mockResolvedValue(fake.job);const original=h.request.getMockImplementation()!;let batches=0;
    h.request.mockImplementation(async(method,params)=>{if(method==='files.roots.remove')expect(fake.stop).toHaveBeenCalledOnce();if(method==='files.scan.prune')return {removed:++batches===1?512:3};return original(method,params);});
    await h.service.startIndex(h.roots[0]!.config.id);await h.service.removeFolder(h.roots[0]!.config.id);expect(batches).toBe(2);expect(h.roots).toEqual([]);
    h.request.mockRejectedValue(new Error('/private/error'));await expect(h.service.getState()).rejects.toMatchObject({message:'File search unavailable: storage-unavailable.'});
  });
  it('rejects duplicate/config-invalid owner roots and stops during admitted startup idempotently',async()=>{
    const h=harness();h.roots=[h.roots[0]!,h.roots[0]!];await expect(h.service.getState()).rejects.toMatchObject({reason:'storage-unavailable'});h.roots=[root()];h.roots[0]!.config.path='/bad/../path';await expect(h.service.getState()).rejects.toMatchObject({reason:'storage-unavailable'});
    h.roots=[root()];const creating=deferred<RootIndexer>(),fake=indexer();vi.spyOn(RootIndexer,'create').mockReturnValue(creating.promise);await h.service.startIndex(h.roots[0]!.config.id);const stopped=h.service.stop();expect(h.service.terminate()).toBe(stopped);creating.resolve(fake.job);await stopped;expect(fake.stop).toHaveBeenCalledOnce();expect(fake.startWatching).not.toHaveBeenCalled();await expect(h.service.getState()).rejects.toMatchObject({reason:'stopped'});
  });
  it.each(['relevance','name','modified-desc','size-desc'] as const)('forwards and echoes validated options for %s without changing the default shape',async sort=>{
    const h=harness(),id=h.roots[0]!.config.id;h.results=[candidate(h.roots[0]!)];
    const options:FileSearchOptions={sort,kind:'file',modifiedFromMs:0,modifiedBeforeMs:10};
    const reply=await h.service.search({query:'fixture',rootId:id,options});
    expect(h.request).toHaveBeenCalledWith('files.search',{query:'fixture',rootId:id,limit:100,options});
    expect(reply).toMatchObject({query:'fixture',rootId:id,options,results:[{modifiedMs:1}]});expect(reply.options).not.toBe(options);
    h.request.mockClear();expect(await h.service.search({query:'',options})).toEqual({query:'',rootId:null,options,results:[]});
    expect(h.request.mock.calls.some(([method])=>method==='files.search')).toBe(false);
    const plain=await h.service.search({query:'fixture'});expect(plain).not.toHaveProperty('options');
    expect(h.request).toHaveBeenCalledWith('files.search',{query:'fixture',limit:100});
  });
  it('owns the query, root and nested options before its first await',async()=>{
    const h=harness(),id=h.roots[0]!.config.id,gate=deferred<RootState[]>();h.results=[candidate(h.roots[0]!)];
    const original=h.request.getMockImplementation()!;let first=true;
    h.request.mockImplementation(async(method,params)=>{if(method==='files.roots.list'&&first){first=false;return gate.promise;}return original(method,params);});
    const options:FileSearchOptions={sort:'size-desc',kind:'file',modifiedFromMs:0,modifiedBeforeMs:10};
    const input:{query:string;rootId:string;options:FileSearchOptions}={query:'fixture',rootId:id,options};
    const pending=h.service.search(input);
    options.sort='name';options.kind='directory';options.modifiedFromMs=20;delete options.modifiedBeforeMs;
    input.query='changed';input.rootId=randomUUID();input.options={sort:'modified-desc',kind:'directory'};
    await vi.waitFor(()=>expect(first).toBe(false));gate.resolve(structuredClone(h.roots));
    const expected={sort:'size-desc',kind:'file',modifiedFromMs:0,modifiedBeforeMs:10};
    expect((await pending).options).toEqual(expected);
    expect(h.request).toHaveBeenCalledWith('files.search',{query:'fixture',rootId:id,limit:100,options:expected});
  });
  it('rejects malformed options and unknown request keys before contacting storage',async()=>{
    const h=harness();
    const invalid=[null,[],false,'name',{}, {sort:'unknown'}, {sort:'name',extra:true}, {sort:'name',kind:'symlink'},
      {sort:'name',modifiedFromMs:0.5},{sort:'name',modifiedBeforeMs:Infinity},{sort:'name',modifiedBeforeMs:NaN},
      {sort:'name',modifiedFromMs:Number.MIN_SAFE_INTEGER-1},{sort:'name',modifiedBeforeMs:Number.MAX_SAFE_INTEGER+1},
      {sort:'name',modifiedFromMs:0,modifiedBeforeMs:0},{sort:'name',modifiedFromMs:2,modifiedBeforeMs:1}];
    for(const options of invalid)await expect(h.service.search({query:'fixture',options} as Parameters<FileSearchService['search']>[0])).rejects.toMatchObject({reason:'invalid-request'});
    await expect(h.service.search({query:'fixture',extra:true} as Parameters<FileSearchService['search']>[0])).rejects.toMatchObject({reason:'invalid-request'});
    expect(h.request).not.toHaveBeenCalled();
  });
  it('rejects an entire owner page when any result violates kind or modified bounds',async()=>{
    const h=harness(),good=candidate(h.roots[0]!);
    const cases:{options:FileSearchOptions;patch:Partial<FileCandidate>}[]=[
      {options:{sort:'relevance',kind:'file'},patch:{kind:'directory'}},
      {options:{sort:'name',kind:'directory'},patch:{kind:'file'}},
      {options:{sort:'modified-desc',modifiedFromMs:0,modifiedBeforeMs:10},patch:{modifiedMs:-1}},
      {options:{sort:'modified-desc',modifiedFromMs:0,modifiedBeforeMs:10},patch:{modifiedMs:10}},
      {options:{sort:'size-desc',modifiedFromMs:-10,modifiedBeforeMs:0},patch:{modifiedMs:-11}},
      {options:{sort:'size-desc',modifiedFromMs:-10,modifiedBeforeMs:0},patch:{modifiedMs:0}},
      {options:{sort:'relevance'},patch:{modifiedMs:0.5}},
    ];
    for(const {options,patch} of cases) {
      const valid={...good,kind:options.kind??'file',modifiedMs:options.modifiedFromMs??1};
      h.results=[valid,{...valid,...patch,path:'outside.txt',id:`${good.rootId}:outside.txt`}];
      await expect(h.service.search({query:'fixture',options})).rejects.toMatchObject({reason:'storage-unavailable',message:'File search unavailable: storage-unavailable.'});
    }
  });
  it('accepts inclusive from and exclusive before bounds including epoch zero and negative instants',async()=>{
    const h=harness(),original=candidate(h.roots[0]!);
    for(const {options,times} of [
      {options:{sort:'modified-desc' as const,modifiedFromMs:0,modifiedBeforeMs:10},times:[9,0]},
      {options:{sort:'modified-desc' as const,modifiedFromMs:-10,modifiedBeforeMs:0},times:[-1,-10]},
      {options:{sort:'modified-desc' as const,modifiedFromMs:Number.MIN_SAFE_INTEGER,modifiedBeforeMs:Number.MAX_SAFE_INTEGER},times:[Number.MAX_SAFE_INTEGER-1,Number.MIN_SAFE_INTEGER]},
    ]) {
      h.results=times.map((modifiedMs,index)=>({...original,id:`${original.rootId}:time${index}.txt`,path:`time${index}.txt`,modifiedMs}));
      expect((await h.service.search({query:'fixture',options})).results.map(row=>row.modifiedMs)).toEqual(times);
    }
  });
  it('preserves the owner result order without locally sorting an already limited page',async()=>{
    const h=harness(),original=candidate(h.roots[0]!);const paths=['z-last.txt','a-first.txt','m-middle.txt'];
    h.results=paths.map((path,index)=>({...original,path,id:`${original.rootId}:${path}`,size:30-index,modifiedMs:10-index}));
    for(const sort of ['relevance','name','modified-desc','size-desc'] as const) {
      const reply=await h.service.search({query:'fixture',options:{sort}});expect(reply.results.map(row=>row.path)).toEqual(paths);
      expect(h.request).toHaveBeenCalledWith('files.search',{query:'fixture',limit:100,options:{sort}});
    }
  });

  it('forwards empty-query root browsing only when the explicit empty directory is present',async()=>{
    const h=harness(),rootId=h.roots[0]!.config.id,original=candidate(h.roots[0]!);
    h.results=[{...original,id:`${rootId}:z-folder`,path:'z-folder',kind:'directory'},original];
    const options={sort:'name' as const};
    for(const query of ['', '  ']) {
      const reply=await h.service.search({query,rootId,directory:'',options});
      expect(reply).toMatchObject({query,rootId,directory:'',options,results:[{path:'z-folder'},{path:'fixture.txt'}]});
      expect(h.request).toHaveBeenLastCalledWith('files.roots.list',{});
      expect(h.request).toHaveBeenCalledWith('files.search',{query,rootId,directory:'',options,limit:100});
    }
    h.request.mockClear();expect(await h.service.search({query:'',rootId})).toEqual({query:'',rootId,results:[]});
    expect(h.request.mock.calls.some(([method])=>method==='files.search')).toBe(false);
  });
  it('forwards and echoes canonical directory scope without treating literal path characters as prefixes',async()=>{
    const h=harness(),rootId=h.roots[0]!.config.id,original=candidate(h.roots[0]!);
    for(const directory of ['folder','folder/deeper','space folder','folder_%']) {
      const path=`${directory}/child.txt`;h.results=[{...original,id:`${rootId}:${path}`,path}];
      const reply=await h.service.search({query:'child',rootId,directory,options:{sort:'relevance',kind:'file'}});
      expect(reply).toMatchObject({query:'child',rootId,directory,results:[{path}]});
      expect(h.request).toHaveBeenCalledWith('files.search',{query:'child',rootId,directory,options:{sort:'relevance',kind:'file'},limit:100});
    }
    h.results=[];expect(await h.service.search({query:'',rootId,directory:'missing-in-index'})).toEqual({query:'',rootId,directory:'missing-in-index',results:[]});
    const plain=await h.service.search({query:'child'});expect(plain).not.toHaveProperty('directory');
  });
  it('rejects malformed directory scope and missing root identity before contacting storage',async()=>{
    const h=harness(),rootId=h.roots[0]!.config.id;
    for(const directory of [null,[],1,'/absolute','../outside','folder/..','folder/.','./folder','folder//child','folder/','nul\0path','a'.repeat(4097),'界'.repeat(1366)]) {
      await expect(h.service.search({query:'',rootId,directory} as Parameters<FileSearchService['search']>[0])).rejects.toMatchObject({reason:'invalid-request'});
    }
    for(const directory of ['', 'folder'])await expect(h.service.search({query:'',directory})).rejects.toMatchObject({reason:'invalid-request'});
    await expect(h.service.search({query:'',rootId:'forged',directory:''})).rejects.toMatchObject({reason:'invalid-request'});
    expect(h.request).not.toHaveBeenCalled();
  });
  it('snapshots directory, root, query and options before waiting for owner state',async()=>{
    const h=harness([root('/synthetic/one'),root('/synthetic/two')]),rootId=h.roots[0]!.config.id,gate=deferred<RootState[]>();
    const path='folder/child.txt';h.results=[{...candidate(h.roots[0]!),id:`${rootId}:${path}`,path}];
    const original=h.request.getMockImplementation()!;let first=true;
    h.request.mockImplementation(async(method,params)=>{if(method==='files.roots.list'&&first){first=false;return gate.promise;}return original(method,params);});
    const input={query:'child',rootId,directory:'folder',options:{sort:'name' as const,kind:'file' as const}};
    const pending=h.service.search(input);input.directory='';input.rootId=h.roots[1]!.config.id;input.query='changed';delete (input.options as Partial<FileSearchOptions>).kind;
    await vi.waitFor(()=>expect(first).toBe(false));gate.resolve(structuredClone(h.roots));
    expect(await pending).toMatchObject({query:'child',rootId,directory:'folder',options:{sort:'name',kind:'file'},results:[{path}]});
    expect(h.request).toHaveBeenCalledWith('files.search',{query:'child',rootId,directory:'folder',options:{sort:'name',kind:'file'},limit:100});
  });
  it('rejects a whole directory page for descendants, parent rows or prefix siblings',async()=>{
    const h=harness(),rootId=h.roots[0]!.config.id,original=candidate(h.roots[0]!);
    for(const {directory,valid,bad} of [
      {directory:'',valid:'root.txt',bad:'folder/nested.txt'},
      {directory:'folder',valid:'folder/child.txt',bad:'folder/deeper/child.txt'},
      {directory:'folder',valid:'folder/child.txt',bad:'folder2/child.txt'},
      {directory:'folder',valid:'folder/child.txt',bad:'folder'},
      {directory:'folder',valid:'folder/child.txt',bad:'root.txt'},
      {directory:'folder_%',valid:'folder_%/child.txt',bad:'folder_other/child.txt'},
    ]) {
      h.results=[valid,bad].map(path=>({...original,id:`${rootId}:${path}`,path}));
      await expect(h.service.search({query:'',rootId,directory})).rejects.toMatchObject({reason:'storage-unavailable',message:'File search unavailable: storage-unavailable.'});
    }
  });
  it('keeps separate directory snapshots when concurrent owner searches settle out of order',async()=>{
    const h=harness(),rootId=h.roots[0]!.config.id,first=deferred<FileCandidate[]>(),second=deferred<FileCandidate[]>(),original=h.request.getMockImplementation()!;
    h.request.mockImplementation(async(method,params)=>method==='files.search'?(params.directory==='one'?first.promise:second.promise):original(method,params));
    const one=h.service.search({query:'',rootId,directory:'one'}),two=h.service.search({query:'',rootId,directory:'two'});
    await vi.waitFor(()=>expect(h.request.mock.calls.filter(([method])=>method==='files.search')).toHaveLength(2));
    const entry=candidate(h.roots[0]!);second.resolve([{...entry,id:`${rootId}:two/child.txt`,path:'two/child.txt'}]);
    expect(await two).toMatchObject({query:'',rootId,directory:'two',results:[{path:'two/child.txt'}]});
    first.resolve([{...entry,id:`${rootId}:one/child.txt`,path:'one/child.txt'}]);
    expect(await one).toMatchObject({query:'',rootId,directory:'one',results:[{path:'one/child.txt'}]});
  });
  it('retains generation fencing while a directory query waits for the owner',async()=>{
    const h=harness(),rootId=h.roots[0]!.config.id,read=deferred<FileCandidate[]>(),original=h.request.getMockImplementation()!;
    h.request.mockImplementation(async(method,params)=>method==='files.search'?read.promise:original(method,params));
    const entry=candidate(h.roots[0]!);const pending=h.service.search({query:'',rootId,directory:''});
    await vi.waitFor(()=>expect(h.request).toHaveBeenCalledWith('files.search',{query:'',rootId,directory:'',limit:100}));
    h.roots=[{...h.roots[0]!,generation:randomUUID()}];read.resolve([entry]);await expect(pending).rejects.toMatchObject({reason:'busy'});
  });

});
