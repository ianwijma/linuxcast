import * as z from 'zod';
import {rpcFailureSchema} from './protocol.ts';
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
export const emojiSearchInputSchema=z.strictObject({revision:positive,query:emojiQuerySchema,group:emojiGroupSchema.optional()});
export const emojiSearchRequestSchema=emojiSearchInputSchema.extend({protocolVersion:z.literal(1)});
export const emojiSearchValueSchema=z.strictObject({revision:positive,searchId:positive,datasetVersion:z.literal('17.0'),query:emojiQuerySchema,group:emojiGroupSchema.nullable(),groups:z.array(z.strictObject({id:emojiGroupSchema,name:emojiGroupSchema,count:z.number().int().positive().max(10000)})).max(16),records:z.array(emojiRowSchema).max(100)}).refine(value=>new Set(value.groups.map(row=>row.id)).size===value.groups.length&&new Set(value.records.map(row=>row.id)).size===value.records.length&&(value.group===null||value.groups.some(row=>row.id===value.group))&&value.records.every(row=>value.groups.some(group=>group.id===row.group)&&(value.group===null||row.group===value.group)));
export const emojiCopyInputSchema=emojiSearchInputSchema.extend({searchId:positive,id:emojiIdSchema});
export const emojiCopyRequestSchema=emojiCopyInputSchema.extend({protocolVersion:z.literal(1)});
export const emojiReleaseInputSchema=z.strictObject({revision:positive,searchId:positive});
export const emojiReleaseRequestSchema=emojiReleaseInputSchema.extend({protocolVersion:z.literal(1)});
const failed=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const emojiSearchReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:emojiSearchValueSchema}),failed]);
export const emojiCopyValueSchema=z.strictObject({outcome:z.literal('copied'),revision:positive,searchId:positive,query:emojiQuerySchema,group:emojiGroupSchema.nullable(),id:emojiIdSchema,value:emojiValueSchema}).refine(row=>row.value.length<=128&&row.id.length<=230&&canonicalEmojiId(row.value)===row.id);
export const emojiCopyReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:emojiCopyValueSchema}),failed]);
export const emojiReleaseReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('released'),searchId:positive})}),failed]);
export type EmojiSearchValue=z.infer<typeof emojiSearchValueSchema>;
export type EmojiSearchReply=z.infer<typeof emojiSearchReplySchema>;
export type EmojiCopyReply=z.infer<typeof emojiCopyReplySchema>;
export type EmojiReleaseReply=z.infer<typeof emojiReleaseReplySchema>;
export interface EmojiApi{
 searchEmoji?(input:z.infer<typeof emojiSearchInputSchema>):Promise<EmojiSearchReply>;
 copyEmoji?(input:z.infer<typeof emojiCopyInputSchema>):Promise<EmojiCopyReply>;
 releaseEmojiSearch?(input:z.infer<typeof emojiReleaseInputSchema>):Promise<EmojiReleaseReply>;
}
export const EMOJI_CHANNELS={search:'launcher:search-emoji',copy:'launcher:copy-emoji',release:'launcher:release-emoji-search'} as const;
