import {openStarDictSource} from '../../../../packages/builtins/dictionary/src/stardict.ts';
import {createInstalledDictionary} from '../../../../packages/builtins/dictionary/src/installed.ts';
import {getEmoji,getEmojiGroups} from '../../../../packages/builtins/emoji/src/data.ts';
import {searchEmoji} from '../../../../packages/builtins/emoji/src/search.ts';
import {createNotesWorkspace} from './notes.ts';
import {RateConversionService} from './rate-service.ts';
import {fetchFrankfurterRate} from './rate-http.ts';
import {parseDefinitionSourceSetting,definitionSourcePreferenceSchema,parseEmojiKeywordSetting,emojiKeywordSnapshotSchema,parseEmojiFavouriteSetting,emojiFavouriteSnapshotSchema,RATE_ENDPOINT} from '@linuxcast/contracts';
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

let notes:ReturnType<typeof createNotesWorkspace>|undefined;
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
startResidentShell({ resourcesDirectory: __dirname,rates,dictionary:createInstalledDictionary(),
  prepareQuit:async()=>{if(notes&&!await notes.prepareClose())return false;return workflowEditor?workflowEditor.prepareClose():true;},
  copyCalculatorResult:copyText,
  definitions:{
    async read(){if(!storage?.isReady())throw new Error('Definition source unavailable.');const setting=await storage.repository.request('settings.get',{id:'dictionary.definitionSource'});if(!setting)return {revision:0,source:null};const source=parseDefinitionSourceSetting(setting.value);if(source===undefined)throw new Error('Definition source unavailable.');return definitionSourcePreferenceSchema.parse({revision:setting.revision,source});},
    async write(expectedRevision,source){if(!storage?.isReady())throw new Error('Definition source unavailable.');const value=JSON.stringify(source),setting=await storage.repository.request('settings.set',{id:'dictionary.definitionSource',expectedRevision,value});if(setting.revision!==expectedRevision+1||setting.value!==value)throw new Error('Unconfirmed source configuration.');return definitionSourcePreferenceSchema.parse({revision:setting.revision,source:parseDefinitionSourceSetting(setting.value)});},
    open:ifoPath=>openStarDictSource({ifoPath}),
    async choose(){
      const owner=BrowserWindow.getAllWindows().find(window=>!window.isDestroyed()&&window.isVisible()&&window.webContents.getURL()===APP_URL);if(!owner)throw new Error('Source selection unavailable.');
      const choice=await dialog.showOpenDialog(owner,{title:'Choose local StarDict definitions',buttonLabel:'Choose source',filters:[{name:'StarDict source',extensions:['ifo']}],properties:['openFile']});
      if(owner.isDestroyed()||!owner.isVisible()||owner.webContents.getURL()!==APP_URL)throw new Error('Source selection changed.');return choice.canceled||choice.filePaths.length!==1?null:choice.filePaths[0]!;
    },
    async confirm(source){
      const owner=BrowserWindow.getAllWindows().find(window=>!window.isDestroyed()&&window.isVisible()&&window.webContents.getURL()===APP_URL);if(!owner)return false;
      const choice=await dialog.showMessageBox(owner,{type:'question',title:'Use local definitions?',message:`Use “${source.name}”?`,detail:`Read ${source.wordCount} entries from this selected local source. Linuxcast saves its location so you can reopen it later. No data is downloaded or source files changed. Forget source removes the saved location.`,buttons:['Cancel','Use source'],defaultId:0,cancelId:0,noLink:true});
      return choice.response===1&&!owner.isDestroyed()&&owner.isVisible()&&owner.webContents.getURL()===APP_URL;
    },
  },
  emoji:{groups:getEmojiGroups(),get:getEmoji,search:input=>searchEmoji({...input,limit:100}),keywords:{
    async read(){if(!storage?.isReady())throw new Error('Emoji keywords unavailable.');const setting=await storage.repository.request('settings.get',{id:'emoji.keywords'});if(!setting)return {revision:0,entries:[]};const entries=parseEmojiKeywordSetting(setting.value);if(!entries)throw new Error('Emoji keywords unavailable.');return emojiKeywordSnapshotSchema.parse({revision:setting.revision,entries});},
    async write(input){if(!storage?.isReady())throw new Error('Emoji keywords unavailable.');const entries=emojiKeywordSnapshotSchema.parse({revision:input.expectedRevision,entries:input.entries}).entries,value=JSON.stringify(entries);const setting=await storage.repository.request('settings.set',{id:'emoji.keywords',expectedRevision:input.expectedRevision,value});if(setting.value!==value||setting.revision!==input.expectedRevision+1)throw new Error('Emoji keyword save unconfirmed.');return emojiKeywordSnapshotSchema.parse({revision:setting.revision,entries});},
  },favourites:{
    async read(){if(!storage?.isReady())throw new Error('Emoji favourites unavailable.');const setting=await storage.repository.request('settings.get',{id:'emoji.favourites'});if(!setting)return {revision:0,ids:[]};const ids=parseEmojiFavouriteSetting(setting.value);if(!ids)throw new Error('Emoji favourites unavailable.');return emojiFavouriteSnapshotSchema.parse({revision:setting.revision,ids});},
    async write(input){if(!storage?.isReady())throw new Error('Emoji favourites unavailable.');const ids=emojiFavouriteSnapshotSchema.parse({revision:input.expectedRevision,ids:input.ids}).ids,value=JSON.stringify(ids);const setting=await storage.repository.request('settings.set',{id:'emoji.favourites',expectedRevision:input.expectedRevision,value});if(setting.value!==value||setting.revision!==input.expectedRevision+1)throw new Error('Emoji favourites change unconfirmed.');return emojiFavouriteSnapshotSchema.parse({revision:setting.revision,ids});},
  }},
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
  searchNotes:async query=>{if(!storage?.isReady())throw new Error('Notes unavailable.');return storage.repository.request('notes.searchRoot',{query},{timeoutMs:2000});},
  getNote:async id=>{if(!storage?.isReady())throw new Error('Notes unavailable.');return storage.repository.request('notes.get',{id},{timeoutMs:2000});},
  openNote:async(selection,current)=>{if(!notes)throw new Error('Notes unavailable.');await notes.openNote(selection,current);},
  openNotes:async()=>{if(!notes)throw new Error('Notes unavailable.');await notes.open();},
  openQuickNote:async()=>{if(!notes)throw new Error('Notes unavailable.');await notes.quickNote();},
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
  notes=createNotesWorkspace({resourcesDirectory:__dirname,isReady:currentStorage.isReady,
    list:input=>currentStorage.repository.request('notes.list',input,{timeoutMs:2000}),
    get:id=>currentStorage.repository.request('notes.get',{id},{timeoutMs:2000}),
    write:input=>currentStorage.repository.request('notes.write',input,{timeoutMs:2000}),
    setPinned:input=>currentStorage.repository.request('notes.setPinned',input,{timeoutMs:2000}),
    setArchived:input=>currentStorage.repository.request('notes.setArchived',input,{timeoutMs:2000}),
    setTrashed:input=>currentStorage.repository.request('notes.setTrashed',input,{timeoutMs:2000}),
    deletePermanently:input=>currentStorage.repository.request('notes.deletePermanently',input,{timeoutMs:2000}),
    history:input=>currentStorage.repository.request('notes.history',input,{timeoutMs:2000}),
    getRevision:input=>currentStorage.repository.request('notes.getRevision',input,{timeoutMs:2000}),
    restoreRevision:input=>currentStorage.repository.request('notes.restoreRevision',input,{timeoutMs:2000}),
  });
  const currentNotes=notes;
  const controls=new DataControls(currentStorage.repository);
  const fileService=createFileSearchService({
    repository:{async request(method,params){if(!currentStorage.isReady())throw new Error('File search storage unavailable.');return currentStorage.repository.request(method,params,{timeoutMs:1000});}},
    controls,executable:join(__dirname,'platform'),
  });
  fileSearch=createFileSearchWorkspace({resourcesDirectory:__dirname,service:fileService,isReady:currentStorage.isReady,copyPath:copyText,copyText,previewText:async input=>{if(!applications)throw new Error('Preview unavailable.');return applications.previewText(input);}});
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
  const orderedStorage={async stop(){await Promise.all([currentFiles.stop(),currentSettings.stop(),currentWorkflow.stop(),currentNotes.stop()]);await currentStorage.stop();},
    async terminate(){await Promise.all([currentFiles.terminate(),currentSettings.terminate(),currentWorkflow.terminate(),currentNotes.terminate()]);await currentStorage.terminate();}};
  return [orderedStorage,currentFiles,dataSettings,applications,currentWorkflow,currentNotes];
} });
