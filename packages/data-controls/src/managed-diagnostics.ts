import { constants } from 'node:fs';
import { mkdir,open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { MAX_ENVELOPE_BYTES } from '@linuxcast/contracts';
import { LocalDiagnostics } from './diagnostics.ts';
import type { DiagnosticCategory } from './diagnostics.ts';

const unavailable=()=>Object.assign(new Error('Diagnostics unavailable.'),{reasonCode:'diagnostics-unavailable'});
/** Main-owned lifecycle. No renderer receives records or a filesystem path;
 * exports go directly to the existing native-dialog publisher. */
export class ManagedDiagnostics {
  #opening:Promise<LocalDiagnostics|undefined>;
  #closing:Promise<void>|undefined;
  #timer:ReturnType<typeof setTimeout>|undefined;
  #maintenance:Promise<void>=Promise.resolve();
  #closed=false;
  constructor(stateDirectory:string) {
    this.#opening=this.#initialize(stateDirectory);
  }
  async #initialize(path:string):Promise<LocalDiagnostics|undefined> {
    if(!isAbsolute(path))return undefined;
    let directory:Awaited<ReturnType<typeof open>>|undefined,diagnostics:LocalDiagnostics|undefined;
    try {
      await mkdir(path,{recursive:true,mode:0o700});
      directory=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      const info=await directory.stat();
      if(info.uid!==process.getuid?.()||(info.mode&0o777)!==0o700)throw unavailable();
      diagnostics=await LocalDiagnostics.open(`/proc/self/fd/${directory.fd}`);
      if(this.#closed){await diagnostics.close();return undefined;}
      // A failed append must not prevent explicit reset of a corrupt category.
      await diagnostics.append('application-logs',{component:'main',event:'started'});
      await diagnostics.prune('tool-diagnostics');
      this.#schedule(diagnostics);
      return diagnostics;
    } catch {await diagnostics?.close().catch(()=>{});return undefined;}
    finally {await directory?.close().catch(()=>{});}
  }
  #schedule(service:LocalDiagnostics):void {
    if(this.#closed)return;
    this.#timer=setTimeout(()=>{
      this.#timer=undefined;
      this.#maintenance=(async()=>{
        await service.prune('application-logs');
        await service.prune('tool-diagnostics');
      })().catch(()=>{/* Fixed unavailable results remain recoverable by category reset. */})
        .finally(()=>{this.#schedule(service);});
    },60_000);
    this.#timer.unref();
  }
  async #service(signal?:AbortSignal):Promise<LocalDiagnostics> {
    signal?.throwIfAborted();
    const service=await this.#opening;
    signal?.throwIfAborted();
    if(this.#closed||!service)throw unavailable();
    return service;
  }
  async export(category:DiagnosticCategory,signal?:AbortSignal):Promise<unknown> {
    const service=await this.#service(signal),result=await service.export(category);
    signal?.throwIfAborted();
    if(result.outcome!=='completed')throw unavailable();
    const value={schemaVersion:1,format:'linuxcast-diagnostics-json',encrypted:false,data:result.result};
    // Complete-or-fail, using the same bound as the final native file publisher.
    if(Buffer.byteLength(JSON.stringify(value)+'\n')>MAX_ENVELOPE_BYTES)throw {reasonCode:'export-too-large'};
    return value;
  }
  async clear(category:DiagnosticCategory,signal?:AbortSignal):Promise<void> {
    const service=await this.#service(signal);
    // Once dispatched, a clear may have happened even if its window closes.
    // Await the real result; cancellation never manufactures an undone clear.
    const result=await service.clear(category);
    if(result.outcome!=='completed')throw unavailable();
  }
  close():Promise<void> {
    this.#closed=true;
    if(this.#timer){clearTimeout(this.#timer);this.#timer=undefined;}
    return this.#closing??=(async()=>{const service=await this.#opening;await this.#maintenance;await service?.close();})();
  }
}
