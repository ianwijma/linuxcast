import { contextBridge, ipcRenderer } from "electron";
import type { LauncherAPI, LauncherState } from "./contract.ts";
const api: LauncherAPI = {
  reportContentHeight: (height) =>
    ipcRenderer.invoke("launcher:content-height", {
      protocolVersion: 1,
      height,
    }),
  getState: () =>
    ipcRenderer.invoke("launcher:get-state", { protocolVersion: 1 }),
  beginShortcutRecording: () =>
    ipcRenderer.invoke("launcher:begin-recording", { protocolVersion: 1 }),
  cancelShortcutRecording: () =>
    ipcRenderer.invoke("launcher:cancel-recording", { protocolVersion: 1 }),
  hideLauncher: () =>
    ipcRenderer.invoke("launcher:hide", { protocolVersion: 1 }),
  quit: () => ipcRenderer.invoke("launcher:quit", { protocolVersion: 1 }),
  setShortcut: (accelerator) =>
    ipcRenderer.invoke("launcher:set-shortcut", {
      protocolVersion: 1,
      accelerator,
    }),
  setAppearance: (appearance) =>
    ipcRenderer.invoke("launcher:set-appearance", {
      protocolVersion: 1,
      appearance,
    }),
  onState: (listener) => {
    const wrapped = (_event: unknown, state: LauncherState) => listener(state);
    ipcRenderer.on("launcher:state", wrapped);
    return () => ipcRenderer.removeListener("launcher:state", wrapped);
  },
  runtime: Object.freeze({
    sandboxed: process.sandboxed === true,
    contextIsolated: process.contextIsolated === true,
  }),
};
contextBridge.exposeInMainWorld("linuxcast", api);
