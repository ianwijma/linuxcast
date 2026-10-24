import { expect, test } from 'vitest';
import * as z from 'zod';
import { ContractError, parseContract } from '../src/protocol.ts';
import { createExtensionSessionStart, extensionInvocationSchema, extensionSecretHandleSchema, parseExtensionSessionTerminal } from '../src/extension-session.ts';
import type { ExtensionCommandContract } from '../src/extension-session.ts';
const context = () => ({ protocolVersion: 1, sessionId: 'session-synthetic', connectionId: 'connection-synthetic', generation: 1,
  package: { kind: 'extension', id: 'org.linuxcast.synthetic', version: '1.0.0', integrity: 'a'.repeat(64) }, capabilityGeneration: 2,
  capabilities: [{ id: 'launcher.activate', generation: 2, state: 'component-required', backend: null, remediationAction: 'open-setup' }] });
const invocation = () => ({ commandId: 'search', arguments: { query: 'synthetic', credential: { kind: 'secret-handle', handleId: 'opaque-synthetic' } }, preferences: {} });
const commands = () => new Map<string, ExtensionCommandContract>([['search', { mode: 'view',
  arguments: z.strictObject({ query: z.string(), credential: extensionSecretHandleSchema }), preferences: z.strictObject({ limit: z.number().default(10) }) }]]);
const start = () => createExtensionSessionStart(invocation(), context(), commands());
const terminal = () => {
  const { protocolVersion, sessionId, connectionId, generation, package: pkg, commandId } = start();
  return { protocolVersion, sessionId, connectionId, generation, package: pkg, commandId, terminal: true, outcome: 'completed' };
};
test('host creates pinned launch identity with normalized validated nonsecret settings', () => {
  const result = start();
  expect(result.preferences).toEqual({ limit: 10 });
  expect(result.mode).toBe('view');
  expect(result.capabilities[0]!.state).toBe('component-required');
  expect(result.arguments).toMatchObject({ credential: { kind: 'secret-handle' } });
});
test.each(['sessionId', 'connectionId', 'generation', 'package', 'mode', 'capabilities', 'grants'])('caller cannot choose %s authority', key => {
  expect(() => createExtensionSessionStart({ ...invocation(), [key]: 'untrusted' }, context(), commands())).toThrow(ContractError);
});
test('launch rejects unknown command, plaintext credential and unrecognized settings', () => {
  expect(() => createExtensionSessionStart({ ...invocation(), commandId: 'unknown' }, context(), commands())).toThrow(ContractError);
  expect(() => createExtensionSessionStart({ ...invocation(), arguments: { query: 'synthetic', credential: 'synthetic-disallowed' } }, context(), commands())).toThrow(ContractError);
  expect(() => createExtensionSessionStart({ ...invocation(), preferences: { execute: 'synthetic-disallowed' } }, context(), commands())).toThrow(ContractError);
});
test('normalization cannot introduce non-JSON runtime values or oversize launch records', () => {
  const registry = commands(); registry.set('search', { mode: 'view', arguments: z.unknown().transform(() => ({ value: new Date() })), preferences: z.strictObject({}) });
  expect(() => createExtensionSessionStart(invocation(), context(), registry)).toThrow(ContractError);
  expect(() => parseContract(extensionInvocationSchema, { ...invocation(), arguments: { text: 'x'.repeat(1024 * 1024) } })).toThrow(ContractError);
});
test('capability snapshot rejects duplicate and mismatched generations', () => {
  const ctx = context();
  expect(() => createExtensionSessionStart(invocation(), { ...ctx, capabilities: [...ctx.capabilities, ...ctx.capabilities] }, commands())).toThrow(ContractError);
  expect(() => createExtensionSessionStart(invocation(), { ...ctx, capabilityGeneration: 3 }, commands())).toThrow(ContractError);
});
test('a terminal binds exact session, connection generation, command and immutable package', () => {
  const session = start(); const done = terminal();
  expect(parseExtensionSessionTerminal(done, session).outcome).toBe('completed');
  for (const patch of [{ sessionId: 'other' }, { connectionId: 'other' }, { generation: 2 }, { commandId: 'other' },
    { package: { ...session.package, version: '1.1.0' } }, { package: { ...session.package, integrity: 'b'.repeat(64) } }, { protocolVersion: 2 }]) {
    expect(() => parseExtensionSessionTerminal({ ...done, ...patch }, session)).toThrow(ContractError);
  }
});
test('lost connection retains unknown effect and cannot request replay or success', () => {
  const session = start();
  const lost = { ...terminal(), outcome: 'interrupted', effectOutcome: 'unknown', automaticReplay: false, reason: 'transport-lost', remediationAction: 'review-command' };
  expect(parseExtensionSessionTerminal(lost, session).outcome).toBe('interrupted');
  for (const patch of [{ automaticReplay: true }, { effectOutcome: 'not-applied' }, { outcome: 'completed' }]) {
    expect(() => parseExtensionSessionTerminal({ ...lost, ...patch }, session)).toThrow(ContractError);
  }
});
test('cancelled and failed terminals are distinct and cloned session inputs cannot drift', () => {
  const ctx = context(); const input = invocation(); const session = createExtensionSessionStart(input, ctx, commands());
  ctx.package.integrity = 'b'.repeat(64); input.arguments.query = 'changed';
  expect(session.package.integrity).toBe('a'.repeat(64)); expect(session.arguments).toMatchObject({ query: 'synthetic' });
  const cancelled = { ...terminal(), outcome: 'cancelled', error: { code: 'cancelled', message: 'Cancelled.', retryable: false } };
  expect(parseExtensionSessionTerminal(cancelled, session).outcome).toBe('cancelled');
  expect(() => parseExtensionSessionTerminal({ ...cancelled, outcome: 'failed' }, session)).toThrow(ContractError);
});
test('identity-preserving validators and normalized nested defaults cannot retain caller references', () => {
  const input = { commandId: 'search', arguments: { nested: { query: 'synthetic' }, values: [1] }, preferences: { nested: { limit: 10 } } };
  const registry = new Map<string, ExtensionCommandContract>([['search', { mode: 'view', arguments: z.custom(() => true), preferences: z.custom(() => true) }]]);
  const unchanged = createExtensionSessionStart(input, context(), registry);
  const sharedDefault = { values: ['synthetic-default'] };
  registry.set('search', { mode: 'view', arguments: z.custom(() => true), preferences: z.unknown().transform(() => ({ defaulted: sharedDefault, submitted: input.preferences })) });
  const normalized = createExtensionSessionStart(input, context(), registry);
  input.arguments.nested.query = 'changed'; input.arguments.values.push(2); input.preferences.nested.limit = 20;
  sharedDefault.values.push('changed');
  expect(unchanged.arguments).toEqual({ nested: { query: 'synthetic' }, values: [1] });
  expect(unchanged.preferences).toEqual({ nested: { limit: 10 } });
  expect(normalized.preferences).toEqual({ defaulted: { values: ['synthetic-default'] }, submitted: { nested: { limit: 10 } } });
});
