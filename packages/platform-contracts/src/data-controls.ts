import {parseEmojiFavouriteSetting} from '../../contracts/src/emoji.ts';
import * as z from 'zod';
import { conversationRecordSchema, messageRevisionRecordSchema, uiTextSchema } from '../../contracts/src/index.ts';
const commandId = z.string().regex(/^[a-z][a-z0-9._:-]{0,199}$/u);
export const localSettingIdSchema = z.enum(['ui.theme','launcher.shortcut','onboarding.completed','clipboard.historyEnabled','calculator.rateSource','emoji.favourites']);
const ids = (item:z.ZodType<string>) => z.array(item).max(100).refine(values=>new Set(values).size===values.length).optional();
export const dataClearParamsSchema = z.discriminatedUnion('category',[
  z.strictObject({category:z.literal('command-usage'),ids:ids(commandId)}),
  z.strictObject({category:z.literal('ai-conversations'),ids:ids(z.uuid())}),
  z.strictObject({category:z.literal('file-index'),ids:ids(z.uuid())}),
]);
export const dataClearResultSchema = z.strictObject({category:z.enum(['command-usage','ai-conversations','file-index']),
  removed:z.number().int().nonnegative().safe(),complete:z.boolean()}).refine(value=>value.category==='file-index'||value.complete);
export const dataExportParamsSchema = z.discriminatedUnion('category',[
  z.strictObject({category:z.literal('settings'),ids:ids(localSettingIdSchema)}),
  z.strictObject({category:z.literal('command-usage'),ids:ids(commandId)}),
  z.strictObject({category:z.literal('ai-conversations'),ids:ids(z.uuid())}),
]);
const setting = z.strictObject({id:localSettingIdSchema,revision:z.number().int().positive().safe(),value:z.union([z.string(),z.boolean()]),modifiedAt:z.iso.datetime()}).refine(record=>{
  switch(record.id) {
    case 'emoji.favourites': return parseEmojiFavouriteSetting(record.value)!==undefined;
    case 'calculator.rateSource': return typeof record.value==='string'&&['disabled','frankfurter'].includes(record.value);
    case 'ui.theme': return typeof record.value==='string'&&['system','dark','light'].includes(record.value);
    case 'launcher.shortcut': return typeof record.value==='string'&&record.value.length<=100&&![...record.value].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127);
    default: return typeof record.value==='boolean';
  }
});
const usage = z.strictObject({commandId,useCount:z.number().int().nonnegative().safe(),lastUsedAt:z.iso.datetime().nullable(),pinned:z.boolean(),alias:uiTextSchema.nullable()});
export const dataExportResultSchema = z.discriminatedUnion('category',[
  z.strictObject({category:z.literal('settings'),records:z.array(setting)}),
  z.strictObject({category:z.literal('command-usage'),records:z.array(usage)}),
  z.strictObject({category:z.literal('ai-conversations'),conversations:z.array(conversationRecordSchema),messageRevisions:z.array(messageRevisionRecordSchema)}),
]);
export type DataClearParams = z.infer<typeof dataClearParamsSchema>;
export type DataClearResult = z.infer<typeof dataClearResultSchema>;
export type DataExportParams = z.infer<typeof dataExportParamsSchema>;
export type DataExportResult = z.infer<typeof dataExportResultSchema>;
export const dataControlContracts = new Map<string,{params:z.ZodType;result:z.ZodType}>([
  ['dataControls.clear',{params:dataClearParamsSchema,result:dataClearResultSchema}],
  ['dataControls.export',{params:dataExportParamsSchema,result:dataExportResultSchema}],
]);
