import {createHash} from 'node:crypto';
import type {IpcMain,IpcMainInvokeEvent} from 'electron';
import {DICTIONARY_SPELLING_CHANNELS,dictionarySpellingRequestSchema,dictionarySpellingReplySchema,dictionarySpellingCopyRequestSchema,dictionarySpellingCopyReplySchema,dictionarySpellingReleaseRequestSchema,dictionarySpellingReleaseReplySchema,nativeSpellingEventSchema} from '../../../../packages/contracts/src/dictionary-spelling.ts';
import {dictionaryCatalogueSchema,dictionaryBackendSearchSchema} from '../../../../packages/contracts/src/dictionary.ts';
import type {DictionarySpellingCopyReply,DictionarySpellingValue} from '../../../../packages/contracts/src/dictionary-spelling.ts';
import type {DictionaryBackend} from './dictionary-ipc.ts';
interface Context{
 trusted(event:IpcMainInvokeEvent):boolean;active():boolean;busy():boolean;revision():number;generation():number;
 authorize(event:IpcMainInvokeEvent,revision:number):Promise<Extract<DictionarySpellingCopyReply,{ok:false}>|undefined>;
 acquire():()=>void;recordUse():Promise<void>;copy?:(text:string)=>Promise<'written'|'unsupported'|'busy'>;
}
type Code='invalid-request'|'permission-denied'|'capability-unavailable'|'cancelled'|'conflict'|'deadline-exceeded';
const failure=(code:Code)=>({ok:false as const,error:{code,retryable:false,message:code==='deadline-exceeded'?'Copy could not be confirmed. Check your clipboard, then Check spelling again before another explicit Copy. Nothing is replayed.':code==='conflict'?'The installed language or spelling result changed. Check spelling again.':'Spelling is unavailable or cancelled. Check the installed UTF-8 language and reopen Dictionary. Nothing is downloaded or pasted.'}});
type Task={event:IpcMainInvokeEvent;request:{revision:number;requestId:string;languageId:string;word:string};checkId:number;generation:number;controller:AbortController};
type Issued={task:Task;value:DictionarySpellingValue;generation:number;copying:boolean};
/** Renderer words request read-only checks; only issued, freshly revalidated suggestions grant Copy authority. */
export function registerSpellingIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,backend:DictionaryBackend,context:Context,timeoutMs=4000){
 let disposed=false,sequence=0,issued:Issued|undefined,latest:Task|undefined;
 const reads=new Set<Task>();
 const sameOwner=(task:Task,event:IpcMainInvokeEvent)=>task.event.sender===event.sender&&task.event.senderFrame===event.senderFrame;
 const invalidate=(choice:Issued)=>{if(issued===choice)issued=undefined;};
 ipc.handle(DICTIONARY_SPELLING_CHANNELS.release,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=dictionarySpellingReleaseRequestSchema.safeParse(payload);if(!parsed.success)return failure('invalid-request');
  const matches=(task:Task)=>sameOwner(task,event)&&task.request.revision===parsed.data.revision&&task.request.requestId===parsed.data.requestId;
  if(latest&&matches(latest)){latest.controller.abort();latest=undefined;}if(issued&&matches(issued.task))invalidate(issued);
  return dictionarySpellingReleaseReplySchema.parse({ok:true,value:{outcome:'released',requestId:parsed.data.requestId}});
 });
 ipc.handle(DICTIONARY_SPELLING_CHANNELS.check,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=dictionarySpellingRequestSchema.safeParse(payload);if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');
  if(disposed||!context.active()||context.busy()||reads.size>=4)return failure('cancelled');if(!backend.checkSpelling)return failure('capability-unavailable');
  latest?.controller.abort();issued=undefined;const task:Task={event,request:parsed.data,checkId:++sequence,generation:context.generation(),controller:new AbortController()};latest=task;reads.add(task);
  const expires=performance.now()+timeoutMs;let timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!disposed&&!task.controller.signal.aborted&&performance.now()<expires&&latest===task&&context.active()&&!context.busy()&&context.trusted(event)&&context.revision()===task.request.revision&&context.generation()===task.generation;
  const work=(async()=>{try{
   const denied=await context.authorize(event,task.request.revision);if(denied)return denied;if(!current())return failure('cancelled');
   const catalogue=dictionaryCatalogueSchema.parse(await backend.languages());if(!current())return failure('cancelled');const language=catalogue.languages.find(row=>row.id===task.request.languageId);if(language?.state!=='available')return failure('capability-unavailable');
   const raw=await backend.checkSpelling!({languageId:language.id,word:task.request.word,signal:task.controller.signal});if(!current())return failure('cancelled');
   const native=nativeSpellingEventSchema.parse({protocolVersion:1,kind:'result',backend:raw.backend,word:raw.word,correct:raw.correct,suggestions:raw.suggestions,truncated:raw.truncated});
   if(native.kind!=='result'||native.word!==task.request.word||JSON.stringify(raw.language)!==JSON.stringify(language))return failure('conflict');
   const texts=native.correct?[native.word]:native.suggestions;
   const reply=dictionarySpellingReplySchema.parse({ok:true,value:{revision:task.request.revision,requestId:task.request.requestId,languageId:language.id,word:native.word,checkId:task.checkId,language,snapshotId:raw.snapshotId,backend:native.backend,correct:native.correct,truncated:native.truncated,records:texts.map(text=>({id:`spelling:${createHash('sha256').update(`${language.id}\0${raw.snapshotId}\0${native.word}\0${text}`).digest('hex')}`,text}))}});
   const revoked=await context.authorize(event,task.request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   if(!reply.ok)return failure('capability-unavailable');issued={task,value:reply.value,generation:task.generation,copying:false};return reply;
  }catch{return failure('capability-unavailable');}finally{reads.delete(task);}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{task.controller.abort();resolve(failure('capability-unavailable'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 ipc.handle(DICTIONARY_SPELLING_CHANNELS.copy,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=dictionarySpellingCopyRequestSchema.safeParse(payload);if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');
  if(disposed||!context.active()||context.busy())return failure('cancelled');const request=parsed.data,choice=issued;
  if(!choice||choice.copying||!sameOwner(choice.task,event)||choice.generation!==context.generation()||!Object.entries(request).every(([key,value])=>key==='protocolVersion'||key==='id'||choice.value[key as keyof DictionarySpellingValue]===value)||!choice.value.records.some(row=>row.id===request.id))return failure('conflict');
  if(!context.copy)return failure('capability-unavailable');choice.copying=true;const release=context.acquire(),generation=context.generation(),expires=performance.now()+timeoutMs;let expired=false,dispatched=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&issued===choice&&context.active()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation;
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return failure('cancelled');
   const source=dictionaryBackendSearchSchema.parse(await backend.search({languageId:request.languageId,query:''}));if(!current())return failure('cancelled');
   if(source.query!==''||source.snapshotId!==request.snapshotId||JSON.stringify(source.language)!==JSON.stringify(choice.value.language)){invalidate(choice);return failure('conflict');}
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   const text=choice.value.records.find(row=>row.id===request.id)!.text;dispatched=true;const outcome=await context.copy!(text);if(!current()){invalidate(choice);return failure('deadline-exceeded');}
   if(outcome==='unsupported')return failure('capability-unavailable');if(outcome==='busy')return failure('cancelled');if(outcome!=='written')throw new Error('unconfirmed');
   await context.recordUse();if(!current()){invalidate(choice);return failure('deadline-exceeded');}
   return dictionarySpellingCopyReplySchema.parse({ok:true,value:{revision:request.revision,requestId:request.requestId,languageId:request.languageId,word:request.word,checkId:request.checkId,snapshotId:request.snapshotId,id:request.id,outcome:'copied',text}});
  }catch{invalidate(choice);return failure(dispatched?'deadline-exceeded':'capability-unavailable');}finally{choice.generation=generation;choice.copying=false;release();}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;invalidate(choice);resolve(failure(dispatched?'deadline-exceeded':'cancelled'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 return()=>{disposed=true;issued=undefined;latest=undefined;for(const task of reads)task.controller.abort();for(const channel of Object.values(DICTIONARY_SPELLING_CHANNELS))ipc.removeHandler(channel);};
}
