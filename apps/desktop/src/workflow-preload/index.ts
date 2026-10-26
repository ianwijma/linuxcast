import { contextBridge, ipcRenderer } from 'electron';
import { createWorkflowEditorApi } from './api.ts';
import { createWorkflowIntentApi } from './intent-api.ts';
import { createWorkflowRunApi } from './run-api.ts';
const transport={invoke:(channel:string,payload:unknown)=>ipcRenderer.invoke(channel,payload),on:(channel:string,listener:(_event:unknown,value:unknown)=>void)=>ipcRenderer.on(channel,listener),removeListener:(channel:string,listener:(_event:unknown,value:unknown)=>void)=>ipcRenderer.removeListener(channel,listener)};
contextBridge.exposeInMainWorld('linuxcastWorkflow',Object.freeze({...createWorkflowEditorApi(transport),...createWorkflowRunApi(transport),...createWorkflowIntentApi(transport)}));
