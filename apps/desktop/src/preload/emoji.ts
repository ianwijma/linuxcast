import {emojiKeywordsInputSchema,emojiKeywordsReplySchema} from '../../../../packages/contracts/src/emoji.ts';
import {EMOJI_CHANNELS,emojiSearchInputSchema,emojiSearchReplySchema,emojiCopyInputSchema,emojiCopyReplySchema,emojiReleaseInputSchema,emojiReleaseReplySchema,MAX_ENVELOPE_BYTES,emojiFavouriteInputSchema,emojiFavouriteReplySchema} from '../../../../packages/contracts/src/index.ts';
import type {EmojiApi} from '../../../../packages/contracts/src/emoji.ts';
import type {ShellTransport} from './api.ts';
const failed=(code:'invalid-request'|'capability-unavailable'|'deadline-exceeded')=>({ok:false as const,error:{code,retryable:false,message:code==='deadline-exceeded'?'Copy could not be confirmed. Check your clipboard, then reload Emoji results before another explicit Copy.':code==='invalid-request'?'Use a valid Emoji search and current selection.':'Emoji is unavailable. Reload commands or reopen the view to reconnect.'}});
const bounded=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length<=MAX_ENVELOPE_BYTES;
/** Named local Emoji operations only. Main owns canonical data and copy authority. */
export function createEmojiApi(transport:Pick<ShellTransport,'invoke'>):EmojiApi{
 return Object.freeze<EmojiApi>({
  async searchEmoji(input){
   const request=emojiSearchInputSchema.safeParse(input);if(!request.success)return failed('invalid-request');
   try{const raw=await transport.invoke(EMOJI_CHANNELS.search,{protocolVersion:1,...request.data});if(!bounded(raw))return failed('capability-unavailable');const reply=emojiSearchReplySchema.safeParse(raw);
    if(!reply.success||reply.data.ok&&(reply.data.value.revision!==request.data.revision||reply.data.value.query!==request.data.query||reply.data.value.group!==(request.data.group??null)||reply.data.value.tone!==request.data.tone||reply.data.value.favouritesOnly!==request.data.favouritesOnly))return failed('capability-unavailable');return reply.data;
   }catch{return failed('capability-unavailable');}
  },
  async copyEmoji(input){
   const request=emojiCopyInputSchema.safeParse(input);if(!request.success)return failed('invalid-request');
   try{const raw=await transport.invoke(EMOJI_CHANNELS.copy,{protocolVersion:1,...request.data});if(!bounded(raw))return failed('deadline-exceeded');const reply=emojiCopyReplySchema.safeParse(raw);
    if(!reply.success||reply.data.ok&&(reply.data.value.revision!==request.data.revision||reply.data.value.searchId!==request.data.searchId||reply.data.value.id!==request.data.id||reply.data.value.query!==request.data.query||reply.data.value.group!==(request.data.group??null)||reply.data.value.tone!==request.data.tone||reply.data.value.favouritesOnly!==request.data.favouritesOnly))return failed('deadline-exceeded');return reply.data;
   }catch{return failed('deadline-exceeded');}
  },
  async setEmojiFavourite(input){
   const request=emojiFavouriteInputSchema.safeParse(input);if(!request.success)return failed('invalid-request');
   const unknown=()=>({ok:false as const,error:{code:'deadline-exceeded' as const,retryable:false,message:'Favourite change could not be confirmed. Reload emoji to read stored favourites before another explicit change. Nothing is replayed.'}});
   try{const raw=await transport.invoke(EMOJI_CHANNELS.favourite,{protocolVersion:1,...request.data});if(!bounded(raw))return unknown();const reply=emojiFavouriteReplySchema.safeParse(raw);
    if(!reply.success||reply.data.ok&&(reply.data.value.revision!==request.data.revision||reply.data.value.searchId!==request.data.searchId||reply.data.value.id!==request.data.id||reply.data.value.query!==request.data.query||reply.data.value.group!==(request.data.group??null)||reply.data.value.tone!==request.data.tone||reply.data.value.favouritesOnly!==request.data.favouritesOnly||reply.data.value.favourite!==request.data.favourite||reply.data.value.favouritesRevision!==request.data.favouritesRevision+1))return unknown();return reply.data;
   }catch{return unknown();}
  },
  async setEmojiKeywords(input){
   const request=emojiKeywordsInputSchema.safeParse(input);if(!request.success)return failed('invalid-request');
   const unknown=()=>({ok:false as const,error:{code:'deadline-exceeded' as const,retryable:false,message:'Keyword save could not be confirmed. Wait for the pending save, then Reload emoji to read saved keywords before another explicit change. Nothing is replayed.'}});
   try{const raw=await transport.invoke(EMOJI_CHANNELS.keywords,{protocolVersion:1,...request.data});if(!bounded(raw))return unknown();const reply=emojiKeywordsReplySchema.safeParse(raw);
    if(!reply.success||reply.data.ok&&(reply.data.value.revision!==request.data.revision||reply.data.value.searchId!==request.data.searchId||reply.data.value.id!==request.data.id||reply.data.value.query!==request.data.query||reply.data.value.group!==(request.data.group??null)||reply.data.value.tone!==request.data.tone||reply.data.value.favouritesOnly!==request.data.favouritesOnly||JSON.stringify(reply.data.value.keywords)!==JSON.stringify(request.data.keywords)||reply.data.value.keywordsRevision!==request.data.keywordsRevision+1))return unknown();return reply.data;
   }catch{return unknown();}
  },
  async releaseEmojiSearch(input){
   const request=emojiReleaseInputSchema.safeParse(input);if(!request.success)return failed('invalid-request');
   try{const raw=await transport.invoke(EMOJI_CHANNELS.release,{protocolVersion:1,...request.data});if(!bounded(raw))return failed('capability-unavailable');const reply=emojiReleaseReplySchema.safeParse(raw);return reply.success&&(!reply.data.ok||reply.data.value.searchId===request.data.searchId)?reply.data:failed('capability-unavailable');}catch{return failed('capability-unavailable');}
  },
 });
}
