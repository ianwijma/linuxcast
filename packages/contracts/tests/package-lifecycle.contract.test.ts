import { expect, test } from 'vitest';
import { ContractError, parseContract } from '../src/protocol.ts';
import { packageIntegritySchema, packageLifecycleRequestSchema, parsePackageIntegrity,
  parsePackageLifecycleRequest, parsePackageLifecycleResult, samePackageVersion } from '../src/package-lifecycle.ts';
import type { PackageVersion, PackageLifecycleRegistry } from '../src/package-lifecycle.ts';
const old: PackageVersion = { kind: 'extension', id: 'org.linuxcast.synthetic', version: '1.0.0', integrity: 'a'.repeat(64) };
const next: PackageVersion = { ...old, version: '1.1.0', integrity: 'b'.repeat(64) };
const common = { protocolVersion: 1, operationId: 'synthetic-operation', packageId: old.id };
const update = () => ({ ...common, operation: 'update', expectedActive: old, stagedPackageRef: 'stage-synthetic' });
const registry = (): PackageLifecycleRegistry => ({ active: new Map([[old.id, old]]), staged: new Map([['stage-synthetic', next]]), retained: [old] });
const file = { path: 'extension.json', bytes: 128, sha256: 'c'.repeat(64) };
const integrity = () => ({ schemaVersion: 1, algorithm: 'sha256', files: [file] });
const inventory = () => new Map([[file.path, { bytes: file.bytes, sha256: file.sha256 }]]);
const activated = () => ({ ...common, terminal: true, outcome: 'activated', activeVersion: next, previousVersion: old, automaticTriggersEnabled: false, newAutomaticTriggersEnabled: false });
test('integrity covers the exact trusted staged regular-file inventory', () => {
  expect(parsePackageIntegrity(integrity(), inventory()).files).toEqual([file]);
  for (const files of [new Map(), new Map([...inventory(), ['extra.js', { bytes: 1, sha256: file.sha256 }]]),
    new Map([[file.path, { bytes: 129, sha256: file.sha256 }]]), new Map([[file.path, { bytes: 128, sha256: 'd'.repeat(64) }]])]) {
    expect(() => parsePackageIntegrity(integrity(), files)).toThrow(ContractError);
  }
});
test('integrity rejects duplicates, traversal, self-hashes and unbounded records', () => {
  for (const files of [[file, file], [{ ...file, path: '../outside' }], [{ ...file, path: 'integrity.json' }],
    [{ ...file, bytes: 200 * 1024 * 1024 + 1 }], [{ ...file, bytes: 101 * 1024 * 1024 }, { ...file, path: 'second', bytes: 101 * 1024 * 1024 }],
    Array.from({ length: 10000 }, (_, n) => ({ ...file, path: `f${n}` }))]) {
    expect(() => parseContract(packageIntegritySchema, { ...integrity(), files })).toThrow(ContractError);
  }
  expect(() => parseContract(packageIntegritySchema, { ...integrity(), schemaVersion: 2 })).toThrow(ContractError);
});
test('legal package integrity metadata can exceed the RPC frame limit', () => {
  const files = Array.from({ length: 9999 }, (_, n) => ({ ...file, path: `dist/modules/module-${n}.js`, bytes: 1 }));
  const record = { ...integrity(), files };
  expect(new TextEncoder().encode(JSON.stringify(record)).byteLength).toBeGreaterThan(1024 * 1024);
  expect(parsePackageIntegrity(record, new Map(files.map(item => [item.path, item]))).files).toHaveLength(9999);
});
test('update binds active identity, version and integrity separately', () => {
  expect(parsePackageLifecycleRequest(update(), registry())).toMatchObject({ operation: 'update' });
  for (const expectedActive of [{ ...old, integrity: next.integrity }, { ...old, version: '0.9.0' }, { ...old, kind: 'workflow' }, null]) {
    expect(() => parsePackageLifecycleRequest({ ...update(), expectedActive }, registry())).toThrow(ContractError);
  }
  expect(samePackageVersion(old, { ...old, integrity: next.integrity })).toBe(false);
});
test('install requires no currently active version and a known staged candidate', () => {
  const request = { ...common, operation: 'install', expectedActive: null, stagedPackageRef: 'stage-synthetic' };
  expect(() => parsePackageLifecycleRequest(request, registry())).toThrow(ContractError);
  const context = registry(); context.active = new Map();
  expect(parsePackageLifecycleRequest(request, context).operation).toBe('install');
  expect(() => parsePackageLifecycleRequest({ ...request, stagedPackageRef: 'unknown' }, context)).toThrow(ContractError);
});
test('staged candidate cannot substitute another package or package kind', () => {
  for (const candidate of [{ ...next, id: 'org.linuxcast.other' }, { ...next, kind: 'workflow' as const }]) {
    const context = registry(); context.staged = new Map([['stage-synthetic', candidate]]);
    expect(() => parsePackageLifecycleRequest(update(), context)).toThrow(ContractError);
  }
});
test('rollback only names a retained immutable identity', () => {
  const context = registry(); context.active = new Map([[old.id, next]]);
  const request = { ...common, operation: 'rollback', expectedActive: next, targetVersion: old };
  expect(parsePackageLifecycleRequest(request, context).operation).toBe('rollback');
  expect(() => parsePackageLifecycleRequest({ ...request, targetVersion: { ...old, integrity: next.integrity } }, context)).toThrow(ContractError);
});
test('activation result cannot report another operation, target or previous version', () => {
  const request = parsePackageLifecycleRequest(update(), registry());
  expect(parsePackageLifecycleResult(activated(), request, next).outcome).toBe('activated');
  for (const patch of [{ operationId: 'other' }, { activeVersion: old }, { previousVersion: next }, { newAutomaticTriggersEnabled: true }]) {
    expect(() => parsePackageLifecycleResult({ ...activated(), ...patch }, request, next)).toThrow(ContractError);
  }
  expect(() => parsePackageLifecycleResult(activated(), request, null)).toThrow(ContractError);
});
test('only previously configured automatic bindings can be resumed after reviewed updates', () => {
  const updateRequest = parsePackageLifecycleRequest(update(), registry());
  expect(parsePackageLifecycleResult({ ...activated(), automaticTriggersEnabled: true }, updateRequest, next).outcome).toBe('activated');
  const context = registry(); context.active = new Map();
  const install = parsePackageLifecycleRequest({ ...common, operation: 'install', stagedPackageRef: 'stage-synthetic', expectedActive: null }, context);
  const initial = { ...activated(), previousVersion: null };
  expect(parsePackageLifecycleResult(initial, install, next).outcome).toBe('activated');
  expect(() => parsePackageLifecycleResult({ ...initial, automaticTriggersEnabled: true }, install, next)).toThrow(ContractError);
});
test('uninstall defaults to retained data and requires explicit completed teardown', () => {
  const request = parsePackageLifecycleRequest({ ...common, operation: 'uninstall', expectedActive: old, credentialHandling: 'revoke' }, registry());
  const result = { ...common, terminal: true, outcome: 'uninstalled', activeVersion: null, dataDisposition: 'retained',
    credentialHandling: 'revoke', processes: 'exited', registrations: 'removed', capabilities: 'revoked' };
  expect(parsePackageLifecycleResult(result, request, null).outcome).toBe('uninstalled');
  for (const patch of [{ dataDisposition: 'deleted' }, { processes: 'running' }, { capabilities: 'active' }, { credentialHandling: 'remove' }]) {
    expect(() => parsePackageLifecycleResult({ ...result, ...patch }, request, null)).toThrow(ContractError);
  }
  const deleting = parsePackageLifecycleRequest({ ...request, deleteData: true }, registry());
  expect(parsePackageLifecycleResult({ ...result, dataDisposition: 'deleted' }, deleting, null).outcome).toBe('uninstalled');
  expect(() => parsePackageLifecycleResult(activated(), request, next)).toThrow(ContractError);
});
test('failure/restoration is distinct from uncertain interrupted activation and never replays automatically', () => {
  const request = parsePackageLifecycleRequest(update(), registry());
  const failure = { ...common, terminal: true, outcome: 'failed', error: { code: 'internal', message: 'Activation failed.', retryable: false },
    activeVersion: old, recovery: 'restored', automaticRetry: false };
  expect(parsePackageLifecycleResult(failure, request, next).outcome).toBe('failed');
  expect(() => parsePackageLifecycleResult({ ...failure, activeVersion: next }, request, next)).toThrow(ContractError);
  expect(parsePackageLifecycleResult({ ...failure, activeVersion: null, recovery: 'review-required' }, request, next)).toMatchObject({ recovery: 'review-required' });
  expect(() => parsePackageLifecycleResult({ ...failure, automaticRetry: true }, request, next)).toThrow(ContractError);
  const cancelled = { ...failure, outcome: 'cancelled', error: { code: 'cancelled', message: 'Cancelled.', retryable: false } };
  expect(parsePackageLifecycleResult(cancelled, request, next).outcome).toBe('cancelled');
  expect(() => parsePackageLifecycleResult({ ...cancelled, error: failure.error }, request, next)).toThrow(ContractError);
});
test('disable keeps installed identity/data but cannot complete while code or grants remain active', () => {
  const request = parsePackageLifecycleRequest({ ...common, operation: 'disable', expectedActive: old }, registry());
  const result = { ...common, terminal: true, outcome: 'disabled', activeVersion: old, processes: 'exited', registrations: 'removed',
    capabilities: 'revoked', automaticTriggersEnabled: false, dataDisposition: 'retained' };
  expect(parsePackageLifecycleResult(result, request, null).outcome).toBe('disabled');
  for (const patch of [{ activeVersion: next }, { processes: 'running' }, { dataDisposition: 'deleted' }, { automaticTriggersEnabled: true }]) {
    expect(() => parsePackageLifecycleResult({ ...result, ...patch }, request, null)).toThrow(ContractError);
  }
  expect(() => parsePackageLifecycleResult(result, parsePackageLifecycleRequest(update(), registry()), next)).toThrow(ContractError);
  expect(() => parsePackageLifecycleResult(activated(), request, next)).toThrow(ContractError);
});
test('requests cannot grant themselves permissions or execute migration hooks', () => {
  for (const field of ['grants', 'scripts', 'migrate', 'sandbox', 'credentials']) {
    expect(() => parseContract(packageLifecycleRequestSchema, { ...update(), [field]: 'untrusted' })).toThrow(ContractError);
  }
});
