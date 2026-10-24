import { app } from 'electron';
import { isAbsolute, join } from 'node:path';
import { startResidentShell } from './shell.ts';
import { startStorage } from '../services/storage.ts';

startResidentShell({ resourcesDirectory: __dirname, createServices: () => {
  const dataHome = process.env.XDG_DATA_HOME;
  const directory = join(dataHome && isAbsolute(dataHome) ? dataHome : join(app.getPath('home'), '.local/share'), 'linuxcast');
  const storage = startStorage(__dirname, directory, app.getVersion());
  app.once('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', () => storage.confirmLaunch());
  });
  return [storage];
} });
