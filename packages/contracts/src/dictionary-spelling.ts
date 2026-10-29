import * as z from 'zod';
import {rpcFailureSchema} from './protocol.ts';
import {dictionaryLanguageIdSchema,dictionaryLanguageSchema,dictionarySnapshotIdSchema,dictionaryWordSchema} from './dictionary.ts';
const positive=z.number().int().positive().safe(),encoder=new TextEncoder();
/** Suggestions can contain an internal space, unlike the single input word. */
export const dictionarySpellingTextSchema=z.string().min(1).max(512).refine(value=>value.length<=512&&value.trim()===value&&!/[\p{Cc}\p{Cs}\p{Bidi_Control}]/u.test(value)&&Array.from(value).length<=256&&encoder.encode(value).length<=1024);
export const dictionarySpellingRecordSchema=z.strictObject({id:z.string().regex(/^spelling:[0-9a-f]{64}$/u),text:dictionarySpellingTextSchema});
export const dictionarySpellingInputSchema=z.strictObject({revision:positive,requestId:z.uuid(),languageId:dictionaryLanguageIdSchema,word:dictionaryWordSchema});
export const dictionarySpellingRequestSchema=dictionarySpellingInputSchema.extend({protocolVersion:z.literal(1)});
export const dictionarySpellingValueSchema=dictionarySpellingInputSchema.extend({checkId:positive,language:dictionaryLanguageSchema,snapshotId:dictionarySnapshotIdSchema,backend:z.literal('hunspell-1.7'),correct:z.boolean(),records:z.array(dictionarySpellingRecordSchema).max(32),truncated:z.boolean()}).refine(value=>value.language.id===value.languageId&&value.language.state==='available'&&new Set(value.records.map(row=>row.id)).size===value.records.length&&new Set(value.records.map(row=>row.text)).size===value.records.length&&(!value.correct||value.records.length===1&&value.records[0]!.text===value.word&&!value.truncated));
const failure=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const dictionarySpellingReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:dictionarySpellingValueSchema}),failure]);
export const dictionarySpellingCopyInputSchema=dictionarySpellingInputSchema.extend({checkId:positive,snapshotId:dictionarySnapshotIdSchema,id:dictionarySpellingRecordSchema.shape.id});
export const dictionarySpellingCopyRequestSchema=dictionarySpellingCopyInputSchema.extend({protocolVersion:z.literal(1)});
export const dictionarySpellingCopyReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:dictionarySpellingCopyInputSchema.extend({outcome:z.literal('copied'),text:dictionarySpellingTextSchema})}),failure]);
export const dictionarySpellingReleaseInputSchema=z.strictObject({revision:positive,requestId:z.uuid()});
export const dictionarySpellingReleaseRequestSchema=dictionarySpellingReleaseInputSchema.extend({protocolVersion:z.literal(1)});
export const dictionarySpellingReleaseReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('released'),requestId:z.uuid()})}),failure]);
export type DictionarySpellingValue=z.infer<typeof dictionarySpellingValueSchema>;
export type DictionarySpellingReply=z.infer<typeof dictionarySpellingReplySchema>;
export type DictionarySpellingCopyReply=z.infer<typeof dictionarySpellingCopyReplySchema>;
export interface DictionarySpellingApi{
 checkDictionarySpelling?(input:z.infer<typeof dictionarySpellingInputSchema>):Promise<DictionarySpellingReply>;
 copyDictionarySpellingSuggestion?(input:z.infer<typeof dictionarySpellingCopyInputSchema>):Promise<DictionarySpellingCopyReply>;
 releaseDictionarySpelling?(input:z.infer<typeof dictionarySpellingReleaseInputSchema>):Promise<z.infer<typeof dictionarySpellingReleaseReplySchema>>;
}
export const DICTIONARY_SPELLING_CHANNELS={check:'launcher:check-dictionary-spelling',copy:'launcher:copy-dictionary-spelling',release:'launcher:release-dictionary-spelling'} as const;
/** Main-to-fixed-native-worker only. No paths or resource controls are accepted. */
export const nativeSpellingRequestSchema=z.strictObject({protocolVersion:z.literal(1),kind:z.literal('check'),word:dictionaryWordSchema});
export const nativeSpellingEventSchema=z.discriminatedUnion('kind',[
 z.strictObject({protocolVersion:z.literal(1),kind:z.literal('ready'),backend:z.literal('hunspell-1.7')}),
 z.strictObject({protocolVersion:z.literal(1),kind:z.literal('result'),backend:z.literal('hunspell-1.7'),word:dictionaryWordSchema,correct:z.boolean(),suggestions:z.array(dictionarySpellingTextSchema).max(32),truncated:z.boolean()}).refine(value=>new Set(value.suggestions).size===value.suggestions.length&&(!value.correct||value.suggestions.length===0&&!value.truncated)),
 z.strictObject({protocolVersion:z.literal(1),kind:z.literal('failed'),code:z.enum(['invalid-request','unavailable','unsupported-encoding','changed','malformed'])}),
]);
