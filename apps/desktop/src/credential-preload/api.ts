import {CREDENTIAL_SETTINGS_CHANNELS,CREDENTIAL_SETTINGS_CHANGED,credentialSettingsSaveSchema,credentialSettingsRemoveSchema,credentialSettingsPolicySchema,credentialSettingsActionReplySchema,credentialSettingsStateReplySchema} from '../../../../packages/platform-contracts/src/credential-settings.ts';
import type {CredentialSettingsApi} from '../../../../packages/platform-contracts/src/credential-settings.ts';
import type {ShellTransport} from '../preload/api.ts';
export function createCredentialSettingsApi(transport:Pick<ShellTransport,'invoke'|'on'|'removeListener'>):CredentialSettingsApi {
  const fail={ok:false as const,error:{code:'unavailable' as const}},invalid={ok:false as const,error:{code:'invalid-request' as const}};
  const action=async(channel:string,payload:unknown)=>{try{const parsed=credentialSettingsActionReplySchema.safeParse(await transport.invoke(channel,payload));return parsed.success?parsed.data:fail;}catch{return fail;}};
  const api:CredentialSettingsApi={
    async getState(){try{const parsed=credentialSettingsStateReplySchema.safeParse(await transport.invoke(CREDENTIAL_SETTINGS_CHANNELS.state,{protocolVersion:1}));return parsed.success?parsed.data:fail;}catch{return fail;}},
    saveKey:input=>{const parsed=credentialSettingsSaveSchema.safeParse({protocolVersion:1,...input});return parsed.success?action(CREDENTIAL_SETTINGS_CHANNELS.save,parsed.data):Promise.resolve(invalid);},
    removeKey:input=>{const parsed=credentialSettingsRemoveSchema.safeParse({protocolVersion:1,...input});return parsed.success?action(CREDENTIAL_SETTINGS_CHANNELS.remove,parsed.data):Promise.resolve(invalid);},
    setPolicy:input=>{const parsed=credentialSettingsPolicySchema.safeParse({protocolVersion:1,...input});return parsed.success?action(CREDENTIAL_SETTINGS_CHANNELS.policy,parsed.data):Promise.resolve(invalid);},
    recheck:()=>action(CREDENTIAL_SETTINGS_CHANNELS.recheck,{protocolVersion:1}),close:()=>action(CREDENTIAL_SETTINGS_CHANNELS.close,{protocolVersion:1}),
    onChanged(listener){if(typeof listener!=='function')throw new TypeError('A listener is required.');let active=true;const receive=(_event:unknown,...payload:unknown[])=>{if(active&&payload.length===0)listener();};transport.on(CREDENTIAL_SETTINGS_CHANGED,receive);return()=>{active=false;transport.removeListener(CREDENTIAL_SETTINGS_CHANGED,receive);};},
  };return Object.freeze(api);
}
