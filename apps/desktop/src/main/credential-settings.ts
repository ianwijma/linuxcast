import {BrowserWindow,dialog,ipcMain,nativeTheme,powerMonitor,screen,session} from 'electron';
import {join} from 'node:path';
import {CredentialSettingsService} from '../../../../packages/secrets/src/settings.ts';
import type {CredentialPreferences} from '../../../../packages/secrets/src/settings.ts';
import type {CredentialRuntime} from '../../../../packages/secrets/src/runtime.ts';
import type {SecretReferences} from '../../../../packages/secrets/src/types.ts';
import {CREDENTIAL_SETTINGS_CHANNELS,CREDENTIAL_SETTINGS_CHANGED,credentialSettingsRequestSchema,credentialSettingsSaveSchema,credentialSettingsRemoveSchema,credentialSettingsPolicySchema,credentialSettingsStateReplySchema,credentialSettingsActionReplySchema} from '../../../../packages/platform-contracts/src/credential-settings.ts';
import {CREDENTIAL_SETTINGS_URL} from './assets.ts';
import {trustedAppSender} from './ipc.ts';
import {restrictContents,securePreferences} from './security.ts';
import type {ResidentService} from './lifecycle.ts';
import tokens from '../../../../docs/design/tokens.json' with {type:'json'};

export function createCredentialSettings(options:{resourcesDirectory:string;runtime:CredentialRuntime;preferences:CredentialPreferences;references:SecretReferences;removeReadiness():void;restoreFocus?():void}):ResidentService&{open():Promise<void>} {
  const model=new CredentialSettingsService({...options,appearance:()=>nativeTheme.shouldUseDarkColors?'dark':'light'});
  let window:BrowserWindow|undefined,windowAbort:AbortController|undefined,creating:Promise<void>|undefined,closing:Promise<void>|undefined,stopped=false;
  const fail=(code:'invalid-request'|'permission-denied'|'conflict'|'unavailable')=>({ok:false as const,error:{code}});
  const alive=(owner:BrowserWindow)=>!stopped&&window===owner&&!owner.isDestroyed();
  const current=(owner:BrowserWindow)=>alive(owner)&&owner.webContents.getURL()===CREDENTIAL_SETTINGS_URL;
  const changed=()=>{if(window&&current(window))window.webContents.send(CREDENTIAL_SETTINGS_CHANGED);};
  const removeChanged=model.onChanged(changed);
  const confirm=async(owner:BrowserWindow,kind:'save'|'replace'|'remove',signal:AbortSignal)=>{
    if(!current(owner)||signal.aborted)return false;
    const choice=await dialog.showMessageBox(owner,{type:kind==='remove'?'warning':'question',title:'OpenRouter credential',
      message:kind==='remove'?'Remove the OpenRouter key?':kind==='replace'?'Replace the OpenRouter key?':'Save the OpenRouter key?',
      detail:kind==='remove'?'Remove this provider’s saved and session-only keys. Existing backups may retain earlier encrypted data. This does not revoke the key with OpenRouter or securely erase disk contents.':kind==='replace'?'Replace the existing key using the storage mode you selected. Active uses of the old key will be stopped. No request is sent to OpenRouter.':'Use the storage mode you selected. No request is sent to OpenRouter; provider and model selection remain separate.',
      buttons:['Cancel',kind==='remove'?'Remove key':kind==='replace'?'Replace key':'Save key'],defaultId:0,cancelId:0,noLink:true,signal});
    return choice.response===1&&current(owner)&&!signal.aborted;
  };
  for(const channel of Object.values(CREDENTIAL_SETTINGS_CHANNELS))ipcMain.handle(channel,async(event,payload)=>{
    const owner=window,signal=windowAbort?.signal;
    if(!owner||!signal||!current(owner)||!trustedAppSender(event,owner.webContents,CREDENTIAL_SETTINGS_URL))return fail('permission-denied');
    const schema=channel===CREDENTIAL_SETTINGS_CHANNELS.save?credentialSettingsSaveSchema:channel===CREDENTIAL_SETTINGS_CHANNELS.remove?credentialSettingsRemoveSchema:channel===CREDENTIAL_SETTINGS_CHANNELS.policy?credentialSettingsPolicySchema:credentialSettingsRequestSchema;
    const parsed=schema.safeParse(payload);if(!parsed.success)return fail('invalid-request');
    if(channel===CREDENTIAL_SETTINGS_CHANNELS.close){windowAbort?.abort();setImmediate(()=>{if(alive(owner))owner.close();});return {ok:true,value:{outcome:'cancelled'}};}
    try {
      if(channel===CREDENTIAL_SETTINGS_CHANNELS.state)return credentialSettingsStateReplySchema.parse({ok:true,value:await model.state()});
      const reply=channel===CREDENTIAL_SETTINGS_CHANNELS.save?await model.save(parsed.data,(replacing,lease)=>confirm(owner,replacing?'replace':'save',lease),signal):
        channel===CREDENTIAL_SETTINGS_CHANNELS.remove?await model.remove(parsed.data,lease=>confirm(owner,'remove',lease),signal):
        channel===CREDENTIAL_SETTINGS_CHANNELS.policy?await model.setPolicy(parsed.data,signal):await model.recheck();
      return credentialSettingsActionReplySchema.parse(reply);
    }catch{return fail('unavailable');}
  });
  const appearance=()=>{if(window&&alive(window)){window.setBackgroundColor(tokens.themes[nativeTheme.shouldUseDarkColors?'dark':'light'].background);changed();}};
  // Electron45 Linux does not report lock-screen/unlock-screen here. The
  // read-only native session observer owns those asynchronous eligibility hints.
  const suspend=()=>options.runtime.suspend(),resume=()=>{void options.runtime.resume().catch(()=>{});};
  nativeTheme.on('updated',appearance);powerMonitor.on('suspend',suspend);powerMonitor.on('resume',resume);
  const stop=():Promise<void>=>{
    if(closing)return closing;stopped=true;windowAbort?.abort();options.runtime.suspend();
    for(const channel of Object.values(CREDENTIAL_SETTINGS_CHANNELS))ipcMain.removeHandler(channel);
    nativeTheme.off('updated',appearance);powerMonitor.off('suspend',suspend);powerMonitor.off('resume',resume);removeChanged();options.removeReadiness();
    if(window&&!window.isDestroyed())window.destroy();window=undefined;
    closing=(async()=>{const results=await Promise.allSettled([creating?.catch(()=>{}),model.close(),options.runtime.close()]);if(results.some(value=>value.status==='rejected'))throw new Error('Credential shutdown unverified.');})();return closing;
  };
  return {async open(){
    if(stopped)throw new Error('Credential settings unavailable.');if(creating)return creating;
    if(window&&!window.isDestroyed()){window.show();window.focus();return;}
    creating=(async()=>{
      const area=screen.getPrimaryDisplay().workArea,owner=new BrowserWindow({width:Math.max(1,Math.min(1000,area.width-32)),height:Math.max(1,Math.min(720,area.height-32)),minWidth:Math.min(480,area.width),minHeight:Math.min(320,area.height),show:false,title:'Credentials — Linuxcast',backgroundColor:tokens.themes[nativeTheme.shouldUseDarkColors?'dark':'light'].background,
        webPreferences:securePreferences(join(options.resourcesDirectory,'credential-preload.cjs'),session.fromPartition('linuxcast-shell'))});
      window=owner;const abort=new AbortController();windowAbort=abort;owner.setMenu(null);restrictContents(owner.webContents);
      owner.on('closed',()=>{abort.abort();if(window===owner){window=undefined;windowAbort=undefined;if(!stopped)options.restoreFocus?.();}});
      try{await owner.loadURL(CREDENTIAL_SETTINGS_URL);if(alive(owner))owner.show();}catch{owner.destroy();throw new Error('Credential settings unavailable.');}
    })().finally(()=>{creating=undefined;});return creating;
  },stop,terminate:stop};
}
