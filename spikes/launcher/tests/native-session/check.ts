import { _electron, expect } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, release } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLauncher } from '../../build.ts';
import { APP_ID, APP_URL } from '../../src/contract.ts';
import type { LauncherState } from '../../src/contract.ts';
import { BACKENDS, contained, parseObservation, requireNativeTarget } from './protocol.ts';
import type { Backend, Observation } from './protocol.ts';

const backend = process.argv[2] as Backend;
const root = process.env.LINUXCAST_S001_MATRIX_ROOT ?? '';
if (!BACKENDS.includes(backend) || process.env.LINUXCAST_S001_PRIVATE_MATRIX !== '1'
  || !existsSync(root) || realpathSync(root) !== root || dirname(root) !== realpathSync(tmpdir())
  || !basename(root).startsWith('linuxcast-s001-matrix-') || lstatSync(root).uid !== process.getuid?.()
  || (lstatSync(root).mode & 0o077) !== 0 || process.env.HOME !== join(root, 'home')
  || process.env.XDG_RUNTIME_DIR !== join(root, 'runtime') || !process.env.DBUS_SESSION_BUS_ADDRESS?.startsWith(`unix:path=${root}/`)) throw new Error('PRIVATE_MATRIX_REQUIRED');
const wayland = backend.endsWith('wayland');
if (process.env.XDG_SESSION_TYPE !== (wayland ? 'wayland' : 'x11') || (wayland && (process.env.DISPLAY || process.env.WAYLAND_DISPLAY !== 'linuxcast-s001-wayland'))
  || (!wayland && !/\/xvfb-run\.[^/]+\/Xauthority$/.test(process.env.XAUTHORITY ?? ''))) throw new Error('PRIVATE_NATIVE_SESSION_REQUIRED');
const require = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url));
const executable = require('electron') as string;
const profile = join(root, 'linuxcast-launcher-native-session');
const env = { ...process.env, TMPDIR: root, LINUXCAST_LAUNCHER_PROFILE: profile, LINUXCAST_LAUNCHER_SHORTCUT: 'Ctrl+Alt+Shift+F12' } as Record<string, string>;
const observations: { phase: string; native: Observation }[] = [];
const report: Record<string, unknown> = { task: 'S0-01', backend, status: 'running', physicalDesktopMatrixEstablished: false,
  evidenceKind: 'actual-isolated-software-compositor-launcher', kernel: release(), hostDisplayClipboardInputOrSettingsUsed: false,
  launcherCompanionActivationOrPlacementUsed: false, observations };
let application: ElectronApplication | undefined;
let stage = 'build';
let request = 0;
let pid = 0;
const decoy = spawn('/usr/bin/python3', [fileURLToPath(new URL('./decoy.py', import.meta.url))], { env: process.env, stdio: 'ignore' });
decoy.on('error', () => { /* A missing fixed decoy cannot pass native observations. */ });
const observe = async (operation: 'observe' | 'activate-decoy' = 'observe'): Promise<Observation> => {
  const serial = ++request;
  if (!Number.isSafeInteger(pid) || !decoy.pid) throw new Error('OWN_PIDS_REQUIRED');
  writeFileSync(join(root, 'context-next.json'), JSON.stringify({ request: serial, pid, decoyPid: decoy.pid, operation }), { mode: 0o600 });
  renameSync(join(root, 'context-next.json'), join(root, 'context.json'));
  let observation: Observation | undefined;
  await expect.poll(() => {
    const path = join(root, 'observation.json');
    if (!existsSync(path) || lstatSync(path).size > 8192) return false;
    try {
      const value = JSON.parse(readFileSync(path, 'utf8')) as { request?: number };
      if (value.request !== serial) return false;
      observation = parseObservation(value, serial); return true;
    } catch { return false; }
  }, { timeout: 8000 }).toBe(true);
  return observation!;
};
const observed = async (phase: string, predicate: (observation: Observation) => boolean) => {
  let value: Observation | undefined;
  await expect.poll(async () => { value = await observe(); return predicate(value); }, { timeout: 12_000 }).toBe(true);
  observations.push({ phase, native: value! }); return value!;
};
const challenge = async () => {
  const native = await observed('decoy-native-ready', value => value.decoy.count === 1 && value.decoy.identityMatches);
  requireNativeTarget(native.decoy, backend);
  const setup = await observe('activate-decoy');
  expect(setup.decoyActivationIssued).toBe(true);
  report.decoyActivationUsedForChallengeSetup = true;
  await observed('decoy-focused-before-ordinary-show', value => value.decoy.focused && !value.launcher.focused);
};
const cli = async (main: string, command: '--show' | '--toggle' | '--quit') => {
  const child = spawn(executable, [`--ozone-platform=${wayland ? 'wayland' : 'x11'}`, main, command], { env, stdio: 'ignore' });
  const code = await new Promise<number | null>((resolve, reject) => {
    const deadline = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('SINGLETON_CLI_DEADLINE')); }, 15_000);
    child.once('error', error => { clearTimeout(deadline); reject(error); });
    child.once('close', code => { clearTimeout(deadline); resolve(code); });
  });
  expect(code).toBe(0);
};
const state = async (): Promise<LauncherState> => {
  const page = await application!.firstWindow();
  const reply = await page.evaluate(() => window.linuxcast.getState());
  expect(reply.ok).toBe(true);
  if (!reply.ok) throw new Error('STATE_REQUIRED');
  expect(reply.value.identity).toBe(APP_ID); expect(reply.value.session).toBe(wayland ? 'wayland' : 'x11');
  return reply.value;
};
const capture = async (name: string) => {
  const png = await application!.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'));
  writeFileSync(join(root, name), Buffer.from(png, 'base64'));
};
const waitForExit = (app: ElectronApplication) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('EXPLICIT_QUIT_DEADLINE')), 15_000);
  app.once('close', () => { clearTimeout(timer); resolve(); });
});

try {
  const main = await buildLauncher();
  const launch = async () => {
    application = await _electron.launch({ executablePath: executable, chromiumSandbox: true,
      args: [`--ozone-platform=${wayland ? 'wayland' : 'x11'}`, main], env, timeout: 60_000 });
    const page = await application.firstWindow();
    await page.waitForURL(APP_URL, { timeout: 60_000 });
    await expect(page.getByRole('textbox', { name: 'Search commands', exact: true })).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    const runtime = await application.evaluate(({ app, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      const preferences = (window.webContents as unknown as { getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean; webSecurity: boolean } }).getLastWebPreferences();
      return { pid: process.pid, electron: process.versions.electron, chrome: process.versions.chrome,
        ozone: app.commandLine.getSwitchValue('ozone-platform'), noSandbox: app.commandLine.hasSwitch('no-sandbox'),
        sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration, webSecurity: preferences.webSecurity };
    });
    const renderer = await page.evaluate(() => ({ runtime: window.linuxcast.runtime,
      process: typeof (window as unknown as Record<string, unknown>).process, require: typeof (window as unknown as Record<string, unknown>).require }));
    expect(runtime).toMatchObject({ electron: '45.0.0', ozone: wayland ? 'wayland' : 'x11', noSandbox: false,
      sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true });
    expect(renderer).toEqual({ runtime: { sandboxed: true, contextIsolated: true }, process: 'undefined', require: 'undefined' });
    pid = runtime.pid;
    // Public runtime fields only; no PID/profile/environment or broad preferences.
    report.runtime = { electron: runtime.electron, chrome: runtime.chrome, ozone: runtime.ozone, noSandbox: runtime.noSandbox,
      sandbox: runtime.sandbox, contextIsolation: runtime.contextIsolation, nodeIntegration: runtime.nodeIntegration, webSecurity: runtime.webSecurity, renderer };
    return page;
  };
  stage = 'first-launch';
  let page = await launch();
  stage = 'native-initial-identity';
  const initial = await observed('initial-native-launch', value => value.launcher.count === 1);
  requireNativeTarget(initial.launcher, backend);
  report.initialPlacementInsideWorkArea = contained(initial.launcher);
  if (!wayland) expect(contained(initial.launcher)).toBe(true);
  await page.evaluate(() => window.linuxcast.setAppearance('dark'));
  await capture('dark-launcher.png');
  stage = 'resident-close';
  const original = application!.process();
  await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  await expect.poll(async () => (await state()).visible).toBe(false);
  await observed('after-close-native-hidden', value => value.launcher.count === 0 || value.launcher.hidden);
  expect(original.exitCode).toBeNull(); expect(process.kill(pid, 0)).toBe(true);
  report.closeRetainedResidentProcess = true;
  stage = 'decoy-challenge'; await challenge();
  stage = 'ordinary-cli-show'; await cli(main, '--show');
  await expect.poll(async () => (await state()).visible).toBe(true);
  expect(application!.process().pid).toBe(pid);
  const shown = await observed('ordinary-singleton-cli-show', value => value.launcher.count === 1);
  requireNativeTarget(shown.launcher, backend);
  report.singletonShowRetainedPid = true;
  report.ordinaryShowNativeFocused = shown.launcher.focused;
  const current = await state();
  if (wayland) {
    for (const id of ['launcher.activate', 'launcher.position']) expect(current.capabilities.some(capability => capability.id === id && capability.state === 'component-required' && !!capability.remediation)).toBe(true);
    report.activationOutcome = shown.launcher.focused ? 'normal-show-focused-component-placement-still-required' : 'actionable-component-required';
    report.componentRequirementVisible = true;
    expect(current.shortcut.effective).toBeNull();
    const portal = spawnSync('gdbus', ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.NameHasOwner', 'org.freedesktop.portal.Desktop'], { env, encoding: 'utf8', timeout: 5000 });
    report.shortcut = { state: current.shortcut.state, effectiveBindingExposed: false, portalServicePresent: portal.status === 0 && portal.stdout.trim() === '(true,)', consentOrEffectiveBindingProven: false };
    await cli(main, '--toggle'); await expect.poll(async () => (await state()).visible).toBe(false);
    await observed('wayland-singleton-toggle-hidden', value => value.launcher.count === 0 || value.launcher.hidden);
    await cli(main, '--show'); await expect.poll(async () => (await state()).visible).toBe(true);
    const reopened = await observed('wayland-singleton-reopened', value => value.launcher.count === 1);
    requireNativeTarget(reopened.launcher, backend);
    expect(application!.process().pid).toBe(pid);
  } else {
    // Give the WM bounded time for ordinary show activation, never force focus.
    await observed('ordinary-show-native-focus', value => value.launcher.focused);
    expect(current.shortcut.state).toBe('available'); expect(current.shortcut.effective).toBe('Ctrl+Alt+Shift+F12');
    stage = 'actual-x11-global-shortcut';
    await cli(main, '--toggle'); await expect.poll(async () => (await state()).visible).toBe(false);
    await challenge();
    expect(spawnSync('xdotool', ['key', '--clearmodifiers', 'ctrl+alt+shift+F12'], { env, timeout: 5000 }).status).toBe(0);
    await observed('actual-x11-shortcut-native-focus', value => value.launcher.count === 1 && value.launcher.focused);
    report.shortcut = { state: 'available', nativeXTestActivationObserved: true, effective: 'Ctrl+Alt+Shift+F12' };
    report.activationOutcome = 'normal-show-and-shortcut-native-focus-observed';
  }
  stage = 'light-component-state';
  await page.evaluate(() => window.linuxcast.setAppearance('light'));
  await page.getByRole('button', { name: 'Launcher capabilities', exact: true }).click();
  if (wayland) {
    await expect(page.getByText('component required', { exact: true })).toHaveCount(2);
    for (const capability of current.capabilities) await expect(page.getByText(capability.remediation, { exact: true })).toBeVisible();
  }
  await capture('light-capabilities.png');
  await page.getByRole('button', { name: 'Back to commands', exact: true }).click();
  stage = 'explicit-ui-quit';
  const firstExit = waitForExit(application!);
  await Promise.all([page.getByRole('button', { name: 'Quit Linuxcast', exact: true }).click(), firstExit]);
  expect(original.exitCode).toBe(0);
  await observed('after-ui-quit-native-window-absent', value => value.launcher.count === 0);
  report.explicitUiQuitExited = true;
  application = undefined;
  stage = 'fresh-launch-hidden-cli-quit'; page = await launch();
  const second = application!.process();
  await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  await expect.poll(async () => (await state()).visible).toBe(false);
  await observed('fresh-resident-native-hidden', value => value.launcher.count === 0 || value.launcher.hidden);
  const secondExit = waitForExit(application!);
  await Promise.all([cli(main, '--quit'), secondExit]); expect(second.exitCode).toBe(0);
  await observed('after-hidden-cli-quit-native-window-absent', value => value.launcher.count === 0);
  application = undefined; report.hiddenCliQuitExited = true;
  stage = 'complete'; report.status = 'passed-bounded-native-probe';
} catch { report.status = 'incomplete'; process.exitCode = 3; }
finally {
  decoy.kill('SIGTERM');
  if (application?.process().exitCode === null) await application.close().catch(() => { application?.process().kill('SIGKILL'); report.status = 'cleanup-incomplete'; process.exitCode = 3; });
  // The outer process-local supervisor independently reaps every descendant.
  rmSync(profile, { recursive: true, force: true });
  report.stage = stage;
  writeFileSync(join(root, 'result.json'), JSON.stringify(report), { mode: 0o600 });
}
