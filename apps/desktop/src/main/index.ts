import { createApplications } from '@linuxcast/applications';
import { createFileSearchService } from '@linuxcast/file-search/service';
import { createFileSearchWorkspace } from './file-search.ts';
import { DataControls } from '@linuxcast/data-controls';
import { createDataSettings } from './data-settings.ts';
import { app,clipboard } from 'electron';
import { createClipboardWriter } from './clipboard-write.ts';
import { isAbsolute, join } from 'node:path';
import { startResidentShell } from './shell.ts';
import { startStorage } from '../services/storage.ts';

let fileSearch:ReturnType<typeof createFileSearchWorkspace>|undefined;
let dataSettings:ReturnType<typeof createDataSettings>|undefined;
let storage:ReturnType<typeof startStorage>|undefined;
let applications:ReturnType<typeof createApplications>|undefined;
const copyText=createClipboardWriter(clipboard,()=>process.env.XDG_SESSION_TYPE==='x11'&&!!process.env.DISPLAY || process.env.XDG_SESSION_TYPE==='wayland'&&!!process.env.WAYLAND_DISPLAY);
startResidentShell({ resourcesDirectory: __dirname,
  copyCalculatorResult:copyText,
  async openUrl(url){if(!applications)throw new Error('Browser opening unavailable.');return applications.openUrl(url);},
  async listApplications(){if(!applications)throw new Error('Applications unavailable.');return applications.list();},
  async launchApplication(application){if(!applications)throw new Error('Applications unavailable.');return applications.launch(application);},
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
  async recordCommandUse(commandId) {
    if(!storage?.isReady()) throw new Error('Local ranking unavailable.');
    return storage.repository.request('commands.recordUse',{commandId},{timeoutMs:250});
  },
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
  const orderedStorage={async stop(){await Promise.all([currentFiles.stop(),currentSettings.stop()]);await currentStorage.stop();},
    async terminate(){await Promise.all([currentFiles.terminate(),currentSettings.terminate()]);await currentStorage.terminate();}};
  return [orderedStorage,currentFiles,dataSettings,applications];
} });
