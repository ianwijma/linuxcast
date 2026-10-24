import { contextBridge, ipcRenderer } from 'electron';
import { createShellApi } from './api.ts';

// A misconfigured build fails closed instead of claiming a secure renderer.
if (process.sandboxed !== true || process.contextIsolated !== true)
  throw new Error('Linuxcast requires renderer isolation.');
contextBridge.exposeInMainWorld('linuxcast', createShellApi(ipcRenderer));
