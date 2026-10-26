import * as z from 'zod';
import { httpUrlSchema } from './open-url.ts';
import { rpcFailureSchema } from './protocol.ts';
import type { RepositoryContracts } from './repositories.ts';

export const MAX_QUICKLINKS=500;
const revision=z.number().int().positive().safe();
export const quicklinkNameSchema=z.string().min(1).max(128).refine(value=>value===value.trim()&&!/[\p{Cc}\p{Cs}]/u.test(value)&&new TextEncoder().encode(value).length<=256);
/** This increment is literal web URLs. Reject template syntax before URL.href
 * can normalize it; percent-encoded literal braces never become placeholders. */
export const quicklinkUrlSchema=z.string().refine(value=>!/[{}]/u.test(value)).pipe(httpUrlSchema).refine(value=>new URL(value).host.length<=320);
export const WEB_SEARCH_TEMPLATE='{{vars.query}}' as const;
export const webSearchParameterSchema=z.string().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/u);
export const webSearchQuerySchema=z.string().min(1).max(2048).refine(value=>value.trim().length>0&&!/[\p{Cc}\p{Cs}]/u.test(value)&&new TextEncoder().encode(value).length<=2048);
/** One explicit query-component builder. Other template/context sources remain
 * separate capabilities, never inferred from a saved string or root query. */
export const quicklinkWebSearchSchema=z.strictObject({queryParameter:webSearchParameterSchema,template:z.literal(WEB_SEARCH_TEMPLATE)});
export type QuicklinkWebSearch=z.infer<typeof quicklinkWebSearchSchema>;
export const normalizeQuicklinkName=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en-US').trim().replace(/\s+/gu,' ');
/** Explicit user labels only: canonical Unicode/trim, no delimiter or controls. */
export const quicklinkTagSchema=z.string().max(128).transform(value=>value.normalize('NFKC').trim()).pipe(z.string().min(1).max(32).refine(value=>new TextEncoder().encode(value).length<=64&&!/[\p{Cc}\p{Cs},]/u.test(value)));
export const quicklinkTagsSchema=z.array(quicklinkTagSchema).max(8).refine(values=>new Set(values.map(normalizeQuicklinkName)).size===values.length);
export const quicklinkSelectionSchema=z.strictObject({id:z.uuid(),revision});
export const quicklinkSaveSchema=z.strictObject({id:z.uuid().optional(),expectedRevision:z.number().int().nonnegative().safe(),name:quicklinkNameSchema,url:quicklinkUrlSchema,tags:quicklinkTagsSchema.optional(),webSearch:quicklinkWebSearchSchema.optional()})
  .refine(value=>value.id===undefined?value.expectedRevision===0:value.expectedRevision>0);
export const quicklinkRecordSchema=z.strictObject({id:z.uuid(),revision,name:quicklinkNameSchema,url:quicklinkUrlSchema,tags:quicklinkTagsSchema.optional(),webSearch:quicklinkWebSearchSchema.optional(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()})
  .refine(value=>Date.parse(value.createdAt)<=Date.parse(value.updatedAt));
export const quicklinkSummarySchema=z.strictObject({id:z.uuid(),revision,name:quicklinkNameSchema,host:z.string().min(1).max(320).regex(/^[!-~]+$/u),tags:quicklinkTagsSchema.optional(),webSearch:z.literal(true).optional()});
export const quicklinkListSchema=z.array(quicklinkSummarySchema).max(MAX_QUICKLINKS).refine(records=>records.every((record,index)=>index===0||records[index-1]!.id<record.id));
export type QuicklinkRecord=z.infer<typeof quicklinkRecordSchema>;
export type QuicklinkSummary=z.infer<typeof quicklinkSummarySchema>;
export type QuicklinkSelection=z.infer<typeof quicklinkSelectionSchema>;
export type QuicklinkSave=z.infer<typeof quicklinkSaveSchema>;
export interface QuicklinkStorageMethods {
  'quicklinks.list':{params:Record<string,never>;result:QuicklinkSummary[]};
  'quicklinks.get':{params:QuicklinkSelection;result:QuicklinkRecord|null};
  'quicklinks.save':{params:QuicklinkSave;result:QuicklinkRecord};
  'quicklinks.remove':{params:QuicklinkSelection;result:QuicklinkSelection};
}
export type QuicklinkStorageMethod=keyof QuicklinkStorageMethods;
export const QUICKLINK_STORAGE_METHODS:readonly QuicklinkStorageMethod[]=['quicklinks.list','quicklinks.get','quicklinks.save','quicklinks.remove'];
export const quicklinkRepositoryContracts:RepositoryContracts=new Map([
  ['quicklinks.list',{params:z.strictObject({}),result:quicklinkListSchema}],
  ['quicklinks.get',{params:quicklinkSelectionSchema,result:quicklinkRecordSchema.nullable()}],
  ['quicklinks.save',{params:quicklinkSaveSchema,result:quicklinkRecordSchema}],
  ['quicklinks.remove',{params:quicklinkSelectionSchema,result:quicklinkSelectionSchema}],
]);
export const QUICKLINK_CHANNELS={list:'quicklinks:list',get:'quicklinks:get',save:'quicklinks:save',remove:'quicklinks:remove',open:'quicklinks:open'} as const;
const protocol={protocolVersion:z.literal(1)},failed=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const quicklinkListRequestSchema=z.strictObject(protocol);
export const quicklinkGetRequestSchema=quicklinkSelectionSchema.extend(protocol);
export const quicklinkSaveRequestSchema=z.strictObject({...protocol,id:z.uuid().optional(),expectedRevision:z.number().int().nonnegative().safe(),name:quicklinkNameSchema,url:quicklinkUrlSchema,tags:quicklinkTagsSchema.optional(),webSearch:quicklinkWebSearchSchema.optional()})
  .refine(value=>value.id===undefined?value.expectedRevision===0:value.expectedRevision>0);
export const quicklinkOpenRequestSchema=quicklinkSelectionSchema.extend({...protocol,launcherRevision:revision,query:webSearchQuerySchema.optional()});
export const quicklinkListReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({records:quicklinkListSchema})}),failed]);
export const quicklinkRecordReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({record:quicklinkRecordSchema})}),failed]);
export const quicklinkRemoveReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:quicklinkSelectionSchema.extend({outcome:z.enum(['removed','cancelled'])})}),failed]);
export const quicklinkOpenReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:quicklinkSelectionSchema.extend({outcome:z.literal('dispatched'),webSearch:z.strictObject({query:webSearchQuerySchema,url:quicklinkUrlSchema}).optional()})}),failed]);
export type QuicklinkListReply=z.infer<typeof quicklinkListReplySchema>;
export type QuicklinkRecordReply=z.infer<typeof quicklinkRecordReplySchema>;
export type QuicklinkRemoveReply=z.infer<typeof quicklinkRemoveReplySchema>;
export type QuicklinkOpenReply=z.infer<typeof quicklinkOpenReplySchema>;
export interface QuicklinkApi {
  listQuicklinks?:()=>Promise<QuicklinkListReply>;
  getQuicklink?:(request:QuicklinkSelection)=>Promise<QuicklinkRecordReply>;
  saveQuicklink?:(request:QuicklinkSave)=>Promise<QuicklinkRecordReply>;
  removeQuicklink?:(request:QuicklinkSelection)=>Promise<QuicklinkRemoveReply>;
  openQuicklink?:(request:QuicklinkSelection&{launcherRevision:number;query?:string})=>Promise<QuicklinkOpenReply>;
}
