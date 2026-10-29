import {contextBridge,ipcRenderer} from 'electron';
import {createNotesApi} from './api.ts';
contextBridge.exposeInMainWorld('linuxcastNotes',createNotesApi({invoke:(channel,payload)=>ipcRenderer.invoke(channel,payload),on:(channel,listener)=>ipcRenderer.on(channel,listener),removeListener:(channel,listener)=>ipcRenderer.removeListener(channel,listener)}));
