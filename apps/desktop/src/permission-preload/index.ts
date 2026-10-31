import { contextBridge,ipcRenderer } from 'electron';
import { createPermissionSettingsApi } from './api.ts';
if(process.sandboxed!==true||process.contextIsolated!==true)throw new Error('Linuxcast requires renderer isolation.');
contextBridge.exposeInMainWorld('linuxcastPermissions',createPermissionSettingsApi(ipcRenderer));
