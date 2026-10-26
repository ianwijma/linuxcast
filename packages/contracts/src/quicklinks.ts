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
export const normalizeQuicklinkName=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en-US').trim().replace(/\s+/gu,' ');
export const quicklinkSelectionSchema=z.strictObject({id:z.uuid(),revision});
export const quicklinkSaveSchema=z.strictObject({id:z.uuid().optional(),expectedRevision:z.number().int().nonnegative().safe(),name:quicklinkNameSchema,url:quicklinkUrlSchema})
  .refine(value=>value.id===undefined?value.expectedRevision===0:value.expectedRevision>0);
export const quicklinkRecordSchema=z.strictObject({id:z.uuid(),revision,name:quicklinkNameSchema,url:quicklinkUrlSchema,createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()})
  .refine(value=>Date.parse(value.createdAt)<=Date.parse(value.updatedAt));
export const quicklinkSummarySchema=z.strictObject({id:z.uuid(),revision,name:quicklinkNameSchema,host:z.string().min(1).max(320).regex(/^[!-~]+$/u)});
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
export const quicklinkSaveRequestSchema=z.strictObject({...protocol,id:z.uuid().optional(),expectedRevision:z.number().int().nonnegative().safe(),name:quicklinkNameSchema,url:quicklinkUrlSchema})
  .refine(value=>value.id===undefined?value.expectedRevision===0:value.expectedRevision>0);
export const quicklinkOpenRequestSchema=quicklinkSelectionSchema.extend({...protocol,launcherRevision:revision});
export const quicklinkListReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({records:quicklinkListSchema})}),failed]);
export const quicklinkRecordReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({record:quicklinkRecordSchema})}),failed]);
export const quicklinkRemoveReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:quicklinkSelectionSchema.extend({outcome:z.enum(['removed','cancelled'])})}),failed]);
export const quicklinkOpenReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:quicklinkSelectionSchema.extend({outcome:z.literal('dispatched')})}),failed]);
export type QuicklinkListReply=z.infer<typeof quicklinkListReplySchema>;
export type QuicklinkRecordReply=z.infer<typeof quicklinkRecordReplySchema>;
export type QuicklinkRemoveReply=z.infer<typeof quicklinkRemoveReplySchema>;
export type QuicklinkOpenReply=z.infer<typeof quicklinkOpenReplySchema>;
export interface QuicklinkApi {
  listQuicklinks?:()=>Promise<QuicklinkListReply>;
  getQuicklink?:(request:QuicklinkSelection)=>Promise<QuicklinkRecordReply>;
  saveQuicklink?:(request:QuicklinkSave)=>Promise<QuicklinkRecordReply>;
  removeQuicklink?:(request:QuicklinkSelection)=>Promise<QuicklinkRemoveReply>;
  openQuicklink?:(request:QuicklinkSelection&{launcherRevision:number})=>Promise<QuicklinkOpenReply>;
}
