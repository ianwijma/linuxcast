import { DATA_SETTINGS_CHANNELS, DATA_SETTINGS_APPEARANCE_CHANNEL, dataSettingsAppearanceSchema, dataSettingsStateReplySchema, dataSettingsActionReplySchema } from '@linuxcast/contracts';
import type { DataSettingsApi, DataSettingsExportCategory, DataSettingsClearCategory } from '@linuxcast/contracts';
import type { ShellTransport } from '../preload/api.ts';
export function createDataSettingsApi(transport: Pick<ShellTransport,'invoke'|'on'|'removeListener'>): DataSettingsApi {
  const failed={ok:false as const,error:{code:'internal' as const,message:'Local data controls are unavailable.',retryable:false}};
  const action=async(channel:string,payload:unknown)=>{
    try {const parsed=dataSettingsActionReplySchema.safeParse(await transport.invoke(channel,payload));return parsed.success?parsed.data:failed;}
    catch {return failed;}
  };
  return Object.freeze({
    async getState(){try{const parsed=dataSettingsStateReplySchema.safeParse(await transport.invoke(DATA_SETTINGS_CHANNELS.state,{protocolVersion:1}));return parsed.success?parsed.data:failed;}catch{return failed;}},
    exportCategory:(category:DataSettingsExportCategory)=>action(DATA_SETTINGS_CHANNELS.export,{protocolVersion:1,category}),
    clearCategory:(category:DataSettingsClearCategory)=>action(DATA_SETTINGS_CHANNELS.clear,{protocolVersion:1,category}),
    onAppearance(listener:(appearance:'dark'|'light')=>void){
      if(typeof listener!=='function')throw new TypeError('An appearance listener is required.');
      let active=true;const receive=(_event:unknown,value:unknown)=>{const parsed=dataSettingsAppearanceSchema.safeParse(value);if(active&&parsed.success)listener(parsed.data);};
      transport.on(DATA_SETTINGS_APPEARANCE_CHANNEL,receive);return()=>{active=false;transport.removeListener(DATA_SETTINGS_APPEARANCE_CHANNEL,receive);};
    },
    close:()=>action(DATA_SETTINGS_CHANNELS.close,{protocolVersion:1}),
  });
}
