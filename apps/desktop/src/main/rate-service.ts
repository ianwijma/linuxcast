import {randomUUID} from 'node:crypto';
import {RATE_ENDPOINT,rateAmountSchema,ratePairSchema,rateSnapshotSchema,rateQuoteSchema,rateConfigurationSchema} from '@linuxcast/contracts';
import type {RateConfiguration,RateQuote,RateSnapshot} from '@linuxcast/contracts';
import {parseFrankfurterRate,calculateRateText,isRateStale} from '@linuxcast/calculator/rates';
export type RateFailure='disabled'|'configuration-changed'|'busy'|'unavailable'|'invalid-request'|'expired'|'cancelled';
export class RateServiceError extends Error{readonly reason:RateFailure;constructor(reason:RateFailure){super('Currency conversion unavailable.');this.reason=reason;}}
export interface RateServiceOptions{
 configuration():Promise<RateConfiguration>;
 configure(expectedRevision:number,source:'disabled'|'frankfurter'):Promise<RateConfiguration>;
 cached(pair:{base:string;quote:string}):Promise<RateSnapshot|null>;
 /** Storage owner atomically checks enabled source/revision before publishing. */
 cache(snapshot:RateSnapshot,configurationRevision:number):Promise<void>;
 clear(configurationRevision:number):Promise<void>;
 /** Fixed native HTTPS endpoint only; caller supplies no URL/amount/headers. */
 fetch(pair:{base:string;quote:string},signal:AbortSignal):Promise<unknown>;
 now?:()=>Date;
}
/** One explicit rate operation, one ephemeral quote, no amount/result history. */
export class RateConversionService{
 #options:RateServiceOptions;#generation=0;#converting=false;#controller:AbortController|undefined;
 #quote:{value:RateQuote;snapshot:RateSnapshot}|undefined;
 constructor(options:RateServiceOptions){this.#options=options;}
 #now(){return (this.#options.now?.()??new Date()).toISOString();}
 async configuration(){return rateConfigurationSchema.parse(await this.#options.configuration());}
 #invalidate(){this.#generation++;this.#quote=undefined;this.#controller?.abort();}
 async configure(expectedRevision:number,source:'disabled'|'frankfurter'){
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!['disabled','frankfurter'].includes(source))throw new RateServiceError('invalid-request');
  this.#invalidate();const value=rateConfigurationSchema.parse(await this.#options.configure(expectedRevision,source));
  if(value.revision!==expectedRevision+1||value.source!==source)throw new RateServiceError('configuration-changed');return value;
 }
 async clear(configurationRevision:number){
  this.#invalidate();const config=await this.configuration();if(config.revision!==configurationRevision)throw new RateServiceError('configuration-changed');await this.#options.clear(configurationRevision);
 }
 async convert(input:{configurationRevision:number;amount:string;base:string;quote:string},signal:AbortSignal):Promise<RateQuote>{
  if(this.#converting)throw new RateServiceError('busy');
  if(!rateAmountSchema.safeParse(input.amount).success||!ratePairSchema.safeParse({base:input.base,quote:input.quote}).success)throw new RateServiceError('invalid-request');
  this.#converting=true;this.#quote=undefined;const generation=++this.#generation,controller=new AbortController();this.#controller=controller;
  const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  const current=()=>{if(controller.signal.aborted||generation!==this.#generation)throw new RateServiceError('cancelled');};
  const pair={base:input.base,quote:input.quote};
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const config=await this.configuration();current();
   if(config.revision!==input.configurationRevision)throw new RateServiceError('configuration-changed');
   if(config.source!=='frankfurter')throw new RateServiceError('disabled');
   let snapshot:RateSnapshot,connection:'online'|'offline'='online';
   try{
    // Race bounds even a broken trusted transport. Abort closes production socket.
    const payload=await Promise.race([this.#options.fetch(pair,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new RateServiceError('unavailable'));},8000);})]);
    current();snapshot=parseFrankfurterRate(payload,pair,this.#now());
   }catch{
    if(signal.aborted||generation!==this.#generation)throw new RateServiceError('cancelled');
    const cached=await this.#options.cached(pair);if(!cached)throw new RateServiceError('unavailable');
    snapshot=rateSnapshotSchema.parse(cached);if(snapshot.base!==pair.base||snapshot.quote!==pair.quote)throw new RateServiceError('unavailable');connection='offline';
   }finally{clearTimeout(timer);}
   // Deadline-aborted fetch may use cache; explicit cancellation/config change may not.
   if(signal.aborted||generation!==this.#generation)throw new RateServiceError('cancelled');
   const fresh=await this.configuration();if(signal.aborted||generation!==this.#generation)throw new RateServiceError('cancelled');if(fresh.revision!==config.revision||fresh.source!=='frankfurter')throw new RateServiceError('configuration-changed');
   if(connection==='online')await this.#options.cache(snapshot,config.revision);
   if(signal.aborted||generation!==this.#generation)throw new RateServiceError('cancelled');
   const now=this.#now(),value=rateQuoteSchema.parse({id:randomUUID(),configurationRevision:config.revision,amount:input.amount,base:pair.base,quote:pair.quote,text:calculateRateText(input.amount,snapshot),provider:'frankfurter',endpoint:RATE_ENDPOINT,asOfDate:snapshot.asOfDate,fetchedAt:snapshot.fetchedAt,connection,stale:isRateStale(snapshot,now),expiresAt:new Date(Date.parse(now)+300000).toISOString()});
   this.#quote={value,snapshot};return value;
  }finally{signal.removeEventListener('abort',abort);if(this.#controller===controller)this.#controller=undefined;controller.abort();this.#converting=false;}
 }
 async copyValue(quoteId:string){
  const stored=this.#quote,generation=this.#generation;if(!stored||stored.value.id!==quoteId)throw new RateServiceError('expired');
  const config=await this.configuration(),now=Date.parse(this.#now()),expires=Date.parse(stored.value.expiresAt);
  if(this.#quote!==stored||generation!==this.#generation||config.source!=='frankfurter'||config.revision!==stored.value.configurationRevision||now>=expires||now<expires-300000)throw new RateServiceError('expired');
  const text=calculateRateText(stored.value.amount,stored.snapshot);if(text!==stored.value.text)throw new RateServiceError('expired');
  return {clipboardText:`${text} ${stored.value.quote}`,receipt:{outcome:'copied' as const,quoteId,text,currency:stored.value.quote}};
 }
 isCurrentQuote(quoteId:string){const value=this.#quote?.value;if(!value||value.id!==quoteId)return false;const now=Date.parse(this.#now()),expires=Date.parse(value.expiresAt);return now>=expires-300000&&now<expires;}
 invalidate(){this.#invalidate();}
}
