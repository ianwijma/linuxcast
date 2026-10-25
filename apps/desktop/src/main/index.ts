import { createApplications } from '@linuxcast/applications';
import { DataControls } from '@linuxcast/data-controls';
import { createDataSettings } from './data-settings.ts';
import { app } from 'electron';
import { isAbsolute, join } from 'node:path';
import { startResidentShell } from './shell.ts';
import { startStorage } from '../services/storage.ts';

let dataSettings:ReturnType<typeof createDataSettings>|undefined;
let storage:ReturnType<typeof startStorage>|undefined;
let applications:ReturnType<typeof createApplications>|undefined;
startResidentShell({ resourcesDirectory: __dirname,
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
  async recordCommandUse(commandId) {
    if(!storage?.isReady()) throw new Error('Local ranking unavailable.');
    return storage.repository.request('commands.recordUse',{commandId},{timeoutMs:250});
  },
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
  dataSettings=createDataSettings({resourcesDirectory:__dirname,isReady:currentStorage.isReady,
    async exportCategory(category,signal){
      const result=await controls.export({category},{signal});
      if(result.outcome!=='exported')throw {reasonCode:result.reason};
      return {schemaVersion:1,format:result.format,encrypted:result.encrypted,data:result.data};
    },
    async clearCategory(category,signal){
      const result=await controls.clear({category},{signal});
      if(result.outcome!=='completed')throw new Error('Local data action interrupted.');
    },
  });
  return [currentStorage,dataSettings,applications];
} });
