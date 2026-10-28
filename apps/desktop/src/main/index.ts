import {RateConversionService} from './rate-service.ts';
import {fetchFrankfurterRate} from './rate-http.ts';
import {RATE_ENDPOINT} from '@linuxcast/contracts';
import { saveDataExport } from './data-export.ts';
import { createWorkflowEditorWorkspace } from './workflow-editor.ts';
import { createApplications } from '@linuxcast/applications';
import { createFileSearchService } from '@linuxcast/file-search/service';
import { createFileSearchWorkspace } from './file-search.ts';
import { DataControls } from '@linuxcast/data-controls';
import { createDataSettings } from './data-settings.ts';
import { app,clipboard,dialog,BrowserWindow } from 'electron';
import { createClipboardWriter } from './clipboard-write.ts';
import { isAbsolute, join } from 'node:path';
import { startResidentShell } from './shell.ts';
import { startStorage } from '../services/storage.ts';
import { APP_URL } from './assets.ts';

let workflowEditor:ReturnType<typeof createWorkflowEditorWorkspace>|undefined;
let fileSearch:ReturnType<typeof createFileSearchWorkspace>|undefined;
let dataSettings:ReturnType<typeof createDataSettings>|undefined;
let storage:ReturnType<typeof startStorage>|undefined;
let applications:ReturnType<typeof createApplications>|undefined;
const copyText=createClipboardWriter(clipboard,()=>process.env.XDG_SESSION_TYPE==='x11'&&!!process.env.DISPLAY || process.env.XDG_SESSION_TYPE==='wayland'&&!!process.env.WAYLAND_DISPLAY);
const rates=new RateConversionService({
 async configuration(){if(!storage?.isReady())throw new Error('Rates storage unavailable.');const setting=await storage.repository.request('settings.get',{id:'calculator.rateSource'});return {revision:setting?.revision??0,source:setting?.value==='frankfurter'?'frankfurter':'disabled',endpoint:RATE_ENDPOINT};},
 async configure(expectedRevision,source){if(!storage?.isReady())throw new Error('Rates storage unavailable.');const setting=await storage.repository.request('settings.set',{id:'calculator.rateSource',expectedRevision,value:source});return {revision:setting.revision,source:setting.value==='frankfurter'?'frankfurter':'disabled',endpoint:RATE_ENDPOINT};},
 async cached(pair){if(!storage?.isReady())throw new Error('Rates storage unavailable.');return storage.repository.request('rates.cache.get',pair);},
 async cache(snapshot,configurationRevision){if(!storage?.isReady())throw new Error('Rates storage unavailable.');await storage.repository.request('rates.cache.put',{snapshot,configurationRevision});},
 async clear(configurationRevision){if(!storage?.isReady())throw new Error('Rates storage unavailable.');await storage.repository.request('rates.cache.clear',{configurationRevision});},
 fetch:fetchFrankfurterRate,
});
startResidentShell({ resourcesDirectory: __dirname,rates,
  prepareQuit:async()=>workflowEditor?workflowEditor.prepareClose():true,
  copyCalculatorResult:copyText,
  quicklinks:{
    async chooseExport(record){
      const owner=BrowserWindow.getAllWindows().find(window=>!window.isDestroyed()&&window.webContents.getURL()===APP_URL);if(!owner)throw new Error('Export window unavailable.');
      const choice=await dialog.showSaveDialog(owner,{title:'Export quicklink — unencrypted JSON',defaultPath:`linuxcast-quicklink-${record.id}.json`,buttonLabel:'Save unencrypted JSON',filters:[{name:'Linuxcast Quicklink JSON',extensions:['json']}],properties:['createDirectory']});
      if(owner.isDestroyed()||owner.webContents.getURL()!==APP_URL)throw new Error('Export window changed.');
      return choice.canceled||!choice.filePath?null:choice.filePath;
    },
    async writeExport(path,value,signal){await saveDataExport(path,value,signal);},
    async list(){if(!storage?.isReady())throw new Error('Storage unavailable.');return storage.repository.request('quicklinks.list',{});},
    async get(selection){if(!storage?.isReady())throw new Error('Storage unavailable.');return storage.repository.request('quicklinks.get',selection);},
    async save(input){if(!storage?.isReady())throw new Error('Storage unavailable.');return storage.repository.request('quicklinks.save',input);},
    async remove(selection){if(!storage?.isReady())throw new Error('Storage unavailable.');return storage.repository.request('quicklinks.remove',selection);},
    async confirmRemove(record){
      const owner=BrowserWindow.getAllWindows().find(window=>!window.isDestroyed()&&window.webContents.getURL()===APP_URL);if(!owner)return false;
      const choice=await dialog.showMessageBox(owner,{type:'warning',title:'Remove Quicklink?',message:`Remove “${record.name}”?`,detail:'This removes the saved definition. It does not close browser pages. Existing backups may still contain this entry.',buttons:['Cancel','Remove Quicklink'],defaultId:0,cancelId:0,noLink:true});
      return choice.response===1&&!owner.isDestroyed();
    },
  },
  async openUrl(url){if(!applications)throw new Error('Browser opening unavailable.');return applications.openUrl(url);},
  async listApplications(){if(!applications)throw new Error('Applications unavailable.');return applications.list();},
  async launchApplication(application){if(!applications)throw new Error('Applications unavailable.');return applications.launch(application);},
  async launchApplicationAction(application){if(!applications)throw new Error('Application actions unavailable.');return applications.launchAction(application);},
  async getCommandUsage(commandId) {
    if(!storage?.isReady()) throw new Error('Local ranking unavailable.');
    return storage.repository.request('commands.getUsage',{commandId},{timeoutMs:250});
  },
  async setCommandPinned(commandId,pinned) {
    if(!storage?.isReady()) throw new Error('Local ranking unavailable.');
    return storage.repository.request('commands.setPinned',{commandId,pinned},{timeoutMs:1000});
  },
  async setCommandAlias(commandId,alias) {
    if(!storage?.isReady()) throw new Error('Local ranking unavailable.');
    return storage.repository.request('commands.setAlias',{commandId,alias},{timeoutMs:1000});
  },
  async listHiddenCommands() {
    if(!storage?.isReady())throw new Error('Command visibility unavailable.');
    return storage.repository.request('commands.listHidden',{},{timeoutMs:1000});
  },
  async setCommandHidden(commandId,hidden) {
    if(!storage?.isReady())throw new Error('Command visibility unavailable.');
    return storage.repository.request('commands.setHidden',{commandId,hidden},{timeoutMs:1000});
  },
  async recordCommandUse(commandId) {
    if(!storage?.isReady()) throw new Error('Local ranking unavailable.');
    return storage.repository.request('commands.recordUse',{commandId},{timeoutMs:250});
  },
  loadWorkflowCommands:async()=>{if(!storage?.isReady())throw new Error('Workflow commands unavailable.');return storage.repository.request('workflows.editor.get',{});},
  openWorkflowEntry:async(selection,trusted)=>{if(!workflowEditor)throw new Error('Workflow editor unavailable.');await workflowEditor.open(selection,trusted);},
  openWorkflowEditor:async()=>{if(!workflowEditor)throw new Error('Workflow editor unavailable.');await workflowEditor.open();},
  openFileSearch:async()=>{if(!fileSearch)throw new Error('File search unavailable.');await fileSearch.open();},
  openDataSettings:async()=>{if(!dataSettings)throw new Error('Local data workspace unavailable.');await dataSettings.open();}, createServices: () => {
  const dataHome = process.env.XDG_DATA_HOME;
  const directory = join(dataHome && isAbsolute(dataHome) ? dataHome : join(app.getPath('home'), '.local/share'), 'linuxcast');
  applications=createApplications({helperPath:join(__dirname,'platform')});
  const currentStorage = startStorage(__dirname, directory, app.getVersion());
  storage = currentStorage;
  app.once('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', () => currentStorage.confirmLaunch());
  });
  workflowEditor=createWorkflowEditorWorkspace({resourcesDirectory:__dirname,isReady:currentStorage.isReady,repository:currentStorage.repository,copyText,
    load:()=>currentStorage.repository.request('workflows.editor.get',{}),
    write:input=>currentStorage.repository.request('workflows.editor.write',input),
  });
  const currentWorkflow=workflowEditor;
  const controls=new DataControls(currentStorage.repository);
  const fileService=createFileSearchService({
    repository:{async request(method,params){if(!currentStorage.isReady())throw new Error('File search storage unavailable.');return currentStorage.repository.request(method,params,{timeoutMs:1000});}},
    controls,executable:join(__dirname,'platform'),
  });
  fileSearch=createFileSearchWorkspace({resourcesDirectory:__dirname,service:fileService,isReady:currentStorage.isReady,copyPath:copyText});
  const currentFiles=fileSearch;
  dataSettings=createDataSettings({resourcesDirectory:__dirname,isReady:currentStorage.isReady,
    async exportCategory(category,signal){
      const result=await controls.export({category},{signal});
      if(result.outcome!=='exported')throw {reasonCode:result.reason};
      return {schemaVersion:1,format:result.format,encrypted:result.encrypted,data:result.data};
    },
    async clearCategory(category,signal){
      try {
        const result=await controls.clear({category},{signal});
        if(result.outcome!=='completed')throw new Error('Local data action interrupted.');
      } finally {
        // Paused roots have no active job to publish index-clear invalidation.
        if(category==='file-index')currentFiles.refresh();
      }
    },
  });
  const currentSettings=dataSettings;
  // Index jobs and data operations must finish while their sole repository owner is still alive.
  const orderedStorage={async stop(){await Promise.all([currentFiles.stop(),currentSettings.stop(),currentWorkflow.stop()]);await currentStorage.stop();},
    async terminate(){await Promise.all([currentFiles.terminate(),currentSettings.terminate(),currentWorkflow.terminate()]);await currentStorage.terminate();}};
  return [orderedStorage,currentFiles,dataSettings,applications,currentWorkflow];
} });
