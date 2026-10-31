import * as z from 'zod';
import { permissionIdSchema } from './permissions.ts';
export const PERMISSION_SETTINGS_CHANNELS={list:'permission-settings:list',revoke:'permission-settings:revoke',close:'permission-settings:close'} as const;
export const PERMISSION_SETTINGS_APPEARANCE='permission-settings:appearance';
export const permissionSettingsRequestSchema=z.strictObject({protocolVersion:z.literal(1)});
export const permissionSettingsListSchema=permissionSettingsRequestSchema.extend({afterId:z.uuid().optional()});
export const permissionSettingsRevokeSchema=permissionSettingsRequestSchema.extend({snapshotId:z.uuid(),selectionId:z.uuid()});
export const permissionSettingsRowSchema=z.strictObject({
  selectionId:z.uuid(),sourceKind:z.enum(['builtin','extension','workflow']),sourceLabel:z.string().min(1).max(512),
  version:z.string().max(512).nullable(),permissionId:permissionIdSchema,scopeLabel:z.string().min(1).max(2300),
  decision:z.enum(['allow','deny']),updatedAt:z.iso.datetime(),
});
const failed=z.strictObject({ok:z.literal(false),error:z.strictObject({
  code:z.enum(['invalid-request','permission-denied','conflict','unavailable']),message:z.string().min(1).max(512),
})});
export const permissionSettingsStateSchema=z.strictObject({
  snapshotId:z.uuid(),appearance:z.enum(['dark','light']),records:z.array(permissionSettingsRowSchema).max(50),nextCursor:z.uuid().nullable(),
}).refine(value=>new Set(value.records.map(row=>row.selectionId)).size===value.records.length);
export const permissionSettingsStateReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:permissionSettingsStateSchema}),failed]);
export const permissionSettingsActionReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.enum(['removed','changed','missing','requested'])}),failed]);
export type PermissionSettingsRow=z.infer<typeof permissionSettingsRowSchema>;
export type PermissionSettingsState=z.infer<typeof permissionSettingsStateSchema>;
export type PermissionSettingsActionReply=z.infer<typeof permissionSettingsActionReplySchema>;
export interface PermissionSettingsApi {
  getState(input?:{afterId?:string}):Promise<z.infer<typeof permissionSettingsStateReplySchema>>;
  revoke(input:{snapshotId:string;selectionId:string}):Promise<PermissionSettingsActionReply>;
  close():Promise<PermissionSettingsActionReply>;
  onAppearance(listener:(appearance:'dark'|'light')=>void):()=>void;
}
