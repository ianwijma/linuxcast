import * as z from 'zod';

/** Dedicated first-party settings wire. Input is user-entered once, never read
 * back or placed in a generic ViewModel/action, repository request or diagnostic. */
export const CREDENTIAL_SETTINGS_CHANNELS={state:'credential-settings:state',save:'credential-settings:save',remove:'credential-settings:remove',policy:'credential-settings:policy',recheck:'credential-settings:recheck',close:'credential-settings:close'} as const;
export const CREDENTIAL_SETTINGS_CHANGED='credential-settings:changed';
export const credentialSettingsRequestSchema=z.strictObject({protocolVersion:z.literal(1)});
const revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const credentialSettingsSaveSchema=credentialSettingsRequestSchema.extend({
  expectedRevision:revision,persistence:z.enum(['persistent','session-only']),
  value:z.string().min(1).max(65536).refine(value=>{const bytes=new TextEncoder().encode(value);return bytes.length<=65536&&new TextDecoder().decode(bytes)===value;}),
});
export const credentialSettingsRemoveSchema=credentialSettingsRequestSchema.extend({expectedRevision:revision});
export const credentialSettingsPolicySchema=credentialSettingsRemoveSchema.extend({clearSessionOnLock:z.boolean()});
export const credentialSettingsStateSchema=z.strictObject({
  revision,appearance:z.enum(['dark','light']),provider:z.literal('openrouter'),
  session:z.enum(['observed-unlocked','locked','inactive','unavailable']),
  storage:z.enum(['available','insecure-backend','unavailable','encryption-failed','storage-failed']),
  sessionOnlyAvailable:z.boolean(),stored:z.enum(['none','secure-persistent','session-only','needs-review']),
  clearSessionOnLock:z.boolean(),busy:z.boolean(),
}).refine(value=>value.session==='observed-unlocked'||(!value.sessionOnlyAvailable&&value.storage!=='available'));
// Fixed codes only: no raw errors or user-entered values can cross a reply.
const failed=z.strictObject({ok:z.literal(false),error:z.strictObject({code:z.enum(['invalid-request','permission-denied','conflict','unavailable'])})});
export const credentialSettingsStateReplySchema=z.discriminatedUnion('ok',[
  z.strictObject({ok:z.literal(true),value:credentialSettingsStateSchema}),failed,
]);
export const credentialSettingsActionReplySchema=z.discriminatedUnion('ok',[
  z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.enum(['saved','removed','policy-updated','refreshing','cancelled','stale','unavailable','unknown'])})}),failed,
]);
export type CredentialSettingsState=z.infer<typeof credentialSettingsStateSchema>;
export type CredentialSettingsActionReply=z.infer<typeof credentialSettingsActionReplySchema>;
export interface CredentialSettingsApi {
  getState():Promise<z.infer<typeof credentialSettingsStateReplySchema>>;
  saveKey(input:{expectedRevision:number;value:string;persistence:'persistent'|'session-only'}):Promise<CredentialSettingsActionReply>;
  removeKey(input:{expectedRevision:number}):Promise<CredentialSettingsActionReply>;
  setPolicy(input:{expectedRevision:number;clearSessionOnLock:boolean}):Promise<CredentialSettingsActionReply>;
  recheck():Promise<CredentialSettingsActionReply>;
  close():Promise<CredentialSettingsActionReply>;
  onChanged(listener:()=>void):()=>void;
}
