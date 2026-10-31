import * as z from 'zod';

/** Main/storage metadata only; deliberately excluded from portable settings. */
export const CREDENTIAL_PREFERENCE_ID='credentials.openrouter.default' as const;
export const credentialPreferenceSchema=z.strictObject({schemaVersion:z.literal(1),referenceId:z.uuid().nullable(),clearSessionOnLock:z.boolean()});
export type CredentialPreference=z.infer<typeof credentialPreferenceSchema>;
export function parseCredentialPreference(value:unknown):CredentialPreference|undefined {
  if(typeof value!=='string'||value.length>256)return undefined;
  try {const result=credentialPreferenceSchema.safeParse(JSON.parse(value));return result.success&&JSON.stringify(result.data)===value?result.data:undefined;}
  catch{return undefined;}
}
