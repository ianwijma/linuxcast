import {DICTIONARY_CHANNELS,dictionarySearchInputSchema,dictionarySearchReplySchema,dictionaryCopyInputSchema,dictionaryCopyReplySchema,dictionaryReleaseInputSchema,dictionaryReleaseReplySchema,MAX_ENVELOPE_BYTES} from '../../../../packages/contracts/src/index.ts';
import type {DictionaryApi} from '../../../../packages/contracts/src/dictionary.ts';
import type {ShellTransport} from './api.ts';
const failure=(code:'invalid-request'|'capability-unavailable'|'deadline-exceeded')=>({ok:false as const,error:{code,retryable:false,message:code==='deadline-exceeded'?'Copy could not be confirmed. Check your clipboard, then reload Dictionary before another explicit Copy. Nothing is replayed.':code==='invalid-request'?'Use a valid Dictionary search and current selected word.':'Dictionary is unavailable. Reload commands or reopen the view to reconnect. Nothing is downloaded.'}});
const bounded=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length<=MAX_ENVELOPE_BYTES;
export function createDictionaryApi(transport:Pick<ShellTransport,'invoke'>):DictionaryApi{
 return Object.freeze<DictionaryApi>({
  async searchDictionary(input){
   const request=dictionarySearchInputSchema.safeParse(input);if(!request.success)return failure('invalid-request');
   try{const raw=await transport.invoke(DICTIONARY_CHANNELS.search,{protocolVersion:1,...request.data});if(!bounded(raw))return failure('capability-unavailable');const reply=dictionarySearchReplySchema.safeParse(raw);
    return reply.success&&(!reply.data.ok||reply.data.value.revision===request.data.revision&&reply.data.value.query===request.data.query&&reply.data.value.requestedLanguageId===(request.data.languageId??null))?reply.data:failure('capability-unavailable');
   }catch{return failure('capability-unavailable');}
  },
  async copyDictionaryWord(input){
   const request=dictionaryCopyInputSchema.safeParse(input);if(!request.success)return failure('invalid-request');
   try{const raw=await transport.invoke(DICTIONARY_CHANNELS.copy,{protocolVersion:1,...request.data});if(!bounded(raw))return failure('deadline-exceeded');const reply=dictionaryCopyReplySchema.safeParse(raw);
    return reply.success&&(!reply.data.ok||Object.entries(request.data).every(([key,value])=>reply.data.ok&&reply.data.value[key as keyof typeof request.data]===value))?reply.data:failure('deadline-exceeded');
   }catch{return failure('deadline-exceeded');}
  },
  async releaseDictionarySearch(input){
   const request=dictionaryReleaseInputSchema.safeParse(input);if(!request.success)return failure('invalid-request');
   try{const raw=await transport.invoke(DICTIONARY_CHANNELS.release,{protocolVersion:1,...request.data});if(!bounded(raw))return failure('capability-unavailable');const reply=dictionaryReleaseReplySchema.safeParse(raw);return reply.success&&(!reply.data.ok||reply.data.value.searchId===request.data.searchId)?reply.data:failure('capability-unavailable');}catch{return failure('capability-unavailable');}
  },
 });
}
