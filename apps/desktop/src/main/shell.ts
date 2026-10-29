import { createQuitRequest } from './quit-preflight.ts';
import { app, BrowserWindow, ipcMain, nativeTheme, protocol, screen, session } from 'electron';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SHELL_APP_ID, SHELL_CHANNELS } from '../../../../packages/contracts/src/desktop-shell.ts';
import type { DesktopShellState } from '../../../../packages/contracts/src/desktop-shell.ts';
import tokens from '../../../../docs/design/tokens.json' with { type: 'json' };
import { APP_SCHEME, APP_URL, createAssetHandler, parseAssetManifest } from './assets.ts';
import { parseArguments, parseDeepLink, parseInstanceRequest } from './commands.ts';
import type { ShellCommand } from './commands.ts';
import { registerShellIpc } from './ipc.ts';
import { registerLauncherIpc } from './launcher-ipc.ts';
import type { LauncherActions } from './launcher-ipc.ts';
import { ResidentLifecycle } from './lifecycle.ts';
import type { ResidentService } from './lifecycle.ts';
import { restrictContents, restrictSession, securePreferences } from './security.ts';

export interface ResidentShellOptions {
  rates?:LauncherActions['rates'];
  resourcesDirectory: string;
  prepareQuit?:()=>Promise<boolean>;
  /** Called once after instance ownership and Electron readiness; return owned handles synchronously. */
  createServices?: () => readonly ResidentService[];
  copyCalculatorResult?:LauncherActions['copyCalculatorResult'];
  definitions?:LauncherActions['definitions'];
  dictionary?:LauncherActions['dictionary'];
  emoji?:LauncherActions['emoji'];
  quicklinks?:LauncherActions['quicklinks'];
  loadWorkflowCommands?:LauncherActions['loadWorkflowCommands'];
  openWorkflowEntry?:LauncherActions['openWorkflowEntry'];
  openWorkflowEditor?: () => Promise<void>;
  searchNotes?:LauncherActions['searchNotes'];
  getNote?:LauncherActions['getNote'];
  openNote?:LauncherActions['openNote'];
  openNotes?: () => Promise<void>;
  openQuickNote?: () => Promise<void>;
  openFileSearch?: () => Promise<void>;
  openDataSettings?: () => Promise<void>;
  openUrl?: LauncherActions['openUrl'];
  getCommandUsage?: LauncherActions['getUsage'];
  recordCommandUse?: LauncherActions['recordUse'];
  setCommandPinned?: LauncherActions['setPinned'];
  setCommandAlias?: LauncherActions['setAlias'];
  listHiddenCommands?: LauncherActions['listHidden'];
  setCommandHidden?: LauncherActions['setHidden'];
  listApplications?: LauncherActions['listApplications'];
  launchApplication?: LauncherActions['launchApplication'];
  launchApplicationAction?:LauncherActions['launchApplicationAction'];
}

/** Called once, synchronously before Electron readiness, by the packaged entry. */
export function startResidentShell(options: ResidentShellOptions): void {
  app.setName('Linuxcast');
  app.setDesktopName(`${SHELL_APP_ID}.desktop`);
  app.enableSandbox();
  protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

  let initial: ShellCommand;
  try { initial = parseArguments(process.argv.slice(process.defaultApp ? 2 : 1)); }
  catch { console.error('SHELL_INVALID_STARTUP'); app.exit(2); return; }
  if (!app.requestSingleInstanceLock({ protocolVersion: 1, command: initial })) {
    app.exit(0); return;
  }

  const sessionKind = process.env.XDG_SESSION_TYPE === 'wayland' && process.env.WAYLAND_DISPLAY ? 'wayland'
    : process.env.XDG_SESSION_TYPE === 'x11' && process.env.DISPLAY ? 'x11' : 'unknown';
  if (sessionKind !== 'unknown') app.commandLine.appendSwitch('ozone-platform', sessionKind);
  let window: BrowserWindow | undefined;
  let generation = 0;
  let removeIpc = () => {};
  let removeLauncherIpc = () => {};
  const services: ResidentService[] = [];
  let shutdownFinished = false;
  const snapshot = (): DesktopShellState => {
    const focused = !!window && !window.isDestroyed() && window.isFocused();
    return {
      protocolVersion: 1, identity: SHELL_APP_ID,
      visible: !!window && !window.isDestroyed() && window.isVisible(), focused,
      appearance: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      activation: {
        id: 'launcher.activate', generation,
        state: focused ? 'available' : sessionKind === 'wayland' ? 'component-required' : 'temporarily-unavailable',
        backend: focused ? `electron-${sessionKind}` : null,
        reasonCode: focused ? 'launcher-focused' : 'launcher-focus-unconfirmed',
        ...(!focused ? { remediationAction: 'select-linuxcast-window' } : {}),
      },
    };
  };
  const publish = () => {
    generation++;
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.getURL() === APP_URL)
      window.webContents.send(SHELL_CHANNELS.state, snapshot());
  };
  const updateAppearance = () => {
    if (window && !window.isDestroyed()) window.setBackgroundColor(tokens.themes[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'].surface);
    publish();
  };

  const lifecycle = new ResidentLifecycle(async () => {
    const area = screen.getPrimaryDisplay().workArea;
    const width = Math.max(1, Math.min(tokens.layout.launcherWidth, area.width - 32));
    const height = Math.max(1, Math.min(tokens.layout.launcherMaxHeight, area.height - 32));
    const current = new BrowserWindow({
      width, height, minWidth: Math.min(360, width), minHeight: Math.min(200, height),
      show: false, frame: false, resizable: true, title: 'Linuxcast',
      backgroundColor: tokens.themes[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'].surface,
      webPreferences: securePreferences(join(options.resourcesDirectory, 'preload.cjs'), session.fromPartition('linuxcast-shell')),
    });
    window = current;
    current.setMenu(null);
    restrictContents(current.webContents);
    current.on('close', event => {
      if (!lifecycle.quitting) { event.preventDefault(); lifecycle.hide(); publish(); }
    });
    current.on('show', publish);
    current.on('hide',()=>{options.rates?.invalidate();publish();});
    current.on('focus', publish);
    current.on('blur', publish);
    current.on('closed', () => { if (window === current) window = undefined; });
    current.webContents.on('render-process-gone', () => {
      console.error('SHELL_RENDERER_UNAVAILABLE');
      current.destroy(); // A later explicit invocation recreates it; no crash loop.
    });
    try { await current.loadURL(APP_URL); }
    catch { current.destroy(); throw new Error('Shell load failed.'); }
    return {
      isDestroyed: () => current.isDestroyed(), isVisible: () => current.isVisible(),
      show: () => {
        // A single ordinary request, never repeated focus forcing or an activation success claim.
        if (sessionKind === 'x11' && current.isMinimized()) current.restore();
        current.show();
        if (sessionKind === 'x11') current.focus();
        publish();
      },
      hide: () => { current.hide(); publish(); }, destroy: () => current.destroy(),
    };
  }, services, code => {
    shutdownFinished = true;
    removeIpc();
    removeLauncherIpc();
    nativeTheme.removeListener('updated', updateAppearance);
    app.exit(code);
  }, () => console.error('SHELL_LIFECYCLE_UNAVAILABLE'));

  const requestQuit=createQuitRequest(async()=>options.prepareQuit?options.prepareQuit():true,()=>lifecycle.quit());

  const ready = app.whenReady().then(async () => {
    if (lifecycle.quitting) return;
    const assets = parseAssetManifest(JSON.parse(await readFile(join(options.resourcesDirectory, 'assets.json'), 'utf8')));
    const shellSession = session.fromPartition('linuxcast-shell');
    restrictSession(shellSession, assets);
    await shellSession.protocol.handle(APP_SCHEME, await createAssetHandler(join(options.resourcesDirectory, 'renderer'), assets));
    if (lifecycle.quitting) return;
    services.push(...(options.createServices?.() ?? []));
    removeLauncherIpc = registerLauncherIpc(ipcMain, {
      contents: () => window?.webContents, quitting: () => lifecycle.quitting,
      ...(options.rates?{rates:options.rates,rateVisible:()=>!!window&&!window.isDestroyed()&&window.isVisible()}:{}),
      hide: () => lifecycle.hide(), quit: () => requestQuit(),
      ...(options.openDataSettings ? {openDataSettings: options.openDataSettings} : {}),
      ...(options.loadWorkflowCommands?{loadWorkflowCommands:options.loadWorkflowCommands}:{}),
      ...(options.openWorkflowEntry?{openWorkflowEntry:options.openWorkflowEntry}:{}),
      ...(options.openWorkflowEditor ? {openWorkflowEditor:options.openWorkflowEditor} : {}),
      ...(options.searchNotes?{searchNotes:options.searchNotes}:{}),
      ...(options.getNote?{getNote:options.getNote}:{}),
      ...(options.openNote?{openNote:options.openNote}:{}),
      ...(options.openNotes ? {openNotes:options.openNotes} : {}),
      ...(options.openQuickNote ? {openQuickNote:options.openQuickNote} : {}),
      ...(options.openFileSearch ? {openFileSearch:options.openFileSearch} : {}),
      ...(options.definitions?{definitions:options.definitions}:{}),
      ...(options.dictionary?{dictionary:options.dictionary,dictionaryVisible:()=>!!window&&!window.isDestroyed()&&window.isVisible()}:{}),
      ...(options.emoji?{emoji:options.emoji,emojiVisible:()=>!!window&&!window.isDestroyed()&&window.isVisible()}:{}),
      ...(options.copyCalculatorResult ? {copyCalculatorResult:options.copyCalculatorResult} : {}),
      ...(options.openUrl ? {openUrl:options.openUrl} : {}),
      ...(options.quicklinks?{quicklinks:options.quicklinks}:{}),
      ...(options.getCommandUsage ? {getUsage: options.getCommandUsage} : {}),
      ...(options.listApplications ? {listApplications: options.listApplications} : {}),
      ...(options.launchApplication ? {launchApplication: options.launchApplication} : {}),
      ...(options.launchApplicationAction?{launchApplicationAction:options.launchApplicationAction}:{}),
      ...(options.setCommandPinned ? {setPinned: options.setCommandPinned} : {}),
      ...(options.setCommandAlias ? {setAlias: options.setCommandAlias} : {}),
      ...(options.listHiddenCommands ? {listHidden:options.listHiddenCommands} : {}),
      ...(options.setCommandHidden ? {setHidden:options.setCommandHidden} : {}),
      ...(options.recordCommandUse ? {recordUse: options.recordCommandUse} : {}),
    });
    removeIpc = registerShellIpc(ipcMain, {
      contents: () => window?.webContents, state: snapshot, hide: () => lifecycle.hide(),
      ...(options.openDataSettings ? {openDataSettings: options.openDataSettings} : {}),
      resize: height => {
        if (!window || window.isDestroyed()) return;
        const area = screen.getDisplayMatching(window.getBounds()).workArea;
        window.setMinimumSize(Math.min(360, area.width), Math.min(200, area.height));
        window.setSize(Math.max(1, Math.min(window.getSize()[0]!, area.width - 32)),
          Math.max(1, Math.min(height, tokens.layout.launcherMaxHeight, area.height - 32)));
      },
      quit: () => requestQuit(), quitting: () => lifecycle.quitting,
    });
    nativeTheme.on('updated', updateAppearance);
  });
  const dispatch = (command: ShellCommand) => {
    if (command === 'quit') { void requestQuit(); return; }
    void ready.then(() => lifecycle.dispatch(command)).catch(() => {
      console.error('SHELL_START_FAILED'); void lifecycle.quit(1);
    });
  };
  app.on('second-instance', (_event, _argv, _directory, data: unknown) => {
    try { dispatch(parseInstanceRequest(data)); }
    catch { console.error('SHELL_INSTANCE_REQUEST_REJECTED'); }
  });
  app.on('open-url', (event, url) => {
    event.preventDefault();
    try { dispatch(parseDeepLink(url)); } catch { console.error('SHELL_LINK_REJECTED'); }
  });
  app.on('activate', () => dispatch('show'));
  app.on('window-all-closed', () => { /* Hiding/closing the launcher keeps services resident. */ });
  app.on('before-quit', event => {
    if (!shutdownFinished) { event.preventDefault(); void requestQuit(); }
  });
  dispatch(initial);
}
