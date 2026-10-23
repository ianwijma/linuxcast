import { _electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { release, endianness } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLauncher } from '../../build.ts';
import { APP_ID, APP_URL } from '../../src/contract.ts';
import type { LauncherState } from '../../src/contract.ts';
import { BACKENDS, contained, ConsumerTrace, NativeTrace, requireNativeTarget, requireOwnedLifecycleTarget, ownedGeometryCapabilities, parseProbeMode, LIFECYCLE_SKIPPED, OWNED_X11_KIND, OWNED_X11_FAILURES, parseOwnedX11Handle, parseObservation } from './protocol.ts';
import type { Backend, NativePhase, Observation, OwnedX11Failure } from './protocol.ts';

const backend = process.argv[2] as Backend;
const probeMode = parseProbeMode(process.argv[3], backend);
if (process.argv.length > 4) throw new Error('PROBE_MODE_REQUIRED');
const root = process.env.LINUXCAST_S001_MATRIX_ROOT ?? '';
// One reviewed guard covers Python and direct Node entry. This executes before
// build, Electron/GTK launch, D-Bus calls, settings or compositor operations.
if (!BACKENDS.includes(backend)) throw new Error('PRIVATE_MATRIX_REQUIRED');
const contextKeys = new Set(['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'GSETTINGS_BACKEND',
  'XDG_DATA_DIRS', 'XDG_CONFIG_DIRS', 'LINUXCAST_S001_PRIVATE_MATRIX', 'LINUXCAST_S001_MATRIX_ROOT', 'LINUXCAST_S001_NODE', 'LINUXCAST_S001_BACKEND',
  'DBUS_SESSION_BUS_ADDRESS', 'DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'GDK_BACKEND', 'LIBGL_ALWAYS_SOFTWARE', 'QT_QUICK_BACKEND', 'PWD']);
// Unknown names are enough to reject the environment; their values may be
// credentials and are never copied to the validator or a diagnostic artifact.
const candidateEnv = Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key, contextKeys.has(key) ? value : '']));
const guard = spawnSync('/usr/bin/python3', ['-I', fileURLToPath(new URL('./private.py', import.meta.url)), '--driver', backend],
  { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }, input: JSON.stringify(candidateEnv), encoding: 'utf8', timeout: 5000, maxBuffer: 65536 });
if (guard.status !== 0 || guard.stdout.trim() !== 'PRIVATE_MATRIX_VERIFIED') throw new Error('PRIVATE_MATRIX_REQUIRED');
const wayland = backend.endsWith('wayland');
const ownedRoute = backend === 'kwin-x11' && probeMode === 'lifecycle-only';
const require = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url));
const executable = require('electron') as string;
const profile = join(root, 'linuxcast-launcher-native-session');
const env = { ...process.env, TMPDIR: root, LINUXCAST_LAUNCHER_PROFILE: profile, LINUXCAST_LAUNCHER_SHORTCUT: 'Ctrl+Alt+Shift+F12' } as Record<string, string>;
const observations: { phase: string; native: Observation }[] = [];
const report: Record<string, unknown> = { task: 'S0-01', backend, status: 'running', physicalDesktopMatrixEstablished: false,
  probeMode, ...(probeMode === 'lifecycle-only' ? { skippedChecks: [...LIFECYCLE_SKIPPED], diagnosticOutcome: 'failed' } : {}),
  evidenceKind: 'actual-isolated-software-compositor-launcher', kernel: release(), hostDisplayClipboardInputOrSettingsUsed: false,
  launcherCompanionActivationOrPlacementUsed: false, observations };
if (ownedRoute) report.ownedTargetObserver = { ...OWNED_X11_KIND, bindingObserved: false };
let application: ElectronApplication | undefined;
let applicationChild: ReturnType<ElectronApplication['process']> | undefined;
let stage = 'build';
let request = 0;
let pid = 0;
const nativeTrace = new NativeTrace();
const consumerTrace = new ConsumerTrace(() => process.hrtime.bigint());
class NativeHookFailed extends Error { constructor() { super('NATIVE_HOOK_FAILURE'); } }
const decoy = ownedRoute ? undefined : spawn('/usr/bin/python3', [fileURLToPath(new URL('./decoy.py', import.meta.url))], { env: process.env, stdio: 'ignore' });
decoy?.on('error', () => { /* A missing fixed decoy cannot pass native observations. */ });
// This private route is never selected by full/GNOME/Wayland probes.
class OwnedX11Failed extends Error {
  readonly kind: OwnedX11Failure;
  constructor(kind: OwnedX11Failure) { super('OWNED_X11_FAILED'); this.kind = kind; }
}
const ownedBudget = async <T>(operation: () => Promise<T>, deadline: number): Promise<T> => {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new OwnedX11Failed('deadline');
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new OwnedX11Failed('deadline')), remaining); })]); }
  finally { clearTimeout(timer!); }
};
const captureOwnedWindow = async (app: ElectronApplication, page: Page, deadline: number) => {
  const child = app.process();
  if (!child.pid || child.exitCode !== null || child.signalCode !== null || page.url() !== APP_URL) throw new OwnedX11Failed('binding');
  const browserWindow = await ownedBudget(() => app.browserWindow(page), deadline);
  try {
    const native = await ownedBudget(() => browserWindow.evaluate(win => {
      if (win.isDestroyed() || win.webContents.isDestroyed()) throw new Error('OWN_WINDOW_REQUIRED');
      const preferences = (win.webContents as unknown as { getLastWebPreferences(): { sandbox: boolean; contextIsolation: boolean; nodeIntegration: boolean; webSecurity: boolean } }).getLastWebPreferences();
      return { handle: win.getNativeWindowHandle().toString('hex'), url: win.webContents.getURL(), sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration, webSecurity: preferences.webSecurity };
    }), deadline);
    const main = await ownedBudget(() => app.evaluate(({ app }) => ({ pid: process.pid, electron: process.versions.electron, chrome: process.versions.chrome,
      platform: process.platform, arch: process.arch, ozone: app.commandLine.getSwitchValue('ozone-platform'), noSandbox: app.commandLine.hasSwitch('no-sandbox') })), deadline);
    const renderer = await ownedBudget(() => page.evaluate(async () => {
      const state = await window.linuxcast.getState();
      if (!state.ok || state.value.identity !== 'io.github.ianwijma.Linuxcast' || state.value.session !== 'x11') throw new Error('OWN_PAGE_STATE_REQUIRED');
      return { runtime: window.linuxcast.runtime, process: typeof (window as unknown as Record<string, unknown>).process,
        require: typeof (window as unknown as Record<string, unknown>).require };
    }), deadline);
    expect(main).toMatchObject({ pid: child.pid, electron: '45.0.0', ozone: 'x11', noSandbox: false });
    expect(native).toMatchObject({ url: APP_URL, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true });
    expect(renderer).toEqual({ runtime: { sandboxed: true, contextIsolated: true }, process: 'undefined', require: 'undefined' });
    if (child.exitCode !== null || child.signalCode !== null) throw new OwnedX11Failed('lifetime');
    const xid = parseOwnedX11Handle(native.handle, main.platform, main.arch, endianness());
    return { pid: child.pid, xid, handle: native.handle, runtime: { electron: main.electron, chrome: main.chrome, ozone: main.ozone,
      noSandbox: main.noSandbox, sandbox: native.sandbox, contextIsolation: native.contextIsolation, nodeIntegration: native.nodeIntegration, webSecurity: native.webSecurity, renderer } };
  } finally { void browserWindow.dispose().catch(() => {}); }
};
class OwnedChannel {
  private child = spawn('/usr/bin/python3', [fileURLToPath(new URL('./owned-x11.py', import.meta.url)), '--kwin-x11-lifecycle-only'], { env: process.env, stdio: ['pipe', 'pipe', 'ignore'] });
  private buffer = Buffer.alloc(0);
  private pending: { resolve: (value: unknown) => void; reject: (error: OwnedX11Failed) => void } | undefined;
  private terminal: OwnedX11Failed | undefined;
  private exited: Promise<number | null>;
  constructor() {
    this.exited = new Promise(resolve => this.child.once('close', code => { resolve(code); this.fail('lifetime'); }));
    this.child.once('error', () => this.fail('native-query'));
    this.child.stdin!.on('error', () => this.fail('protocol'));
    this.child.stdout!.on('error', () => this.fail('native-query'));
    this.child.stdout!.on('data', (part: Buffer) => {
      if (this.terminal) return;
      this.buffer = Buffer.concat([this.buffer, part]);
      if (this.buffer.length > 8192) { this.fail('overflow'); return; }
      const newline = this.buffer.indexOf(10);
      if (newline < 0) return;
      if (!this.pending || newline !== this.buffer.length - 1) { this.fail('protocol'); return; }
      const pending = this.pending; this.pending = undefined;
      try {
        const value = JSON.parse(this.buffer.subarray(0, newline).toString('utf8')) as Record<string, unknown>; this.buffer = Buffer.alloc(0);
        if (value && typeof value === 'object' && Object.hasOwn(value, 'failure')) {
          if (Object.keys(value).length !== 1 || !OWNED_X11_FAILURES.includes(value.failure as OwnedX11Failure)) throw new Error('OWNED_FAILURE_SCHEMA');
          const error = new OwnedX11Failed(value.failure as OwnedX11Failure); pending.reject(error); this.fail(error.kind);
        } else pending.resolve(value);
      } catch { pending.reject(new OwnedX11Failed('protocol')); this.fail('protocol'); }
    });
  }
  private fail(kind: OwnedX11Failure) { this.terminal ??= new OwnedX11Failed(kind); this.pending?.reject(this.terminal); this.pending = undefined; this.abort(); }
  abort() { if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL'); }
  async send(value: unknown, deadline: number) {
    if (this.terminal) throw this.terminal;
    if (this.pending) throw new OwnedX11Failed('protocol');
    const encoded = JSON.stringify(value) + '\n';
    if (Buffer.byteLength(encoded) > 4096) throw new OwnedX11Failed('overflow');
    try {
      return await ownedBudget(() => new Promise<unknown>((resolve, reject) => {
        this.pending = { resolve, reject }; this.child.stdin!.write(encoded, error => { if (error) this.fail('protocol'); });
      }), deadline);
    } catch (error) { this.fail(error instanceof OwnedX11Failed ? error.kind : 'protocol'); throw error; }
  }
  async close(generation: number, nonce: string, deadline: number) {
    expect(await this.send({ command: 'close', generation, nonce }, deadline)).toEqual({ closed: true });
    expect(await ownedBudget(() => this.exited, deadline)).toBe(0);
  }
}
let ownedPage: Page | undefined, ownedGeneration = 0;
let ownedBinding: { pid: number; xid: number; handle: string; generation: number; nonce: string; app: ElectronApplication; child: ReturnType<ElectronApplication['process']> } | undefined;
let ownedChannel: OwnedChannel | undefined;
const observeOwned = async (serial: number, phase: NativePhase): Promise<Observation> => {
  const deadline = performance.now() + 8000;
  nativeTrace.begin(phase);
  try {
    if (!application || !ownedPage) throw new OwnedX11Failed('binding');
    const retired = phase === 'after-ui-quit-native-window-absent' || phase === 'after-hidden-cli-quit-native-window-absent';
    if (!retired) {
      const snapshot = await captureOwnedWindow(application, ownedPage, deadline);
      if (!ownedBinding) {
        ownedBinding = { ...snapshot, generation: ownedGeneration, nonce: randomBytes(32).toString('hex'), app: application, child: application.process() };
        ownedChannel = new OwnedChannel();
        expect(await ownedChannel.send({ command: 'bind', pid: snapshot.pid, xid: snapshot.xid, generation: ownedGeneration, nonce: ownedBinding.nonce }, deadline)).toEqual({ bound: true });
      }
      if (ownedBinding.app !== application || snapshot.pid !== ownedBinding.pid || snapshot.handle !== ownedBinding.handle || snapshot.xid !== ownedBinding.xid) throw new OwnedX11Failed('binding');
      pid = snapshot.pid; report.runtime = snapshot.runtime;
    } else {
      if (!ownedBinding || ownedBinding.app !== application || ownedBinding.child.exitCode !== 0 || ownedBinding.child.signalCode !== null) throw new OwnedX11Failed('lifetime');
      expect(await ownedChannel!.send({ command: 'retire', exitCode: 0, generation: ownedGeneration, nonce: ownedBinding.nonce }, deadline)).toEqual({ retired: true });
    }
    if (!ownedBinding || !ownedChannel) throw new OwnedX11Failed('binding');
    const value = await ownedChannel.send({ command: 'observe', request: serial, generation: ownedGeneration, nonce: ownedBinding.nonce }, deadline);
    const result = parseObservation(value, serial);
    if (!retired) {
      const after = await captureOwnedWindow(application, ownedPage, deadline);
      if (after.pid !== ownedBinding.pid || after.xid !== ownedBinding.xid || after.handle !== ownedBinding.handle) throw new OwnedX11Failed('binding');
      report.ownedTargetObserver = { ...OWNED_X11_KIND, bindingObserved: true };
    } else {
      await ownedChannel.close(ownedGeneration, ownedBinding.nonce, deadline); ownedChannel = undefined; ownedBinding = undefined;
    }
    if (!nativeTrace.reply(result, serial)) throw new OwnedX11Failed('protocol');
    return result;
  } catch (error) {
    const failure = error instanceof OwnedX11Failed ? error.kind : 'binding';
    report.ownedTargetFailure = failure; ownedChannel?.abort(); throw new OwnedX11Failed(failure);
  }
};
const observe = async (operation: 'observe' | 'activate-decoy', phase: NativePhase): Promise<Observation> => {
  const serial = ++request;
  if (ownedRoute) { if (operation !== 'observe') throw new OwnedX11Failed('binding'); return observeOwned(serial, phase); }
  if (!Number.isSafeInteger(pid) || !decoy?.pid) throw new Error('OWN_PIDS_REQUIRED');
  writeFileSync(join(root, 'context-next.json'), JSON.stringify({ request: serial, pid, decoyPid: decoy.pid, operation }), { mode: 0o600 });
  renameSync(join(root, 'context-next.json'), join(root, 'context.json'));
  nativeTrace.begin(phase);
  consumerTrace.begin(serial);
  let observation: Observation | undefined;
  let hookFailed = false;
  try {
    await expect.poll(() => {
      const path = join(root, 'observation.json');
      if (!existsSync(path)) { consumerTrace.record('missing'); return false; }
      let size: number;
      try { size = lstatSync(path).size; }
      catch (error) { consumerTrace.record('poll-error'); throw error; }
      if (size > 8192) { consumerTrace.record('parse-rejected'); nativeTrace.reject(); return false; }
      try {
        const value = JSON.parse(readFileSync(path, 'utf8')) as { request?: number };
        if (value.request !== serial) { consumerTrace.record('other-serial'); return false; }
        observation = nativeTrace.reply(value, serial);
        hookFailed = nativeTrace.snapshot()?.state === 'hook-failed';
        consumerTrace.record(observation || hookFailed ? 'matching' : 'parse-rejected');
        return !!observation || hookFailed;
      } catch { consumerTrace.record('parse-rejected'); nativeTrace.reject(); return false; }
    }, { timeout: 8000 }).toBe(true);
  } finally { consumerTrace.finish(); }
  if (hookFailed) throw new NativeHookFailed();
  return observation!;
};
const observed = async (phase: NativePhase, predicate: (observation: Observation) => boolean) => {
  let value: Observation | undefined;
  let hookFailed = false;
  await expect.poll(async () => {
    try { value = await observe('observe', phase); }
    catch (error) { if (error instanceof NativeHookFailed) { hookFailed = true; return true; } throw error; }
    const met = predicate(value); nativeTrace.predicate(met); return met;
  }, { timeout: 12_000 }).toBe(true);
  // A matching fixed hook failure is terminal: never retry an uncertain action.
  if (hookFailed) throw new NativeHookFailed();
  observations.push({ phase, native: value! }); return value!;
};
const challenge = async () => {
  const native = await observed('decoy-native-ready', value => value.decoy.count === 1 && value.decoy.identityMatches && !!value.decoy.geometry && !!value.decoy.workArea);
  requireNativeTarget(native.decoy, backend);
  const setup = await observe('activate-decoy', 'decoy-activation-request');
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
const capture = async (name: string, appearance: 'dark' | 'light', view: 'search' | 'capabilities') => {
  const page = await application!.firstWindow();
  await expect(page.locator('main')).toHaveAttribute('data-theme', appearance, { timeout: 5000 });
  if (view === 'search') await expect(page.getByRole('textbox', { name: 'Search commands', exact: true })).toBeVisible({ timeout: 5000 });
  else {
    await expect(page.getByRole('heading', { name: 'Launcher capabilities', exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Back to commands', exact: true })).toBeVisible({ timeout: 5000 });
  }
  // Renderer DOM acknowledgement precedes two actual animation frames. The
  // Node-owned deadline remains bounded even when the renderer is backgrounded.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SCREENSHOT_PAINT_DEADLINE')), 5000);
    void page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
      .then(() => { clearTimeout(timer); resolve(); }, () => { clearTimeout(timer); reject(new Error('SCREENSHOT_PAINT_FAILED')); });
  });
  // Actual own-renderer/CDP pixels, not a compositor-wide screen capture.
  const png = await page.screenshot({ type: 'png', timeout: 5000 });
  writeFileSync(join(root, name), png);
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
    applicationChild = application.process();
    const page = await application.firstWindow();
    await page.waitForURL(APP_URL, { timeout: 60_000 });
    await expect(page.getByRole('textbox', { name: 'Search commands', exact: true })).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    if (ownedRoute) {
      if (ownedChannel || ownedBinding || ++ownedGeneration > 2) throw new OwnedX11Failed('binding');
      ownedPage = page; return page;
    }
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
  const lifecycleOnly = async (page: Awaited<ReturnType<typeof launch>>) => {
    stage = 'light-component-state';
    expect(await page.evaluate(() => window.linuxcast.setAppearance('light'))).toMatchObject({ ok: true });
    await page.getByRole('button', { name: 'Launcher capabilities', exact: true }).click();
    await capture('light-capabilities.png', 'light', 'capabilities');
    await page.getByRole('button', { name: 'Back to commands', exact: true }).click();
    stage = 'explicit-ui-quit';
    const first = application!.process();
    const firstExit = waitForExit(application!);
    await Promise.all([page.getByRole('button', { name: 'Quit Linuxcast', exact: true }).click(), firstExit]);
    expect(first.exitCode).toBe(0);
    await observed('after-ui-quit-native-window-absent', value => value.launcher.count === 0);
    report.explicitUiQuitExited = true;
    application = undefined;
    stage = 'fresh-launch-hidden-cli-quit'; await launch();
    const fresh = await observed('fresh-lifecycle-native-launch', value => value.launcher.count === 1 && (ownedRoute || !value.launcher.identityMatches || (!!value.launcher.geometry && !!value.launcher.workArea)));
    if (ownedRoute) requireOwnedLifecycleTarget(fresh.launcher);
    else { requireNativeTarget(fresh.launcher, backend); expect(contained(fresh.launcher)).toBe(true); }
    const second = application!.process();
    await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await expect.poll(async () => (await state()).visible).toBe(false);
    await observed('fresh-resident-native-hidden', value => value.launcher.count === 0 || value.launcher.hidden);
    expect(second.exitCode).toBeNull(); expect(process.kill(pid, 0)).toBe(true);
    report.closeRetainedResidentProcess = true;
    const secondExit = waitForExit(application!);
    await Promise.all([cli(main, '--quit'), secondExit]); expect(second.exitCode).toBe(0);
    await observed('after-hidden-cli-quit-native-window-absent', value => value.launcher.count === 0);
    application = undefined; report.hiddenCliQuitExited = true;
    report.lifecycleProof = { launches: 2, darkSearchCaptured: true, lightCapabilitiesCaptured: true,
      uiQuitExitCode: 0, hiddenCliQuitExitCode: 0, closeProcessAlive: true };
    stage = 'complete'; report.diagnosticOutcome = 'complete'; report.status = 'incomplete'; process.exitCode = 3;
  };
  stage = 'first-launch';
  let page = await launch();
  stage = 'native-initial-identity';
  const initial = await observed('initial-native-launch', value => value.launcher.count === 1 && (ownedRoute || !value.launcher.identityMatches || (!!value.launcher.geometry && !!value.launcher.workArea)));
  if (ownedRoute) requireOwnedLifecycleTarget(initial.launcher);
  else {
    requireNativeTarget(initial.launcher, backend);
    report.initialPlacementInsideWorkArea = contained(initial.launcher);
    if (!wayland) expect(contained(initial.launcher)).toBe(true);
  }
  expect(await page.evaluate(() => window.linuxcast.setAppearance('dark'))).toMatchObject({ ok: true });
  await capture('dark-launcher.png', 'dark', 'search');
  if (probeMode === 'lifecycle-only') { await lifecycleOnly(page); }
  else {
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
  expect(await page.evaluate(() => window.linuxcast.setAppearance('light'))).toMatchObject({ ok: true });
  await page.getByRole('button', { name: 'Launcher capabilities', exact: true }).click();
  if (wayland) {
    await expect(page.getByText('component required', { exact: true })).toHaveCount(2);
    for (const capability of current.capabilities) await expect(page.getByText(capability.remediation, { exact: true })).toBeVisible();
  }
  await capture('light-capabilities.png', 'light', 'capabilities');
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
  }
} catch { report.status = 'incomplete'; if (probeMode === 'lifecycle-only') report.diagnosticOutcome = 'failed'; process.exitCode = 3; }
finally {
  decoy?.kill('SIGTERM');
  ownedChannel?.abort();
  if (application && applicationChild?.exitCode === null) await application.close().catch(() => { applicationChild?.kill('SIGKILL'); report.status = 'cleanup-incomplete'; if (probeMode === 'lifecycle-only') report.diagnosticOutcome = 'failed'; process.exitCode = 3; });
  // The outer process-local supervisor independently reaps every descendant.
  rmSync(profile, { recursive: true, force: true });
  report.stage = stage;
  const diagnostic = nativeTrace.snapshot();
  if (diagnostic) report.nativeDiagnostic = diagnostic;
  const consumer = consumerTrace.snapshot();
  if (consumer) report.consumerRead = consumer;
  if (ownedRoute) {
    const geometryCapabilities = ownedGeometryCapabilities(observations.map(row => row.native.launcher));
    if (geometryCapabilities) report.ownedTargetObserver = { ...(report.ownedTargetObserver as Record<string, unknown>), geometryCapabilities };
  }
  writeFileSync(join(root, 'result.json'), JSON.stringify(report), { mode: 0o600 });
}
