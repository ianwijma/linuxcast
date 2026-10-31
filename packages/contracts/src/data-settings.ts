import * as z from 'zod';
import { rpcFailureSchema } from './protocol.ts';
export const DATA_SETTINGS_APPEARANCE_CHANNEL='data-settings:appearance';
export const dataSettingsAppearanceSchema=z.enum(['dark','light']);
export const DATA_SETTINGS_CHANNELS = {state:'data-settings:state',export:'data-settings:export',clear:'data-settings:clear',close:'data-settings:close'} as const;
export const dataSettingsRequestSchema = z.strictObject({protocolVersion:z.literal(1)});
export const dataSettingsExportSchema = dataSettingsRequestSchema.extend({category:z.enum(['settings','command-usage','ai-conversations','application-logs','tool-diagnostics'])});
export const dataSettingsClearSchema = dataSettingsRequestSchema.extend({category:z.enum(['command-usage','ai-conversations','file-index','application-logs','tool-diagnostics'])});
export const dataSettingsStateReplySchema = z.discriminatedUnion('ok',[
  z.strictObject({ok:z.literal(true),value:z.strictObject({appearance:dataSettingsAppearanceSchema})}),
  z.strictObject({ok:z.literal(false),error:rpcFailureSchema}),
]);
export const dataSettingsActionReplySchema = z.discriminatedUnion('ok',[
  z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.enum(['saved','cleared','cancelled'])})}),
  z.strictObject({ok:z.literal(false),error:rpcFailureSchema}),
]);
export type DataSettingsExportCategory = z.infer<typeof dataSettingsExportSchema>['category'];
export type DataSettingsClearCategory = z.infer<typeof dataSettingsClearSchema>['category'];
export type DataSettingsActionReply = z.infer<typeof dataSettingsActionReplySchema>;
export interface DataSettingsApi {
  getState(): Promise<z.infer<typeof dataSettingsStateReplySchema>>;
  exportCategory(category:DataSettingsExportCategory): Promise<DataSettingsActionReply>;
  clearCategory(category:DataSettingsClearCategory): Promise<DataSettingsActionReply>;
  close(): Promise<DataSettingsActionReply>;
  onAppearance(listener:(appearance:'dark'|'light')=>void):()=>void;
}
