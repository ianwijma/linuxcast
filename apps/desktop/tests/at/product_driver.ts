// Private stdio adapter. No evidence publication and no native focus inference.
import { _electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import type { DesktopShellApi } from '../../../../packages/contracts/src/desktop-shell.ts';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { enterAliasForm, endAtFinalResult } from './driver_guards.ts';

const staging = resolve(process.argv[2]!);
const root = process.env.LINUXCAST_F102_AT_ROOT;
if (process.versions.node !== '24.22.1' || !root || process.argv.length !== 3 || !/^\/tmp\/linuxcast-f102-at-[a-f0-9]{16}$/.test(root))
  throw new Error('Private controller required');
const executable = createRequire(join(staging, 'apps/desktop/package.json'))('electron') as string;
const wrapper = join(root, 'entry.cjs');
// Preserve the real state handler so recovery restores validation and service
// behavior, rather than returning a cached synthetic "ok" state.
writeFileSync(wrapper, `const {app,ipcMain}=require('electron');
process.argv=process.argv.filter(v=>v!=='--inspect=0'&&v!=='--remote-debugging-port=0');
app.setPath('userData',${JSON.stringify(join(root, 'profile'))});
app.setPath('sessionData',${JSON.stringify(join(root, 'profile'))});
const handle=ipcMain.handle.bind(ipcMain); let stateHandler;
ipcMain.handle=(channel,listener)=>{if(channel==='shell:get-state'&&!stateHandler)stateHandler=listener;return handle(channel,listener)};
global.__f102Restore=()=>{if(!stateHandler)throw Error('Missing real handler');ipcMain.removeHandler('shell:get-state');handle('shell:get-state',stateHandler)};
require(${JSON.stringify(join(staging, 'apps/desktop/dist/main.cjs'))});
`, { mode: 0o600, flag: 'wx' });

let app: ElectronApplication | undefined;
let page: Page;
let mainPid = 0;
let expected = 0;
const commands = ['attest', 'anchor', 'search', 'query', 'result', 'away', 'back', 'final-query', 'final', 'actions', 'filter-action', 'form',
  'save', 'cancel', 'restore', 'hide', 'reopen', 'loading', 'error', 'recovery'];
const output = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);

async function geometry(fallback = false, result = false, final = false) {
  const stable = await page.evaluate(async () => {
    const frames: string[] = [];
    for (let frame = 0; frame < 12; frame++) {
      await new Promise<void>(done => requestAnimationFrame(() => done()));
      frames.push(`${innerWidth}:${innerHeight}`);
    }
    return new Set(frames.slice(-6)).size === 1;
  });
  const viewport = await page.evaluate(({ fallback, result, final }) => {
    const footer = document.querySelector(fallback ? '.shell-footer' : '.lc-view:not([hidden]) .lc-view-footer');
    if (!footer) return false;
    const f = footer.getBoundingClientRect();
    const body = document.querySelector('.lc-view:not([hidden]) .lc-view-scroll');
    let rowFits = true;
    if (result) {
      const row = document.querySelector('[role="option"][aria-selected="true"]');
      if (!body || !row) return false;
      const r = row.getBoundingClientRect(), b = body.getBoundingClientRect();
      rowFits = (!final || body.scrollTop > 0 && body.scrollHeight > body.clientHeight) && r.top >= b.top && r.bottom <= b.bottom + 1 && r.left >= 0 && r.right <= innerWidth + 1;
    }
    return devicePixelRatio === 2 && innerWidth > 0 && innerHeight > 0 && f.top >= 0 &&
      f.bottom <= innerHeight + 1 && f.right <= innerWidth + 1 && f.left >= 0 && rowFits &&
      document.documentElement.scrollWidth <= innerWidth + 1 &&
      document.documentElement.scrollHeight <= innerHeight + 1 && (fallback || !!body && body.clientHeight > 0);
  }, { fallback, result, final });
  const pixels = await app!.evaluate(async ({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length !== 1) return false;
    const window = windows[0]!, bounds = window.getContentBounds();
    const size = (await window.capturePage()).getSize();
    return window.webContents.getZoomFactor() === 2 && size.width === bounds.width &&
      size.height === bounds.height && size.width > 0 && size.height > 0;
  });
  return stable && viewport && pixels;
}

async function secondary() {
  await new Promise<void>((done, reject) => {
    const child = spawn(executable, [wrapper, '--show'], { env: process.env, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Secondary deadline')); }, 8000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Secondary unavailable')); });
    child.once('exit', code => { clearTimeout(timer); if (code === 0) done(); else reject(new Error('Secondary failed')); });
  });
}

async function command(id: string) {
  if (id !== commands[expected++]) throw new Error('Order');
  if (id === 'attest') {
    app = await _electron.launch({ executablePath: executable, args: ['--force-renderer-accessibility=complete', wrapper, '--show'],
      chromiumSandbox: true, env: process.env as Record<string, string>, timeout: 8000 });
    page = await app.firstWindow({ timeout: 8000 });
    page.setDefaultTimeout(1500);
    await page.waitForURL('linuxcast-app://shell/index.html');
    await page.getByRole('combobox', { name: 'Search commands', exact: true }).waitFor();
    const runtime = await app.evaluate(({ app, BrowserWindow }) => {
      app.setAccessibilitySupportEnabled(true);
      const windows = BrowserWindow.getAllWindows();
      if (windows.length !== 1) throw new Error('Window count');
      const window = windows[0]!;
      window.webContents.setZoomFactor(2);
      const preferences = (window.webContents as unknown as { getLastWebPreferences(): Record<string, unknown> }).getLastWebPreferences();
      return { pid: process.pid, windowId: window.getNativeWindowHandle().readUInt32LE(),
        secure: preferences.sandbox === true && preferences.contextIsolation === true &&
          preferences.nodeIntegration === false && preferences.webSecurity === true &&
          !app.commandLine.hasSwitch('no-sandbox') && !app.commandLine.hasSwitch('disable-web-security') &&
          window.webContents.getURL() === 'linuxcast-app://shell/index.html',
        versions: process.versions.electron === '45.0.0' };
    });
    const renderer = await page.evaluate(() => {
      const api = (window as unknown as { linuxcast: DesktopShellApi }).linuxcast;
      return typeof (window as unknown as Record<string, unknown>).process === 'undefined' &&
        typeof (window as unknown as Record<string, unknown>).require === 'undefined' &&
        api.runtime.sandboxed && api.runtime.contextIsolated;
    });
    if (!runtime.secure || !runtime.versions || !renderer) throw new Error('Runtime');
    mainPid = runtime.pid;
    // PIDs/window IDs remain on private pipes, never in public evidence.
    return { status: 'attested', pid: mainPid, windowId: runtime.windowId, secure: true };
  }
  if (id === 'anchor') {
    // A real native key sequence moves to the list; never DOM focus().
    await page.keyboard.press('Tab');
  } else if (id === 'search') {
    await page.keyboard.press('Shift+Tab');
  } else if (id === 'query') {
    await page.keyboard.type('Public AT result');
    await page.getByRole('option', { name: 'Public AT result Installed application', exact: true }).waitFor();
  } else if (id === 'result') {
    await page.keyboard.press('Tab');
  } else if (id === 'away' || id === 'back') {
    await page.keyboard.press(id === 'away' ? 'ArrowDown' : 'ArrowUp');
    const name = id === 'away' ? 'Public AT result alternate Installed application' : 'Public AT result Installed application';
    if (await page.getByRole('option', { name, exact: true }).getAttribute('aria-selected') !== 'true') throw new Error('Selection');
  } else if (id === 'final-query') {
    await page.keyboard.press('Shift+Tab');
    const query=page.getByRole('combobox',{name:'Search commands',exact:true});
    if(!await query.evaluate(element=>element===document.activeElement))throw new Error('Final query focus');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Public AT filler 1');
    await page.getByRole('option',{name:'Public AT filler 119 Installed application',exact:true}).waitFor();
    await page.keyboard.press('Tab');
  } else if (id === 'final') {
    await endAtFinalResult(page);
  } else if (id === 'actions') {
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog', { name: 'Actions', exact: true }).waitFor();
  } else if (id === 'filter-action') {
    await page.keyboard.type('Edit search alias');
  } else if (id === 'form') {
    await enterAliasForm(page);
    await page.getByRole('textbox', { name: 'Search alias', exact: true }).waitFor();
  } else if (id === 'save' || id === 'cancel') {
    await page.keyboard.press('Tab');
  } else if (id === 'restore') {
    if (!await page.getByRole('button', { name: 'Cancel', exact: true })
      .evaluate(element => element === document.activeElement)) throw new Error('Cancel input');
    await page.keyboard.press('Enter'); // Untouched Cancel only; never Save.
  } else if (id === 'hide') {
    await page.keyboard.press('Escape');
    if (await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())) throw new Error('Hide');
    return { status: 'ok', operation: true, geometry: false };
  } else if (id === 'reopen') {
    await secondary();
    const same = await app!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().length === 1 && BrowserWindow.getAllWindows()[0]!.isVisible());
    if (!same || app!.process().pid !== mainPid) throw new Error('Singleton');
    await page.getByRole('combobox', { name: 'Search commands', exact: true }).waitFor();
  } else if (id === 'loading') {
    await app!.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('shell:get-state');
      ipcMain.handle('shell:get-state', () => new Promise(() => {}));
    });
    await page.reload();
    await page.getByText('Opening Linuxcast…', { exact: true }).waitFor();
  } else if (id === 'error') {
    await app!.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('shell:get-state');
      ipcMain.handle('shell:get-state', () => ({ ok: false, error: { code: 'internal', message: 'Shell operation unavailable.', retryable: false } }));
    });
    await page.reload();
    await page.getByRole('heading', { name: 'Linuxcast could not connect', exact: true }).waitFor();
  } else if (id === 'recovery') {
    await app!.evaluate(() => {
      (globalThis as unknown as { __f102Restore(): void }).__f102Restore();
    });
    await page.reload();
    const state = await page.evaluate(() => (window as unknown as { linuxcast: DesktopShellApi }).linuxcast.getState());
    if (!state.ok) throw new Error('Recovery');
    await page.getByRole('combobox', { name: 'Search commands', exact: true }).waitFor();
  }
  return { status: 'ok', operation: true, geometry: await geometry(id === 'loading' || id === 'error', ['result', 'away', 'back', 'final'].includes(id), id === 'final') };
}

// Serialized bounded command processing. Parent owns the overall 10s deadline;
// a child-side watchdog also prevents a hung adapter outliving that deadline.
let running = false;
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
output({ status: 'ready' });
for await (const line of input) {
  if (running || line.length > 32 || !commands.includes(line)) { output({ status: 'failed' }); break; }
  running = true;
  const watchdog = setTimeout(() => process.exit(3), 9500);
  try {
    output(await command(line));
  } catch {
    output({ status: 'failed' });
    process.exitCode = 3;
    break;
  } finally {
    clearTimeout(watchdog);
  }
  running = false;
}
// The controller kills/reaps the entire owned tree. No unbounded app.close().
