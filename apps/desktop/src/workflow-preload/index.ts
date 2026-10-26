import { contextBridge, ipcRenderer } from 'electron';
import { createWorkflowEditorApi } from './api.ts';
contextBridge.exposeInMainWorld('linuxcastWorkflow',createWorkflowEditorApi({invoke:(channel,payload)=>ipcRenderer.invoke(channel,payload),on:(channel,listener)=>ipcRenderer.on(channel,listener),removeListener:(channel,listener)=>ipcRenderer.removeListener(channel,listener)}));
