import { DataControls } from '@linuxcast/data-controls';
import { createDataSettings } from './data-settings.ts';
import { app } from 'electron';
import { isAbsolute, join } from 'node:path';
import { startResidentShell } from './shell.ts';
import { startStorage } from '../services/storage.ts';

let dataSettings:ReturnType<typeof createDataSettings>|undefined;
startResidentShell({ resourcesDirectory: __dirname, openDataSettings:async()=>{if(!dataSettings)throw new Error('Local data workspace unavailable.');await dataSettings.open();}, createServices: () => {
  const dataHome = process.env.XDG_DATA_HOME;
  const directory = join(dataHome && isAbsolute(dataHome) ? dataHome : join(app.getPath('home'), '.local/share'), 'linuxcast');
  const storage = startStorage(__dirname, directory, app.getVersion());
  app.once('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', () => storage.confirmLaunch());
  });
  const controls=new DataControls(storage.repository);
  dataSettings=createDataSettings({resourcesDirectory:__dirname,isReady:storage.isReady,
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
  return [storage,dataSettings];
} });
