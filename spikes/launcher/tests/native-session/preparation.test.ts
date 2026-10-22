import { expect, test } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { buildNativeSession } from './build.ts';
import { CONSUMER_OUTCOMES, ConsumerTrace, parseConsumerRead, NativeTrace, parseNativeDiagnostic, parseObservation, parseHookFailureReply, parseObserverStartup, requireNativeTarget } from './protocol.ts';
import type { ConsumerOutcome, NativeWindow, Observation } from './protocol.ts';
import { hookFixture, syntheticWindow } from './observation-fixtures.ts';
const source = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const native = (): NativeWindow => ({ count: 1, identityMatches: true, nativeBackend: 'wayland', focused: false, hidden: false,
  geometry: { x: 32, y: 32, width: 720, height: 560 }, workArea: { x: 0, y: 0, width: 1280, height: 900 } });

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
    request: 1, pid: 101, decoy: { pid: 202 }, root: '/synthetic', join,
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

for (const scenario of ['parser', 'prevalidation-parser', 'drain', 'typed-info', 'schema', 'lifecycle-schema', 'lifecycle-eof-running', 'lifecycle-exited-pipe-held', 'query-deadline', 'gio-call', 'runner-order', 'runner-deadline']) test(`fixed observer startup ${scenario} has no desktop or private output`, () => {
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
