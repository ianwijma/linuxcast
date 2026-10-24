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
import { APP_ID, APP_URL, capabilities } from '../../src/contract.ts';

// Never attach the screen reader to a normal desktop/session/accessibility bus.
const atAddress = process.env.AT_SPI_BUS_ADDRESS;
if (process.env.LINUXCAST_LAUNCHER_PRIVATE_AT !== '1' || !process.env.DBUS_SESSION_BUS_ADDRESS
  || !/\/xvfb-run\.[^/]+\/Xauthority$/.test(process.env.XAUTHORITY ?? '')
  || !atAddress || !process.env.XDG_RUNTIME_DIR?.includes('linuxcast-s001-at-bus-')
  || !atAddress.startsWith(`unix:path=${process.env.XDG_RUNTIME_DIR}/`)) throw new Error('Private Xvfb/session/AT entrypoint required');
const modeArguments = process.argv.slice(2);
if (modeArguments.length > 1 || (modeArguments.length === 1 && modeArguments[0] !== '--activation-help-only')) throw new Error('Unsupported AT mode');
const activationHelpOnly = modeArguments.length === 1;
const mode = activationHelpOnly ? 'activation-help-only' : 'default-nine';
const legacyCheckpoints = ['Search commands', 'Hide launcher', 'Actions Ctrl K', 'Record shortcut', 'Cancel shortcut change'];
const helpCheckpoints = ['View activation help', 'Launcher capabilities', 'Launcher capability details', 'Search commands'];
const expectedCheckpoints = activationHelpOnly ? helpCheckpoints : [...legacyCheckpoints, ...helpCheckpoints];
const skippedLegacyCheckpoints = activationHelpOnly ? legacyCheckpoints : [];
const expectedPresentationCheckpoints = expectedCheckpoints.filter(label => label !== 'Launcher capability details');

type NativeSnapshot = {
  status: string;
  controls?: { label: string; role: string; kind: string; focused: boolean }[];
  focus_events?: string[];
  event_sequence?: number;
};
const evidence = join(spikeRoot, 'evidence/at/results');
mkdirSync(evidence, { recursive: true });
for (const name of ['report.json', 'runtime.json', 'native-at.json', 'orca.json', 'dark-search.png', 'dark-actions.png', 'light-shortcut.png', 'light-activation-help.png']) rmSync(join(evidence, name), { force: true });
const profile = mkdtempSync(join(realpathSync(tmpdir()), 'linuxcast-launcher-at-'));
const inherited = Object.fromEntries(['PATH', 'DISPLAY', 'XAUTHORITY', 'TMPDIR', 'DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'GSETTINGS_BACKEND', 'LANG', 'LC_ALL'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
const env = { ...inherited, HOME: profile, XDG_CONFIG_HOME: join(profile, 'config'), XDG_CACHE_HOME: join(profile, 'cache') };
let application: ElectronApplication | undefined;
let applicationChild: ReturnType<ElectronApplication['process']> | undefined;
let discovery: ChildProcessWithoutNullStreams | undefined;
let observer: ChildProcessWithoutNullStreams | undefined;
let speech: ChildProcessWithoutNullStreams | undefined;
let orca: ChildProcessWithoutNullStreams | undefined;
let orcaExited = false;
let speechFailed = false;
let stage = 'build';
const snapshots: { label: string; snapshot: NativeSnapshot }[] = [];
let lastNativeAttempt: { label: string; snapshot: NativeSnapshot } | undefined;
const presentations: { label: string; generatedAfterNativeFocus: boolean; dispatchAttemptObserved: boolean }[] = [];
let headingFocusEventReceiptObserved = false;
const helpSentences = [
  'Linuxcast opened, but focus is unconfirmed for this request.',
  'Select Linuxcast using the desktop app switcher or click its window to type.',
  'A validated GNOME/KWin activation companion is required for automatic focus; none is connected in this prototype.',
];
const helpReading = { command: 'KP_Add', desktopLayoutVerified: false, requested: false,
  sentences: helpSentences.map((_, index) => ({ id: index === 0 ? 'reason' : index === 1 ? 'manual-remediation' : 'companion-limitation', generatedAfterCommand: false, deliveredToSpeechDispatcher: false })) };
// Orca48.1 web.textLines logs the generated SayAllContext immediately before
// yielding it to speechdispatcherfactory._say_all. With an active server,
// speech.say_all does NOT emit the ordinary SPEECH OUTPUT marker.
const helpReadingObservation = (fresh: string, sentence: string) => {
  const lines = fresh.split('\n');
  // A fresh pressed key cancels earlier presentation before invoking say_all.
  // Refuse overlapping/new requests in this slice instead of mixing readers.
  const requests = lines.flatMap((line, index) => /^(?:\d{2}:\d{2}:\d{2}\.\d{6} - )?DEFAULT: SayAll requested starting from \[[^\r\n]+\]$/.test(line) ? [index] : []);
  if (requests.length !== 1) return { generated: false, delivered: false };
  const contextPattern = /^(?:\d{2}:\d{2}:\d{2}\.\d{6} - )?WEB SAY ALL: .+ '([^\r\n]*)' \(-?\d+--?\d+, current: -?\d+\)$/;
  const generatedAt = lines.findIndex((line, index) => {
    // Standalone Orca uses the quote-free PyGObject object repr here. Fail
    // closed on ambiguous quotes instead of absorbing an utterance prefix
    // into the object field and falsely matching only the expected suffix.
    const match = /^(?:\d{2}:\d{2}:\d{2}\.\d{6} - )?WEB SAY ALL: [^'\r\n]+ '([^'\r\n]+)' \(-?\d+--?\d+, current: -?\d+\)$/.exec(line);
    return index > requests[0]! && match?.[1]?.trim() === sentence;
  });
  // Speaking is logged BEFORE a call that can swallow errors. With the active
  // server, only Speech Dispatcher's END callback resumes this iterator. Its
  // next generated context (or final exhaustion) proves the preceding yield
  // completed; do not wait for unrelated later document content to finish.
  // An unrecognized/multiline next context must stop matching, never be
  // skipped so that a later attempt can be assigned to the earlier utterance.
  const completedAt = generatedAt < 0 ? -1 : lines.findIndex((line, index) => index > generatedAt
    && /^(?:\d{2}:\d{2}:\d{2}\.\d{6} - )?(?:WEB SAY ALL:|WEB: textLines complete\.)/.test(line));
  const completed = completedAt >= 0 && (contextPattern.test(lines[completedAt]!)
    || /^(?:\d{2}:\d{2}:\d{2}\.\d{6} - )?WEB: textLines complete\. Verifying SayAll status$/.test(lines[completedAt]!));
  const attemptedAt = generatedAt < 0 ? -1 : lines.findIndex((line, index) => {
    const match = /^(?:\d{2}:\d{2}:\d{2}\.\d{6} - )?SPEECH DISPATCHER: Speaking '<speak>(.*)<\/speak>' *$/.exec(line);
    // Only Orca's source-defined word-position marks may be removed.
    return index > generatedAt && index < completedAt
      && match?.[1]?.replace(/<mark name="\d+:\d+"\/>/g, '').trim() === sentence;
  });
  return { generated: generatedAt >= 0, delivered: completed && attemptedAt >= 0 };
};
const verifyDesktopReadingSettings = (configuration: unknown) => {
  const value = configuration as { general?: { keyboardLayout?: unknown; sayAllStyle?: unknown; startingProfile?: unknown }; profiles?: { default?: { keyboardLayout?: unknown; sayAllStyle?: unknown; keybindings?: unknown; pronunciations?: unknown } }; keybindings?: unknown; pronunciations?: unknown };
  return value?.general?.keyboardLayout === 1 && value.general.sayAllStyle === 1
    && JSON.stringify(value.general.startingProfile) === '["Default","default"]'
    && value.profiles?.default !== undefined
    && (value.profiles.default.keyboardLayout === undefined || value.profiles.default.keyboardLayout === 1)
    && (value.profiles.default.sayAllStyle === undefined || value.profiles.default.sayAllStyle === 1)
    && [value.keybindings, value.pronunciations, value.profiles.default.keybindings, value.profiles.default.pronunciations]
      .every(mapping => mapping !== null && typeof mapping === 'object' && !Array.isArray(mapping) && Object.keys(mapping).length === 0);
};
const anchors: { nativeFocused: boolean; generated: boolean; dispatchAttemptObserved: boolean }[] = [];
const debugPath = join(profile, 'orca-debug.log');
const log = () => { try { return readFileSync(debugPath, 'utf8'); } catch { return ''; } };
const hasLabel = (text: string, marker: string, label: string) => text.split('\n').some(line => line.includes(marker) && line.includes(label));
// Orca48 event_manager._ignore logs this receipt before its ignore decisions.
// Absence means only not observed in this debug slice, never proven nonreceipt.
const hasHeadingFocusReceipt = (text: string) => text.split('\n').some(line => /^(?:\d{2}:\d{2}:\d{2}\.\d{6} - )?EVENT MANAGER: object:state-changed:focused for \[heading: 'Launcher capabilities'\] in [^\r\n]+ \(1, 0, [^\r\n]*\)$/.test(line));
const startupCompleted = () => log().includes('ORCA: Startup complete') || log().includes('ORCA: Starting Atspi main event loop');
const orcaVersion = /[0-9]+\.[0-9]+(?:\.[0-9]+)?/.exec(spawnSync('/usr/bin/orca', ['--version'], { env, encoding: 'utf8', timeout: 20_000 }).stdout ?? '')?.[0] ?? 'unavailable';

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
  applicationChild = application.process();
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

  stage = 'orca-desktop-reading-settings';
  expect(orcaVersion).toBe('48.1');
  helpReading.desktopLayoutVerified = verifyDesktopReadingSettings(JSON.parse(readFileSync(join(profile, 'orca/user-settings.conf'), 'utf8')));
  expect(helpReading.desktopLayoutVerified).toBe(true);

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
    stage = 'anchor:Dismiss launcher';
    const offset = log().length;
    const anchor = { nativeFocused: false, generated: false, dispatchAttemptObserved: false };
    anchors.push(anchor);
    await page.getByRole('button', { name: 'Dismiss launcher', exact: true }).focus();
    // Process a distinct anchor first so a delayed initial search utterance
    // cannot satisfy the subsequent per-focus presentation assertion.
    await expect.poll(async () => {
      const native = await inspect();
      anchor.nativeFocused = native.controls?.some(control => control.label === 'Dismiss launcher' && control.kind === 'button' && control.focused) ?? false;
      const fresh = log().slice(offset);
      anchor.generated = hasLabel(fresh, 'SPEECH OUTPUT:', 'Dismiss launcher');
      anchor.dispatchAttemptObserved = hasLabel(fresh, 'SPEECH DISPATCHER: Speaking', 'Dismiss launcher');
      return !orcaExited && anchor.nativeFocused && anchor.generated;
    }, { timeout: 30_000 }).toBe(true);
  };
  const nativeFocusCheck = async (label: string, role: string, target: Locator, key: string) => {
    stage = `focus:${label}`;
    const before = await inspect();
    const offset = log().length;
    nativeKey(key);
    await expect(target).toBeFocused({ timeout: 10_000 });
    let snapshot: NativeSnapshot | undefined;
    await expect.poll(async () => {
      snapshot = await inspect();
      lastNativeAttempt = { label, snapshot };
      return (snapshot.event_sequence ?? 0) > (before.event_sequence ?? 0)
        && snapshot.focus_events?.at(-1) === label
        && snapshot.controls?.some(control => control.label === label && control.kind === role && control.focused);
    }, { timeout: 10_000 }).toBe(true);
    snapshots.push({ label, snapshot: snapshot! });
    return offset;
  };
  const capture = async (screenshot: string) => {
    const png = await application!.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'));
    writeFileSync(join(evidence, screenshot), Buffer.from(png, 'base64'));
  };
  const focusCheck = async (label: string, role: string, target: Locator, key: string, screenshot?: string) => {
    const offset = await nativeFocusCheck(label, role, target, key);
    const presentation = { label, generatedAfterNativeFocus: false, dispatchAttemptObserved: false };
    presentations.push(presentation);
    await expect.poll(() => {
      const fresh = log().slice(offset);
      if (label === 'Launcher capabilities') headingFocusEventReceiptObserved ||= hasHeadingFocusReceipt(fresh);
      presentation.generatedAfterNativeFocus = hasLabel(fresh, 'SPEECH OUTPUT:', label);
      presentation.dispatchAttemptObserved = hasLabel(fresh, 'SPEECH DISPATCHER: Speaking', label);
      return !orcaExited && presentation.generatedAfterNativeFocus && presentation.dispatchAttemptObserved;
    }, { timeout: 10_000 }).toBe(true);
    if (screenshot) await capture(screenshot);
  };
  const readActivationHelp = async () => {
    stage = 'activation-help-say-all';
    const offset = log().length;
    nativeKey('KP_Add');
    helpReading.requested = true;
    await expect.poll(() => {
      const fresh = log().slice(offset);
      for (const [index, sentence] of helpSentences.entries()) {
        const observed = helpReadingObservation(fresh, sentence);
        helpReading.sentences[index]!.generatedAfterCommand = observed.generated;
        helpReading.sentences[index]!.deliveredToSpeechDispatcher = observed.delivered;
      }
      return !orcaExited && helpReading.sentences.every(value => value.generatedAfterCommand && value.deliveredToSpeechDispatcher);
    }, { timeout: 10_000 }).toBe(true);
  };
  if (!activationHelpOnly) {
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
    nativeKey('Tab');
    await expect(page.getByRole('region', { name: 'Shortcut details', exact: true })).toBeFocused();
    await focusCheck('Record shortcut', 'toggle-button', page.getByRole('button', { name: 'Record shortcut', exact: true }), 'Tab', 'light-shortcut.png');
    await focusCheck('Cancel shortcut change', 'button', page.getByRole('button', { name: 'Cancel shortcut change', exact: true }), 'Tab');
    nativeKey('Escape');
    await expect(page.getByRole('textbox', { name: 'Search commands', exact: true })).toBeFocused();
  }
  // Public synthetic activation state in only our own renderer. This exercises
  // help accessibility, never native activation or an installed companion.
  if (!state.ok) throw new Error('Own launcher state unavailable');
  const pending = { ...state.value, appearance: 'light' as const, visible: true, focused: false,
    capabilities: capabilities('x11', false, true) };
  await application.evaluate(({ BrowserWindow }, value) => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length !== 1) throw new Error('Own window required');
    windows[0]!.webContents.send('launcher:state', value);
  }, pending);
  await settleDismissAnchor();
  await focusCheck('View activation help', 'button', page.getByRole('button', { name: 'View activation help', exact: true }), 'Tab');
  await focusCheck('Launcher capabilities', 'heading', page.getByRole('heading', { name: 'Launcher capabilities', exact: true }), 'Return');
  await settleDismissAnchor();
  const details = page.getByRole('region', { name: 'Launcher capability details', exact: true });
  await nativeFocusCheck('Launcher capability details', 'landmark', details, 'Tab');
  // The landmark retains its native name/role/focus contract. Read its content
  // using the actual Orca command, rather than requiring passive name speech.
  await readActivationHelp();
  await capture('light-activation-help.png');
  stage = 'activation-help-escape-search';
  await focusCheck('Search commands', 'entry', page.getByRole('textbox', { name: 'Search commands', exact: true }), 'Escape');
  stage = 'complete';
  expect(snapshots.map(value => value.label)).toEqual(expectedCheckpoints);
  expect(presentations).toHaveLength(expectedPresentationCheckpoints.length);
  expect(presentations.map(value => value.label)).toEqual(expectedPresentationCheckpoints);
  expect(orcaExited).toBe(false);
  writeFileSync(join(evidence, 'native-at.json'), JSON.stringify({ status: 'passed-native-focus', mode, expectedCheckpoints, skippedLegacyCheckpoints, snapshots }, null, 2) + '\n');
  writeFileSync(join(evidence, 'orca.json'), JSON.stringify({ status: 'passed-generated-presentation', orcaVersion, startupCompleted: startupCompleted(),
    mode, expectedCheckpoints, skippedLegacyCheckpoints, expectedPresentationCheckpoints, helpReading, headingFocusEventReceiptObserved, anchors, presentations, limitation: 'Ordinary focus: generated presentation and dispatch attempts only, not receipt. Essential help reading: completed Speech Dispatcher callback progression. No audible/tactile, GNOME/KDE/Wayland or desktop-matrix proof.' }, null, 2) + '\n');
  writeFileSync(join(evidence, 'report.json'), JSON.stringify({ status: 'passed', stage, mode, expectedCheckpoints, skippedLegacyCheckpoints, nativeFocus: expectedCheckpoints.length, generatedPresentation: expectedPresentationCheckpoints.length, helpReading,
    affectedActivationHelpChecks: 4, syntheticUnconfirmedFocusState: true, actualGnomeFocusEstablished: false,
    boundary: 'Actual launcher on private Xvfb/session/AT buses; synthetic app-only observation; actual renderer sandbox; no host display hooks/settings or audible QA.' }, null, 2) + '\n');
  console.log(`Launcher native focus ${expectedCheckpoints.length}, Orca focus presentation ${expectedPresentationCheckpoints.length}, help reading ${helpSentences.length}/${helpSentences.length} passed (${mode}). No audible or compositor QA claimed.`);
} catch {
  // Operational stages/allowlisted booleans only. Never persist raw Orca debug,
  // unfiltered accessible text, application screenshots or exception payloads.
  writeFileSync(join(evidence, 'native-at.json'), JSON.stringify({ status: 'incomplete', stage, mode, expectedCheckpoints, skippedLegacyCheckpoints, snapshots, lastNativeAttempt }, null, 2) + '\n');
  writeFileSync(join(evidence, 'orca.json'), JSON.stringify({ status: 'incomplete', stage, mode, expectedCheckpoints, skippedLegacyCheckpoints, expectedPresentationCheckpoints, helpReading, headingFocusEventReceiptObserved, orcaVersion, startupCompleted: startupCompleted(), anchors, presentations,
    anyKnownGenerated: ['Dismiss launcher', 'Search commands', 'Hide launcher', 'Actions Ctrl K', 'Record shortcut', 'Cancel shortcut change', 'View activation help', 'Launcher capabilities', 'Launcher capability details'].some(label => hasLabel(log(), 'SPEECH OUTPUT:', label)),
    anyKnownDispatchAttemptObserved: ['Dismiss launcher', 'Search commands', 'Hide launcher', 'Actions Ctrl K', 'Record shortcut', 'Cancel shortcut change', 'View activation help', 'Launcher capabilities', 'Launcher capability details'].some(label => hasLabel(log(), 'SPEECH DISPATCHER: Speaking', label)) }, null, 2) + '\n');
  writeFileSync(join(evidence, 'report.json'), JSON.stringify({ status: 'incomplete', stage, mode, expectedCheckpoints, skippedLegacyCheckpoints, limitation: 'Required assertions did not all pass. No acceptance success or audible/compositor QA inferred.' }, null, 2) + '\n');
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
  catch { applicationChild?.kill('SIGKILL'); cleanupOk = false; }
  try { rmSync(profile, { recursive: true, force: true }); } catch { cleanupOk = false; }
  if (!cleanupOk) {
    process.exitCode = 1;
    writeFileSync(join(evidence, 'report.json'), JSON.stringify({ status: 'cleanup-failed', stage, mode, expectedCheckpoints, skippedLegacyCheckpoints, limitation: 'No complete acceptance success; private process/profile cleanup was not fully verified.' }, null, 2) + '\n');
    console.error('Private AT cleanup failed; no complete acceptance success.');
  }
}
