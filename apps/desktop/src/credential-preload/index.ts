import {contextBridge,ipcRenderer} from 'electron';
import {createCredentialSettingsApi} from './api.ts';
if(process.sandboxed!==true||process.contextIsolated!==true)throw new Error('Linuxcast requires renderer isolation.');
contextBridge.exposeInMainWorld('linuxcastCredentials',createCredentialSettingsApi(ipcRenderer));
