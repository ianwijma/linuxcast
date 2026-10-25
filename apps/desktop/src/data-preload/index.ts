import { contextBridge, ipcRenderer } from 'electron';
import { createDataSettingsApi } from './api.ts';
contextBridge.exposeInMainWorld('linuxcastData',createDataSettingsApi({invoke:(channel,payload)=>ipcRenderer.invoke(channel,payload),on:(channel,listener)=>ipcRenderer.on(channel,listener),removeListener:(channel,listener)=>ipcRenderer.removeListener(channel,listener)}));
