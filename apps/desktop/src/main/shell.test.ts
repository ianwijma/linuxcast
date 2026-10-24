import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  function events() {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    return {
      on: vi.fn((name: string, fn: (...args: unknown[]) => void) => {
        listeners.set(name, [...(listeners.get(name) ?? []), fn]);
      }),
      removeListener: vi.fn(),
      emit: (name: string, ...args: unknown[]) => { for (const fn of listeners.get(name) ?? []) fn(...args); },
      clear: () => listeners.clear(),
    };
  }
  const contents = { ...events(), setWindowOpenHandler: vi.fn(), getURL: () => 'linuxcast-app://shell/index.html',
    isDestroyed: () => false, send: vi.fn() };
  let visible = false, destroyed = false;
  const window = { ...events(), webContents: contents, setMenu: vi.fn(), loadURL: vi.fn(async () => {}),
    isDestroyed: () => destroyed, isVisible: () => visible, isFocused: () => false, isMinimized: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 720, height: 560 }), getSize: () => [720, 560],
    setMinimumSize: vi.fn(), setSize: vi.fn(), setBackgroundColor: vi.fn(), restore: vi.fn(), focus: vi.fn(),
    show: vi.fn(() => { visible = true; }), hide: vi.fn(() => { visible = false; }),
    destroy: vi.fn(() => { destroyed = true; visible = false; }),
    reset: () => { visible = false; destroyed = false; },
  };
  const session = { ...events(), setPermissionCheckHandler: vi.fn(), setPermissionRequestHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(), setDisplayMediaRequestHandler: vi.fn(),
    webRequest: { onBeforeRequest: vi.fn() }, protocol: { handle: vi.fn() } };
  return {
    app: { ...events(), setName: vi.fn(), setDesktopName: vi.fn(), enableSandbox: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true), exit: vi.fn(), whenReady: vi.fn(async () => {}),
      commandLine: { appendSwitch: vi.fn() } },
    BrowserWindow: vi.fn(function (_options: unknown) { void _options; return window; }), window,
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
    nativeTheme: { ...events(), shouldUseDarkColors: true },
    protocol: { registerSchemesAsPrivileged: vi.fn() },
    session: { fromPartition: vi.fn(() => session) },
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 800 } }),
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 800 } }) },
  };
});
vi.mock('electron', () => electron);
import { startResidentShell } from './shell.ts';

let resources = '';
let argv: string[];
beforeEach(async () => {
  vi.clearAllMocks(); electron.app.clear(); electron.window.clear(); electron.window.webContents.clear();
  electron.window.reset(); electron.app.requestSingleInstanceLock.mockReturnValue(true);
  argv = process.argv; process.argv = ['/packaged/linuxcast', '--show'];
  vi.stubEnv('XDG_SESSION_TYPE', 'wayland'); vi.stubEnv('WAYLAND_DISPLAY', 'synthetic');
  resources = await mkdtemp(join(tmpdir(), 'linuxcast-shell-'));
  await mkdir(join(resources, 'renderer'));
  await writeFile(join(resources, 'assets.json'), '["index.html"]');
  await writeFile(join(resources, 'renderer/index.html'), '<main>Linuxcast</main>');
});
afterEach(async () => {
  process.argv = argv; vi.unstubAllEnvs(); vi.restoreAllMocks();
  await rm(resources, { recursive: true, force: true });
});

describe('Electron main integration with deterministic Electron boundaries', () => {
  it('creates a secure resident window and routes the second instance to it', async () => {
    startResidentShell({ resourcesDirectory: resources });
    await vi.waitFor(() => expect(electron.window.show).toHaveBeenCalled());
    expect(electron.app.enableSandbox).toHaveBeenCalledOnce();
    expect(electron.BrowserWindow).toHaveBeenCalledOnce();
    expect(electron.BrowserWindow.mock.calls[0]?.[0]).toMatchObject({ show: false, frame: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    expect(electron.window.focus).not.toHaveBeenCalled();
    electron.app.emit('second-instance', {}, [], '/ignored', { protocolVersion: 1, command: 'toggle' });
    await vi.waitFor(() => expect(electron.window.hide).toHaveBeenCalled());
    expect(electron.BrowserWindow).toHaveBeenCalledOnce(); expect(electron.app.exit).not.toHaveBeenCalled();
    const preventDefault = vi.fn(); electron.window.emit('close', { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(electron.app.exit).not.toHaveBeenCalled();
    electron.app.emit('window-all-closed'); expect(electron.app.exit).not.toHaveBeenCalled();
    electron.app.emit('second-instance', {}, [], '/ignored', { protocolVersion: 1, command: 'quit' });
    await vi.waitFor(() => expect(electron.app.exit).toHaveBeenCalledWith(0));
    expect(electron.window.destroy).toHaveBeenCalledOnce();
  });
  it('exits a secondary process without creating windows or IPC handlers', () => {
    electron.app.requestSingleInstanceLock.mockReturnValue(false);
    const createServices = vi.fn(() => []);
    startResidentShell({ resourcesDirectory: resources, createServices });
    expect(electron.app.exit).toHaveBeenCalledWith(0);
    expect(electron.BrowserWindow).not.toHaveBeenCalled(); expect(electron.ipcMain.handle).not.toHaveBeenCalled();
    expect(createServices).not.toHaveBeenCalled();
  });
  it('rejects malformed initial links before acquiring the instance', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.argv = ['/packaged/linuxcast', 'linuxcast://launcher/show?private=SYNTHETIC_PRIVATE'];
    startResidentShell({ resourcesDirectory: resources });
    expect(electron.app.exit).toHaveBeenCalledWith(2);
    expect(electron.app.requestSingleInstanceLock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('SHELL_INVALID_STARTUP');
  });
  it('fails startup with nonzero status when packaged resources are invalid', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await writeFile(join(resources, 'assets.json'), '["../private.js"]');
    const createServices = vi.fn(() => []);
    startResidentShell({ resourcesDirectory: resources, createServices });
    await vi.waitFor(() => expect(electron.app.exit).toHaveBeenCalledWith(1));
    expect(electron.BrowserWindow).not.toHaveBeenCalled(); expect(createServices).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('SHELL_START_FAILED');
  });
  it('rejects malformed subsequent links without changing visibility or logging payloads', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    startResidentShell({ resourcesDirectory: resources });
    await vi.waitFor(() => expect(electron.window.show).toHaveBeenCalled());
    electron.app.emit('open-url', { preventDefault: vi.fn() }, 'linuxcast://launcher/quit');
    electron.app.emit('second-instance', {}, [], '', { protocolVersion: 1, command: 'SYNTHETIC_PRIVATE' });
    expect(electron.window.hide).not.toHaveBeenCalled(); expect(electron.app.exit).not.toHaveBeenCalled();
    expect(error.mock.calls).toEqual([['SHELL_LINK_REJECTED'], ['SHELL_INSTANCE_REQUEST_REJECTED']]);
    electron.app.emit('before-quit', { preventDefault: vi.fn() });
    await vi.waitFor(() => expect(electron.app.exit).toHaveBeenCalledWith(0));
  });
  it('creates service ownership only in the primary process after readiness and stops it on Quit', async () => {
    const stop = vi.fn(async () => {}), terminate = vi.fn(async () => {});
    const createServices = vi.fn(() => [{ stop, terminate }]);
    startResidentShell({ resourcesDirectory: resources, createServices });
    expect(createServices).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(electron.window.show).toHaveBeenCalled());
    expect(createServices).toHaveBeenCalledOnce();
    electron.app.emit('before-quit', { preventDefault: vi.fn() });
    await vi.waitFor(() => expect(electron.app.exit).toHaveBeenCalledWith(0));
    expect(stop).toHaveBeenCalledOnce(); expect(terminate).not.toHaveBeenCalled();
  });
});
