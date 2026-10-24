import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseContract } from '../../contracts/src/index.ts';
import { rootConfigSchema } from './contracts.ts';
import type { IndexStorage, RootConfig, RootState, ScanProgress } from './contracts.ts';
import { NativeIndexSession } from './native.ts';
export type {RootConfig, RootState, FileCandidate, ScanProgress, IndexStorage} from './contracts.ts';
export {NativeIndexSession, IndexUnavailable} from './native.ts';

export type IndexUpdate = {state:'scanning'; progress:ScanProgress} | {state:'settled'; root:RootState} |
  {state:'cancelled'|'unavailable'} | {state:'watch-degraded'};

/** One selected-root job. Main owns selection/consent, lifetime and presentation.
 * No root is discovered or enabled automatically by this package. */
export class RootIndexer {
  private session: NativeIndexSession | undefined;
  private active: Promise<void> | undefined;
  private controller: AbortController | undefined;
  private watching = false;
  private stopped = false;
  private lastScan = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly storage: IndexStorage;
  readonly config: RootConfig;
  private readonly executable: string;
  private readonly update: (update:IndexUpdate)=>void;
  private constructor(storage: IndexStorage, config: RootConfig,
    executable: string, update: (update:IndexUpdate)=>void) {
    this.storage=storage;this.config=config;this.executable=executable;this.update=update;
  }
  static async create(storage: IndexStorage, config:RootConfig, executable:string, update:(update:IndexUpdate)=>void=()=>{}):Promise<RootIndexer> {
    const normalized=parseContract(rootConfigSchema,config);
    Object.freeze(normalized.excludeGlobs);Object.freeze(normalized.excludedDirectories);Object.freeze(normalized);
    await storage.request('files.roots.put',{config:normalized});
    return new RootIndexer(storage,normalized,executable,update);
  }
  reconcile(signal?:AbortSignal):Promise<void> {
    if (this.stopped) return Promise.reject(new Error('File index stopped.'));
    if (this.active) return this.active;
    this.controller=new AbortController();
    const controller=this.controller;
    const cancel=() => controller.abort();
    signal?.addEventListener('abort',cancel,{once:true});
    if (signal?.aborted) cancel();
    this.active=this.run(controller.signal).finally(() => {
      signal?.removeEventListener('abort',cancel);this.active=undefined;this.controller=undefined;
    });
    return this.active;
  }
  private async run(signal:AbortSignal):Promise<void> {
    const scanId=randomUUID(),rootId=this.config.id;
    if (signal.aborted) {this.update({state:'cancelled'});return;}
    await this.storage.request('files.scan.begin',{rootId,scanId});
    let published=false;
    try {
      this.session ??= await NativeIndexSession.open(this.executable,this.config);
      if (signal.aborted) throw new Error('Cancelled.');
      for await (const event of this.session.scan(scanId,signal)) {
        if (event.kind==='batch') {
          if (!signal.aborted) await this.storage.request('files.scan.batch',{rootId,scanId,entries:event.entries});
          this.update({state:'scanning',progress:event.progress});
        } else if (event.outcome==='complete' && !signal.aborted) {
          const root=await this.storage.request('files.scan.finish',{rootId,scanId,progress:event.progress});
          published=true;this.lastScan=Date.now();this.update({state:'settled',root});
        } else if (event.outcome==='unavailable') throw new Error('Root unavailable.');
      }
      if (!published) {
        await this.storage.request('files.scan.abort',{rootId,scanId,unavailable:false});
        this.update({state:'cancelled'});
      }
    } catch {
      if (!published) await this.storage.request('files.scan.abort',{rootId,scanId,unavailable:!signal.aborted});
      await this.session?.close();this.session=undefined;
      this.update({state:signal.aborted?'cancelled':'unavailable'});
    }
    // Short owner transactions yield so foreground repository calls can run.
    while (!signal.aborted && !this.stopped) {
      const {removed}=await this.storage.request('files.scan.prune',{rootId});
      if (removed<512) break;
      await delay(0);
    }
  }
  /** Real inotify invalidation plus periodic recovery. Never an event-count success claim. */
  startWatching(options:{pollMs?:number;reconcileMs?:number}={}):void {
    if (this.watching || this.stopped) return;
    const pollMs=options.pollMs??1000,reconcileMs=options.reconcileMs??60_000;
    if (!Number.isSafeInteger(pollMs)||pollMs<100||pollMs>60_000||!Number.isSafeInteger(reconcileMs)||reconcileMs<pollMs||reconcileMs>3_600_000) throw new Error('Invalid index interval.');
    this.watching=true;
    const tick=async () => {
      if (!this.watching || this.stopped) return;
      try {
        if (!this.active) {
          const watch=await this.session?.poll();
          if (watch && !watch.available) this.update({state:'watch-degraded'});
          if (!watch || watch.dirty || watch.overflow || Date.now()-this.lastScan>=reconcileMs) await this.reconcile();
        }
      } catch {this.update({state:'unavailable'});await this.session?.close();this.session=undefined;}
      finally {if (this.watching&&!this.stopped) this.timer=setTimeout(() => {void tick();},pollMs);}
    };
    this.timer=setTimeout(() => {void tick();},0);
  }
  async stop():Promise<void> {
    this.stopped=true;this.watching=false;clearTimeout(this.timer);this.controller?.abort();
    await this.active;await this.session?.close();this.session=undefined;
  }
}
