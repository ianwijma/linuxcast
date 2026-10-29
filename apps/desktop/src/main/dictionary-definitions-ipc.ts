import type {IpcMain,IpcMainInvokeEvent} from 'electron';
import * as z from 'zod';
import {DEFINITION_CHANNELS,definitionSourceMetadataSchema,definitionSourcePreferenceSchema,definitionSourceConfigSchema,definitionRecordSchema,definitionEntryIdSchema,definitionWordSchema,definitionPartsSchema,definitionsSearchRequestSchema,definitionsSearchReplySchema,definitionReadRequestSchema,definitionReadReplySchema,definitionsConfigureRequestSchema,definitionsConfigureReplySchema,definitionsReleaseRequestSchema,definitionsReleaseReplySchema,dictionaryQuerySchema} from '@linuxcast/contracts';
import type {DefinitionSourceMetadata,DefinitionSourcePreference,DefinitionSourceConfig,DefinitionsSearchValue,DefinitionsConfigureReply} from '@linuxcast/contracts';
export interface LocalDefinitionSource{
 metadata:DefinitionSourceMetadata;
 search(input:{query:string}):Promise<{query:string;records:readonly {id:string;word:string}[];truncated:boolean}>;
 definition(input:{id:string}):Promise<{id:string;word:string;parts:readonly {kind:'meaning'|'phonetic';text:string}[]}>;
 close():Promise<void>;
}
export interface DefinitionsBackend{
 read():Promise<DefinitionSourcePreference>;
 write(expectedRevision:number,source:DefinitionSourceConfig|null):Promise<DefinitionSourcePreference>;
 open(ifoPath:string):Promise<LocalDefinitionSource>;
 choose():Promise<string|null>;
 confirm(source:DefinitionSourceMetadata):Promise<boolean>;
}
interface Context{
 trusted(event:IpcMainInvokeEvent):boolean;active():boolean;busy():boolean;revision():number;generation():number;
 authorize(event:IpcMainInvokeEvent,revision:number):Promise<Extract<DefinitionsConfigureReply,{ok:false}>|undefined>;
 acquire():()=>void;recordUse():Promise<void>;
}
const searchResult=z.strictObject({query:dictionaryQuerySchema,records:z.array(definitionRecordSchema).max(100),truncated:z.boolean()}).refine(value=>new Set(value.records.map(row=>row.id)).size===value.records.length);
const entryResult=z.strictObject({id:definitionEntryIdSchema,word:definitionWordSchema,parts:definitionPartsSchema});
const failure=(code:'invalid-request'|'permission-denied'|'capability-unavailable'|'cancelled'|'conflict'|'deadline-exceeded')=>({ok:false as const,error:{code,retryable:false,message:code==='deadline-exceeded'?'The source configuration outcome is unknown. Wait for the pending request, then reload local definitions to check the saved source. Nothing is replayed.':code==='conflict'?'The local source or results changed. Reload local definitions before another explicit action.':'Local definitions are unavailable or the request was cancelled. Reload, choose a supported local source, or return to installed entries. Nothing is downloaded.'}});
type Issued={owner:IpcMainInvokeEvent['sender'];frame:IpcMainInvokeEvent['senderFrame'];revision:number;generation:number;searchId:number;query:string;preference:DefinitionSourcePreference;source:LocalDefinitionSource|null;metadata:DefinitionSourceMetadata|null;records:Map<string,string>;configuring:boolean};
const samePreference=(a:DefinitionSourcePreference,b:DefinitionSourcePreference)=>a.revision===b.revision&&JSON.stringify(a.source)===JSON.stringify(b.source);
const sourceState=(error:unknown):DefinitionsSearchValue['sourceState']=>{const code=error&&typeof error==='object'&&'code'in error?error.code:undefined;return code==='unsupported-format'?'unsupported-format':code==='malformed'?'invalid':code==='changed'?'changed':'unavailable';};
export function registerDefinitionsIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,backend:DefinitionsBackend,context:Context,readTimeoutMs=4000,configureTimeoutMs=120000){
 let disposed=false,reads=0,sequence=0,issued:Issued|undefined,cached:{key:string;promise:Promise<LocalDefinitionSource>}|undefined;
 const close=(source:LocalDefinitionSource)=>{try{void source.close().catch(()=>{});}catch{/* Closing never grants read authority. */}};
 const clearCache=()=>{const old=cached;cached=undefined;if(old)void old.promise.then(close,()=>{});};
 const key=(preference:DefinitionSourcePreference)=>JSON.stringify(preference);
 const verified=(source:LocalDefinitionSource,preference:DefinitionSourcePreference)=>{const metadata=definitionSourceMetadataSchema.parse(source.metadata);if(!preference.source||metadata.id!==preference.source.sourceId||metadata.snapshotId!==preference.source.snapshotId)throw Object.assign(new Error('Source changed.'),{code:'changed'});return metadata;};
 const load=(preference:DefinitionSourcePreference):Promise<LocalDefinitionSource>=>{
  if(!preference.source)throw new Error('No configured source.');if(cached?.key===key(preference))return cached.promise.then(source=>{verified(source,preference);return source;});clearCache();
  const configuration=preference.source,promise=(async()=>{const source=await backend.open(configuration.ifoPath);try{verified(source,preference);if(disposed)throw new Error('Closed.');return source;}catch(error){close(source);throw error;}})();
  const held={key:key(preference),promise};cached=held;void promise.catch(()=>{if(cached===held)cached=undefined;});return promise;
 };
 const invalidate=(choice:Issued)=>{if(issued===choice){issued=undefined;sequence++;}};
 const matches=(event:IpcMainInvokeEvent,request:{revision:number;searchId:number;query:string;configurationRevision:number},choice:Issued|undefined)=>!!choice&&!choice.configuring&&choice.owner===event.sender&&choice.frame===event.senderFrame&&choice.revision===request.revision&&choice.generation===context.generation()&&choice.searchId===request.searchId&&choice.query===request.query&&choice.preference.revision===request.configurationRevision;
 const fresh=async(preference:DefinitionSourcePreference)=>samePreference(preference,definitionSourcePreferenceSchema.parse(await backend.read()));
 ipc.handle(DEFINITION_CHANNELS.release,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=definitionsReleaseRequestSchema.safeParse(payload);if(!parsed.success)return failure('invalid-request');
  if(issued&&issued.owner===event.sender&&issued.frame===event.senderFrame&&issued.revision===parsed.data.revision&&issued.searchId===parsed.data.searchId)invalidate(issued);
  return definitionsReleaseReplySchema.parse({ok:true,value:{outcome:'released',searchId:parsed.data.searchId}});
 });
 ipc.handle(DEFINITION_CHANNELS.search,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=definitionsSearchRequestSchema.safeParse(payload);if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');
  if(disposed||!context.active()||context.busy()||reads>=4)return failure('cancelled');
  const request=parsed.data,generation=context.generation(),searchId=++sequence,expires=performance.now()+readTimeoutMs;issued=undefined;reads++;let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&context.active()&&!context.busy()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation&&sequence===searchId;
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return failure('cancelled');
   const preference=definitionSourcePreferenceSchema.parse(await backend.read());if(!current())return failure('cancelled');
   let source:LocalDefinitionSource|null=null,metadata:DefinitionSourceMetadata|null=null,state:DefinitionsSearchValue['sourceState']='unconfigured',records:DefinitionsSearchValue['records']=[],truncated=false;
   if(preference.source){try{source=await load(preference);if(!current())return failure('cancelled');metadata=verified(source,preference);const result=searchResult.parse(await source.search({query:request.query}));if(result.query!==request.query||JSON.stringify(verified(source,preference))!==JSON.stringify(metadata))throw Object.assign(new Error('Source changed.'),{code:'changed'});records=result.records;truncated=result.truncated;state='available';}catch(error){source=null;metadata=null;records=[];truncated=false;state=sourceState(error);}}else clearCache();
   if(!current())return failure('cancelled');if(!await fresh(preference))return failure('conflict');const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   const reply=definitionsSearchReplySchema.parse({ok:true,value:{revision:request.revision,searchId,query:request.query,configurationRevision:preference.revision,sourceState:state,source:metadata,records,truncated}});if(!reply.ok)return failure('capability-unavailable');
   issued={owner:event.sender,frame:event.senderFrame,revision:request.revision,generation,searchId,query:request.query,preference,source,metadata,records:new Map(records.map(row=>[row.id,row.word])),configuring:false};return reply;
  }catch{return failure('capability-unavailable');}finally{reads--;}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(failure('capability-unavailable'));},readTimeoutMs);})]);}finally{clearTimeout(timer);}
 });
 ipc.handle(DEFINITION_CHANNELS.read,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=definitionReadRequestSchema.safeParse(payload);if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');if(disposed||!context.active()||context.busy()||reads>=4)return failure('cancelled');
  const request=parsed.data,choice=issued;if(!matches(event,request,choice)||!choice?.source||!choice.metadata||choice.metadata.id!==request.sourceId||choice.metadata.snapshotId!==request.snapshotId||!choice.records.has(request.id))return failure('conflict');
  reads++;const expires=performance.now()+readTimeoutMs;let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&issued===choice&&sequence===choice.searchId&&context.active()&&!context.busy()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===choice.generation;
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return failure('cancelled');if(!await fresh(choice.preference))return failure('conflict');if(!current())return failure('cancelled');
   if(JSON.stringify(verified(choice.source!,choice.preference))!==JSON.stringify(choice.metadata))return failure('conflict');const entry=entryResult.parse(await choice.source!.definition({id:request.id}));if(JSON.stringify(verified(choice.source!,choice.preference))!==JSON.stringify(choice.metadata)||entry.id!==request.id||entry.word!==choice.records.get(request.id))return failure('conflict');if(!current())return failure('cancelled');
   if(!await fresh(choice.preference))return failure('conflict');const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   const reply=definitionReadReplySchema.parse({ok:true,value:{revision:request.revision,searchId:request.searchId,query:request.query,configurationRevision:request.configurationRevision,sourceId:request.sourceId,snapshotId:request.snapshotId,...entry}});try{await context.recordUse();}catch{/* Ranking never prevents a successful read. */}return current()?reply:failure('cancelled');
  }catch{return failure('capability-unavailable');}finally{reads--;}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(failure('capability-unavailable'));},readTimeoutMs);})]);}finally{clearTimeout(timer);}
 });
 ipc.handle(DEFINITION_CHANNELS.configure,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=definitionsConfigureRequestSchema.safeParse(payload);if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');if(disposed||!context.active()||context.busy())return failure('cancelled');
  const request=parsed.data,choice=issued;if(!matches(event,request,choice)||!choice)return failure('conflict');if(request.configurationRevision>=Number.MAX_SAFE_INTEGER-1)return failure('conflict');if(request.action==='forget'&&!choice.preference.source)return failure('invalid-request');
  choice.configuring=true;const release=context.acquire(),generation=context.generation(),expires=performance.now()+configureTimeoutMs;let expired=false,dispatched=false,candidate:LocalDefinitionSource|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&issued===choice&&sequence===choice.searchId&&context.active()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation;
  const reply=(outcome:'configured'|'forgotten'|'cancelled',nextConfigurationRevision:number,source:DefinitionSourceMetadata|null)=>definitionsConfigureReplySchema.parse({ok:true,value:{revision:request.revision,searchId:request.searchId,query:request.query,configurationRevision:request.configurationRevision,action:request.action,outcome,nextConfigurationRevision,source}});
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return failure('cancelled');if(!await fresh(choice.preference))return failure('conflict');if(!current())return failure('cancelled');
   let next:DefinitionSourceConfig|null=null,metadata:DefinitionSourceMetadata|null=null;
   if(request.action==='choose'){
    const path=await backend.choose();if(!current())return failure('cancelled');if(path===null)return reply('cancelled',request.configurationRevision,choice.metadata);
    const safePath=definitionSourceConfigSchema.shape.ifoPath.parse(path);candidate=await backend.open(safePath);metadata=definitionSourceMetadataSchema.parse(candidate.metadata);next=definitionSourceConfigSchema.parse({ifoPath:safePath,sourceId:metadata.id,snapshotId:metadata.snapshotId});if(!current())return failure('cancelled');
    const consent=await backend.confirm(metadata);if(!current())return failure('cancelled');if(!consent)return reply('cancelled',request.configurationRevision,choice.metadata);
    const checked=searchResult.parse(await candidate.search({query:''}));if(checked.query!==''||JSON.stringify(definitionSourceMetadataSchema.parse(candidate.metadata))!==JSON.stringify(metadata))return failure('capability-unavailable');if(!current())return failure('cancelled');
   }
   if(!await fresh(choice.preference))return failure('conflict');const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   dispatched=true;const saved=definitionSourcePreferenceSchema.parse(await backend.write(request.configurationRevision,next));if(!current())return failure('deadline-exceeded');if(saved.revision!==request.configurationRevision+1||JSON.stringify(saved.source)!==JSON.stringify(next))throw new Error('Unconfirmed configuration.');
   clearCache();if(candidate){cached={key:key(saved),promise:Promise.resolve(candidate)};candidate=undefined;}
   return reply(request.action==='choose'?'configured':'forgotten',saved.revision,metadata);
  }catch{return failure(dispatched?'deadline-exceeded':'capability-unavailable');}finally{if(candidate)close(candidate);invalidate(choice);choice.configuring=false;release();}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;invalidate(choice);resolve(failure(dispatched?'deadline-exceeded':'cancelled'));},configureTimeoutMs);})]);}finally{clearTimeout(timer);}
 });
 return()=>{disposed=true;issued=undefined;sequence++;clearCache();for(const channel of Object.values(DEFINITION_CHANNELS))ipc.removeHandler(channel);};
}
