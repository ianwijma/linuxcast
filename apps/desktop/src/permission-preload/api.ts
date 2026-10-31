import { MAX_ENVELOPE_BYTES } from '@linuxcast/contracts';
import { PERMISSION_SETTINGS_CHANNELS,PERMISSION_SETTINGS_APPEARANCE,permissionSettingsListSchema,permissionSettingsRevokeSchema,permissionSettingsStateReplySchema,permissionSettingsActionReplySchema } from '../../../../packages/platform-contracts/src/permission-settings.ts';
import type { PermissionSettingsApi } from '../../../../packages/platform-contracts/src/permission-settings.ts';
import type { ShellTransport } from '../preload/api.ts';
export function createPermissionSettingsApi(transport:Pick<ShellTransport,'invoke'|'on'|'removeListener'>):PermissionSettingsApi {
  const failed={ok:false as const,error:{code:'unavailable' as const,message:'Saved permissions are unavailable. Refresh to inspect the current decisions.'}};
  const bounded=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length<=MAX_ENVELOPE_BYTES;
  return Object.freeze({
    async getState(input:Parameters<PermissionSettingsApi['getState']>[0]){
      try {const parsed=permissionSettingsListSchema.safeParse({protocolVersion:1,...input});if(!parsed.success)return failed;
        const value=await transport.invoke(PERMISSION_SETTINGS_CHANNELS.list,parsed.data);
        if(!bounded(value))return failed;const reply=permissionSettingsStateReplySchema.safeParse(value);return reply.success?reply.data:failed;
      } catch{return failed;}
    },
    async revoke(input:Parameters<PermissionSettingsApi['revoke']>[0]){
      try {const parsed=permissionSettingsRevokeSchema.safeParse({protocolVersion:1,...input});if(!parsed.success)return failed;
        const value=await transport.invoke(PERMISSION_SETTINGS_CHANNELS.revoke,parsed.data);
        if(!bounded(value))return failed;const reply=permissionSettingsActionReplySchema.safeParse(value);return reply.success?reply.data:failed;
      }catch{return failed;}
    },
    async close(){try{const value=await transport.invoke(PERMISSION_SETTINGS_CHANNELS.close,{protocolVersion:1});if(!bounded(value))return failed;const reply=permissionSettingsActionReplySchema.safeParse(value);return reply.success?reply.data:failed;}catch{return failed;}},
    onAppearance(listener:(appearance:'dark'|'light')=>void){
      if(typeof listener!=='function')throw new TypeError('An appearance listener is required.');
      let active=true;const receive=(_event:unknown,value:unknown)=>{if(active&&(value==='dark'||value==='light'))listener(value);};
      transport.on(PERMISSION_SETTINGS_APPEARANCE,receive);return()=>{active=false;transport.removeListener(PERMISSION_SETTINGS_APPEARANCE,receive);};
    },
  });
}
