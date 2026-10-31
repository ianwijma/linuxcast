import * as z from 'zod';
import { constants } from 'node:fs';
import { mkdir, open, readdir, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join,isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { planRetention,RETENTION_DEFAULTS } from './retention.ts';
export const diagnosticCategorySchema=z.enum(['application-logs','tool-diagnostics']);
export type DiagnosticCategory=z.infer<typeof diagnosticCategorySchema>;
export const diagnosticEventSchema=z.strictObject({
  component:z.enum(['main','storage','permissions','secrets','file-index','workflow','ai','native']),
  event:z.enum(['started','completed','cancelled','unavailable','denied','failed']),
  reason:z.enum(['locked','unavailable','insecure-backend','invalid-request','storage-failed','permission-required','interrupted','limit-exceeded']).optional(),
  durationMs:z.number().int().min(0).max(86_400_000).optional(),
});
const recordSchema=diagnosticEventSchema.extend({schemaVersion:z.literal(1),id:z.uuid(),at:z.iso.datetime(),category:diagnosticCategorySchema});
export type DiagnosticRecord=z.infer<typeof recordSchema>;
type Result<T>={outcome:'completed';result:T}|{outcome:'unavailable';reason:'diagnostics-unavailable';remediationAction:'reset-diagnostics'};
const fail=():Result<never>=>({outcome:'unavailable',reason:'diagnostics-unavailable',remediationAction:'reset-diagnostics'});
const namePattern=/^(application-logs|tool-diagnostics)-([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\.json$/u;
/** Local allowlisted metadata, not a general-purpose text/error logger. This is
 * the one main-owned diagnostics service; records never accept content fields. */
export class LocalDiagnostics {
  #directory:FileHandle;
  #tail:Promise<unknown>=Promise.resolve();
  #closed=false;
  private constructor(directory:FileHandle){this.#directory=directory;}
  static async open(stateDirectory:string):Promise<LocalDiagnostics> {
    if(!isAbsolute(stateDirectory))throw new Error('Diagnostics unavailable.');
    let directory:FileHandle|undefined;
    try {
      const path=join(stateDirectory,'diagnostics');await mkdir(path,{mode:0o700}).catch((error:unknown)=>{if(!(error && typeof error==='object' && 'code' in error && error.code==='EEXIST'))throw new Error();});
      directory=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);const stat=await directory.stat();
      if(!stat.isDirectory() || stat.uid!==process.getuid?.() || (stat.mode&0o777)!==0o700)throw new Error();
      return new LocalDiagnostics(directory);
    }catch{await directory?.close();throw new Error('Diagnostics unavailable.');}
  }
  #path(name:string):string {if(!namePattern.test(name))throw new Error();return `/proc/self/fd/${this.#directory.fd}/${name}`;}
  #queue<T>(operation:()=>Promise<T>):Promise<Result<T>> {
    if(this.#closed)return Promise.resolve(fail());
    const result=this.#tail.then(async()=>{try{return {outcome:'completed' as const,result:await operation()};}catch{return fail();}});
    this.#tail=result;return result;
  }
  async #names(category:DiagnosticCategory):Promise<string[]> {
    const names=await readdir(`/proc/self/fd/${this.#directory.fd}`);if(names.length>25_000)throw new Error();
    return names.filter(name=>namePattern.test(name) && name.startsWith(`${category}-`));
  }
  async #records(category:DiagnosticCategory):Promise<{record:DiagnosticRecord;size:number;name:string}[]> {
    const result:{record:DiagnosticRecord;size:number;name:string}[]=[];
    for(const name of await this.#names(category)) {
      const file=await open(this.#path(name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      try {
        const stat=await file.stat();if(!stat.isFile() || stat.uid!==process.getuid?.() || (stat.mode&0o777)!==0o600 || stat.size>2048 || stat.nlink!==1)throw new Error();
        const value=await file.readFile('utf8');const record=recordSchema.parse(JSON.parse(value));
        if(record.category!==category || name!==`${category}-${record.id}.json`)throw new Error();
        result.push({record,size:Buffer.byteLength(value),name});
      }finally{await file.close();}
    }
    return result;
  }
  async #prune(category:DiagnosticCategory,now:number):Promise<number> {
    const records=await this.#records(category);
    const defaults=category==='application-logs'?RETENTION_DEFAULTS.applicationLogs:RETENTION_DEFAULTS.toolDiagnostics;
    const plan=planRetention(records.map(({record,size})=>({id:record.id,createdAt:record.at,sizeBytes:size,pinned:false})),{...defaults,maxUnpinnedItems:10_000},now);
    for(const id of plan.removeIds)await unlink(this.#path(`${category}-${id}.json`));
    if(plan.removeIds.length)await this.#directory.sync();return plan.removeIds.length;
  }
  append(category:DiagnosticCategory,event:unknown):Promise<Result<{id:string}>> {
    return this.#queue(async()=>{
      diagnosticCategorySchema.parse(category);const parsed=diagnosticEventSchema.parse(event);const now=Date.now();await this.#prune(category,now);
      const names=await this.#names(category);if(names.length>=10_000) {
        // Leave room for this event by evicting the oldest eligible metadata.
        const records=await this.#records(category);records.sort((a,b)=>a.record.at.localeCompare(b.record.at)||a.record.id.localeCompare(b.record.id));await unlink(this.#path(records[0]!.name));
      }
      const record:DiagnosticRecord={...parsed,schemaVersion:1,id:randomUUID(),at:new Date(now).toISOString(),category};
      const file=await open(this.#path(`${category}-${record.id}.json`),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await file.writeFile(JSON.stringify(record));await file.sync();}finally{await file.close();}
      await this.#directory.sync();await this.#prune(category,now);return {id:record.id};
    });
  }
  export(category:DiagnosticCategory):Promise<Result<{schemaVersion:1;category:DiagnosticCategory;records:DiagnosticRecord[]}>> {
    return this.#queue(async()=>{diagnosticCategorySchema.parse(category);await this.#prune(category,Date.now());return {schemaVersion:1,category,records:(await this.#records(category)).map(({record})=>record)};});
  }
  clear(category:DiagnosticCategory):Promise<Result<{removed:number}>> {
    return this.#queue(async()=>{diagnosticCategorySchema.parse(category);const names=await this.#names(category);for(const name of names)await unlink(this.#path(name));await this.#directory.sync();return {removed:names.length};});
  }
  prune(category:DiagnosticCategory,now=Date.now()):Promise<Result<{removed:number}>> {return this.#queue(async()=>{diagnosticCategorySchema.parse(category);return {removed:await this.#prune(category,now)};});}
  async close():Promise<void>{if(this.#closed)return;this.#closed=true;await this.#tail;await this.#directory.close();}
}
