import { expect, test } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { buildNativeSession } from './build.ts';
import { CONSUMER_OUTCOMES, ConsumerTrace, parseConsumerRead, parseProbeMode, parseLifecycleDiagnostic, parseOwnedX11Handle, parseOwnedX11Provenance, OWNED_X11_FAILURES, OWNED_X11_KIND, NativeTrace, parseNativeDiagnostic, parseObservation, parseHookFailureReply, parseObserverStartup, requireNativeTarget, requireOwnedLifecycleTarget, ownedGeometryCapabilities, canRecoverActivationNotice, noticeNativeState } from './protocol.ts';
import type { ConsumerOutcome, NativeWindow, Observation, NativeDiagnostic, NoticeRecovery } from './protocol.ts';
import { hookFixture, syntheticWindow } from './observation-fixtures.ts';
const source = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const native = (): NativeWindow => ({ count: 1, identityMatches: true, nativeBackend: 'wayland', focused: false, hidden: false,
  geometry: { x: 32, y: 32, width: 720, height: 560 }, workArea: { x: 0, y: 0, width: 1280, height: 900 } });

const noticeObservation = (request = 5, recovered = false): Observation => ({ request, decoyActivationIssued: false,
  launcher: { ...native(), nativeBackend: 'x11', focused: recovered }, decoy: { ...native(), nativeBackend: 'x11', focused: !recovered } });
const noticeFailure = (): NativeDiagnostic => ({ phase: 'ordinary-show-native-focus', state: 'predicate-unmet',
  lastObservation: { phase: 'ordinary-show-native-focus', native: noticeObservation() } });

for (const scenario of ['valid', 'kwin', 'wayland', 'lifecycle', 'prior-success', 'missing', 'startup', 'hook', 'stale-phase', 'parsed-only', 'focused', 'foreign', 'multiple', 'hidden', 'no-geometry', 'wrong-backend', 'decoy-unfocused', 'activation-issued']) {
  test(`notice recovery start gate: ${scenario}`, () => {
    const failure = noticeFailure();
    if (scenario === 'startup') failure.phase = 'initial-native-launch';
    if (scenario === 'hook') failure.state = 'hook-failed';
    if (scenario === 'stale-phase') failure.lastObservation!.phase = 'ordinary-singleton-cli-show';
    if (scenario === 'parsed-only') failure.state = 'parsed';
    const observation = failure.lastObservation!.native;
    if (scenario === 'focused') observation.launcher.focused = true;
    if (scenario === 'foreign') observation.launcher.identityMatches = false;
    if (scenario === 'multiple') observation.launcher.count = 2;
    if (scenario === 'hidden') observation.launcher.hidden = true;
    if (scenario === 'no-geometry') observation.launcher.geometry = null;
    if (scenario === 'wrong-backend') observation.launcher.nativeBackend = 'wayland';
    if (scenario === 'decoy-unfocused') observation.decoy.focused = false;
    if (scenario === 'activation-issued') observation.decoyActivationIssued = true;
    expect(canRecoverActivationNotice(scenario === 'kwin' ? 'kwin-x11' : scenario === 'wayland' ? 'gnome-wayland' : 'gnome-x11',
      scenario === 'lifecycle' ? 'lifecycle-only' : 'full', scenario === 'prior-success', scenario === 'missing' ? undefined : failure)).toBe(scenario === 'valid');
  });
}

// Execute the actual diagnostic with only fixed fake app/native/DOM operations.
// No Electron import, display, bus, guest, or native input is evaluated.
async function noticeRecoveryFixture(scenario = 'complete') {
  const text = readFileSync(source('check.ts'), 'utf8');
  const begin = text.indexOf('const recoverActivationNotice = async'), end = text.indexOf('\ntry {\n  const main =', begin);
  expect(begin).toBeGreaterThan(0); expect(end).toBeGreaterThan(begin);
  const events: string[] = []; let switched = false, beforeCalls = 0, bindings = 0;
  const child = { pid: 101, exitCode: null, signalCode: null };
  const notice = { kind: 'notice', getByRole: () => ({ kind: 'help' }) };
  const page = { getByRole: () => notice, evaluate: async () => ({ ok: true }) };
  const app = { firstWindow: async () => page, process: () => child };
  const report: { ordinaryShowNativeFocused: boolean; noticeRecovery?: NoticeRecovery } = { ordinaryShowNativeFocused: false };
  const fixedFailure = noticeFailure();
  if (scenario === 'ineligible') fixedFailure.phase = 'initial-native-launch';
  const context = {
    backend: 'gnome-x11', probeMode: 'full', report, application: app, pid: 101, env: {}, performance: { now: () => 10 },
    canRecoverActivationNotice, noticeNativeState, fixtureRecovery: undefined as undefined | ((failure: NativeDiagnostic) => Promise<void>),
    captureOwnedWindow: async () => { bindings++; if (scenario === 'dead') throw new Error('PRIVATE_CANARY');
      return { pid: 101, handle: scenario === 'replaced' && bindings > 2 || scenario === 'replaced-after-switch' && switched ? 'replacement' : 'same', xid: 100 }; },
    observed: async (phase: string, predicate: (value: Observation) => boolean) => {
      events.push(phase); if (phase === 'notice-before-manual-switch') beforeCalls++;
      const value = noticeObservation(5 + events.length, switched);
      if (scenario === 'recheck-focused' && beforeCalls === 2) value.launcher.focused = true;
      if (scenario === 'no-native-recovery' && switched) value.launcher.focused = false;
      if (scenario === 'wrong-native' && switched) value.launcher.identityMatches = false;
      if (scenario === 'observer-error') throw new Error('PRIVATE_CANARY');
      if (!predicate(value)) throw new Error('NATIVE_PREDICATE');
      return value;
    },
    state: async () => ({ visible: scenario !== 'state-hidden', focused: scenario === 'state-focused' || switched && scenario !== 'state-not-recovered',
      capabilities: [{ id: 'launcher.activate', state: scenario === 'wrong-capability' || scenario === 'wrong-recovered-capability' && switched ? 'temporarily-unavailable' : switched ? 'available' : 'component-required' }] }),
    capture: async (name: string) => { events.push(name); if (scenario === 'capture-failed' && name === 'notice-light.png') throw new Error('PRIVATE_CANARY'); },
    spawnSync: (command: string, args: string[], options: { timeout: number }) => {
      events.push('key'); expect(command).toBe('xdotool'); expect(args).toEqual(['key', '--clearmodifiers', 'alt+Tab']); expect(options.timeout).toBe(5000);
      switched = true; return { status: scenario === 'key-failed' ? 1 : 0 };
    },
    expect: (value: unknown) => ({
      toBe: (expected: unknown) => expect(value).toBe(expected), toBeNull: () => expect(value).toBeNull(), toMatchObject: (expected: object) => expect(value).toMatchObject(expected),
      toBeVisible: async () => { if (scenario === 'notice-absent') throw new Error('NO_NOTICE'); },
      toHaveCount: async (count: number) => { expect(count).toBe(0); if (scenario === 'notice-remains') throw new Error('NOTICE_REMAINS'); },
    }),
  };
  runInNewContext(stripTypeScriptTypes(`${text.slice(begin, end)}\nglobalThis.fixtureRecovery = recoverActivationNotice;`), context, { timeout: 1000 });
  await context.fixtureRecovery!(fixedFailure);
  return { events, report, failure: fixedFailure };
}

for (const scenario of ['complete', 'ineligible', 'dead', 'replaced', 'recheck-focused', 'observer-error', 'state-hidden', 'state-focused', 'wrong-capability', 'notice-absent', 'capture-failed', 'key-failed', 'no-native-recovery', 'wrong-native', 'notice-remains', 'replaced-after-switch', 'state-not-recovered', 'wrong-recovered-capability']) {
  test(`actual notice recovery keeps input bounded and requires native plus app proof: ${scenario}`, async () => {
    const { events, report, failure } = await noticeRecoveryFixture(scenario);
    expect(events.filter(value => value === 'key')).toHaveLength(['complete', 'key-failed', 'no-native-recovery', 'wrong-native', 'notice-remains', 'replaced-after-switch', 'state-not-recovered', 'wrong-recovered-capability'].includes(scenario) ? 1 : 0);
    if (scenario === 'ineligible') { expect(report.noticeRecovery).toBeUndefined(); expect(events).toEqual([]); }
    else {
      expect(report.noticeRecovery!.originalFailure).toEqual(failure);
      expect(report.noticeRecovery!.status).toBe(scenario === 'complete' ? 'complete' : 'incomplete');
      expect(JSON.stringify(report)).not.toContain('PRIVATE_CANARY');
    }
    expect(report.ordinaryShowNativeFocused).toBe(false);
  });
}

test('ordinary native focus failure still throws after successful recovery and never enters shortcut checks', async () => {
  const text = readFileSync(source('check.ts'), 'utf8');
  const begin = text.indexOf("    try { await observed('ordinary-show-native-focus'"), end = text.indexOf('    expect(current.shortcut.state)', begin);
  expect(begin).toBeGreaterThan(0); expect(end).toBeGreaterThan(begin);
  const failure = noticeFailure(), events: string[] = [];
  const program = `(async () => { ${stripTypeScriptTypes(text.slice(begin, end))}\nevents.push('shortcut'); })()`;
  await expect(runInNewContext(program, { events, observed: async () => { throw new Error('FAILED_FOCUS'); }, nativeTrace: { snapshot: () => failure },
    recoverActivationNotice: async (value: NativeDiagnostic) => { expect(value).toEqual(failure); events.push('recovery'); } })).rejects.toThrow('ORDINARY_SHOW_NATIVE_FOCUS_FAILED');
  expect(events).toEqual(['recovery']);
  events.length = 0;
  await runInNewContext(program, { events, observed: async () => undefined, nativeTrace: { snapshot: () => { throw new Error('UNEXPECTED_FAILURE_READ'); } },
    recoverActivationNotice: async () => { throw new Error('UNEXPECTED_RECOVERY'); } });
  expect(events).toEqual(['shortcut']);
});

for (const scenario of ['valid-complete', 'valid-partial', 'valid-transient-decoy', 'private', 'original-private', 'bool-type', 'no-original', 'wrong-original', 'wrong-original-state', 'stale-original', 'original-focused',
  'no-prior', 'no-runtime', 'wrong-backend', 'wrong-mode', 'wrong-stage', 'forged-pass', 'prior-success', 'no-proof', 'diagnostic-only-no-proof', 'no-precondition', 'no-command', 'no-recovery', 'no-screenshot',
  'native-unfocused', 'native-foreign', 'native-hidden', 'native-no-geometry', 'native-decoy', 'native-activation', 'missing-recheck', 'stale-before', 'phase-order', 'extra-switch', 'incomplete-complete-flags']) {
  test(`notice artifact publication preserves failure and rejects unsupported claims: ${scenario}`, () => {
    const child = spawnSync('/usr/bin/python3', [source('artifact-canary.py'), `notice-${scenario}`], { encoding: 'utf8', timeout: 5000 });
    expect(child.status, child.stderr).toBe(0);
    const result = JSON.parse(child.stdout);
    if (scenario.startsWith('valid-')) expect(result).toMatchObject({ originalFailureRetained: true, overallIncomplete: true, exitCode: 3 });
    else expect(result).toMatchObject({ rejectedBeforePublication: true, publishedFiles: 0 });
  });
}

test('preparation never launches a compositor without the explicit disposable target guard', () => {
  const child = spawnSync('/usr/bin/python3', [source('run-session.py'), 'gnome-wayland'], { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 5000 });
  expect(child.status).toBe(3);
  expect(JSON.parse(child.stdout)).toEqual({ status: 'unavailable', reason: 'EXPLICIT_DISPOSABLE_DEBIAN13_USER_REQUIRED', physicalDesktopMatrixEstablished: false });
});

test('native identity/backend gates reject XWayland even when the requested session is Wayland', () => {
  requireNativeTarget(native(), 'kwin-wayland');
  expect(() => requireNativeTarget({ ...native(), nativeBackend: 'x11' }, 'kwin-wayland')).toThrow('NATIVE_BACKEND_MISMATCH');
  expect(() => requireNativeTarget({ ...native(), nativeBackend: 'unsupported' }, 'kwin-wayland')).toThrow('NATIVE_BACKEND_MISMATCH');
  expect(() => requireNativeTarget({ ...native(), identityMatches: false }, 'gnome-wayland')).toThrow('OWN_NATIVE_IDENTITY_REQUIRED');
  expect(() => requireNativeTarget({ ...native(), count: 2 }, 'gnome-wayland')).toThrow('OWN_NATIVE_IDENTITY_REQUIRED');
});

test('public observation parsing rejects stale replies, arbitrary content and unsafe geometry', () => {
  const row = { request: 7, launcher: native(), decoy: native(), decoyActivationIssued: false };
  expect(parseObservation(row, 7).request).toBe(7);
  expect(() => parseObservation(row, 8)).toThrow('NATIVE_REQUEST');
  expect(() => parseObservation({ ...row, title: 'private-canary-never-retained' }, 7)).toThrow('NATIVE_SCHEMA');
  expect(() => parseObservation({ ...row, launcher: { ...native(), geometry: { x: 0, y: 0, width: NaN, height: 1 } } }, 7)).toThrow('NATIVE_RECT');
  expect(() => parseObservation({ ...row, launcher: { ...native(), count: -1 } }, 7)).toThrow('NATIVE_SCHEMA');
  expect(() => parseObservation({ ...row, launcher: { ...native(), count: 0 } }, 7)).toThrow('NATIVE_IDENTITY_SCHEMA');
});

// Execute the production observe function, type-only stripped, with synthetic
// file operations and a deterministic poll scheduler. No guard, GUI or real
// observation files are evaluated by this fixture.
async function consumerFixture(options: { exists?: boolean; raw?: string; size?: number; callbacks?: number;
  metadataError?: Error; readError?: Error; elapsedNs?: bigint } = {}) {
  const text = readFileSync(source('check.ts'), 'utf8');
  const begin = text.indexOf('const observe = async'), end = text.indexOf('const observed = async', begin);
  expect(begin).toBeGreaterThanOrEqual(0); expect(end).toBeGreaterThan(begin);
  const program = stripTypeScriptTypes(`${text.slice(begin, end)}\nglobalThis.fixtureObserve = observe;`);
  const fs = { write: 0, rename: 0, exists: 0, stat: 0, read: 0 };
  const nativeTrace = new NativeTrace();
  let clock = 9_000_000_000n;
  const consumerTrace = new ConsumerTrace(() => clock);
  const raw = options.raw ?? '{}', timeout = new Error('SYNTHETIC_POLL_DEADLINE');
  class SyntheticHookFailed extends Error {}
  const context = {
    ownedRoute: false, request: 1, pid: 101, decoy: { pid: 202 }, root: '/synthetic', join,
    nativeTrace, consumerTrace, NativeHookFailed: SyntheticHookFailed,
    writeFileSync: (path: string, body: string, mode: { mode: number }) => {
      fs.write++; expect(path).toBe('/synthetic/context-next.json');
      expect(JSON.parse(body)).toEqual({ request: 2, pid: 101, decoyPid: 202, operation: 'observe' });
      expect(mode.mode).toBe(0o600);
    },
    renameSync: (from: string, to: string) => { fs.rename++; expect(from).toBe('/synthetic/context-next.json'); expect(to).toBe('/synthetic/context.json'); },
    existsSync: (path: string) => { fs.exists++; expect(path).toBe('/synthetic/observation.json'); return options.exists !== false; },
    lstatSync: (path: string) => { fs.stat++; expect(path).toBe('/synthetic/observation.json'); if (options.metadataError) throw options.metadataError; return { size: options.size ?? raw.length }; },
    readFileSync: (path: string, encoding: string) => { fs.read++; expect(path).toBe('/synthetic/observation.json'); expect(encoding).toBe('utf8'); if (options.readError) throw options.readError; return raw; },
    expect: { poll: (callback: () => boolean, config: { timeout: number }) => {
      expect(config.timeout).toBe(8000);
      return { toBe: async (expected: boolean) => {
        expect(expected).toBe(true);
        try {
          for (let index = 0; index < (options.callbacks ?? 1); index++) if (callback()) return;
          throw timeout;
        } finally { clock += options.elapsedNs ?? 25_000_000n; }
      } };
    } },
    fixtureObserve: undefined as undefined | ((operation: 'observe', phase: 'after-close-native-hidden') => Promise<Observation>),
  };
  runInNewContext(program, context, { timeout: 1000 });
  let returned: Observation | undefined, error: unknown;
  try { returned = await context.fixtureObserve!('observe', 'after-close-native-hidden'); } catch (value) { error = value; }
  return { fs, returned, error, timeout, hookFailed: error instanceof SyntheticHookFailed,
    native: nativeTrace.snapshot(), consumer: consumerTrace.snapshot()! };
}

const consumerCases: { name: string; options: Parameters<typeof consumerFixture>[0]; outcome: ConsumerOutcome; state: string; stat: number; read: number }[] = [
  { name: 'missing-file', options: { exists: false }, outcome: 'missing', state: 'request-written', stat: 0, read: 0 },
  { name: 'old-serial', options: { raw: '{"request":1}' }, outcome: 'other-serial', state: 'request-written', stat: 1, read: 1 },
  { name: 'missing-serial', options: { raw: '{}' }, outcome: 'other-serial', state: 'request-written', stat: 1, read: 1 },
  { name: 'scalar-json', options: { raw: '17' }, outcome: 'other-serial', state: 'request-written', stat: 1, read: 1 },
  { name: 'null-json', options: { raw: 'null' }, outcome: 'parse-rejected', state: 'reply-rejected', stat: 1, read: 1 },
  { name: 'malformed-json', options: { raw: '{synthetic-private-canary' }, outcome: 'parse-rejected', state: 'reply-rejected', stat: 1, read: 1 },
  { name: 'matching-invalid-schema', options: { raw: '{"request":2,"private":"synthetic-private-canary"}' }, outcome: 'parse-rejected', state: 'reply-rejected', stat: 1, read: 1 },
  { name: 'oversize', options: { size: 8193 }, outcome: 'parse-rejected', state: 'reply-rejected', stat: 1, read: 0 },
  { name: 'read-error', options: { readError: new Error('synthetic-private-canary') }, outcome: 'parse-rejected', state: 'reply-rejected', stat: 1, read: 1 },
];
for (const row of consumerCases) test(`actual consumer callback ${row.name} preserves file operations and native trace`, async () => {
  const value = await consumerFixture(row.options);
  expect(value.error).toBe(value.timeout); expect(value.returned).toBeUndefined();
  expect(value.fs).toEqual({ write: 1, rename: 1, exists: 1, stat: row.stat, read: row.read });
  expect(value.native?.state).toBe(row.state);
  expect(value.consumer).toEqual({ request: 2, pollCount: 1, outcomes: Object.fromEntries(CONSUMER_OUTCOMES.map(name => [name, name === row.outcome ? 1 : 0])),
    pollsCapped: false, elapsedMs: 25, elapsedCapped: false });
  expect(JSON.stringify({ consumer: value.consumer, native: value.native })).not.toContain('synthetic-private-canary');
});

test('actual consumer metadata error rethrows the identical exception without reading or rejecting the old trace', async () => {
  const metadataError = new Error('synthetic-private-canary');
  const value = await consumerFixture({ metadataError });
  expect(value.error).toBe(metadataError);
  expect(value.fs).toEqual({ write: 1, rename: 1, exists: 1, stat: 1, read: 0 });
  expect(value.consumer.outcomes['poll-error']).toBe(1); expect(value.consumer.elapsedMs).toBe(25);
  expect(value.native?.state).toBe('request-written');
  expect(JSON.stringify(value.consumer)).not.toContain('synthetic-private-canary');
});

test('actual consumer distinguishes parsed native observation from terminal typed hook failure without retrying', async () => {
  const observation = { request: 2, launcher: native(), decoy: native(), decoyActivationIssued: false };
  const parsed = await consumerFixture({ raw: JSON.stringify(observation), callbacks: 5 });
  expect(parsed.error).toBeUndefined(); expect(parsed.returned).toEqual(observation); expect(parsed.native?.state).toBe('parsed');
  const failed = await consumerFixture({ raw: JSON.stringify({ request: 2, hookFailure: { stage: 'launcher', outcome: 'native-read-failed' } }), callbacks: 5 });
  expect(failed.hookFailed).toBe(true); expect(failed.returned).toBeUndefined(); expect(failed.native?.state).toBe('hook-failed');
  for (const value of [parsed, failed]) {
    expect(value.consumer.pollCount).toBe(1); expect(value.consumer.outcomes.matching).toBe(1);
    expect(value.fs).toEqual({ write: 1, rename: 1, exists: 1, stat: 1, read: 1 });
  }
});

test('actual consumer exports zero callbacks when the scheduler never invokes it and finishes elapsed on timeout', async () => {
  const value = await consumerFixture({ callbacks: 0, elapsedNs: 8_000_000_000n });
  expect(value.error).toBe(value.timeout); expect(value.consumer.pollCount).toBe(0); expect(value.consumer.elapsedMs).toBe(8000);
  expect(Object.values(value.consumer.outcomes)).toEqual([0, 0, 0, 0, 0]);
  expect(value.native?.state).toBe('request-written');
  expect(value.fs).toEqual({ write: 1, rename: 1, exists: 0, stat: 0, read: 0 });
});

test('actual consumer saturation bounds the exported counts without adding or suppressing existing file operations', async () => {
  const value = await consumerFixture({ callbacks: 300, raw: '{"request":1}' });
  expect(value.error).toBe(value.timeout); expect(value.consumer.pollCount).toBe(255); expect(value.consumer.pollsCapped).toBe(true);
  expect(value.consumer.outcomes['other-serial']).toBe(255); expect(Object.values(value.consumer.outcomes).reduce((a, b) => a + b, 0)).toBe(255);
  expect(value.fs).toEqual({ write: 1, rename: 1, exists: 300, stat: 300, read: 300 });
  expect(value.native?.state).toBe('request-written');
});

test('consumer keeps only the last own request and exports bounded own elapsed time without absolute clock values', () => {
  let clock = 99_000_000_000_000n;
  const trace = new ConsumerTrace(() => clock);
  expect(trace.snapshot()).toBeUndefined();
  trace.begin(1); trace.record('missing'); clock += 1_234_567n; trace.finish();
  expect(trace.snapshot()?.elapsedMs).toBe(1);
  trace.begin(2); expect(trace.snapshot()?.pollCount).toBe(0);
  for (let i = 0; i < 255; i++) trace.record('matching');
  clock += 180_000_000_000n; trace.finish();
  expect(trace.snapshot()?.pollsCapped).toBe(false); expect(trace.snapshot()?.elapsedCapped).toBe(false);
  trace.record('missing'); clock += 1n; trace.finish();
  expect(trace.snapshot()).toEqual({ request: 2, pollCount: 255, outcomes: { missing: 0, 'other-serial': 0, matching: 255, 'parse-rejected': 0, 'poll-error': 0 }, pollsCapped: true, elapsedMs: 180000, elapsedCapped: true });
  expect(JSON.stringify(trace.snapshot())).not.toContain('99000000000000');
});

test('consumer parsers reject private, wrong-typed, unbounded and inconsistent fields', () => {
  const base = { request: 2, pollCount: 1, outcomes: { missing: 1, 'other-serial': 0, matching: 0, 'parse-rejected': 0, 'poll-error': 0 }, pollsCapped: false, elapsedMs: 1, elapsedCapped: false };
  expect(parseConsumerRead(base)).toEqual(base);
  const invalid = [{ ...base, private: 'synthetic-private-canary' }, { ...base, outcomes: { ...base.outcomes, private: 'synthetic-private-canary' } },
    ...[true, 0, -1, 1001, 1.5, NaN, Infinity, 'synthetic-private-canary'].map(request => ({ ...base, request })),
    ...[true, -1, 256, 1.5, NaN, Infinity, 'synthetic-private-canary'].map(pollCount => ({ ...base, pollCount })),
    ...[true, -1, 256, 1.5, NaN, Infinity, 'synthetic-private-canary'].map(missing => ({ ...base, outcomes: { ...base.outcomes, missing } })),
    ...[true, -1, 180001, 1.5, NaN, Infinity, 'synthetic-private-canary'].map(elapsedMs => ({ ...base, elapsedMs })),
    { ...base, outcomes: { ...base.outcomes, matching: 1 } }, { ...base, pollsCapped: true }, { ...base, elapsedCapped: true },
    { ...base, pollsCapped: 1 }, { ...base, elapsedCapped: 1 }];
  for (const value of invalid) expect(() => parseConsumerRead(value)).toThrow();
});

for (const family of ['gnome', 'kwin'] as const) {
  test(`${family} hook never reads identity/geometry outside the exact launched PID`, () => {
    const foreign = syntheticWindow(303, 'synthetic-private-canary'); foreign.forbidMetadata = true;
    const row = hookFixture(family, [foreign]).observe(true);
    expect(row.launcher.count).toBe(0); expect(row.decoy.count).toBe(0);
    expect(row.diagnostics?.launcher.pidMatch).toBe('none');
    expect(foreign.identityReads).toBe(0); expect(foreign.geometryReads).toBe(0);
    expect(row.decoyActivationIssued).toBe(false);
  });
  test(`${family} hook retains only fixed identity outcomes and never reads geometry on mismatch`, () => {
    const own = syntheticWindow(101, 'synthetic-private-canary');
    const row = hookFixture(family, [own]).observe();
    expect(row.launcher.identityMatches).toBe(false);
    expect(row.diagnostics?.launcher.primaryIdentity).toBe('mismatch');
    expect(row.diagnostics?.launcher.geometry).toBe('not-inspected');
    expect(own.geometryReads).toBe(0);
    expect(JSON.stringify(row)).not.toContain('synthetic-private-canary');
  });
  test(`${family} hook reports zero geometry without accepting or activating it, then observes readiness`, () => {
    const launcher = syntheticWindow(101, 'io.github.ianwijma.Linuxcast');
    const decoy = syntheticWindow(202, 'io.github.ianwijma.Linuxcast.S001Decoy');
    launcher.width = 0; decoy.width = 0;
    const fixture = hookFixture(family, [launcher, decoy]);
    const zero = fixture.observe(true);
    expect(zero.diagnostics?.launcher.geometry).toBe('not-ready');
    expect(zero.launcher.geometry).toBeNull();
    expect(() => requireNativeTarget(zero.launcher, 'gnome-wayland')).toThrow('OWN_NATIVE_IDENTITY_REQUIRED');
    expect(fixture.activations()).toBe(0);
    launcher.width = 720; decoy.width = 360;
    const ready = fixture.observe(true);
    requireNativeTarget(ready.launcher, 'gnome-wayland');
    expect(ready.diagnostics?.launcher.geometry).toBe('ready');
    expect(fixture.activations()).toBe(1);
  });
}

test('GNOME nullable closing actors do not prevent exact own-PID observation or read foreign metadata', () => {
  const launcher = syntheticWindow(101, 'io.github.ianwijma.Linuxcast');
  const foreign = syntheticWindow(303, 'synthetic-private-canary'); foreign.forbidMetadata = true;
  const fixture = hookFixture('gnome', [launcher, foreign], { nullActors: true });
  const row = fixture.observe();
  requireNativeTarget(row.launcher, 'gnome-wayland');
  expect(row.launcher.count).toBe(1); expect(foreign.identityReads).toBe(0); expect(foreign.geometryReads).toBe(0);
  fixture.removeWindow(101);
  expect(fixture.observe().launcher.count).toBe(0);
  expect(foreign.identityReads).toBe(0); expect(foreign.geometryReads).toBe(0);
});

for (const stage of ['enumerate', 'launcher', 'decoy', 'activation', 'publish'] as const) test(`GNOME ${stage} failure exports only a fixed failure after a validated request`, () => {
  const launcher = syntheticWindow(101, 'io.github.ianwijma.Linuxcast');
  const decoy = syntheticWindow(202, 'io.github.ianwijma.Linuxcast.S001Decoy');
  if (stage === 'launcher') launcher.failGeometry = true;
  if (stage === 'decoy') decoy.failGeometry = true;
  const fixture = hookFixture('gnome', [launcher, decoy], stage === 'launcher' || stage === 'decoy' ? {} : { failStage: stage });
  const reply = fixture.reply(true);
  expect(parseHookFailureReply(reply, 1)).toEqual({ request: 1, hookFailure: { stage, outcome: 'native-read-failed' } });
  expect(() => parseObservation(reply, 1)).toThrow();
  expect(JSON.stringify(reply)).not.toContain('synthetic-private-exception-canary');
  if (stage !== 'publish') expect(fixture.activations()).toBe(0);
  const attempts = fixture.activationAttempts();
  expect(fixture.repeatRequest()).toBeUndefined();
  expect(fixture.activationAttempts()).toBe(attempts);
});

test('GNOME cannot repeat activation when both normal and failure publications fail', () => {
  const fixture = hookFixture('gnome', [syntheticWindow(101, 'io.github.ianwijma.Linuxcast'), syntheticWindow(202, 'io.github.ianwijma.Linuxcast.S001Decoy')], { failAllPublication: true });
  expect(fixture.reply(true)).toBeUndefined(); expect(fixture.activationAttempts()).toBe(1);
  expect(fixture.repeatRequest()).toBeUndefined(); expect(fixture.activationAttempts()).toBe(1);
});

for (const contextOverride of [{ pid: 303, decoyPid: 303 }, { pid: 'synthetic-private-canary' }, { extra: 'synthetic-private-canary' }, { request: 1001 }]) test('GNOME invalid context emits no native observation or failure reply', () => {
  const foreign = syntheticWindow(303, 'synthetic-private-canary'); foreign.forbidMetadata = true;
  const fixture = hookFixture('gnome', [foreign], { contextOverride, failStage: 'enumerate' });
  expect(fixture.reply()).toBeUndefined(); expect(foreign.identityReads).toBe(0); expect(foreign.geometryReads).toBe(0);
});

test('hook failure matching and trace retain the last safe observation while rejecting private or stale fields', () => {
  const trace = new NativeTrace();
  const row = { request: 1, launcher: native(), decoy: native(), decoyActivationIssued: false };
  trace.begin('initial-native-launch'); trace.reply(row, 1); trace.predicate(true); trace.begin('after-close-native-hidden');
  const failure = { request: 2, hookFailure: { stage: 'launcher', outcome: 'native-read-failed' } };
  expect(trace.reply(failure, 2)).toBeUndefined(); trace.predicate(true);
  expect(trace.snapshot()).toEqual({ phase: 'after-close-native-hidden', state: 'hook-failed', lastObservation: { phase: 'initial-native-launch', native: row }, hookFailure: failure });
  for (const value of [{ ...failure, private: 'synthetic-private-canary' }, { ...failure, request: 1 },
    { ...failure, hookFailure: { ...failure.hookFailure, private: 'synthetic-private-canary' } },
    { ...failure, hookFailure: { stage: { toString: () => 'launcher' }, outcome: 'native-read-failed' } },
    { ...failure, hookFailure: { stage: 'launcher', outcome: 'synthetic-private-canary' } }]) {
    expect(() => parseHookFailureReply(value, 2)).toThrow();
    expect(trace.reply(value, 2)).toBeUndefined();
    expect(trace.snapshot()?.state).toBe('reply-rejected'); expect(trace.snapshot()?.lastObservation?.native.request).toBe(1);
    expect(JSON.stringify(trace.snapshot())).not.toContain('synthetic-private-canary');
  }
  expect(() => parseNativeDiagnostic({ phase: 'after-close-native-hidden', state: 'hook-failed' })).toThrow();
  expect(() => parseNativeDiagnostic({ phase: 'after-close-native-hidden', state: 'parsed', hookFailure: failure })).toThrow();
});

test('native trace distinguishes no reply, rejected reply and an unmet predicate without losing safe evidence', () => {
  const trace = new NativeTrace();
  trace.begin('initial-native-launch');
  expect(trace.snapshot()).toEqual({ phase: 'initial-native-launch', state: 'request-written' });
  const row = { request: 1, launcher: native(), decoy: native(), decoyActivationIssued: false };
  expect(trace.reply(row, 1)).toBeDefined(); trace.predicate(false);
  expect(trace.snapshot()?.state).toBe('predicate-unmet');
  trace.begin('decoy-native-ready');
  expect(trace.reply({ ...row, request: 2, private: 'synthetic-private-canary' }, 2)).toBeUndefined();
  const state = trace.snapshot();
  expect(state?.state).toBe('reply-rejected'); expect(state?.lastObservation?.native.request).toBe(1);
  expect(JSON.stringify(state)).not.toContain('synthetic-private-canary');
  expect(() => parseNativeDiagnostic({ ...state, private: 'synthetic-private-canary' })).toThrow();
  expect(() => parseNativeDiagnostic({ ...state, lastObservation: { phase: 'initial-native-launch', native: { ...row, launcher: { ...native(), private: 'synthetic-private-canary' } } } })).toThrow();
});

test('native diagnostics reject nested private fields, object-valued enums and inconsistent readiness', () => {
  const own = syntheticWindow(101, 'io.github.ianwijma.Linuxcast');
  const row = hookFixture('kwin', [own]).observe();
  const probe = row.diagnostics!.launcher;
  expect(() => parseObservation({ ...row, diagnostics: { ...row.diagnostics, launcher: { ...probe, private: 'synthetic-private-canary' } } }, row.request)).toThrow();
  expect(() => parseObservation({ ...row, diagnostics: { ...row.diagnostics, launcher: { ...probe, geometry: { private: 'synthetic-private-canary', toString: () => 'ready' } } } }, row.request)).toThrow();
  expect(() => parseObservation({ ...row, diagnostics: { ...row.diagnostics, launcher: { ...probe, pidMatch: 'none' } } }, row.request)).toThrow();
  expect(() => parseObservation({ ...row, diagnostics: { ...row.diagnostics, launcher: { ...probe, geometry: 'not-ready' } } }, row.request)).toThrow();
  expect(() => parseObservation({ ...row, request: Infinity }, Infinity)).toThrow('NATIVE_REQUEST');
});

test('offline build records the actual launcher and retained cleanup implementation hashes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'linuxcast-s001-matrix-build-'));
  try {
    const output = await buildNativeSession(directory);
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
    for (const name of ['../../src/main.ts', 'supervision.py', 'gnome-extension.js', 'kwin-script.js']) {
      expect(manifest.sourceSha256[name]).toBe(createHash('sha256').update(readFileSync(source(name))).digest('hex'));
    }
    expect(JSON.parse(readFileSync(join(output, 'metadata.json'), 'utf8'))['shell-version']).toEqual(['48']);
    const verifier = "import pathlib,runpy,sys;sys.path.insert(0,sys.argv[1]);runpy.run_path(sys.argv[1]+'/run-session.py',run_name='preparation_import')['verify_build'](pathlib.Path(sys.argv[2]))";
    const verify = () => spawnSync('/usr/bin/python3', ['-c', verifier, dirname(source('run-session.py')), output], { stdio: 'ignore', timeout: 5000 }).status;
    expect(verify()).toBe(0);
    writeFileSync(join(output, 'extension.js'), 'void 0;');
    expect(verify()).not.toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('preflight rejects changed renderer entrypoint and static HTML in a disposable copied tree', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'linuxcast-s001-source-tamper-'));
  try {
    const original = await buildNativeSession(join(directory, 'original-build'));
    const manifest = JSON.parse(readFileSync(join(original, 'manifest.json'), 'utf8'));
    const copied = join(directory, 'repo/spikes/launcher/tests/native-session');
    for (const name of [...Object.keys(manifest.sourceSha256), '../../../../docs/design/tokens.json', '../../resources/io.github.ianwijma.Linuxcast.desktop']) {
      const destination = join(copied, name); mkdirSync(dirname(destination), { recursive: true }); copyFileSync(source(name), destination);
    }
    const output = await buildNativeSession(join(directory, 'copied-build'), copied);
    const program = "import pathlib,runpy,sys;sys.path.insert(0,sys.argv[1]);runpy.run_path(sys.argv[1]+'/run-session.py',run_name='preparation_import')['verify_build'](pathlib.Path(sys.argv[2]),pathlib.Path(sys.argv[3]))";
    const verify = () => spawnSync('/usr/bin/python3', ['-c', program, dirname(source('run-session.py')), output, copied], { stdio: 'ignore', timeout: 5000 }).status;
    expect(verify()).toBe(0);
    for (const name of ['../../src/renderer/main.tsx', '../../resources/index.html']) {
      const path = join(copied, name), content = readFileSync(path);
      writeFileSync(path, Buffer.concat([content, Buffer.from('\n<!-- public synthetic tamper -->\n')]));
      expect(verify()).not.toBe(0);
      writeFileSync(path, content); expect(verify()).toBe(0);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

for (const scenario of ['valid', 'real-private-bus', 'platform-denied', 'external-home', 'external-config', 'external-data', 'external-cache', 'external-runtime',
  'combined-escape', 'dconf', 'fallback-bus', 'abstract-bus', 'outside-bus', 'non-socket-bus', 'invalid-guid', 'schema-override', 'loader-override', 'unknown-env', 'outside-pwd',
  'symlink-config', 'shared-config', 'inherited-display']) test(`private entry guard ${scenario} before any settings or display calls`, () => {
  const child = spawnSync('/usr/bin/python3', [source('guard-canary.py'), scenario], { encoding: 'utf8', timeout: 5000 });
  expect(child.status).toBe(0);
  const value = JSON.parse(child.stdout.trim().split('\n').at(-1)!);
  expect(value.nativeCalls).toBe(0);
  if (scenario === 'valid' || scenario === 'real-private-bus') expect(value.validPrivateContext).toBe(true);
  else expect(value.rejectedBeforeNative).toBe(true);
  if (scenario === 'real-private-bus') expect(value.wrapperPwdValidated).toBe(true);
});

for (const scenario of ['valid-consumer', 'valid-consumer-zero', 'valid-consumer-capped', 'consumer-private', 'consumer-outcome-private', 'consumer-request-bool',
  'consumer-count-bool', 'consumer-count-over', 'consumer-count-negative', 'consumer-count-fraction', 'consumer-count-nan', 'consumer-sum', 'consumer-poll-cap', 'consumer-flag-type',
  'consumer-outcome-type', 'consumer-outcome-bool', 'consumer-elapsed-cap', 'consumer-elapsed-nan', 'consumer-elapsed-inf', 'consumer-elapsed-over', 'valid-incomplete', 'valid-complete', 'unknown-top-level', 'nested-private-canary', 'forged-physical', 'unknown-stage', 'invalid-runtime',
  'manifest-extra', 'manifest-source-extra', 'manifest-hash-private', 'native-extra', 'missing-success-observations', 'forged-native-backend',
  'valid-diagnostic', 'valid-zero-geometry', 'valid-startup', 'startup-extra', 'startup-nested-private', 'startup-unknown-marker', 'startup-state-type', 'startup-request-private', 'startup-request-bound', 'valid-hook-failed', 'hook-extra', 'hook-nested-private', 'hook-stage-private', 'hook-outcome-private', 'hook-stale', 'hook-missing', 'hook-wrong-state', 'hook-forged-success', 'hook-kwin', 'diagnostic-extra', 'diagnostic-last-private', 'diagnostic-state-private', 'diagnostic-role-private', 'diagnostic-inconsistent', 'forged-success-not-ready']) test(`strict artifact boundary ${scenario}`, () => {
  const child = spawnSync('/usr/bin/python3', [source('artifact-canary.py'), scenario], { encoding: 'utf8', timeout: 5000 });
  expect(child.status).toBe(0);
  const value = JSON.parse(child.stdout);
  if (scenario.startsWith('valid-')) expect(value.strictFixtureAccepted).toBe(true);
  else { expect(value.rejectedBeforePublication).toBe(true); expect(value.publishedFiles).toBe(0); }
});

for (const cancellation of ['SIGTERM', 'SIGINT'] as const) test(`private owner ${cancellation} reaps detached descendants without any display`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'linuxcast-s001-matrix-cancel-'));
  const child = spawn('/usr/bin/python3', [source('supervision-canary.py'), 'outer', root], { env: { PATH: process.env.PATH }, stdio: 'ignore' });
  const close = new Promise<number | null>(resolve => child.once('close', resolve));
  try {
    await expect.poll(() => existsSync(join(root, 'ready')), { timeout: 3000 }).toBe(true);
    const descendants = JSON.parse(readFileSync(join(root, 'pids.json'), 'utf8')) as number[];
    expect(descendants).toHaveLength(2);
    child.kill(cancellation);
    expect(await close).toBe(0);
    for (const pid of descendants) expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await close; }
    rmSync(root, { recursive: true, force: true });
  }
}, 6000);

for (const scenario of ['parser', 'prevalidation-parser', 'drain', 'typed-info', 'schema', 'lifecycle-schema', 'lifecycle-eof-running', 'lifecycle-exited-pipe-held', 'query-deadline', 'gio-call', 'runner-order', 'runner-deadline', 'readiness-schema',
  'runner-ready-delayed', 'runner-ready-missing-accepted', 'runner-ready-missing-poll', 'runner-ready-missing-tick', 'runner-ready-all-missing', 'runner-ready-no-transport',
  'runner-ready-rejected', 'runner-ready-disabled', 'runner-ready-query-deadline', 'runner-ready-exit', 'runner-ready-late-exit', 'runner-ready-late-disabled',
  'runner-ready-last-boundary-deadline', 'runner-ready-kwin-unchanged']) test(`fixed observer startup ${scenario} has no desktop or private output`, () => {
  const result = spawnSync('/usr/bin/python3', [source('startup-fixture.py'), scenario], { encoding: 'utf8', timeout: 5000 });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim().split('\n').at(-1)).toBe(`startup-${scenario}-passed`);
});

test('GNOME startup literals distinguish module, rejected enable and polling before any context exists', () => {
  const denied = hookFixture('gnome', [], { rejectedContext: true }); denied.tick();
  expect(denied.checkpoints()).toEqual(['MODULE_ENTERED', 'ENABLE_ENTERED', 'PRIVATE_CONTEXT_REJECTED'].map(v => `LINUXCAST_S001_OBSERVER:${v}`));
  expect(denied.fileReads()).toBe(0); expect(denied.nativeEnumerations()).toBe(0);
  const ready = hookFixture('gnome', [], { contextMissing: true }); ready.tick(); ready.tick();
  expect(ready.checkpoints()).toEqual(['MODULE_ENTERED', 'ENABLE_ENTERED', 'PRIVATE_CONTEXT_ACCEPTED', 'POLL_INSTALLED', 'FIRST_POLL_TICK', 'CONTEXT_NOT_OBSERVED'].map(v => `LINUXCAST_S001_OBSERVER:${v}`));
  expect(ready.fileReads()).toBe(0); expect(ready.nativeEnumerations()).toBe(0);
  ready.disable(); expect(ready.checkpoints().at(-1)).toBe('LINUXCAST_S001_OBSERVER:DISABLED');
});

test('GNOME operational markers contain only a validated serial and fixed publication result', () => {
  const fixture = hookFixture('gnome', [syntheticWindow(101, 'io.github.ianwijma.Linuxcast')]); fixture.observe();
  expect(fixture.checkpoints().slice(-2)).toEqual(['LINUXCAST_S001_OBSERVER:REQUEST_VALIDATED:1', 'LINUXCAST_S001_OBSERVER:REPLY_PUBLISHED:1']);
  const invalid = hookFixture('gnome', [], { contextOverride: { pid: 'synthetic-private-canary' } }); invalid.reply();
  expect(invalid.checkpoints().some(v => v.includes('REQUEST_VALIDATED'))).toBe(false);
  expect(invalid.checkpoints().join()).not.toContain('synthetic-private-canary');
});

test('typed startup artifacts reject private fields, overbounds and unsupported state types', () => {
  const snapshot = { checkpoints: ['PRIVATE_CONTEXT_REJECTED'], requests: [], extensionInfo: { status: 'INFO_AVAILABLE', state: 1, enabled: true } };
  expect(parseObserverStartup({ latest: snapshot })).toEqual({ latest: snapshot });
  for (const value of [{ latest: { ...snapshot, private: 'synthetic-private-canary' } },
    { latest: { ...snapshot, extensionInfo: { ...snapshot.extensionInfo, error: 'synthetic-private-canary' } } },
    { latest: { ...snapshot, extensionInfo: { ...snapshot.extensionInfo, state: '1' } } },
    { latest: { ...snapshot, extensionInfo: { ...snapshot.extensionInfo, state: NaN } } },
    { latest: { ...snapshot, requests: Array.from({ length: 17 }, () => ({ event: 'REQUEST_VALIDATED', request: 1 })) } }]) {
    expect(() => parseObserverStartup(value)).toThrow();
  }
});

test('typed lifecycle records distinguish own process state from independent pipe health', () => {
  const latest = { checkpoints: [], requests: [], extensionInfo: { status: 'INFO_UNAVAILABLE' } };
  const running = { compositor: { state: 'running', exitCode: null }, drain: { eofObserved: true, readerAlive: false, stopRequested: false } };
  for (const exitCode of [0, 255, -15, -64]) {
    const exited = { compositor: { state: 'exited', exitCode }, drain: { eofObserved: false, readerAlive: true, stopRequested: false } };
    const value = { latest, lifecycle: { beforeChecker: running, afterChecker: exited, finally: exited } };
    expect(parseObserverStartup(value)).toEqual(value);
  }
  expect(parseObserverStartup({ latest })).toEqual({ latest });
});

test('typed lifecycle rejects inconsistent state, missing final sample and nested private values', () => {
  const latest = { checkpoints: [], requests: [], extensionInfo: { status: 'INFO_UNAVAILABLE' } };
  const sample = { compositor: { state: 'exited', exitCode: 0 }, drain: { eofObserved: true, readerAlive: false, stopRequested: true } };
  for (const lifecycle of [{}, { finally: sample, private: 'synthetic-private-canary' },
    { finally: { ...sample, private: 'synthetic-private-canary' } },
    { finally: { ...sample, compositor: { ...sample.compositor, error: 'synthetic-private-canary' } } },
    { finally: { ...sample, compositor: { state: 'crashed', exitCode: -11 } } },
    { finally: { ...sample, compositor: { state: 'running', exitCode: 0 } } },
    { finally: { ...sample, drain: { ...sample.drain, private: 'synthetic-private-canary' } } },
    { finally: { ...sample, drain: { ...sample.drain, readerAlive: 'synthetic-private-canary' } } },
    ...[null, true, false, NaN, Infinity, -65, 256, 1.5, 'synthetic-private-canary'].map(exitCode => ({ finally: { ...sample, compositor: { state: 'exited', exitCode } } }))]) {
    expect(() => parseObserverStartup({ latest, lifecycle })).toThrow();
  }
});

const prevalidationCases: { name: string; marker: string; options: NonNullable<Parameters<typeof hookFixture>[2]>; reads: number; queries: number }[] = [
  { name: 'missing', marker: 'CONTEXT_NOT_OBSERVED', options: { contextMissing: true }, reads: 0, queries: 1 },
  { name: 'unqueryable', marker: 'CONTEXT_NOT_OBSERVED', options: { contextFailure: 'query' }, reads: 0, queries: 1 },
  { name: 'file-setup', marker: 'PREVALIDATION_FAILED', options: { contextFailure: 'file' }, reads: 0, queries: 0 },
  { name: 'read', marker: 'READ_FAILED', options: { contextFailure: 'read' }, reads: 1, queries: 1 },
  { name: 'oversize', marker: 'SIZE_REJECTED', options: { contextRaw: 'synthetic-private-canary'.repeat(300) }, reads: 1, queries: 1 },
  { name: 'decode', marker: 'DECODE_FAILED', options: { contextFailure: 'decode' }, reads: 1, queries: 1 },
  { name: 'JSON', marker: 'JSON_REJECTED', options: { contextRaw: '{synthetic-private-canary' }, reads: 1, queries: 1 },
  ...[null, [], 17, {}, { request: 1, private: 'synthetic-private-canary' }].map((contextValue, index) => ({ name: `shape-${index}`, marker: 'SCHEMA_REJECTED', options: { contextValue }, reads: 1, queries: 1 })),
  ...[{ pid: 0 }, { pid: 4194305 }, { pid: 'synthetic-private-canary' }, { decoyPid: 101 }, { operation: 'synthetic-private-canary' },
    { request: 0 }, { request: -1 }, { request: 1001 }, { request: 1.5 }, { request: 'synthetic-private-canary' }].map((contextOverride, index) => ({ name: `schema-${index}`, marker: 'SCHEMA_REJECTED', options: { contextOverride }, reads: 1, queries: 1 })),
];
for (const { name, marker, options, reads, queries } of prevalidationCases) test(`GNOME ${name} prevalidation emits one fixed category and no native work`, () => {
  const record = syntheticWindow(101, 'synthetic-private-canary'); record.forbidMetadata = true;
  const fixture = hookFixture('gnome', [record], options);
  expect(fixture.reply(true)).toBeUndefined(); expect(fixture.repeatRequest()).toBeUndefined();
  expect(fixture.checkpoints().filter(value => value === `LINUXCAST_S001_OBSERVER:${marker}`)).toHaveLength(1);
  expect(fixture.checkpoints().some(value => value.includes('REQUEST_VALIDATED:'))).toBe(false);
  expect(fixture.checkpoints().join()).not.toContain('synthetic-private');
  expect(fixture.fileReads()).toBe(reads * 2); expect(fixture.fileQueries()).toBe(queries * 2);
  expect(fixture.nativeEnumerations()).toBe(0); expect(fixture.activationAttempts()).toBe(0); expect(fixture.publicationCalls()).toBe(0);
  expect(record.identityReads).toBe(0); expect(record.geometryReads).toBe(0);
});

test('a consumed request is a deduplicated stale category without native replay', () => {
  const fixture = hookFixture('gnome', [syntheticWindow(202, 'io.github.ianwijma.Linuxcast.S001Decoy')]);
  fixture.observe(true);
  const before = [fixture.nativeEnumerations(), fixture.activationAttempts(), fixture.publicationCalls()];
  expect(fixture.repeatRequest()).toBeUndefined(); expect(fixture.repeatRequest()).toBeUndefined();
  expect([fixture.nativeEnumerations(), fixture.activationAttempts(), fixture.publicationCalls()]).toEqual(before);
  expect(fixture.checkpoints().filter(v => v === 'LINUXCAST_S001_OBSERVER:STALE_REQUEST')).toHaveLength(1);
});

test('prevalidation categories are capped at eight literals per enable, with no private values', () => {
  const options: NonNullable<Parameters<typeof hookFixture>[2]> = {};
  const fixture = hookFixture('gnome', [], options);
  for (const row of prevalidationCases) {
    for (const key of Object.keys(options)) delete options[key as keyof typeof options];
    Object.assign(options, row.options); fixture.reply(); fixture.repeatRequest();
  }
  for (const key of Object.keys(options)) delete options[key as keyof typeof options];
  fixture.observe(); fixture.repeatRequest(); fixture.repeatRequest();
  const categories = new Set(prevalidationCases.map(v => `LINUXCAST_S001_OBSERVER:${v.marker}`)); categories.add('LINUXCAST_S001_OBSERVER:STALE_REQUEST');
  const actual = fixture.checkpoints().filter(v => categories.has(v));
  expect(actual).toHaveLength(8); expect(new Set(actual).size).toBe(8);
  expect(actual.join()).not.toContain('synthetic-private');
  expect(parseObserverStartup({ latest: { checkpoints: actual.map(v => v.replace('LINUXCAST_S001_OBSERVER:', '')), requests: [], extensionInfo: { status: 'INFO_UNAVAILABLE' } } }).latest.checkpoints).toHaveLength(8);
});

// Run the exact diagnostic branch without importing Electron, touching the
// filesystem or driving a desktop. Every effect is recorded; failures propagate.
async function lifecycleBranchFixture(failAt?: string, nonzeroExit: 'ui' | 'hidden' | false = false, ownedUnavailable = false) {
  const text = readFileSync(source('check.ts'), 'utf8');
  const begin = text.indexOf('  const lifecycleOnly = async');
  const end = text.indexOf("  stage = 'first-launch';", begin);
  expect(begin).toBeGreaterThan(0); expect(end).toBeGreaterThan(begin);
  const program = stripTypeScriptTypes(`${text.slice(begin, end)}\nglobalThis.runDiagnostic = lifecycleOnly;`);
  const events: string[] = [], failure = new Error('SYNTHETIC_PRIVATE_FAILURE');
  const effect = (name: string) => { events.push(name); if (name === failAt) throw failure; };
  const report: Record<string, unknown> = {}, own = { ...native(), nativeBackend: 'x11' as const };
  if (ownedUnavailable) { own.geometry = null; own.workArea = null; }
  const empty: NativeWindow = { count: 0, identityMatches: false, nativeBackend: 'unsupported', focused: false, hidden: true, geometry: null, workArea: null };
  const child: { exitCode: number | null } = { exitCode: null };
  let count = 1, hidden = false;
  const page = {
    evaluate: async () => { effect('appearance-light'); return { ok: true }; },
    getByRole: (_role: string, options: { name: string; exact: boolean }) => ({ click: async () => {
      expect(options.exact).toBe(true); effect(`click:${options.name}`);
      if (options.name === 'Quit Linuxcast') child.exitCode = nonzeroExit === 'ui' ? 7 : 0;
    } }),
  };
  const app = { process: () => child, evaluate: async () => { effect('close'); hidden = true; } };
  const context = { stage: 'native-initial-identity', application: app as typeof app | undefined, pid: 101, main: '/fixed/main.cjs', backend: ownedUnavailable ? 'kwin-x11' : 'gnome-x11', report,
    expect, ownedRoute: ownedUnavailable, requireOwnedLifecycleTarget,
    requireNativeTarget: ownedUnavailable ? () => { throw new Error('PLACEMENT_ASSERTION_FORBIDDEN'); } : requireNativeTarget,
    contained: () => { if (ownedUnavailable) throw new Error('PLACEMENT_ASSERTION_FORBIDDEN'); return true; },
    process: { exitCode: undefined as number | undefined, kill: (pid: number, signal: number) => { expect([pid, signal]).toEqual([101, 0]); effect('process-live'); return true; } },
    capture: async (name: string, appearance: string, view: string) => { expect([name, appearance, view]).toEqual(['light-capabilities.png', 'light', 'capabilities']); effect('capture-light'); },
    waitForExit: async () => { effect('wait-exit'); },
    state: async () => { effect('state-hidden'); return { visible: !hidden }; },
    observed: async (phase: string, predicate: (value: Observation) => boolean) => {
      effect(`native:${phase}`);
      let launcher = phase === 'fresh-lifecycle-native-launch' ? own : empty;
      if (failAt === 'fresh-identity-mismatch' && phase === 'fresh-lifecycle-native-launch') launcher = { ...empty, count: 1 };
      if (failAt === 'fresh-backend-mismatch' && phase === 'fresh-lifecycle-native-launch') launcher = { ...own, nativeBackend: 'wayland' };
      if (failAt === 'close-still-visible' && phase === 'fresh-resident-native-hidden') launcher = own;
      const observation: Observation = { request: 1, launcher, decoy: empty, decoyActivationIssued: false };
      expect(predicate(observation)).toBe(true); return observation;
    },
    cli: async (main: string, command: string) => { expect([main, command]).toEqual(['/fixed/main.cjs', '--quit']); effect('cli-quit'); child.exitCode = nonzeroExit === 'hidden' ? 7 : 0; },
    launch: async () => { effect('launch'); count++; child.exitCode = null; hidden = false; context.application = app; return page; },
    // These operations are intentionally absent from the diagnostic branch.
    challenge: () => { throw new Error('DECOY_ACTIVATION_FORBIDDEN'); }, spawnSync: () => { throw new Error('CHORD_FORBIDDEN'); },
  };
  runInNewContext(program, context);
  let caught: unknown;
  try { await (context as unknown as { runDiagnostic: (page: unknown) => Promise<void> }).runDiagnostic(page); }
  catch (error) { caught = error; }
  return { events, report, count, context, caught, failure };
}

test('lifecycle-only exact production branch uses two launches and no Show, decoy challenge or chord', async () => {
  const fixture = await lifecycleBranchFixture();
  expect(fixture.caught).toBeUndefined(); expect(fixture.count).toBe(2);
  expect(fixture.events).toEqual(['appearance-light', 'click:Launcher capabilities', 'capture-light', 'click:Back to commands',
    'wait-exit', 'click:Quit Linuxcast', 'native:after-ui-quit-native-window-absent', 'launch', 'native:fresh-lifecycle-native-launch',
    'close', 'state-hidden', 'native:fresh-resident-native-hidden', 'process-live', 'wait-exit', 'cli-quit', 'native:after-hidden-cli-quit-native-window-absent']);
  expect(fixture.report).toMatchObject({ diagnosticOutcome: 'complete', status: 'incomplete', explicitUiQuitExited: true,
    closeRetainedResidentProcess: true, hiddenCliQuitExited: true, lifecycleProof: { launches: 2, darkSearchCaptured: true,
      lightCapabilitiesCaptured: true, uiQuitExitCode: 0, hiddenCliQuitExitCode: 0, closeProcessAlive: true } });
  expect(fixture.context.process.exitCode).toBe(3); expect(fixture.context.stage).toBe('complete');
  expect(fixture.context.application).toBeUndefined();
  for (const key of ['activationOutcome', 'ordinaryShowNativeFocused', 'singletonShowRetainedPid', 'shortcut', 'decoyActivationUsedForChallengeSetup']) expect(fixture.report).not.toHaveProperty(key);
});
for (const failAt of ['appearance-light', 'click:Launcher capabilities', 'capture-light', 'click:Back to commands', 'wait-exit', 'click:Quit Linuxcast',
  'native:after-ui-quit-native-window-absent', 'launch', 'native:fresh-lifecycle-native-launch', 'close', 'state-hidden', 'native:fresh-resident-native-hidden',
  'process-live', 'cli-quit', 'native:after-hidden-cli-quit-native-window-absent']) test(`lifecycle-only production branch stops immediately at ${failAt}`, async () => {
  const fixture = await lifecycleBranchFixture(failAt);
  expect(fixture.caught).toBe(fixture.failure);
  // Waiting for exit and clicking Quit are the existing single concurrent pair.
  if (failAt === 'wait-exit') expect(fixture.events.slice(-2)).toEqual(['wait-exit', 'click:Quit Linuxcast']);
  else expect(fixture.events.at(-1)).toBe(failAt);
  expect(fixture.report).not.toHaveProperty('lifecycleProof'); expect(fixture.report).not.toHaveProperty('diagnosticOutcome', 'complete');
});
test('nonzero UI Quit cannot complete lifecycle-only or start a second launcher', async () => {
  const fixture = await lifecycleBranchFixture(undefined, 'ui');
  expect(fixture.caught).toBeDefined(); expect(fixture.count).toBe(1); expect(fixture.report).not.toHaveProperty('lifecycleProof');
});


test('lifecycle selection accepts only fixed X11 diagnostics and historical missing full mode', () => {
  expect(parseProbeMode(undefined, 'gnome-wayland')).toBe('full');
  expect(parseProbeMode('full', 'kwin-wayland')).toBe('full');
  expect(parseProbeMode('lifecycle-only', 'gnome-x11')).toBe('lifecycle-only');
  for (const value of [null, true, 'shortcut-only', 'synthetic-private-canary', { private: 'synthetic-private-canary' }]) expect(() => parseProbeMode(value, 'gnome-x11')).toThrow();
  expect(() => parseProbeMode('lifecycle-only', 'gnome-wayland')).toThrow();
});
test('typed lifecycle metadata rejects forged completion, unknown skips and private proof fields', () => {
  const value = { probeMode: 'lifecycle-only', skippedChecks: ['ordinary-show-native-focus', 'actual-x11-global-shortcut'], diagnosticOutcome: 'failed' };
  expect(parseLifecycleDiagnostic(value, 'gnome-x11')).toEqual(value);
  const complete = { ...value, diagnosticOutcome: 'complete', lifecycleProof: { launches: 2, darkSearchCaptured: true, lightCapabilitiesCaptured: true, uiQuitExitCode: 0, hiddenCliQuitExitCode: 0, closeProcessAlive: true } };
  expect(parseLifecycleDiagnostic(complete, 'gnome-x11')).toEqual(complete);
  for (const row of [{ ...value, private: 'synthetic-private-canary' }, { ...value, diagnosticOutcome: 'complete' },
    { ...value, probeMode: 'full' }, { ...value, skippedChecks: [] }, { ...value, skippedChecks: ['actual-x11-global-shortcut', 'ordinary-show-native-focus'] },
    { ...complete, lifecycleProof: { ...complete.lifecycleProof, private: 'synthetic-private-canary' } },
    { ...complete, lifecycleProof: { ...complete.lifecycleProof, uiQuitExitCode: false } }, { ...complete, lifecycleProof: { ...complete.lifecycleProof, hiddenCliQuitExitCode: 1 } }]) {
    expect(() => parseLifecycleDiagnostic(row, 'gnome-x11')).toThrow();
  }
});

for (const scenario of ['valid-lifecycle-complete', 'valid-lifecycle-failed', 'valid-lifecycle-identity-failed', 'lifecycle-passed', 'lifecycle-missing-mode', 'lifecycle-wayland', 'lifecycle-unknown-mode',
  'lifecycle-extra', 'lifecycle-private-proof', 'lifecycle-no-proof', 'lifecycle-exit-bool', 'lifecycle-exit-nonzero', 'lifecycle-no-runtime', 'lifecycle-no-screenshot',
  'lifecycle-missing-observation', 'lifecycle-phase-reorder', 'lifecycle-cross-phase', 'lifecycle-forged-identity', 'lifecycle-outside-workarea', 'lifecycle-visible-close', 'lifecycle-nonabsent-quit',
  'lifecycle-trace-cross-phase', 'lifecycle-trace-hook', 'lifecycle-activation-issued', 'lifecycle-focus-claim', 'lifecycle-shortcut-claim', 'lifecycle-activation-claim',
  'lifecycle-skips-reordered', 'lifecycle-skips-extra', 'lifecycle-outcome-private', 'full-lifecycle-phase']) test(`lifecycle artifact mode boundary ${scenario}`, () => {
  const child = spawnSync('/usr/bin/python3', [source('artifact-canary.py'), scenario], { encoding: 'utf8', timeout: 5000 });
  expect(child.status, child.stderr).toBe(0);
  const result = JSON.parse(child.stdout);
  if (scenario.startsWith('valid-')) expect(result.strictFixtureAccepted).toBe(true);
  else expect(result).toMatchObject({ rejectedBeforePublication: true, publishedFiles: 0 });
});

test('nonzero hidden CLI Quit cannot complete the diagnostic after a successful UI Quit', async () => {
  const fixture = await lifecycleBranchFixture(undefined, 'hidden');
  expect(fixture.caught).toBeDefined(); expect(fixture.count).toBe(2); expect(fixture.report.explicitUiQuitExited).toBe(true);
  expect(fixture.report).not.toHaveProperty('lifecycleProof'); expect(fixture.events.at(-1)).toBe('cli-quit');
});
test('lifecycle-only Wayland mode fails before target or compositor actions', () => {
  const child = spawnSync('/usr/bin/python3', [source('run-session.py'), 'gnome-wayland', '--probe-mode', 'lifecycle-only'],
    { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 5000 });
  expect(child.status).toBe(3);
  expect(JSON.parse(child.stdout)).toEqual({ status: 'unavailable', reason: 'X11_DIAGNOSTIC_REQUIRED', physicalDesktopMatrixEstablished: false });
});

for (const failure of ['fresh-identity-mismatch', 'fresh-backend-mismatch', 'close-still-visible']) test(`strict native ${failure} remains terminal in the lifecycle branch`, async () => {
  const fixture = await lifecycleBranchFixture(failure);
  expect(fixture.caught).toBeDefined(); expect(fixture.report).not.toHaveProperty('lifecycleProof');
  expect(fixture.report).not.toHaveProperty('hiddenCliQuitExited'); expect(fixture.events).not.toContain('cli-quit');
});


for (const scenario of ['two-owned-candidates', 'two-owned-missing-frame', 'two-owned-missing-workarea', 'two-owned-missing-both', 'foreign-pid', 'class-mismatch', 'class-suffix', 'class-no-nul', 'class-extra-nul', 'class-private', 'class-nonbytes',
  'swapped-request', 'stale-generation', 'wrong-nonce', 'request-replay', 'extra-private', 'second-bind', 'boolean-generation', 'owner-dead', 'destroy-reuse',
  'identity-event', 'identity-restored', 'unmanaged', 'during-geometry-death', 'during-geometry-swap', 'bad-window-pid', 'bad-window-class', 'bad-window-watch',
  'bad-window-geometry', 'retired-absent', 'retired-reused', 'retired-stale-list', 'retired-live', 'retired-exit-bool', 'retired-identity-event', 'property-wrong-type',
  'property-wrong-format', 'property-oversize', 'property-short', 'property-tail', 'property-null', 'property-highbits', 'property-bool-count', 'property-long-stride',
  'lease-open-first', 'lease-race-replaced', 'lease-ancestry-failed', 'lease-initial-dead', 'lease-open-failed', 'property-free-on-reject', 'optional-absent', 'optional-atom-absent', 'optional-wrong-type', 'optional-wrong-format', 'optional-short', 'optional-nonzero-count', 'optional-tail', 'optional-pointer', 'atoms-optional-absent', 'atoms-identity-absent', 'event-destroy', 'event-foreign', 'event-identity', 'event-input', 'event-overflow', 'geometry-valid', 'geometry-hidden', 'geometry-extents', 'geometry-desktop-count', 'geometry-desktop-index', 'geometry-viewport', 'geometry-missing-frame', 'geometry-missing-workarea', 'geometry-missing-both', 'geometry-missing-strict', 'geometry-missing-both-zero-client',
  'geometry-workarea', 'geometry-active-highbits', 'geometry-foreign-root', 'geometry-override', 'geometry-map-state', 'geometry-bad-window', 'mask-and-abi', 'guard-before-library', 'pipe-eof', 'pipe-overflow', 'pipe-private-json', 'pipe-duplicate']) test(`passive owned X11 synthetic ${scenario}`, () => {
  const child = spawnSync('/usr/bin/python3', [source('owned-x11-fixture.py'), scenario], { encoding: 'utf8', timeout: 5000, env: { PATH: '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' } });
  expect(child.status, child.stderr).toBe(0); expect(child.stdout.trim()).toBe(`owned-${scenario}-passed`);
});

test('owned Linux handle ABI checks every byte and rejects high/protocol bits without truncation', () => {
  const hex = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes.toString('hex'); };
  for (const value of [1, 123, 0x1fffffff]) expect(parseOwnedX11Handle(hex(value), 'linux', 'x64', 'LE')).toBe(value);
  for (const value of ['', '00'.repeat(3), '00'.repeat(5), '7b00000000000000', hex(0), hex(0x20000000), hex(0xffffffff), 'synthetic-private']) {
    expect(() => parseOwnedX11Handle(value, 'linux', 'x64', 'LE')).toThrow();
  }
  for (const [platform, arch, endian] of [['darwin', 'x64', 'LE'], ['linux', 'arm64', 'LE'], ['linux', 'x64', 'BE']]) expect(() => parseOwnedX11Handle(hex(123), platform, arch, endian)).toThrow();
});
test('owned public scope is exact target and never exports private IDs or arbitrary failure data', () => {
  const value = { ...OWNED_X11_KIND, bindingObserved: false };
  expect(parseOwnedX11Provenance(value)).toEqual(value);
  for (const changed of [{ ...value, xid: 123 }, { ...value, pid: 101 }, { ...value, generation: 1 }, { ...value, nonce: 'synthetic-private' },
    { ...value, bindingObserved: 1 }, { ...value, countScope: 'all-pid-windows' }, { ...value, geometryKind: 'client-assumed-frame' }]) expect(() => parseOwnedX11Provenance(changed)).toThrow();
});

function ownedProductionHelpers() {
  const text = readFileSync(source('check.ts'), 'utf8');
  const begin = text.indexOf('class OwnedX11Failed'), end = text.indexOf('let ownedPage:', begin);
  const code = stripTypeScriptTypes(`${text.slice(begin, end)}\nglobalThis.fixtureCapture = captureOwnedWindow; globalThis.fixtureBudget = ownedBudget; globalThis.fixtureChannel = OwnedChannel;`)
    .replaceAll('import.meta.url', JSON.stringify(new URL('check.ts', import.meta.url).href));
  return code;
}
async function ownedCaptureFixture(change?: 'destroyed' | 'url' | 'pid' | 'renderer' | 'preferences' | 'highbits' | 'width' | 'dead' | 'expired' | 'identity' | 'session' | 'state-denied') {
  const calls: string[] = [], deadline = performance.now() + (change === 'expired' ? -1 : 1000);
  const bytes = Buffer.alloc(change === 'width' ? 8 : 4); bytes.writeUInt32LE(change === 'highbits' ? 0x2000007b : 123);
  const child = { pid: 101, exitCode: change === 'dead' ? 0 : null, signalCode: null };
  const page = { url: () => 'linuxcast://launcher/index.html', evaluate: async (callback: () => unknown) => { calls.push('renderer'); return callback(); } };
  const window = { isDestroyed: () => change === 'destroyed', getNativeWindowHandle: () => { calls.push('handle'); return bytes; },
    webContents: { isDestroyed: () => false, getURL: () => change === 'url' ? 'private-canary://denied' : page.url(),
      getLastWebPreferences: () => ({ sandbox: change !== 'preferences', contextIsolation: true, nodeIntegration: false, webSecurity: true }) } };
  const handle = { evaluate: async (callback: (win: typeof window) => unknown) => { calls.push('window'); return callback(window); }, dispose: async () => { calls.push('dispose'); } };
  const app = { process: () => child, browserWindow: async (requested: typeof page) => { expect(requested).toBe(page); calls.push('page-association'); return handle; },
    evaluate: async () => ({ pid: change === 'pid' ? 999 : 101, electron: '45.0.0', chrome: '156.0.8078.48', platform: 'linux', arch: 'x64', ozone: 'x11', noSandbox: false }) };
  const context = { expect, Buffer, setTimeout, clearTimeout, performance, parseOwnedX11Handle, endianness: () => 'LE', OWNED_X11_FAILURES,
    APP_URL: page.url(), window: { linuxcast: { runtime: { sandboxed: change !== 'renderer', contextIsolated: true }, getState: async () => ({ ok: change !== 'state-denied',
      value: { identity: change === 'identity' ? 'synthetic-private-canary' : 'io.github.ianwijma.Linuxcast', session: change === 'session' ? 'wayland' : 'x11' } }) } },
    spawn: () => { throw new Error('NO_CHANNEL_IN_CAPTURE'); }, fileURLToPath, URL, process: { env: {} } };
  runInNewContext(ownedProductionHelpers(), context);
  let result: unknown, error: unknown;
  try { result = await (context as unknown as { fixtureCapture: (app: unknown, page: unknown, deadline: number) => Promise<unknown> }).fixtureCapture(app, page, deadline); }
  catch (caught) { error = caught; }
  return { result, error, calls };
}
test('actual production capture uses only the validated page-associated BrowserWindow', async () => {
  const value = await ownedCaptureFixture(); expect(value.error).toBeUndefined();
  expect(value.result).toMatchObject({ pid: 101, xid: 123, handle: '7b000000', runtime: { sandbox: true, nodeIntegration: false } });
  expect(value.calls).toEqual(['page-association', 'window', 'handle', 'renderer', 'dispose']);
});
for (const change of ['destroyed', 'url', 'pid', 'renderer', 'preferences', 'highbits', 'width', 'dead', 'expired', 'identity', 'session', 'state-denied'] as const) test(`actual page capture rejects ${change} before native observer work`, async () => {
  const value = await ownedCaptureFixture(change); expect(value.error).toBeDefined(); expect(value.result).toBeUndefined();
  if (change === 'dead' || change === 'expired') expect(value.calls).toEqual([]);
});

async function ownedSampleFixture(swap: 'none' | 'before' | 'after' | 'private' = 'none') {
  const text = readFileSync(source('check.ts'), 'utf8');
  const begin = text.indexOf('const observeOwned = async'), end = text.indexOf('const observe = async', begin);
  const failed = class extends Error { readonly kind: string; constructor(kind: string) { super('OWNED_FAILED'); this.kind = kind; } };
  const app = { process: () => ({ pid: 101, exitCode: null, signalCode: null }) };
  const own = { ...native(), nativeBackend: 'x11' as const }, empty: NativeWindow = { count: 0, identityMatches: false, nativeBackend: 'unsupported', focused: false, hidden: true, geometry: null, workArea: null };
  let captures = 0, sends = 0, aborts = 0;
  const report: Record<string, unknown> = {}, trace = new NativeTrace();
  const context = { performance, nativeTrace: trace, application: app, ownedPage: {}, ownedGeneration: 1,
    ownedBinding: { app, pid: 101, xid: 123, handle: '7b000000', generation: 1, nonce: 'a'.repeat(64) },
    ownedChannel: { send: async () => { sends++; return { request: 1, launcher: own, decoy: empty, decoyActivationIssued: false, ...(swap === 'private' ? { private: 'synthetic-private-canary' } : {}) }; }, abort: () => { aborts++; } },
    captureOwnedWindow: async () => { captures++; const changed = swap === 'before' && captures === 1 || swap === 'after' && captures === 2;
      return { pid: 101, xid: changed ? 124 : 123, handle: changed ? '7c000000' : '7b000000', runtime: { sandbox: true } }; },
    OwnedX11Failed: failed, report, pid: 0, parseObservation, OWNED_X11_KIND,
  };
  const program = stripTypeScriptTypes(`${text.slice(begin, end)}\nglobalThis.fixtureSample = observeOwned;`);runInNewContext(program, context);
  let error: unknown;
  try { await (context as unknown as { fixtureSample: (serial: number, phase: string) => Promise<unknown> }).fixtureSample(1, 'initial-native-launch'); } catch (caught) { error = caught; }
  return { sends, aborts, report, trace: trace.snapshot(), error };
}
test('actual immutable primary binding rejects an auxiliary XID before helper/geometry calls', async () => {
  const value = await ownedSampleFixture('before'); expect(value.error).toBeDefined(); expect(value.sends).toBe(0); expect(value.aborts).toBe(1);
  expect(value.trace).toEqual({ phase: 'initial-native-launch', state: 'request-written' }); expect(JSON.stringify(value.report)).not.toContain('7c0000');
});
test('post-query page swap cannot publish sampled geometry as accepted evidence', async () => {
  const value = await ownedSampleFixture('after'); expect(value.error).toBeDefined(); expect(value.sends).toBe(1);
  expect(value.trace).toEqual({ phase: 'initial-native-launch', state: 'request-written' });
});
test('private helper fields cannot reach trace or public report', async () => {
  const value = await ownedSampleFixture('private'); expect(value.error).toBeDefined(); expect(value.trace?.lastObservation).toBeUndefined();
  expect(JSON.stringify(value.report)).not.toContain('synthetic-private');
});
test('exact target sample accepts its known primary alongside other same-PID windows without a PID fallback', async () => {
  const value = await ownedSampleFixture(); expect(value.error).toBeUndefined(); expect(value.sends).toBe(1);
  expect(value.trace?.state).toBe('parsed'); expect(value.report.ownedTargetObserver).toEqual({ ...OWNED_X11_KIND, bindingObserved: true });
});

for (const scenario of ['valid-owned-complete', 'owned-complete-unbound', 'owned-complete-failure', 'owned-complete-decoy', 'owned-complete-missing-phase', 'valid-owned-failed', 'valid-owned-failure', 'owned-extra', 'owned-private', 'owned-pid-count', 'owned-kind', 'owned-bound-bool',
  'owned-no-provenance', 'owned-failure-private', 'owned-failure-unknown', 'owned-wrong-route', 'owned-full-route']) test(`public exact-target provenance ${scenario}`, () => {
  const child = spawnSync('/usr/bin/python3', [source('artifact-canary.py'), scenario], { encoding: 'utf8', timeout: 5000 });
  expect(child.status, child.stderr).toBe(0); const result = JSON.parse(child.stdout);
  if (scenario.startsWith('valid-')) expect(result.strictFixtureAccepted).toBe(true);
  else expect(result).toMatchObject({ rejectedBeforePublication: true, publishedFiles: 0 });
});

async function ownedChannelFixture(parts: string[], expired = false) {
  class Child extends EventEmitter {
    exitCode: number | null = null; signalCode: string | null = null;
    stdout = new EventEmitter(); stdin = new EventEmitter() as EventEmitter & { write: (value: string, done: (error?: Error) => void) => void };
    killed = false;
    constructor() { super(); this.stdin.write = (value, done) => { expect(JSON.parse(value)).toEqual({ command: 'synthetic' }); done();
      queueMicrotask(() => { for (const part of parts) this.stdout.emit('data', Buffer.from(part)); }); }; }
    kill() { this.killed = true; this.signalCode = 'SIGKILL'; queueMicrotask(() => this.emit('close', null)); return true; }
  }
  const child = new Child(); let spawns = 0;
  const context = { expect, Buffer, setTimeout, clearTimeout, performance, parseOwnedX11Handle, OWNED_X11_FAILURES, APP_URL: 'linuxcast://launcher/index.html',
    endianness: () => 'LE', process: { env: { PATH: '/usr/bin:/bin' } }, URL, fileURLToPath,
    spawn: (executable: string, arguments_: string[], options: { stdio: string[] }) => {
      spawns++; expect(executable).toBe('/usr/bin/python3'); expect(arguments_).toEqual([source('owned-x11.py'), '--kwin-x11-lifecycle-only']); expect(options.stdio).toEqual(['pipe', 'pipe', 'ignore']); return child;
    } };
  runInNewContext(ownedProductionHelpers(), context);
  const channel = new (context as unknown as { fixtureChannel: new () => { send: (packet: unknown, deadline: number) => Promise<unknown>; abort: () => void } }).fixtureChannel();
  let value: unknown, error: unknown;
  try { value = await channel.send({ command: 'synthetic' }, performance.now() + (expired ? -1 : 50)); } catch (caught) { error = caught; }
  channel.abort(); return { value, error, child, spawns };
}
test('actual private channel handles split bounded JSON and has no shell or inherited stderr log', async () => {
  const value = await ownedChannelFixture(['{"bound":', 'true}\n']); expect(value.error).toBeUndefined(); expect(value.value).toEqual({ bound: true }); expect(value.spawns).toBe(1);
});
for (const [label, parts] of [['oversize', ['x'.repeat(8193)]], ['extra-line', ['{}\n{}\n']], ['malformed', ['{private\n']],
  ['private-failure', ['{"failure":{"private":"canary"}}\n']], ['unknown-failure', ['{"failure":"private-canary"}\n']], ['native-failure', ['{"failure":"identity"}\n']]] as const) test(`private channel ${label} is terminal and bounded`, async () => {
  const value = await ownedChannelFixture([...parts]); expect(value.error).toBeDefined(); expect(value.value).toBeUndefined(); expect(value.child.killed).toBe(true);
});
test('expired private channel budget does not wait for or accept a later reply', async () => {
  const value = await ownedChannelFixture([], true); expect(value.error).toBeDefined(); expect(value.child.killed).toBe(true);
});

for (const outcome of ['zero', 'nonzero', 'signal', 'running'] as const) test(`retired primary uses retained child after dispatcher disposal: ${outcome}`, async () => {
  const text = readFileSync(source('check.ts'), 'utf8');
  const begin = text.indexOf('const observeOwned = async'), end = text.indexOf('const observe = async', begin);
  const calls: string[] = [];
  const child = { exitCode: outcome === 'running' ? null : outcome === 'nonzero' ? 1 : 0, signalCode: outcome === 'signal' ? 'SIGTERM' : null };
  const app = { process: () => { throw new Error('DISPOSED_DISPATCHER'); } };
  const empty: NativeWindow = { count: 0, identityMatches: false, nativeBackend: 'unsupported', focused: false, hidden: true, geometry: null, workArea: null };
  const failed = class extends Error { readonly kind: string; constructor(kind: string) { super('OWNED_FAILED'); this.kind = kind; } };
  const trace = new NativeTrace();
  const context = { expect, performance, nativeTrace: trace, application: app, ownedPage: {},
    ownedBinding: { app, child, pid: 101, xid: 123, handle: '7b000000', generation: 1, nonce: 'a'.repeat(64) },
    ownedChannel: {
      send: async (packet: { command: string; exitCode?: number }) => {
        calls.push(packet.command);
        if (packet.command === 'retire') { expect(packet.exitCode).toBe(0); return { retired: true }; }
        expect(packet.command).toBe('observe'); return { request: 1, launcher: empty, decoy: empty, decoyActivationIssued: false };
      },
      close: async () => { calls.push('close'); }, abort: () => { calls.push('abort'); },
    },
    captureOwnedWindow: () => { throw new Error('RETIRED_CAPTURE_FORBIDDEN'); },
    OwnedX11Failed: failed, report: {}, pid: 0, parseObservation, OWNED_X11_KIND, ownedGeneration: 1,
  };
  runInNewContext(stripTypeScriptTypes(`${text.slice(begin, end)}\nglobalThis.retiredSample = observeOwned;`), context);
  const run = (context as unknown as { retiredSample: (serial: number, phase: string) => Promise<unknown> }).retiredSample;
  if (outcome === 'zero') {
    await expect(run(1, 'after-ui-quit-native-window-absent')).resolves.toMatchObject({ launcher: { count: 0 } });
    expect(calls).toEqual(['retire', 'observe', 'close']); expect(trace.snapshot()?.state).toBe('parsed');
  } else {
    await expect(run(1, 'after-ui-quit-native-window-absent')).rejects.toMatchObject({ kind: 'lifetime' });
    expect(calls).toEqual(['abort']); expect(trace.snapshot()?.lastObservation).toBeUndefined();
  }
});

for (const outcome of ['already-exited', 'live-close', 'close-rejected'] as const) test(`final cleanup uses retained child after dispatcher disposal: ${outcome}`, async () => {
  const text = readFileSync(source('check.ts'), 'utf8');
  const begin = text.lastIndexOf('\nfinally {') + '\nfinally {'.length;
  const body = text.slice(begin, text.lastIndexOf('}'));
  const calls: string[] = [];
  const child = { exitCode: outcome === 'already-exited' ? 0 : null, kill: (signal: string) => { expect(signal).toBe('SIGKILL'); calls.push('kill'); } };
  const app = { process: () => { throw new Error('DISPOSED_DISPATCHER'); }, close: async () => { calls.push('close'); if (outcome === 'close-rejected') throw new Error('DISPOSED_DISPATCHER'); } };
  const context = { application: app, applicationChild: child, decoy: undefined, ownedChannel: { abort: () => { calls.push('abort'); } },
    report: {} as Record<string, unknown>, ownedRoute: false, probeMode: 'lifecycle-only', process: { exitCode: 3 }, profile: '/synthetic/profile', root: '/synthetic', stage: 'explicit-ui-quit',
    nativeTrace: { snapshot: () => undefined }, consumerTrace: { snapshot: () => undefined },
    rmSync: () => { calls.push('remove-profile'); }, writeFileSync: () => { calls.push('write-report'); }, join,
  };
  runInNewContext(stripTypeScriptTypes(`globalThis.cleanup = async () => {${body}};`), context);
  await (context as unknown as { cleanup: () => Promise<void> }).cleanup();
  expect(calls).toEqual(['abort', ...(outcome === 'already-exited' ? [] : ['close']), ...(outcome === 'close-rejected' ? ['kill'] : []), 'remove-profile', 'write-report']);
  expect(context.report.stage).toBe('explicit-ui-quit');
  if (outcome === 'close-rejected') expect(context.report).toMatchObject({ status: 'cleanup-incomplete', diagnosticOutcome: 'failed' });
});

test('owned lifecycle branch completes residency and Quit with unavailable rectangles and no placement assertion', async () => {
  const fixture = await lifecycleBranchFixture(undefined, false, true);
  expect(fixture.caught).toBeUndefined(); expect(fixture.count).toBe(2);
  expect(fixture.report).toMatchObject({ closeRetainedResidentProcess: true, explicitUiQuitExited: true, hiddenCliQuitExited: true, diagnosticOutcome: 'complete', status: 'incomplete' });
  expect(fixture.context.process.exitCode).toBe(3); expect(fixture.report).not.toHaveProperty('initialPlacementInsideWorkArea');
});
for (const failure of ['fresh-identity-mismatch', 'fresh-backend-mismatch', 'close-still-visible']) test(`owned geometry unavailability cannot bypass ${failure}`, async () => {
  const fixture = await lifecycleBranchFixture(failure, false, true);
  expect(fixture.caught).toBeDefined(); expect(fixture.report).not.toHaveProperty('lifecycleProof');
  expect(fixture.report).not.toHaveProperty('hiddenCliQuitExited'); expect(fixture.events).not.toContain('cli-quit');
});
test('only the scoped owned lifecycle gate accepts missing geometry; full placement gate stays strict', () => {
  const own = { ...native(), nativeBackend: 'x11' as const, geometry: null, workArea: null };
  requireOwnedLifecycleTarget(own);
  expect(() => requireNativeTarget(own, 'kwin-x11')).toThrow('OWN_NATIVE_IDENTITY_REQUIRED');
  for (const value of [{ ...own, count: 0 }, { ...own, count: 2 }, { ...own, identityMatches: false }, { ...own, hidden: true }, { ...own, nativeBackend: 'wayland' as const }]) {
    expect(() => requireOwnedLifecycleTarget(value)).toThrow();
  }
});
test('geometry capability summary reflects only recorded known X11 observations without inventing rectangles', () => {
  const own = { ...native(), nativeBackend: 'x11' as const };
  const unavailable = { ...own, geometry: null, workArea: null };
  expect(ownedGeometryCapabilities([])).toBeUndefined();
  expect(ownedGeometryCapabilities([{ ...unavailable, identityMatches: false }])).toBeUndefined();
  expect(ownedGeometryCapabilities([own])).toEqual({ frame: 'available', workArea: 'available' });
  expect(ownedGeometryCapabilities([own, unavailable])).toEqual({ frame: 'unavailable', workArea: 'unavailable' });
  expect(ownedGeometryCapabilities([{ ...own, geometry: null }])).toEqual({ frame: 'unavailable', workArea: 'available' });
  expect(ownedGeometryCapabilities([{ ...own, workArea: null }])).toEqual({ frame: 'available', workArea: 'unavailable' });
});
test('owned capability metadata is fixed and rejects coercion, private fields and unbound claims', () => {
  const value = { ...OWNED_X11_KIND, bindingObserved: true, geometryCapabilities: { frame: 'unavailable', workArea: 'available' } };
  expect(parseOwnedX11Provenance(value)).toEqual(value);
  const trap = { toString: () => { throw new Error('PRIVATE_COERCION_FORBIDDEN'); } };
  for (const geometryCapabilities of [null, {}, { ...value.geometryCapabilities, private: 'synthetic-private-canary' },
    { frame: trap, workArea: 'available' }, { frame: true, workArea: 'available' }, { frame: 'missing', workArea: 'available' }]) {
    expect(() => parseOwnedX11Provenance({ ...value, geometryCapabilities })).toThrow();
  }
  expect(() => parseOwnedX11Provenance({ ...value, bindingObserved: false })).toThrow();
});
for (const scenario of ['valid-owned-cap-complete', 'valid-owned-cap-frame', 'valid-owned-cap-workarea', 'valid-owned-cap-available',
  'owned-cap-no-metadata', 'owned-cap-lie-available', 'owned-cap-lie-unavailable', 'owned-cap-private', 'owned-cap-type', 'owned-cap-placement',
  'owned-cap-unbound', 'owned-cap-wrong-route', 'owned-cap-full', 'owned-cap-hidden-initial', 'owned-cap-visible-close', 'owned-cap-live-quit', 'owned-cap-zero-rect']) test(`public lifecycle capability ${scenario}`, () => {
  const child = spawnSync('/usr/bin/python3', [source('artifact-canary.py'), scenario], { encoding: 'utf8', timeout: 5000 });
  expect(child.status, child.stderr).toBe(0); const result = JSON.parse(child.stdout);
  if (scenario.startsWith('valid-')) expect(result.strictFixtureAccepted).toBe(true);
  else expect(result).toMatchObject({ rejectedBeforePublication: true, publishedFiles: 0 });
});
