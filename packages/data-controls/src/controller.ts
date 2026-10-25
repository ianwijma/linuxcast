import { setTimeout as yieldToOwner } from 'node:timers/promises';
import { MAX_ENVELOPE_BYTES,parseContract } from '../../contracts/src/index.ts';
import { dataClearParamsSchema,dataClearResultSchema,dataExportParamsSchema,dataExportResultSchema } from '../../platform-contracts/src/data-controls.ts';
import type { DataClearParams,DataClearResult,DataExportParams,DataExportResult } from '../../platform-contracts/src/data-controls.ts';
export interface DataControlClient {
  request(method:'dataControls.clear',params:DataClearParams,options?:{signal?:AbortSignal}):Promise<DataClearResult>;
  request(method:'dataControls.export',params:DataExportParams,options?:{signal?:AbortSignal}):Promise<DataExportResult>;
}
export type ClearOutcome={outcome:'completed';category:DataClearParams['category'];removed:number} |
  {outcome:'cancelled'|'unavailable';removed:number;mayHaveChanged:boolean;automaticReplay:false;reason:'cancelled'|'invalid-request'|'clear-in-progress'|'index-stop-failed'|'storage-unavailable';remediationAction:'review-data'|'retry-storage'};
export type ExportOutcome={outcome:'exported';format:'linuxcast-category-json';encrypted:false;data:DataExportResult} |
  {outcome:'unavailable';reason:'invalid-request'|'cancelled'|'export-too-large'|'storage-unavailable';remediationAction:'select-smaller-category'|'retry-storage'};
/** Trusted main controller. Register every index job before starting it, so
 * clearing can stop existing jobs and bar new jobs until all batches settle.
 * This is not a renderer dispatcher or authority to export arbitrary tables. */
export class DataControls {
  #client:DataControlClient;
  #jobs=new Map<string,{stop():Promise<void>}>();
  #clearing=false;
  #indexGate=false;
  constructor(client:DataControlClient){this.#client=client;}
  registerIndexJob(rootId:string,job:{stop():Promise<void>}):()=>void {
    parseContract(dataClearParamsSchema,{category:'file-index',ids:[rootId]});
    if(this.#indexGate || this.#jobs.has(rootId) || this.#jobs.size>=1000)throw new Error('File index control unavailable.');
    this.#jobs.set(rootId,job);return ()=>{if(this.#jobs.get(rootId)===job)this.#jobs.delete(rootId);};
  }
  async clear(value:unknown,options:{signal?:AbortSignal}={}):Promise<ClearOutcome> {
    let params:DataClearParams;
    try{params=structuredClone(parseContract(dataClearParamsSchema,value));}catch{return {outcome:'unavailable',removed:0,mayHaveChanged:false,automaticReplay:false,reason:'invalid-request',remediationAction:'review-data'};}
    const interrupted=(reason:'cancelled'|'clear-in-progress'|'index-stop-failed'|'storage-unavailable',removed:number,mayHaveChanged:boolean):ClearOutcome=>({outcome:reason==='cancelled'?'cancelled':'unavailable',removed,mayHaveChanged,automaticReplay:false,reason,remediationAction:reason==='storage-unavailable'?'retry-storage':'review-data'});
    if(this.#clearing)return interrupted('clear-in-progress',0,false);
    if(options.signal?.aborted)return interrupted('cancelled',0,false);
    if(params.ids?.length===0)return {outcome:'completed',category:params.category,removed:0};
    this.#clearing=true;
    let removed=0,dispatched=false;
    try {
      if(params.category==='file-index') {
        this.#indexGate=true;
        const jobs=[...this.#jobs].filter(([id])=>params.ids===undefined || params.ids.includes(id));
        // Keep registrations until every stop settles, including a failed stop;
        // the caller can retry explicitly but cannot silently restart the job.
        const stopped=await Promise.allSettled(jobs.map(([,job])=>Promise.resolve().then(()=>job.stop())));
        if(stopped.some(result=>result.status==='rejected'))return interrupted('index-stop-failed',0,false);
        for(const [id,job] of jobs)if(this.#jobs.get(id)===job)this.#jobs.delete(id);
      }
      for(let batch=0;batch<10_000;batch++) {
        if(options.signal?.aborted)return interrupted('cancelled',removed,dispatched);
        dispatched=true;
        const result=parseContract(dataClearResultSchema,await this.#client.request('dataControls.clear',structuredClone(params),options));
        if(result.category!==params.category || (params.category==='file-index' && (result.removed>512 || (!result.complete && result.removed===0))))throw new Error();
        removed+=result.removed;if(!Number.isSafeInteger(removed))throw new Error();
        if(result.complete)return {outcome:'completed',category:params.category,removed};
        await yieldToOwner(0);
      }
      return interrupted('storage-unavailable',removed,true);
    }catch{return interrupted(options.signal?.aborted?'cancelled':'storage-unavailable',removed,dispatched);}
    finally{this.#clearing=false;this.#indexGate=false;}
  }
  async export(value:unknown,options:{signal?:AbortSignal}={}):Promise<ExportOutcome> {
    let params:DataExportParams;
    try{params=structuredClone(parseContract(dataExportParamsSchema,value));}catch{return {outcome:'unavailable',reason:'invalid-request',remediationAction:'select-smaller-category'};}
    if(options.signal?.aborted)return {outcome:'unavailable',reason:'cancelled',remediationAction:'retry-storage'};
    try {
      const raw=await this.#client.request('dataControls.export',params,options);
      if(Buffer.byteLength(JSON.stringify(raw))>MAX_ENVELOPE_BYTES)throw new Error();
      const data=parseContract(dataExportResultSchema,raw);if(data.category!==params.category)throw new Error();
      if(data.category==='ai-conversations') {
        const ids=new Set(data.conversations.map(record=>record.id));
        if(ids.size!==data.conversations.length || data.conversations.some(record=>params.ids!==undefined && !params.ids.includes(record.id)) || data.messageRevisions.some(record=>!ids.has(record.conversationId)) || new Set(data.messageRevisions.map(record=>record.id)).size!==data.messageRevisions.length)throw new Error();
      }else {
        const ids=data.category==='settings'?data.records.map(record=>record.id):data.records.map(record=>record.commandId);
        if(new Set(ids).size!==ids.length || ids.some(id=>params.ids!==undefined && !params.ids.includes(id)))throw new Error();
      }
      if(options.signal?.aborted)return {outcome:'unavailable',reason:'cancelled',remediationAction:'retry-storage'};
      return {outcome:'exported',format:'linuxcast-category-json',encrypted:false,data:structuredClone(data)};
    }catch(error:unknown){
      const tooLarge=error!==null && typeof error==='object' && 'reasonCode' in error && error.reasonCode==='export-too-large';
      return {outcome:'unavailable',reason:options.signal?.aborted?'cancelled':tooLarge?'export-too-large':'storage-unavailable',remediationAction:tooLarge?'select-smaller-category':'retry-storage'};
    }
  }
}
