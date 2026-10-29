import {EMOJI_CHANNELS,emojiSearchInputSchema,emojiSearchReplySchema,emojiCopyInputSchema,emojiCopyReplySchema,emojiReleaseInputSchema,emojiReleaseReplySchema,MAX_ENVELOPE_BYTES} from '../../../../packages/contracts/src/index.ts';
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
    if(!reply.success||reply.data.ok&&(reply.data.value.revision!==request.data.revision||reply.data.value.query!==request.data.query||reply.data.value.group!==(request.data.group??null)))return failed('capability-unavailable');return reply.data;
   }catch{return failed('capability-unavailable');}
  },
  async copyEmoji(input){
   const request=emojiCopyInputSchema.safeParse(input);if(!request.success)return failed('invalid-request');
   try{const raw=await transport.invoke(EMOJI_CHANNELS.copy,{protocolVersion:1,...request.data});if(!bounded(raw))return failed('deadline-exceeded');const reply=emojiCopyReplySchema.safeParse(raw);
    if(!reply.success||reply.data.ok&&(reply.data.value.revision!==request.data.revision||reply.data.value.searchId!==request.data.searchId||reply.data.value.id!==request.data.id||reply.data.value.query!==request.data.query||reply.data.value.group!==(request.data.group??null)))return failed('deadline-exceeded');return reply.data;
   }catch{return failed('deadline-exceeded');}
  },
  async releaseEmojiSearch(input){
   const request=emojiReleaseInputSchema.safeParse(input);if(!request.success)return failed('invalid-request');
   try{const raw=await transport.invoke(EMOJI_CHANNELS.release,{protocolVersion:1,...request.data});if(!bounded(raw))return failed('capability-unavailable');const reply=emojiReleaseReplySchema.safeParse(raw);return reply.success&&(!reply.data.ok||reply.data.value.searchId===request.data.searchId)?reply.data:failed('capability-unavailable');}catch{return failed('capability-unavailable');}
  },
 });
}
