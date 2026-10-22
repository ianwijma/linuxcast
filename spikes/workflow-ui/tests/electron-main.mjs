// Disposable S0-06 validation app. No production preload, extension or host privileges.
import { app, BrowserWindow, session } from 'electron';
import { isAbsolute, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
const profile = process.env.LINUXCAST_UI_PROFILE;
const target = new URL(process.env.LINUXCAST_UI_URL ?? '');
if (!profile || !isAbsolute(profile) || target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('Explicit disposable profile and loopback fixture required');
app.setPath('userData', profile);
app.setName('Linuxcast S0-06 Synthetic');
app.commandLine.appendSwitch('force-renderer-accessibility');
const preload = resolve(profile, 'sandbox-probe.cjs');
// Test-only sandbox preload exposes two immutable booleans, no host methods,
// process/require objects, IPC, filesystem access or credentials to the page.
writeFileSync(preload, 'const {contextBridge}=require("electron");contextBridge.exposeInMainWorld("__syntheticSandboxProbe",{sandboxed:process.sandboxed,contextIsolated:process.contextIsolated});');
app.whenReady().then(async () => {
  app.setAccessibilitySupportEnabled(true);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const window = new BrowserWindow({ width: 1440, height: 1100, show: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, preload } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== target.origin) event.preventDefault(); });
  await window.loadURL(target.toString());
});
app.on('window-all-closed', () => app.quit());
