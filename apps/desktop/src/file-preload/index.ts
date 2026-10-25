import { contextBridge,ipcRenderer } from 'electron';
import { createFileSearchApi } from './api.ts';
if(process.sandboxed!==true||process.contextIsolated!==true)throw new Error('Linuxcast requires renderer isolation.');
contextBridge.exposeInMainWorld('linuxcastFiles',createFileSearchApi(ipcRenderer));
