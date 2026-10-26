import {randomUUID} from 'node:crypto';
import {realpath,stat} from 'node:fs/promises';
import {basename,isAbsolute} from 'node:path';
import {setTimeout as yieldToOwner} from 'node:timers/promises';
import {RootIndexer} from '@linuxcast/file-index';
import type {IndexUpdate,IndexStorage,RootState,ScanProgress} from '@linuxcast/file-index';
import {fileIndexSchemas,rootConfigSchema} from '@linuxcast/file-index/contracts';
import type {DataControls} from '@linuxcast/data-controls';
import {fileSearchMatchesOptions,fileSearchQueryRequestSchema,fileSearchResultSchema,fileSearchRootSchema} from '@linuxcast/contracts';
import type {FileSearchOptions,FileSearchResult,FileSearchState} from '@linuxcast/contracts';

export class FileSearchUnavailable extends Error {
  readonly reason:'invalid-request'|'root-unavailable'|'storage-unavailable'|'index-unavailable'|'busy'|'stopped';
  constructor(reason:FileSearchUnavailable['reason']) {super(`File search unavailable: ${reason}.`);this.reason=reason;}
}
export interface FileSearchServiceOptions {
  repository:IndexStorage;
  controls:Pick<DataControls,'registerIndexJob'>;
  /** Fixed bundled executable, supplied by trusted main only. */
  executable:string;
}
type Job={rootId:string;cancelled:boolean;phase:'indexing'|'watching'|'unavailable';progress:ScanProgress|null;watching?:boolean;
  ready?:Promise<RootIndexer|undefined>;stopPromise?:Promise<void>;unregister?:()=>void};
type SearchRequest={query:string;rootId?:string;options?:FileSearchOptions};
const searchRequestSchema=fileSearchQueryRequestSchema.omit({protocolVersion:true});
const fail=(reason:FileSearchUnavailable['reason']):never=>{throw new FileSearchUnavailable(reason);};
const bytes=(value:string)=>Buffer.byteLength(value,'utf8');
const validId=(value:string)=>fileIndexSchemas['files.roots.remove'].params.safeParse({rootId:value}).success;
const validPath=(value:string)=>typeof value==='string' && bytes(value)<=4096 && rootConfigSchema.shape.path.safeParse(value).success;

/** Main-only selected-root metadata service. Display paths/IDs confer no file authority.
 * Saved roots remain paused until an explicit startIndex call. */
export class FileSearchService {
  private readonly options:FileSearchServiceOptions;
  private readonly jobs=new Map<string,Job>();
  private readonly unavailable=new Set<string>();
  private readonly listeners=new Set<()=>void>();
  private tail:Promise<unknown>=Promise.resolve();
  private stopping:Promise<void>|undefined;
  private stopped=false;
  private revision=1;
  private fingerprint='';
  private searches=0;
  constructor(options:FileSearchServiceOptions) {
    if(!isAbsolute(options.executable)||options.executable.includes('\0')||bytes(options.executable)>4096)fail('invalid-request');
    this.options=options;
  }
  private alive() {if(this.stopped)fail('stopped');}
  private changed() {
    this.revision=Math.min(Number.MAX_SAFE_INTEGER,this.revision+1);
    for(const listener of [...this.listeners]) {try {listener();}catch {/* A display listener cannot break job ownership. */}}
  }
  private serial<T>(operation:()=>Promise<T>):Promise<T> {
    const result=this.tail.then(async()=>{this.alive();return operation();});
    this.tail=result.catch(()=>{});return result;
  }
  private async roots():Promise<RootState[]> {
    try {
      const roots=fileIndexSchemas['files.roots.list'].result.parse(await this.options.repository.request('files.roots.list',{}));
      if(new Set(roots.map(root=>root.config.id)).size!==roots.length || new Set(roots.map(root=>root.config.path)).size!==roots.length ||
        roots.some(root=>!validPath(root.config.path)))fail('storage-unavailable');
      return roots;
    }catch {return fail('storage-unavailable');}
  }
  private async selected(rootId:string):Promise<RootState> {
    if(!validId(rootId))fail('invalid-request');
    return (await this.roots()).find(root=>root.config.id===rootId)??fail('root-unavailable');
  }
  getState():Promise<Omit<FileSearchState,'appearance'>> {
    return this.serial(async()=>{
      let roots:RootState[]=[];
      for(let attempt=0;attempt<3;attempt++) {
        const revision=this.revision;roots=await this.roots();this.alive();
        if(revision===this.revision)break;
        if(attempt===2)fail('busy');
      }
      const display=roots.map(root=>{
        const job=this.jobs.get(root.config.id);
        return fileSearchRootSchema.parse({id:root.config.id,name:basename(root.config.path)||'/',displayPath:root.config.path,
          state:root.state,generation:root.generation,progress:job?.progress??root.progress,
          activity:job?.phase??(this.unavailable.has(root.config.id)?'unavailable':'paused')});
      });
      const fingerprint=JSON.stringify(display);
      if(fingerprint!==this.fingerprint) {this.fingerprint=fingerprint;this.changed();}
      return {revision:this.revision,roots:display};
    }).catch(error=>{throw error instanceof FileSearchUnavailable?error:new FileSearchUnavailable('storage-unavailable');});
  }
  /** Native picker output only; never expose a caller-supplied path over IPC. */
  addFolder(path:string):Promise<{rootId:string}> {
    return this.serial(async()=>{
      if(!validPath(path))fail('invalid-request');
      let canonical:string;
      try {canonical=await realpath(path);if(!validPath(canonical)||!(await stat(canonical)).isDirectory())fail('root-unavailable');}
      catch {return fail('root-unavailable');}
      const roots=await this.roots();this.alive();
      const existing=roots.find(root=>root.config.path===canonical);
      if(existing)return {rootId:existing.config.id};
      if(roots.length>=100)fail('busy');
      const config={id:randomUUID(),path:canonical,includeHidden:false,excludeGlobs:[],excludedDirectories:[],maxFileBytes:null};
      try {
        const saved=fileIndexSchemas['files.roots.put'].result.parse(await this.options.repository.request('files.roots.put',{config}));
        if(JSON.stringify(saved.config)!==JSON.stringify(config))fail('storage-unavailable');
      }catch {return fail('storage-unavailable');}
      this.changed();return {rootId:config.id};
    });
  }
  startIndex(rootId:string):Promise<void> {
    return this.serial(async()=>{
      const root=await this.selected(rootId);this.alive();
      if(this.jobs.has(rootId)) {if(this.jobs.get(rootId)!.cancelled)fail('index-unavailable');return;}
      if(this.jobs.size>=8)fail('busy');
      const job:Job={rootId,cancelled:false,phase:'indexing',progress:null};
      this.jobs.set(rootId,job);
      try {job.unregister=this.options.controls.registerIndexJob(rootId,{stop:()=>this.stopJob(job)});}
      catch {this.jobs.delete(rootId);return fail('busy');}
      this.unavailable.delete(rootId);this.changed();
      // Registration precedes both roots.put and reconciliation, including a
      // clear re-entering while RootIndexer.create awaits the owner.
      job.ready=Promise.resolve().then(()=>job.cancelled?undefined:RootIndexer.create(this.options.repository,root.config,this.options.executable,update=>this.update(job,update)));
      void job.ready.then(async indexer=>{
        if(!indexer||job.cancelled)return;
        await indexer.reconcile();
        if(job.cancelled)return;
        if(job.phase==='unavailable') {await this.stopJob(job,true);return;}
        indexer.startWatching();job.watching=true;job.phase='watching';this.changed();
      }).catch(async()=>{try {await this.stopJob(job,true);}catch {/* Retain failed ownership and deny restart. */}});
    });
  }
  private update(job:Job,update:IndexUpdate) {
    if(job.cancelled||this.jobs.get(job.rootId)!==job)return;
    if(update.state==='scanning') {job.phase='indexing';job.progress=structuredClone(update.progress);}
    else if(update.state==='settled') {job.progress=structuredClone(update.root.progress);job.phase=job.watching?'watching':'indexing';}
    else if(update.state==='unavailable'||update.state==='watch-degraded'||update.state==='cancelled') {
      job.phase='unavailable';
      // Never silently resume a failed watcher. stop waits for an active scan.
      void this.stopJob(job,true).catch(()=>{});
    }
    this.changed();
  }
  private stopJob(job:Job,failed=false):Promise<void> {
    if(job.stopPromise)return job.stopPromise;
    job.cancelled=true;
    job.stopPromise=(async()=>{
      let indexer:RootIndexer|undefined;
      try {indexer=await job.ready;}catch {failed=true;}
      try {await indexer?.stop();}
      catch {job.phase='unavailable';this.unavailable.add(job.rootId);this.changed();return fail('index-unavailable');}
      if(this.jobs.get(job.rootId)===job)this.jobs.delete(job.rootId);
      job.unregister?.();
      if(failed)this.unavailable.add(job.rootId);else this.unavailable.delete(job.rootId);
      this.changed();
    })();
    return job.stopPromise;
  }
  pauseIndex(rootId:string):Promise<void> {
    return this.serial(async()=>{
      await this.selected(rootId);const job=this.jobs.get(rootId);
      if(job)await this.stopJob(job);
      this.unavailable.delete(rootId);this.changed();
    });
  }
  removeFolder(rootId:string):Promise<void> {
    return this.serial(async()=>{
      await this.selected(rootId);const job=this.jobs.get(rootId);if(job)await this.stopJob(job);
      try {
        fileIndexSchemas['files.roots.remove'].result.parse(await this.options.repository.request('files.roots.remove',{rootId}));
        this.unavailable.delete(rootId);this.changed();
        // Only derived rows are pruned; source files are never opened or deleted.
        for(let batch=0;batch<10_000;batch++) {
          const {removed}=fileIndexSchemas['files.scan.prune'].result.parse(await this.options.repository.request('files.scan.prune',{rootId}));
          if(removed<512)return;
          await yieldToOwner(0);
        }
      }catch {return fail('storage-unavailable');}
      return fail('storage-unavailable');
    });
  }
  async search(input:SearchRequest):Promise<{query:string;rootId:string|null;options?:FileSearchOptions;results:FileSearchResult[]}> {
    this.alive();
    const parsed=searchRequestSchema.safeParse(input);
    if(!parsed.success)return fail('invalid-request');
    // Validate and own the complete request before yielding. Callers can keep
    // editing their options without changing this operation or its echoed reply.
    const snapshot=structuredClone(parsed.data);
    const request={query:snapshot.query,...(snapshot.rootId===undefined?{}:{rootId:snapshot.rootId}),
      ...(snapshot.options===undefined?{}:{options:snapshot.options})};
    const reply={query:request.query,rootId:request.rootId??null,...(request.options===undefined?{}:{options:request.options})};
    if(this.searches>=2)fail('busy');
    this.searches++;
    const work=(async()=>{
      await this.tail;this.alive();const revision=this.revision;
      const before=await this.roots();
      if(request.rootId!==undefined&&!before.some(root=>root.config.id===request.rootId))fail('root-unavailable');
      if(!request.query.trim())return {...reply,results:[]};
      const candidates=fileIndexSchemas['files.search'].result.parse(await this.options.repository.request('files.search',{...request,limit:100}));
      const after=await this.roots();this.alive();
      if(this.revision!==revision||JSON.stringify(before)!==JSON.stringify(after))fail('busy');
      const selected=new Map(after.map(root=>[root.config.id,root]));const identities=new Set<string>();
      const results=candidates.map(candidate=>{
        const root=selected.get(candidate.rootId);
        if(!root||candidate.rootPath!==root.config.path||candidate.generation!==root.generation||candidate.id!==`${candidate.rootId}:${candidate.path}`||
          (request.rootId!==undefined&&request.rootId!==candidate.rootId)||identities.has(candidate.id)||root.state==='idle'||root.state==='unavailable'||
          !fileSearchMatchesOptions(candidate,request.options))fail('storage-unavailable');
        identities.add(candidate.id);
        return fileSearchResultSchema.parse({id:candidate.id,rootId:candidate.rootId,generation:candidate.generation,path:candidate.path,
          kind:candidate.kind,size:candidate.size,modifiedMs:candidate.modifiedMs});
      });
      // The owner applies filters and fixed sorting before LIMIT 100. Preserve its
      // order and reject mismatches; never filter/sort an already limited page.
      return {...reply,results};
    })().catch(error=>{throw error instanceof FileSearchUnavailable?error:new FileSearchUnavailable('storage-unavailable');});
    // A timed-out owner request retains its concurrency slot until it settles.
    void work.finally(()=>{this.searches--;}).catch(()=>{});
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new FileSearchUnavailable('storage-unavailable')),1000);})]);}
    finally {clearTimeout(timer);}
  }
  subscribe(listener:()=>void):()=>void {this.alive();this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  stop():Promise<void> {
    if(this.stopping)return this.stopping;
    this.stopped=true;
    this.stopping=(async()=>{
      await this.tail;
      const results=await Promise.allSettled([...this.jobs.values()].map(job=>this.stopJob(job)));
      this.listeners.clear();
      if(results.some(result=>result.status==='rejected'))fail('index-unavailable');
    })();
    return this.stopping;
  }
  terminate():Promise<void> {return this.stop();}
}
export function createFileSearchService(options:FileSearchServiceOptions):FileSearchService {return new FileSearchService(options);}
