import { _electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, release } from 'node:os';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

// Run through dbus-run-session to isolate accessibility from the user's normal bus.
if (process.env.LINUXCAST_PRIVATE_AT !== '1' || !process.env.DBUS_SESSION_BUS_ADDRESS) throw new Error('Private dbus-run-session with LINUXCAST_PRIVATE_AT=1 required');
const atAddress = process.env.AT_SPI_BUS_ADDRESS;
if (!atAddress || !process.env.XDG_RUNTIME_DIR?.includes('linuxcast-s006-at-bus-') || !atAddress.startsWith(`unix:path=${process.env.XDG_RUNTIME_DIR}/`)) throw new Error('Private native accessibility bus unavailable');
const root = fileURLToPath(new URL('../../..', import.meta.url));
const fullOrca = process.env.LINUXCAST_ORCA_FULL === '1';
if (fullOrca && !/\/xvfb-run\.[^/]+\/Xauthority$/.test(process.env.XAUTHORITY ?? '')) throw new Error('Actual Orca requires the disposable xvfb-run display');
const evidence = resolve(root, 'spikes/workflow-ui/evidence', fullOrca ? 'electron-xvfb-orca' : 'electron');
mkdirSync(evidence, { recursive: true });
const profile = mkdtempSync(resolve(tmpdir(), 'linuxcast-s006-electron-'));
const server = await createServer({ configFile: false, root: resolve(root, 'spikes/workflow-ui'), esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } }, logLevel: 'error' });
let electron: ElectronApplication | undefined;
let observer: ChildProcessWithoutNullStreams | undefined;
let discovery: ChildProcessWithoutNullStreams | undefined;
let orca: ChildProcessWithoutNullStreams | undefined;
let speech: ChildProcessWithoutNullStreams | undefined;
let orcaExit: { code: number | null; signal: string | null } | undefined;
let orcaPassed = false;
const orcaVersion = fullOrca ? /[0-9]+\.[0-9]+(?:\.[0-9]+)?/.exec(spawnSync('/usr/bin/orca', ['--version'], { encoding: 'utf8' }).stdout)?.[0] ?? 'unavailable' : null;
async function tabTo(page: Page, name: string) {
  for (let i = 0; i < 100; i++) {
    if (await page.getByRole('button', { name, exact: true }).evaluateAll(elements => elements.some(element => element === document.activeElement))) return;
    if (await page.getByRole('combobox', { name, exact: true }).evaluateAll(elements => elements.some(element => element === document.activeElement))) return;
    if (await page.getByLabel(name, { exact: true }).evaluateAll(elements => elements.some(element => element === document.activeElement))) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Synthetic keyboard control unavailable');
}
try {
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server unavailable');
  const require = createRequire(resolve(root, 'apps/desktop/package.json'));
  const executable = require('electron') as string;
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  // Supply no provider keys, browser profiles or user credential paths to this app.
  const inherited = Object.fromEntries(['PATH', 'DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'GSETTINGS_BACKEND', 'LANG', 'LC_ALL'].flatMap(key => env[key] ? [[key, env[key]!]] : []));
  discovery = spawn('/usr/bin/python3', [resolve(root, 'spikes/workflow-ui/tests/private-a11y.py')], { env: { ...inherited, HOME: profile } });
  discovery.stderr.resume();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Private discovery unavailable')), 5000);
    discovery!.once('error', reject);
    discovery!.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  });
  electron = await _electron.launch({ executablePath: executable, chromiumSandbox: true, args: ['--force-renderer-accessibility=complete', resolve(root, 'spikes/workflow-ui/tests/electron-main.mjs')],
    env: { ...inherited, HOME: profile, XDG_CONFIG_HOME: resolve(profile, 'config'), XDG_CACHE_HOME: resolve(profile, 'cache'), LINUXCAST_UI_PROFILE: profile, LINUXCAST_UI_URL: `http://127.0.0.1:${address.port}` } });
  const page = await electron.firstWindow();
  await expect(page.getByRole('heading', { name: 'Trim Text', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const runtime = await electron.evaluate(({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    // Pinned Electron45 diagnostic method is available at runtime but omitted from public types.
    // This test-only shape does not change production Electron types or compiler strictness.
    const prefs = (window.webContents as unknown as { getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean } }).getLastWebPreferences();
    return { versions: process.versions, pid: process.pid, argv: process.argv, windowId: window.getNativeWindowHandle().readUInt32LE(), accessible: app.isAccessibilitySupportEnabled(), sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
  });
  expect(runtime.sandbox).toBe(true); expect(runtime.contextIsolation).toBe(true); expect(runtime.nodeIntegration).toBe(false);
  expect(runtime.argv).not.toContain('--no-sandbox');
  expect(await page.evaluate(() => typeof (window as unknown as Record<string, unknown>).require)).toBe('undefined');
  expect(await page.evaluate(() => typeof (window as unknown as Record<string, unknown>).process)).toBe('undefined');
  const rendererSandbox = await page.evaluate(() => (window as unknown as Record<string, unknown>).__syntheticSandboxProbe);
  expect(rendererSandbox).toEqual({ sandboxed: true, contextIsolated: true });
  if (fullOrca) {
    const configuration = resolve(profile, 'speechd'); mkdirSync(configuration);
    writeFileSync(resolve(configuration, 'speechd.conf'), 'AddModule "dummy" "sd_dummy" ""\nDefaultModule dummy\nDisableAutoSpawn\nLogLevel 0\nAudioOutputMethod "alsa"\nAudioALSADevice "null"\n');
    const socket = resolve(profile, 'speechd.sock');
    speech = spawn('/usr/bin/speech-dispatcher', ['--run-single', '--config-dir', configuration, '--communication-method', 'unix_socket', '--socket-path', socket, '--pid-file', resolve(profile, 'speechd.pid'), '--timeout', '60', '--module-dir', '/usr/lib/speech-dispatcher-modules', '--log-dir', configuration],
      { detached: true, env: { ...inherited, HOME: profile, XDG_CONFIG_HOME: resolve(profile, 'config'), XDG_CACHE_HOME: resolve(profile, 'cache') } });
    speech.stdout.resume(); speech.stderr.resume();
    await expect.poll(() => existsSync(socket), { timeout: 5000 }).toBe(true);
    orca = spawn('/usr/bin/orca', ['--user-prefs', resolve(profile, 'orca-full'), '--enable', 'speech', '--disable', 'braille', '--debug-file', resolve(profile, 'orca-debug.log')],
      { env: { ...inherited, HOME: profile, XDG_CONFIG_HOME: resolve(profile, 'config'), XDG_CACHE_HOME: resolve(profile, 'cache'), SPEECHD_ADDRESS: `unix_socket:${socket}` } });
    orca.stdout.resume(); orca.stderr.resume();
    orca.on('exit', (code, signal) => { orcaExit = { code, signal }; });
  }
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Use light appearance' }).click();
    // Electron contexts cannot create the blank target used by axe's cross-frame mode.
    // This trusted single-frame local fixture uses axe's documented legacy injection mode.
    expect((await new AxeBuilder({ page }).setLegacyMode(true).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.getByLabel('Node label', { exact: true }).focus();
    await page.screenshot({ path: resolve(evidence, `${theme}-ready.png`), fullPage: true });
  }
  for (const [state, text] of [
    ['loading', 'Loading fixture rows…'], ['empty', 'No nodes'],
    ['error', 'Fixture could not be loaded. Retry the local sample.'],
    ['permission', 'Clipboard permission required. Review permissions in the full client. This prototype cannot grant access.'],
    ['cancelled', 'Preview cancelled. No clipboard operation was performed.'],
  ]) {
    await page.getByRole('combobox', { name: 'Fixture state' }).selectOption(state!);
    await expect(page.getByRole('region', { name: 'Workflow nodes' }).getByText(text!, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run unavailable' })).toBeDisabled();
    if (state === 'error' || state === 'permission') await page.screenshot({ path: resolve(evidence, `light-${state}.png`), fullPage: true });
  }
  await page.getByRole('combobox', { name: 'Fixture state' }).selectOption('ready');
  await page.getByLabel('Search palette', { exact: true }).focus();
  await tabTo(page, 'Add Trim Text'); await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await tabTo(page, 'Node label'); await page.keyboard.press('Control+A'); await page.keyboard.type('Synthetic Electron node');
  await tabTo(page, 'Apply configuration'); await page.keyboard.press('Enter');
  await tabTo(page, 'Target node'); await page.keyboard.press('End'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  await tabTo(page, 'Remove node'); await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__node')).toHaveCount(3); await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.getByLabel('Search palette', { exact: true })).toBeFocused();
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(2));
  expect(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())).toBe(2);
  await page.getByLabel('Node label', { exact: true }).fill('Synthetic 200% Zoom');
  await page.getByRole('button', { name: 'Apply configuration' }).click();
  await page.getByRole('button', { name: 'Move node down' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Node moved down.' })).toBeVisible();
  const zoomMetrics = await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  expect(zoomMetrics.documentWidth).toBeLessThanOrEqual(zoomMetrics.viewportWidth);
  const nativeCapture = async (name: string) => {
    const png = await electron!.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.capturePage()).toPNG().toString('base64'));
    writeFileSync(resolve(evidence, name), Buffer.from(png, 'base64'));
  };
  await nativeCapture('forced-colors-reduced-motion-zoom200-inspector.png');
  await page.evaluate(() => window.scrollTo(0, 0));
  await nativeCapture('forced-colors-reduced-motion-zoom200-top.png');
  rmSync(resolve(evidence, 'forced-colors-reduced-motion-zoom200.png'), { force: true });
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(1));
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
  let native: unknown = { status: 'not-run' };
  let nativeStage = 'launch';
  let lastSnapshot: unknown;
  try {
    observer = spawn('/usr/bin/python3', [resolve(root, 'spikes/workflow-ui/tests/native-at.py'), String(runtime.pid), ...(orca?.pid ? [String(orca.pid)] : [])], { env: { ...inherited, HOME: profile, XDG_CONFIG_HOME: resolve(profile, 'config'), XDG_CACHE_HOME: resolve(profile, 'cache') } });
    const messages: unknown[] = [];
    let buffer = '';
    observer.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      if (buffer.length > 1_048_576) { observer?.kill(); return; }
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n');
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        try { messages.push(JSON.parse(line)); } catch { messages.push({ status: 'invalid-observer' }); }
      }
    });
    // Keep native diagnostics out of evidence; only structured synthetic allowlist results persist.
    observer.stderr.resume();
    observer.on('error', () => messages.push({ status: 'observer-unavailable' }));
    observer.on('exit', (code, signal) => messages.push({ status: 'observer-exited', code, signal }));
    const next = async () => {
      await expect.poll(() => messages.length, { timeout: 8000 }).toBeGreaterThan(0);
      return messages.shift() as { status: string; controls?: { label: string; focused: boolean }[]; focus_events?: string[] };
    };
    nativeStage = 'observer-readiness';
    lastSnapshot = await next();
    expect((lastSnapshot as { status: string }).status).toBe('ready');
    const snapshots = [];
    for (const label of ['Node label', 'Apply configuration', 'Move node down']) {
      nativeStage = `synthetic-focus-${label}`;
      await page.getByLabel('Search palette', { exact: true }).focus();
      if (label === 'Node label') await page.getByLabel(label, { exact: true }).focus();
      else await page.getByRole('button', { name: label, exact: true }).focus();
      let snapshot: Awaited<ReturnType<typeof next>> | undefined;
      await expect.poll(async () => {
        observer!.stdin.write('inspect\n'); snapshot = await next(); lastSnapshot = snapshot;
        return snapshot.status === 'observed' && snapshot.controls?.some(control => control.label === label && control.focused) === true && snapshot.focus_events?.includes(label) === true;
      }, { timeout: 10_000 }).toBe(true);
      snapshots.push(snapshot);
    }
    native = { status: 'native-exposure-and-focus-events-observed', snapshots,
      limitation: 'Actual native controls and focus events observed. Screen-reader presentation/audio are separate evidence.' };
  } catch {
    native = { status: 'native-probe-unavailable', stage: nativeStage, snapshot: lastSnapshot ?? null, limitation: 'Native probe did not establish the required synthetic focus/Orca semantics. S0-06-UI stays pending.' };
  }
  writeFileSync(resolve(evidence, 'native-at.json'), JSON.stringify(native, null, 2) + '\n');
  if (fullOrca) {
    const debugPath = resolve(profile, 'orca-debug.log');
    const presentation = [];
    expect(spawnSync('xdotool', ['windowfocus', '--sync', String(runtime.windowId)], { env: inherited }).status).toBe(0);
    for (const label of ['Node label', 'Apply configuration', 'Move node down']) {
      try {
        await page.getByLabel('Search palette', { exact: true }).focus();
        let offset = 0;
        try { offset = readFileSync(debugPath, 'utf8').length; } catch { /* unavailable startup */ }
        if (label === 'Node label') await page.getByLabel('Configuration text', { exact: true }).focus();
        else if (label === 'Apply configuration') await page.getByLabel('Configuration text', { exact: true }).focus();
        else await page.getByRole('button', { name: 'Remove connection start-trim', exact: true }).focus();
        // A native key on the isolated display reaches Orca's actual keyboard/event
        // path. No host display receives this fixed Tab/Shift+Tab operation.
        expect(spawnSync('xdotool', ['key', '--clearmodifiers', label === 'Node label' ? 'shift+Tab' : 'Tab'], { env: inherited }).status).toBe(0);
        await expect.poll(() => {
          try { return readFileSync(debugPath, 'utf8').slice(offset).split('\n').some(line => line.includes('SPEECH OUTPUT:') && line.includes(label)); } catch { return false; }
        }, { timeout: 10_000 }).toBe(true);
        presentation.push({ label, generatedAfterNativeFocus: true, input: 'native Xvfb Tab key' });
      } catch { presentation.push({ label, generatedAfterNativeFocus: false, deadlineMs: 10_000 }); }
    }
    let log = '';
    try { log = readFileSync(debugPath, 'utf8'); } catch { /* Explicit no-log outcome below. */ }
    const expected = ['Node label', 'Apply configuration', 'Move node down'];
    const utterances = expected.map(label => ({ label, generated: log.split('\n').some(line => line.includes('SPEECH OUTPUT:') && line.includes(label)) }));
    const speechDispatcherDeliveryObserved = log.includes('SPEECH DISPATCHER: Speaking');
    orcaPassed = !orcaExit && log.includes('ORCA: Startup complete') && speechDispatcherDeliveryObserved && presentation.every(result => result.generatedAfterNativeFocus);
    writeFileSync(resolve(evidence, 'orca.json'), JSON.stringify({ mode: 'Actual installed Orca process on disposable Xvfb/private buses; private Speech Dispatcher sd_dummy only, braille disabled', orcaVersion,
      process: orcaExit ?? { running: true }, startupCompleted: log.includes('ORCA: Startup complete'), speechDispatcherDeliveryObserved, utterances, presentation,
      status: orcaPassed ? 'passed-generated-presentation' : 'incomplete-presentation',
      lastOperation: !orcaPassed && log.trimEnd().split('\n').at(-1)?.includes('Looking for common ancestor') ? 'Orca ancestor-context generation did not finish within the presentation deadline' : null,
      limitation: 'Generated presentation/debug evidence only; no audible or tactile QA, no GNOME/KDE/Wayland integration claim.' }, null, 2) + '\n');
  }
  // Never infer full screen-reader proof from axe, native tree exposure or a generator.
  writeFileSync(resolve(evidence, 'runtime.json'), JSON.stringify({ scope: fullOrca ? 'Actual disposable Electron and Orca on isolated Xvfb; no compositor/desktop-matrix claim' : 'Actual disposable Electron window, authorized GNOME42.9 X11 host; no Debian release-matrix claim', runtime, rendererSandbox,
    kernel: release(), zoomMetrics, distro: readFileSync('/etc/os-release', 'utf8').split('\n').find(line => line.startsWith('PRETTY_NAME=')),
    assertions: ['sandboxed/no renderer Node', 'keyboard add/configure/connect/remove', 'dark/light axe WCAG A/AA', 'loading/empty/error/permission/cancelled/disabled fixtures on Electron', 'actual Electron zoom 200%', 'forced colors/reduced motion on Electron'],
    accessibility: 'Screen reader is not established by this command alone' }, null, 2) + '\n');
  const nativePassed = (native as { status: string }).status === 'native-exposure-and-focus-events-observed';
  console.log(`Electron UI checks passed; native AT ${nativePassed ? 'passed' : 'unavailable'}; ${fullOrca ? `Orca presentation ${orcaPassed ? 'passed' : 'incomplete'}` : 'Orca not run on host display'}. No audible QA claimed.`);
  if (!nativePassed || (fullOrca && !orcaPassed)) process.exitCode = 3;
} finally {
  observer?.kill('SIGKILL'); orca?.kill('SIGKILL'); discovery?.kill('SIGKILL');
  if (speech?.pid) {
    try { process.kill(-speech.pid, 'SIGKILL'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') { process.exitCode = 1; console.error('Synthetic speech process cleanup failed.'); }
    }
  }
  await electron?.close(); await server.close(); rmSync(profile, { recursive: true, force: true });
}
