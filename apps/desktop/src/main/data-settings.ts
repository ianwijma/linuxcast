import { BrowserWindow, dialog, ipcMain, nativeTheme, screen, session } from 'electron';
import { join } from 'node:path';
import { DATA_SETTINGS_CHANNELS, DATA_SETTINGS_APPEARANCE_CHANNEL, dataSettingsRequestSchema, dataSettingsExportSchema, dataSettingsClearSchema } from '@linuxcast/contracts';
import type { DataSettingsActionReply, DataSettingsClearCategory, DataSettingsExportCategory } from '@linuxcast/contracts';
import tokens from '../../../../docs/design/tokens.json' with {type:'json'};
import { trustedAppSender } from './ipc.ts';
import { DATA_SETTINGS_URL } from './assets.ts';
import { restrictContents, securePreferences } from './security.ts';
import { saveDataExport } from './data-export.ts';
import type { ResidentService } from './lifecycle.ts';
const labels={settings:'Settings','command-usage':'Command usage','ai-conversations':'AI conversations','file-index':'File index','application-logs':'Application logs','tool-diagnostics':'Tool diagnostics'} as const;
export interface DataSettingsOptions {
  resourcesDirectory:string;
  exportCategory(category:DataSettingsExportCategory,signal:AbortSignal):Promise<unknown>;
  clearCategory(category:DataSettingsClearCategory,signal:AbortSignal):Promise<void>;
  isReady():boolean;
}
/** Dedicated main-owned workspace. Renderer receives no records, file paths, secrets or repository client. */
export function createDataSettings(options:DataSettingsOptions):ResidentService&{open():Promise<void>} {
  let window:BrowserWindow|undefined,creating:Promise<void>|undefined,active:Promise<unknown>|undefined,operationAbort:AbortController|undefined,stopped=false;
  const failed=(message='Local data controls are unavailable.'):DataSettingsActionReply=>({ok:false,error:{code:'internal',message,retryable:false}});
  const cancelled=():DataSettingsActionReply=>({ok:true,value:{outcome:'cancelled'}});
  const alive=(owner:BrowserWindow)=>!stopped&&!owner.isDestroyed()&&window===owner;
  for(const channel of Object.values(DATA_SETTINGS_CHANNELS))ipcMain.handle(channel,async(event,payload)=>{
    const owner=window;
    if(!owner||!alive(owner)||!trustedAppSender(event,owner.webContents,DATA_SETTINGS_URL))
      return {ok:false,error:{code:'permission-denied',message:'Local data request denied.',retryable:false}};
    const schema=channel===DATA_SETTINGS_CHANNELS.export?dataSettingsExportSchema:channel===DATA_SETTINGS_CHANNELS.clear?dataSettingsClearSchema:dataSettingsRequestSchema;
    const parsed=schema.safeParse(payload);if(!parsed.success)return {ok:false,error:{code:'invalid-request',message:'Invalid local data request.',retryable:false}};
    if(channel===DATA_SETTINGS_CHANNELS.close){setImmediate(()=>{if(alive(owner))owner.close();});return cancelled();}
    if(!options.isReady())return failed('Local data is still opening. Try again shortly.');
    if(channel===DATA_SETTINGS_CHANNELS.state)return {ok:true,value:{appearance:nativeTheme.shouldUseDarkColors?'dark':'light'}};
    if(active)return failed('Another local data action is still in progress.');
    operationAbort=new AbortController();
    const signal=operationAbort.signal;
    const operation=async():Promise<DataSettingsActionReply>=>{
      try {
        if(channel===DATA_SETTINGS_CHANNELS.export){
          const category=dataSettingsExportSchema.parse(payload).category;
          const choice=await dialog.showSaveDialog(owner,{title:`Export ${labels[category].toLowerCase()}`,defaultPath:`linuxcast-${category}.json`,
            buttonLabel:'Save unencrypted export',filters:[{name:'JSON data',extensions:['json']}],properties:['createDirectory','showOverwriteConfirmation']});
          if(choice.canceled||!choice.filePath||!alive(owner))return cancelled();
          const value=await options.exportCategory(category,signal);if(!alive(owner))return cancelled();
          await saveDataExport(choice.filePath,value,signal);return {ok:true,value:{outcome:'saved'}};
        }
        const category=dataSettingsClearSchema.parse(payload).category;
        const detail=category==='command-usage'?'Usage counts and last-used times will be removed. Pins and aliases stay.':category==='file-index'?'Indexed metadata will be removed. Selected folders and original files stay.':category==='application-logs'?'Only application log metadata will be removed. Tool diagnostics and other data stay. New events may appear after clearing.':category==='tool-diagnostics'?'Only tool diagnostic metadata will be removed. Application logs and other data stay. New events may appear after clearing.':'Conversations and their message revisions will be deleted. Other categories stay.';
        const choice=await dialog.showMessageBox(owner,{type:'warning',title:`Clear ${labels[category].toLowerCase()}?`,message:`Clear ${labels[category].toLowerCase()}?`,
          detail:`${detail} Existing backups may still contain earlier data. This does not securely erase disk contents.`,buttons:['Cancel','Clear data'],defaultId:0,cancelId:0,noLink:true});
        if(choice.response!==1||!alive(owner))return cancelled();
        await options.clearCategory(category,signal);return {ok:true,value:{outcome:'cleared'}};
      }catch(error){
        if(error&&typeof error==='object'&&'reasonCode'in error&&error.reasonCode==='export-too-large')return failed('This category is too large for a single export.');
        if(error&&typeof error==='object'&&'reasonCode'in error&&error.reasonCode==='diagnostics-unavailable')return failed('Diagnostics are unavailable. Clear only this diagnostic category to reset unreadable records, or quit and reopen Linuxcast after checking local storage.');
        return failed('The data action could not be completed. Check the category before trying again.');
      }
    };
    active=operation();try{return await active;}finally{active=undefined;operationAbort=undefined;}
  });
  const appearance=()=>{if(window&&!window.isDestroyed()){window.setBackgroundColor(tokens.themes[nativeTheme.shouldUseDarkColors?'dark':'light'].background);if(window.webContents.getURL()===DATA_SETTINGS_URL)window.webContents.send(DATA_SETTINGS_APPEARANCE_CHANNEL,nativeTheme.shouldUseDarkColors?'dark':'light');}};
  nativeTheme.on('updated',appearance);
  const close=()=>{stopped=true;operationAbort?.abort();for(const channel of Object.values(DATA_SETTINGS_CHANNELS))ipcMain.removeHandler(channel);nativeTheme.off('updated',appearance);if(window&&!window.isDestroyed())window.destroy();window=undefined;};
  return {
    async open(){
      if(stopped)throw new Error('Local data workspace unavailable.');
      if(creating){await creating;return;}
      if(window&&!window.isDestroyed()){window.show();window.focus();return;}
      creating??=(async()=>{
        const area=screen.getPrimaryDisplay().workArea;
        const owner=new BrowserWindow({width:Math.max(1,Math.min(1000,area.width-32)),height:Math.max(1,Math.min(720,area.height-32)),minWidth:Math.min(480,area.width),minHeight:Math.min(320,area.height),
          show:false,title:'Local data — Linuxcast',backgroundColor:tokens.themes[nativeTheme.shouldUseDarkColors?'dark':'light'].background,
          webPreferences:securePreferences(join(options.resourcesDirectory,'data-preload.cjs'),session.fromPartition('linuxcast-shell'))});
        window=owner;owner.setMenu(null);restrictContents(owner.webContents);owner.on('closed',()=>{if(window===owner){operationAbort?.abort();window=undefined;}});
        try{await owner.loadURL(DATA_SETTINGS_URL);if(alive(owner))owner.show();}catch{owner.destroy();throw new Error('Local data workspace unavailable.');}
      })().finally(()=>{creating=undefined;});
      await creating;
    },
    async stop(){close();await creating?.catch(()=>{});await active;},
    async terminate(){close();},
  };
}
