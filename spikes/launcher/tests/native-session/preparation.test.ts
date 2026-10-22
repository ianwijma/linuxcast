import { expect, test } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildNativeSession } from './build.ts';
import { NativeTrace, parseNativeDiagnostic, parseObservation, requireNativeTarget } from './protocol.ts';
import type { NativeWindow } from './protocol.ts';
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

for (const scenario of ['valid-incomplete', 'valid-complete', 'unknown-top-level', 'nested-private-canary', 'forged-physical', 'unknown-stage', 'invalid-runtime',
  'manifest-extra', 'manifest-source-extra', 'manifest-hash-private', 'native-extra', 'missing-success-observations', 'forged-native-backend',
  'valid-diagnostic', 'valid-zero-geometry', 'diagnostic-extra', 'diagnostic-last-private', 'diagnostic-state-private', 'diagnostic-role-private', 'diagnostic-inconsistent', 'forged-success-not-ready']) test(`strict artifact boundary ${scenario}`, () => {
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
