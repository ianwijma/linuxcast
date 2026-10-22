import { _electron, expect } from '@playwright/test';
import type { ElectronApplication, Locator } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, release } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLauncher, spikeRoot } from '../../build.ts';
import { APP_ID, APP_URL } from '../../src/contract.ts';

// Never attach the screen reader to a normal desktop/session/accessibility bus.
const atAddress = process.env.AT_SPI_BUS_ADDRESS;
if (process.env.LINUXCAST_LAUNCHER_PRIVATE_AT !== '1' || !process.env.DBUS_SESSION_BUS_ADDRESS
  || !/\/xvfb-run\.[^/]+\/Xauthority$/.test(process.env.XAUTHORITY ?? '')
  || !atAddress || !process.env.XDG_RUNTIME_DIR?.includes('linuxcast-s001-at-bus-')
  || !atAddress.startsWith(`unix:path=${process.env.XDG_RUNTIME_DIR}/`)) throw new Error('Private Xvfb/session/AT entrypoint required');

type NativeSnapshot = {
  status: string;
  controls?: { label: string; role: string; kind: string; focused: boolean }[];
  focus_events?: string[];
  event_sequence?: number;
};
const evidence = join(spikeRoot, 'evidence/at/results');
mkdirSync(evidence, { recursive: true });
for (const name of ['report.json', 'runtime.json', 'native-at.json', 'orca.json', 'dark-search.png', 'dark-actions.png', 'light-shortcut.png']) rmSync(join(evidence, name), { force: true });
const profile = mkdtempSync(join(realpathSync(tmpdir()), 'linuxcast-launcher-at-'));
const inherited = Object.fromEntries(['PATH', 'DISPLAY', 'XAUTHORITY', 'TMPDIR', 'DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'GSETTINGS_BACKEND', 'LANG', 'LC_ALL'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
const env = { ...inherited, HOME: profile, XDG_CONFIG_HOME: join(profile, 'config'), XDG_CACHE_HOME: join(profile, 'cache') };
let application: ElectronApplication | undefined;
let discovery: ChildProcessWithoutNullStreams | undefined;
let observer: ChildProcessWithoutNullStreams | undefined;
let speech: ChildProcessWithoutNullStreams | undefined;
let orca: ChildProcessWithoutNullStreams | undefined;
let orcaExited = false;
let speechFailed = false;
let stage = 'build';
const snapshots: { label: string; snapshot: NativeSnapshot }[] = [];
const presentations: { label: string; generatedAfterNativeFocus: boolean; deliveredToSpeechDispatcher: boolean }[] = [];
const debugPath = join(profile, 'orca-debug.log');
const log = () => { try { return readFileSync(debugPath, 'utf8'); } catch { return ''; } };
const hasLabel = (text: string, marker: string, label: string) => text.split('\n').some(line => line.includes(marker) && line.includes(label));
const startupCompleted = () => log().includes('ORCA: Startup complete') || log().includes('ORCA: Starting Atspi main event loop');
const orcaVersion = /[0-9]+\.[0-9]+(?:\.[0-9]+)?/.exec(spawnSync('/usr/bin/orca', ['--version'], { env, encoding: 'utf8', timeout: 5000 }).stdout ?? '')?.[0] ?? 'unavailable';

try {
  const main = await buildLauncher();
  stage = 'private-discovery';
  discovery = spawn('/usr/bin/python3', [fileURLToPath(new URL('./private-a11y.py', import.meta.url))], { env });
  discovery.stderr.resume();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Private discovery deadline')), 5000);
    discovery!.once('error', reject);
    discovery!.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  });
  stage = 'electron-launch';
  const require = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url));
  application = await _electron.launch({ executablePath: require('electron') as string, chromiumSandbox: true,
    args: ['--force-renderer-accessibility=complete', main], timeout: 60_000,
    env: { ...env, XDG_SESSION_TYPE: 'x11', LINUXCAST_LAUNCHER_PROFILE: profile, LINUXCAST_LAUNCHER_SHORTCUT: 'Ctrl+Alt+Shift+F12' } });
  const page = await application.firstWindow();
  await page.waitForURL(APP_URL, { timeout: 60_000 });
  await expect(page.getByRole('textbox', { name: 'Search commands', exact: true })).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  const runtime = await application.evaluate(({ app, BrowserWindow }) => {
    app.setAccessibilitySupportEnabled(true);
    const window = BrowserWindow.getAllWindows()[0]!;
    // Electron45 exposes this diagnostic method but omits it from public types.
    const prefs = (window.webContents as unknown as { getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean; webSecurity: boolean } }).getLastWebPreferences();
    return { pid: process.pid, electron: process.versions.electron, chrome: process.versions.chrome, embeddedNode: process.versions.node,
      windowId: window.getNativeWindowHandle().readUInt32LE(), accessible: app.isAccessibilitySupportEnabled(),
      noSandboxArgument: process.argv.includes('--no-sandbox') || app.commandLine.hasSwitch('no-sandbox'),
      sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration, webSecurity: prefs.webSecurity };
  });
  const renderer = await page.evaluate(() => ({ runtime: window.linuxcast.runtime,
    process: typeof (window as unknown as Record<string, unknown>).process, require: typeof (window as unknown as Record<string, unknown>).require }));
  expect(runtime).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, noSandboxArgument: false, accessible: true });
  expect(renderer).toEqual({ runtime: { sandboxed: true, contextIsolated: true }, process: 'undefined', require: 'undefined' });
  const state = await page.evaluate(() => window.linuxcast.getState());
  expect(state.ok && state.value.identity).toBe(APP_ID);
  // Retain selected diagnostic booleans, never profile paths or broad preferences.
  writeFileSync(join(evidence, 'runtime.json'), JSON.stringify({ scope: 'Actual launcher Electron on disposable Xvfb, no compositor/desktop matrix claim',
    electron: runtime.electron, chrome: runtime.chrome, embeddedNode: runtime.embeddedNode, harnessNode: process.versions.node, kernel: release(), orcaVersion,
    sandbox: runtime.sandbox, contextIsolation: runtime.contextIsolation, nodeIntegration: runtime.nodeIntegration, webSecurity: runtime.webSecurity,
    noSandboxArgument: runtime.noSandboxArgument, renderer, accessible: runtime.accessible,
    distro: readFileSync('/etc/os-release', 'utf8').split('\n').find(line => line.startsWith('PRETTY_NAME=')),
    checkerSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex') }, null, 2) + '\n');

  stage = 'private-speech';
  const configuration = join(profile, 'speechd'); mkdirSync(configuration);
  writeFileSync(join(configuration, 'speechd.conf'), 'AddModule "dummy" "sd_dummy" ""\nDefaultModule dummy\nDisableAutoSpawn\nLogLevel 0\nAudioOutputMethod "alsa"\nAudioALSADevice "null"\n');
  const socket = join(profile, 'speechd.sock');
  speech = spawn('/usr/bin/speech-dispatcher', ['--run-single', '--config-dir', configuration, '--communication-method', 'unix_socket', '--socket-path', socket,
    '--pid-file', join(profile, 'speechd.pid'), '--timeout', '60', '--module-dir', '/usr/lib/speech-dispatcher-modules', '--log-dir', configuration], { detached: true, env });
  speech.on('error', () => { speechFailed = true; });
  speech.stdout.resume(); speech.stderr.resume();
  await expect.poll(() => !speechFailed && existsSync(socket), { timeout: 5000 }).toBe(true);
  stage = 'orca-startup';
  orca = spawn('/usr/bin/orca', ['--user-prefs', join(profile, 'orca'), '--enable', 'speech', '--disable', 'braille', '--debug-file', debugPath], { env: { ...env, SPEECHD_ADDRESS: `unix_socket:${socket}` } });
  orca.stdout.resume(); orca.stderr.resume(); orca.on('exit', () => { orcaExited = true; }); orca.on('error', () => { orcaExited = true; });
  await expect.poll(() => !orcaExited && startupCompleted(), { timeout: 20_000 }).toBe(true);

  stage = 'native-observer';
  observer = spawn('/usr/bin/python3', [fileURLToPath(new URL('./native-at.py', import.meta.url)), String(runtime.pid), String(orca.pid)], { env });
  observer.stderr.resume();
  const messages: NativeSnapshot[] = [];
  let buffer = '';
  let waiting: { resolve: (value: NativeSnapshot) => void; reject: (error: Error) => void } | undefined;
  let observerError: Error | undefined;
  const failObserver = () => { observerError = new Error('Private native observer failed'); waiting?.reject(observerError); waiting = undefined; };
  observer.on('error', failObserver); observer.on('exit', failObserver);
  observer.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    if (buffer.length > 64 * 1024) { failObserver(); return; }
    while (buffer.includes('\n')) {
      const split = buffer.indexOf('\n'); const line = buffer.slice(0, split); buffer = buffer.slice(split + 1);
      try {
        const value = JSON.parse(line) as NativeSnapshot;
        if (waiting) { waiting.resolve(value); waiting = undefined; }
        else if (messages.length < 8) messages.push(value);
        else failObserver();
      } catch { failObserver(); }
    }
  });
  const receive = async () => {
    if (observerError) throw observerError;
    if (messages.length) return messages.shift()!;
    return await new Promise<NativeSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => { waiting = undefined; reject(new Error('Native observer deadline')); }, 8000);
      waiting = { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } };
    });
  };
  expect((await receive()).status).toBe('ready');
  const inspect = async () => { observer!.stdin.write('inspect\n'); const value = await receive(); expect(value.status).toBe('observed'); return value; };
  const nativeKey = (key: string) => expect(spawnSync('xdotool', ['key', '--clearmodifiers', key], { env, timeout: 5000 }).status).toBe(0);
  expect(spawnSync('xdotool', ['windowfocus', '--sync', String(runtime.windowId)], { env, timeout: 5000 }).status).toBe(0);
  const settleDismissAnchor = async () => {
    const offset = log().length;
    await page.getByRole('button', { name: 'Dismiss launcher', exact: true }).focus();
    // Process a distinct anchor first so a delayed initial search utterance
    // cannot satisfy the subsequent per-focus presentation assertion.
    await expect.poll(() => hasLabel(log().slice(offset), 'SPEECH OUTPUT:', 'Dismiss launcher'), { timeout: 10_000 }).toBe(true);
  };
  const focusCheck = async (label: string, role: string, target: Locator, key: string, screenshot?: string) => {
    stage = `focus:${label}`;
    const before = await inspect();
    const offset = log().length;
    nativeKey(key);
    await expect(target).toBeFocused({ timeout: 10_000 });
    let snapshot: NativeSnapshot | undefined;
    await expect.poll(async () => {
      snapshot = await inspect();
      return (snapshot.event_sequence ?? 0) > (before.event_sequence ?? 0)
        && snapshot.focus_events?.at(-1) === label
        && snapshot.controls?.some(control => control.label === label && control.kind === role && control.focused);
    }, { timeout: 10_000 }).toBe(true);
    snapshots.push({ label, snapshot: snapshot! });
    await expect.poll(() => !orcaExited && hasLabel(log().slice(offset), 'SPEECH OUTPUT:', label)
      && hasLabel(log().slice(offset), 'SPEECH DISPATCHER: Speaking', label), { timeout: 10_000 }).toBe(true);
    presentations.push({ label, generatedAfterNativeFocus: true, deliveredToSpeechDispatcher: true });
    if (screenshot) {
      const png = await application!.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'));
      writeFileSync(join(evidence, screenshot), Buffer.from(png, 'base64'));
    }
  };
  await page.evaluate(() => window.linuxcast.setAppearance('dark'));
  await settleDismissAnchor();
  await focusCheck('Search commands', 'entry', page.getByRole('textbox', { name: 'Search commands', exact: true }), 'shift+Tab', 'dark-search.png');
  await focusCheck('Hide launcher', 'button', page.getByRole('dialog', { name: 'Launcher actions' }).getByRole('button', { name: 'Hide launcher', exact: true }), 'ctrl+k', 'dark-actions.png');
  await focusCheck('Actions Ctrl K', 'button', page.getByRole('button', { name: 'Actions Ctrl K', exact: true }), 'ctrl+k');
  await page.getByRole('button', { name: 'Change session shortcut', exact: true }).focus();
  nativeKey('Return');
  await expect(page.getByRole('heading', { name: 'Session shortcut', exact: true })).toBeVisible();
  await page.evaluate(() => window.linuxcast.setAppearance('light'));
  await settleDismissAnchor();
  await focusCheck('Record shortcut', 'button', page.getByRole('button', { name: 'Record shortcut', exact: true }), 'Tab', 'light-shortcut.png');
  await focusCheck('Cancel shortcut change', 'button', page.getByRole('button', { name: 'Cancel shortcut change', exact: true }), 'Tab');
  stage = 'complete';
  expect(presentations).toHaveLength(5);
  expect(orcaExited).toBe(false);
  writeFileSync(join(evidence, 'native-at.json'), JSON.stringify({ status: 'passed-native-focus', snapshots }, null, 2) + '\n');
  writeFileSync(join(evidence, 'orca.json'), JSON.stringify({ status: 'passed-generated-presentation', orcaVersion, startupCompleted: startupCompleted(),
    presentations, limitation: 'Actual Orca/private Speech Dispatcher generated presentation only; no audible/tactile, GNOME/KDE/Wayland or desktop-matrix proof.' }, null, 2) + '\n');
  writeFileSync(join(evidence, 'report.json'), JSON.stringify({ status: 'passed', stage, nativeFocus: 5, generatedPresentation: 5,
    boundary: 'Actual launcher on private Xvfb/session/AT buses; synthetic app-only observation; actual renderer sandbox; no host display hooks/settings or audible QA.' }, null, 2) + '\n');
  console.log('Launcher actual Electron/native AT/Orca presentation passed5/5. No audible or compositor QA claimed.');
} catch {
  // Operational stages/allowlisted booleans only. Never persist raw Orca debug,
  // unfiltered accessible text, application screenshots or exception payloads.
  writeFileSync(join(evidence, 'native-at.json'), JSON.stringify({ status: 'incomplete', stage, snapshots }, null, 2) + '\n');
  writeFileSync(join(evidence, 'orca.json'), JSON.stringify({ status: 'incomplete', stage, orcaVersion, startupCompleted: startupCompleted(), presentations }, null, 2) + '\n');
  writeFileSync(join(evidence, 'report.json'), JSON.stringify({ status: 'incomplete', stage, limitation: 'Required assertions did not all pass. No acceptance success or audible/compositor QA inferred.' }, null, 2) + '\n');
  console.log(`Launcher AT incomplete at ${stage}; no acceptance success inferred.`);
  process.exitCode = 3;
} finally {
  let cleanupOk = true;
  const terminate = async (child: ChildProcessWithoutNullStreams | undefined) => {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { cleanupOk = false; resolve(); }, 2000);
      child.once('close', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGKILL');
    });
  };
  await Promise.all([terminate(observer), terminate(orca), terminate(discovery)]);
  if (speech?.pid) {
    try { process.kill(-speech.pid, 'SIGKILL'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') cleanupOk = false; }
  }
  await terminate(speech);
  try { await application?.close(); }
  catch { application?.process().kill('SIGKILL'); cleanupOk = false; }
  try { rmSync(profile, { recursive: true, force: true }); } catch { cleanupOk = false; }
  if (!cleanupOk) {
    process.exitCode = 1;
    writeFileSync(join(evidence, 'report.json'), JSON.stringify({ status: 'cleanup-failed', stage, limitation: 'No complete acceptance success; private process/profile cleanup was not fully verified.' }, null, 2) + '\n');
    console.error('Private AT cleanup failed; no complete acceptance success.');
  }
}
