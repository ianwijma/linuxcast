import * as z from 'zod';
import {rpcFailureSchema} from './protocol.ts';
import {dictionaryQuerySchema,dictionarySnapshotIdSchema} from './dictionary.ts';
const encoder=new TextEncoder(),positive=z.number().int().positive().safe(),preferenceRevision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1);
const clean=(value:string)=>!/[\p{Cc}\p{Cs}\p{Bidi_Control}]/u.test(value);
export const definitionSourceIdSchema=z.string().regex(/^stardict:[0-9a-f]{64}$/u);
export const definitionEntryIdSchema=z.string().regex(/^entry:[0-9a-f]{64}$/u);
export const definitionWordSchema=z.string().min(1).max(256).refine(value=>value.length<=256&&clean(value)&&Array.from(value).length<=128&&encoder.encode(value).length<256);
export const definitionPartSchema=z.strictObject({kind:z.enum(['meaning','phonetic']),text:z.string().max(65536).refine(value=>value.length<=65536&&!/[\p{Cc}\p{Cs}\p{Bidi_Control}]/u.test(value.replace(/[\r\n\t]/gu,''))&&encoder.encode(value).length<=65536)});
export const definitionPartsSchema=z.array(definitionPartSchema).min(1).max(32).refine(parts=>parts.length<=32&&parts.reduce((size,part)=>size+encoder.encode(part.text).length,0)<=65536);
export const definitionSourceMetadataSchema=z.strictObject({id:definitionSourceIdSchema,name:z.string().min(1).max(256).refine(clean),wordCount:z.number().int().nonnegative().max(250000),snapshotId:dictionarySnapshotIdSchema});
export type DefinitionSourceMetadata=z.infer<typeof definitionSourceMetadataSchema>;
/** Private main/storage preference only. Never expose this schema through a renderer API. */
export const definitionSourceConfigSchema=z.strictObject({ifoPath:z.string().min(6).max(4096).refine(value=>value.length<=4096&&clean(value)&&value.startsWith('/')&&value.endsWith('.ifo')&&!value.endsWith('/.ifo')&&encoder.encode(value).length<=4096),sourceId:definitionSourceIdSchema,snapshotId:dictionarySnapshotIdSchema});
export type DefinitionSourceConfig=z.infer<typeof definitionSourceConfigSchema>;
export function parseDefinitionSourceSetting(value:unknown):DefinitionSourceConfig|null|undefined{
 if(typeof value!=='string'||value.length>8192)return undefined;
 try{const parsed=definitionSourceConfigSchema.nullable().safeParse(JSON.parse(value));return parsed.success&&JSON.stringify(parsed.data)===value?parsed.data:undefined;}catch{return undefined;}
}
export const definitionSourceSettingSchema=z.string().max(8192).refine(value=>parseDefinitionSourceSetting(value)!==undefined);
export const definitionSourcePreferenceSchema=z.strictObject({revision:preferenceRevision,source:definitionSourceConfigSchema.nullable()});
export type DefinitionSourcePreference=z.infer<typeof definitionSourcePreferenceSchema>;
export const definitionRecordSchema=z.strictObject({id:definitionEntryIdSchema,word:definitionWordSchema});
export const definitionsSearchInputSchema=z.strictObject({revision:positive,query:dictionaryQuerySchema});
export const definitionsSearchRequestSchema=definitionsSearchInputSchema.extend({protocolVersion:z.literal(1)});
export const definitionsSearchValueSchema=z.strictObject({revision:positive,searchId:positive,query:dictionaryQuerySchema,configurationRevision:preferenceRevision,sourceState:z.enum(['unconfigured','available','unavailable','unsupported-format','invalid','changed']),source:definitionSourceMetadataSchema.nullable(),records:z.array(definitionRecordSchema).max(100),truncated:z.boolean()}).refine(value=>(value.sourceState==='available'?value.source!==null:value.source===null&&value.records.length===0&&!value.truncated)&&new Set(value.records.map(row=>row.id)).size===value.records.length);
export type DefinitionsSearchValue=z.infer<typeof definitionsSearchValueSchema>;
const failed=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const definitionsSearchReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:definitionsSearchValueSchema}),failed]);
export type DefinitionsSearchReply=z.infer<typeof definitionsSearchReplySchema>;
export const definitionsContextSchema=definitionsSearchInputSchema.extend({searchId:positive,configurationRevision:preferenceRevision});
export const definitionReadInputSchema=definitionsContextSchema.extend({sourceId:definitionSourceIdSchema,snapshotId:dictionarySnapshotIdSchema,id:definitionEntryIdSchema});
export const definitionReadRequestSchema=definitionReadInputSchema.extend({protocolVersion:z.literal(1)});
export const definitionReadValueSchema=definitionReadInputSchema.extend({word:definitionWordSchema,parts:definitionPartsSchema});
export const definitionReadReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:definitionReadValueSchema}),failed]);
export type DefinitionReadReply=z.infer<typeof definitionReadReplySchema>;
export const definitionsConfigureInputSchema=definitionsContextSchema.extend({action:z.enum(['choose','forget'])});
export const definitionsConfigureRequestSchema=definitionsConfigureInputSchema.extend({protocolVersion:z.literal(1)});
export const definitionsConfigureValueSchema=definitionsConfigureInputSchema.extend({outcome:z.enum(['configured','forgotten','cancelled']),nextConfigurationRevision:preferenceRevision,source:definitionSourceMetadataSchema.nullable()}).refine(value=>value.outcome==='cancelled'?value.action==='choose'&&value.nextConfigurationRevision===value.configurationRevision:value.nextConfigurationRevision===value.configurationRevision+1&&(value.outcome==='configured'?value.action==='choose'&&value.source!==null:value.action==='forget'&&value.source===null));
export const definitionsConfigureReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:definitionsConfigureValueSchema}),failed]);
export type DefinitionsConfigureReply=z.infer<typeof definitionsConfigureReplySchema>;
export const definitionsReleaseInputSchema=z.strictObject({revision:positive,searchId:positive});
export const definitionsReleaseRequestSchema=definitionsReleaseInputSchema.extend({protocolVersion:z.literal(1)});
export const definitionsReleaseReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('released'),searchId:positive})}),failed]);
export type DefinitionsReleaseReply=z.infer<typeof definitionsReleaseReplySchema>;
export interface DictionaryDefinitionsApi{
 searchDictionaryDefinitions?(input:z.infer<typeof definitionsSearchInputSchema>):Promise<DefinitionsSearchReply>;
 readDictionaryDefinition?(input:z.infer<typeof definitionReadInputSchema>):Promise<DefinitionReadReply>;
 configureDictionaryDefinitions?(input:z.infer<typeof definitionsConfigureInputSchema>):Promise<DefinitionsConfigureReply>;
 releaseDictionaryDefinitionsSearch?(input:z.infer<typeof definitionsReleaseInputSchema>):Promise<DefinitionsReleaseReply>;
}
export const DEFINITION_CHANNELS={search:'launcher:search-dictionary-definitions',read:'launcher:read-dictionary-definition',configure:'launcher:configure-dictionary-definitions',release:'launcher:release-dictionary-definitions-search'} as const;
