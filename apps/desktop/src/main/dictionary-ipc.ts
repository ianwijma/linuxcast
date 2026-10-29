import type {IpcMain,IpcMainInvokeEvent} from 'electron';
import {DICTIONARY_CHANNELS,dictionaryCatalogueSchema,dictionaryBackendSearchSchema,dictionarySearchRequestSchema,dictionarySearchReplySchema,dictionaryCopyRequestSchema,dictionaryCopyReplySchema,dictionaryReleaseRequestSchema,dictionaryReleaseReplySchema} from '../../../../packages/contracts/src/dictionary.ts';
import type {DictionaryLanguage,DictionaryCopyReply,DictionarySearchValue} from '../../../../packages/contracts/src/dictionary.ts';
export interface DictionaryBackend{
 languages():Promise<{languages:readonly DictionaryLanguage[];truncated:boolean}>;
 search(input:{languageId:string;query:string}):Promise<{language:DictionaryLanguage;snapshotId:string;query:string;words:readonly {id:string;word:string}[];truncated:boolean}>;
}
interface Context{
 trusted(event:IpcMainInvokeEvent):boolean;active():boolean;busy():boolean;revision():number;generation():number;
 authorize(event:IpcMainInvokeEvent,revision:number):Promise<Extract<DictionaryCopyReply,{ok:false}>|undefined>;
 acquire():()=>void;recordUse():Promise<void>;copy?:(text:string)=>Promise<'written'|'unsupported'|'busy'>;
}
const failure=(code:'invalid-request'|'permission-denied'|'capability-unavailable'|'cancelled'|'conflict'|'deadline-exceeded')=>({ok:false as const,error:{code,retryable:false,message:code==='deadline-exceeded'?'Copy could not be confirmed. Check your clipboard, then reload Dictionary before another explicit Copy. Nothing is replayed.':code==='conflict'?'Dictionary results changed. Reload results and select a word again.':code==='cancelled'?'Finish the current launcher action, then reload Dictionary.':'Dictionary search or Copy is unavailable. Reload installed languages; nothing is downloaded. Copy is separate from pasting into another application.'}});
type Issued={owner:IpcMainInvokeEvent['sender'];frame:IpcMainInvokeEvent['senderFrame'];revision:number;generation:number;searchId:number;query:string;languageId:string;snapshotId:string;records:Map<string,string>;copying:boolean};
/** Only trusted installed-source words issued to this frame can reach the existing clipboard writer. */
export function registerDictionaryIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,backend:DictionaryBackend,context:Context,timeoutMs=4000){
 let disposed=false,reads=0,sequence=0,issued:Issued|undefined;
 const invalidate=(choice:Issued)=>{if(issued===choice){issued=undefined;sequence++;}};
 ipc.handle(DICTIONARY_CHANNELS.release,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=dictionaryReleaseRequestSchema.safeParse(payload);if(!parsed.success)return failure('invalid-request');
  if(issued&&issued.owner===event.sender&&issued.frame===event.senderFrame&&issued.revision===parsed.data.revision&&issued.searchId===parsed.data.searchId)invalidate(issued);
  return dictionaryReleaseReplySchema.parse({ok:true,value:{outcome:'released',searchId:parsed.data.searchId}});
 });
 ipc.handle(DICTIONARY_CHANNELS.search,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=dictionarySearchRequestSchema.safeParse(payload);
  if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');
  if(disposed||!context.active()||context.busy()||reads>=4)return failure('cancelled');
  const request=parsed.data,generation=context.generation(),searchId=++sequence,expires=performance.now()+timeoutMs;issued=undefined;reads++;let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&context.active()&&!context.busy()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation&&sequence===searchId;
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return failure('cancelled');
   const catalogue=dictionaryCatalogueSchema.parse(await backend.languages());if(!current())return failure('cancelled');
   const language=request.languageId?catalogue.languages.find(row=>row.id===request.languageId):catalogue.languages.find(row=>row.state==='available')??catalogue.languages[0]??null;
   if(request.languageId&&!language)return failure('conflict');
   let snapshotId:string|null=null,records:DictionarySearchValue['records']=[],truncated=false;
   if(language?.state==='available'){
    const result=dictionaryBackendSearchSchema.parse(await backend.search({languageId:language.id,query:request.query}));if(!current())return failure('cancelled');
    if(result.language.id!==language.id||JSON.stringify(result.language)!==JSON.stringify(language)||result.query!==request.query)return failure('conflict');
    snapshotId=result.snapshotId;records=result.words;truncated=result.truncated;
   }
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   const reply=dictionarySearchReplySchema.parse({ok:true,value:{revision:request.revision,searchId,query:request.query,requestedLanguageId:request.languageId??null,language,languages:catalogue.languages,languagesTruncated:catalogue.truncated,snapshotId,records,truncated}});
   if(!reply.ok)return failure('capability-unavailable');
   if(language?.state==='available'&&snapshotId)issued={owner:event.sender,frame:event.senderFrame,revision:request.revision,generation,searchId,query:request.query,languageId:language.id,snapshotId,records:new Map(records.map(row=>[row.id,row.word])),copying:false};return reply;
  }catch{return failure('capability-unavailable');}finally{reads--;}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(failure('capability-unavailable'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 ipc.handle(DICTIONARY_CHANNELS.copy,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=dictionaryCopyRequestSchema.safeParse(payload);
  if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');
  if(disposed||!context.active()||context.busy())return failure('cancelled');const request=parsed.data,choice=issued;
  if(!choice||choice.copying||choice.owner!==event.sender||choice.frame!==event.senderFrame||choice.revision!==request.revision||choice.generation!==context.generation()||choice.searchId!==request.searchId||choice.query!==request.query||choice.languageId!==request.languageId||choice.snapshotId!==request.snapshotId||!choice.records.has(request.id))return failure('conflict');
  if(!context.copy)return failure('capability-unavailable');
  choice.copying=true;const release=context.acquire(),generation=context.generation(),expires=performance.now()+timeoutMs;let expired=false,dispatched=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&issued===choice&&sequence===choice.searchId&&context.active()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation;
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return failure('cancelled');
   const word=choice.records.get(request.id)!;
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   dispatched=true;const outcome=await context.copy!(word);if(!current()){invalidate(choice);return failure('deadline-exceeded');}
   if(outcome==='unsupported')return failure('capability-unavailable');if(outcome==='busy')return failure('cancelled');if(outcome!=='written')throw new Error('Copy not confirmed.');
   await context.recordUse();if(!current()){invalidate(choice);return failure('deadline-exceeded');}choice.generation=generation;
   return dictionaryCopyReplySchema.parse({ok:true,value:{outcome:'copied',revision:request.revision,searchId:request.searchId,query:request.query,languageId:request.languageId,snapshotId:request.snapshotId,id:request.id,word}});
  }catch{invalidate(choice);return failure(dispatched?'deadline-exceeded':'capability-unavailable');}finally{choice.copying=false;release();}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;invalidate(choice);resolve(failure(dispatched?'deadline-exceeded':'cancelled'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 return()=>{disposed=true;issued=undefined;sequence++;for(const channel of Object.values(DICTIONARY_CHANNELS))ipc.removeHandler(channel);};
}
