import * as z from 'zod';
import {MAX_ENVELOPE_BYTES,rpcFailureSchema} from './protocol.ts';
const encoder=new TextEncoder();
const validText=(value:string,units:number,bytes:number)=>value.length<=units&&!/[\p{Cc}\p{Cs}\p{Bidi_Control}]/u.test(value)&&encoder.encode(value).length<=bytes;
const text=(max:number)=>z.string().refine(value=>validText(value,max,max));
const positive=z.number().int().positive().safe();
export const emojiQuerySchema=z.string().refine(value=>validText(value,512,2048));
export const emojiGroupSchema=text(96).min(1);
export const emojiIdSchema=z.string().max(230).regex(/^emoji:[0-9a-f]{4,6}(?:-[0-9a-f]{4,6}){0,31}$/u);
export const emojiValueSchema=text(128).min(1).refine(value=>Array.from(value).length<=32);
export function canonicalEmojiId(value:string):string{return 'emoji:'+Array.from(value,char=>char.codePointAt(0)!.toString(16).padStart(4,'0')).join('-');}
export const emojiRowSchema=z.strictObject({id:emojiIdSchema,value:emojiValueSchema,name:text(256).min(1),group:emojiGroupSchema,subgroup:text(128).min(1),version:z.string().max(8).regex(/^[0-9]{1,2}\.[0-9]$/u)}).refine(row=>row.value.length<=128&&row.id.length<=230&&canonicalEmojiId(row.value)===row.id);
export type EmojiRow=z.infer<typeof emojiRowSchema>;
const preferenceRevision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1);
export const emojiFavouriteIdsSchema=z.array(emojiIdSchema).max(4096).refine(ids=>ids.every((id,index)=>index===0||ids[index-1]!<id));
export function parseEmojiFavouriteSetting(value:unknown):string[]|undefined{
 if(typeof value!=='string'||value.length>MAX_ENVELOPE_BYTES-16384)return undefined;
 try{const raw:unknown=JSON.parse(value);if(!Array.isArray(raw)||raw.length>4096)return undefined;const parsed=emojiFavouriteIdsSchema.safeParse(raw);return parsed.success&&JSON.stringify(parsed.data)===value?parsed.data:undefined;}catch{return undefined;}
}
export const emojiFavouriteSettingSchema=z.string().max(MAX_ENVELOPE_BYTES-16384).refine(value=>parseEmojiFavouriteSetting(value)!==undefined);
export const emojiFavouriteSnapshotSchema=z.strictObject({revision:preferenceRevision,ids:emojiFavouriteIdsSchema});
export type EmojiFavouriteSnapshot=z.infer<typeof emojiFavouriteSnapshotSchema>;
const favouriteAvailability=z.discriminatedUnion('available',[z.strictObject({available:z.literal(true),revision:preferenceRevision}),z.strictObject({available:z.literal(false)})]);
export const emojiSearchRecordSchema=emojiRowSchema.safeExtend({favourite:z.boolean().optional()});

export const emojiToneSchema=z.enum(['unmodified','light','medium-light','medium','medium-dark','dark']);
export type EmojiTone=z.infer<typeof emojiToneSchema>;
/** Tone filters select real source sequences. Mixed tones match each modifier they contain. */
export function emojiMatchesTone(value:string,tone:EmojiTone):boolean{
 if(value.length>128)return false;
 const modifiers=Array.from(value,char=>char.codePointAt(0)!).filter(point=>point>=0x1f3fb&&point<=0x1f3ff);
 if(tone==='unmodified')return modifiers.length===0;
 const point={light:0x1f3fb,'medium-light':0x1f3fc,medium:0x1f3fd,'medium-dark':0x1f3fe,dark:0x1f3ff}[tone];
 return modifiers.includes(point);
}
const tonePresence=(value:{tone?:EmojiTone|undefined;favouritesOnly?:true|undefined})=>(!Object.hasOwn(value,'tone')||value.tone!==undefined)&&(!Object.hasOwn(value,'favouritesOnly')||value.favouritesOnly===true);
export const emojiSearchInputSchema=z.strictObject({revision:positive,query:emojiQuerySchema,group:emojiGroupSchema.optional(),tone:emojiToneSchema.optional(),favouritesOnly:z.literal(true).optional()}).refine(tonePresence);
export const emojiSearchRequestSchema=emojiSearchInputSchema.safeExtend({protocolVersion:z.literal(1)});
export const emojiSearchValueSchema=z.strictObject({revision:positive,searchId:positive,datasetVersion:z.literal('17.0'),query:emojiQuerySchema,group:emojiGroupSchema.nullable(),tone:emojiToneSchema.optional(),favouritesOnly:z.literal(true).optional(),favourites:favouriteAvailability.optional(),groups:z.array(z.strictObject({id:emojiGroupSchema,name:emojiGroupSchema,count:z.number().int().positive().max(10000)})).max(16),records:z.array(emojiSearchRecordSchema).max(100)}).refine(value=>tonePresence(value)&&(!value.favouritesOnly||value.favourites?.available===true)&&value.records.every(row=>value.favourites?.available===true?typeof row.favourite==='boolean'&&(!value.favouritesOnly||row.favourite):!Object.hasOwn(row,'favourite'))&&new Set(value.groups.map(row=>row.id)).size===value.groups.length&&new Set(value.records.map(row=>row.id)).size===value.records.length&&(value.group===null||value.groups.some(row=>row.id===value.group))&&value.records.every(row=>value.groups.some(group=>group.id===row.group)&&(value.group===null||row.group===value.group)&&(value.tone===undefined||emojiMatchesTone(row.value,value.tone))));
export const emojiCopyInputSchema=emojiSearchInputSchema.safeExtend({searchId:positive,id:emojiIdSchema});
export const emojiCopyRequestSchema=emojiCopyInputSchema.safeExtend({protocolVersion:z.literal(1)});
export const emojiFavouriteInputSchema=emojiCopyInputSchema.safeExtend({favourite:z.boolean(),favouritesRevision:preferenceRevision});
export const emojiFavouriteRequestSchema=emojiFavouriteInputSchema.safeExtend({protocolVersion:z.literal(1)});
export const emojiReleaseInputSchema=z.strictObject({revision:positive,searchId:positive});
export const emojiReleaseRequestSchema=emojiReleaseInputSchema.extend({protocolVersion:z.literal(1)});
const failed=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const emojiSearchReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:emojiSearchValueSchema}),failed]);
export const emojiCopyValueSchema=z.strictObject({outcome:z.literal('copied'),revision:positive,searchId:positive,query:emojiQuerySchema,group:emojiGroupSchema.nullable(),tone:emojiToneSchema.optional(),favouritesOnly:z.literal(true).optional(),id:emojiIdSchema,value:emojiValueSchema}).refine(row=>row.value.length<=128&&row.id.length<=230&&canonicalEmojiId(row.value)===row.id&&tonePresence(row)&&(row.tone===undefined||emojiMatchesTone(row.value,row.tone)));
export const emojiCopyReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:emojiCopyValueSchema}),failed]);
export const emojiFavouriteValueSchema=z.strictObject({outcome:z.literal('updated'),revision:positive,searchId:positive,query:emojiQuerySchema,group:emojiGroupSchema.nullable(),tone:emojiToneSchema.optional(),favouritesOnly:z.literal(true).optional(),id:emojiIdSchema,favourite:z.boolean(),favouritesRevision:positive}).refine(tonePresence);
export const emojiFavouriteReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:emojiFavouriteValueSchema}),failed]);
export type EmojiFavouriteReply=z.infer<typeof emojiFavouriteReplySchema>;
export const emojiReleaseReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('released'),searchId:positive})}),failed]);
export type EmojiSearchValue=z.infer<typeof emojiSearchValueSchema>;
export type EmojiSearchReply=z.infer<typeof emojiSearchReplySchema>;
export type EmojiCopyReply=z.infer<typeof emojiCopyReplySchema>;
export type EmojiReleaseReply=z.infer<typeof emojiReleaseReplySchema>;
export interface EmojiApi{
 searchEmoji?(input:z.infer<typeof emojiSearchInputSchema>):Promise<EmojiSearchReply>;
 copyEmoji?(input:z.infer<typeof emojiCopyInputSchema>):Promise<EmojiCopyReply>;
 setEmojiFavourite?(input:z.infer<typeof emojiFavouriteInputSchema>):Promise<EmojiFavouriteReply>;
 releaseEmojiSearch?(input:z.infer<typeof emojiReleaseInputSchema>):Promise<EmojiReleaseReply>;
}
export const EMOJI_CHANNELS={search:'launcher:search-emoji',copy:'launcher:copy-emoji',release:'launcher:release-emoji-search',favourite:'launcher:set-emoji-favourite'} as const;
