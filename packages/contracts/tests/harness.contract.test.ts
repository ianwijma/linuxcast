import { expect, it } from 'vitest';
import * as z from 'zod';
import { ContractError, createBrokerHarnessRequest, parseContract, harnessEventSchema, harnessSessionSchema, harnessStatusSchema, harnessOperationSchema, parseHarnessEvent } from '../src/index.ts';
const identity = { runtimeId: 'synthetic-harness', runtimeVersion: '1.0.0', modelId: 'synthetic-model', accountRef: 'synthetic-account',
  billingSource: 'subscription', credentialOwner: 'harness' };
const input = () => ({ schemaVersion: 1, instructions: 'Synthetic instructions', messages: [{ role: 'user', parts: [{ type: 'text', text: 'Synthetic request' }] }],
  context: [], workingDirectory: { kind: 'file', grantId: 'synthetic-directory-grant', entryId: 'synthetic-directory', displayName: 'Synthetic' },
  offeredToolIds: ['synthetic-tool'], scopeRefs: ['synthetic-scope'], limits: { timeoutMs: 10000, toolSteps: 2, outputBytes: 1024 } });
it('copies explicit harness content and broker-owned runtime/account/billing identity', () => {
  const submitted = input(); const request = createBrokerHarnessRequest(submitted, { runId: 'synthetic-run', identity });
  submitted.messages[0]!.parts[0]!.text = 'changed';
  expect(request.messages[0]!.parts[0]).toHaveProperty('text', 'Synthetic request');
  expect(request.identity).toEqual(identity); expect(Object.isFrozen(request.identity)).toBe(true);
});
it.each([{ identity }, { runId: 'forged' }, { apiKey: 'synthetic-private-canary' }, { fallback: 'ordinary-ai' },
  { workingDirectory: '/synthetic-arbitrary-path' }, { schemaVersion: 2 }])('rejects caller authority, credentials, paths or unsupported versions %#', patch => {
  expect(() => createBrokerHarnessRequest({ ...input(), ...patch }, { runId: 'synthetic-run', identity })).toThrow(ContractError);
});
it.each(['missing-executable', 'unsupported-version', 'authentication-required', 'account-mismatch', 'quota', 'child-crash', 'lost-session'])('keeps actionable %s status distinct', state => {
  expect(parseContract(harnessStatusSchema, { schemaVersion: 1, runtimeId: identity.runtimeId, state, reasonCode: 'synthetic', remediationAction: 'harness.settings' })).toHaveProperty('state', state);
});
it('requires explicit steering/resume capability and matching runtime identity', () => {
  const status = { schemaVersion: 1, runtimeId: identity.runtimeId, state: 'ready', identity,
    capabilities: { resume: false, steering: false, cancellation: 'local-only' } };
  expect(parseContract(harnessStatusSchema, status)).toEqual(status);
  expect(() => parseContract(harnessStatusSchema, { ...status, runtimeId: 'different' })).toThrow(ContractError);
  expect(() => parseContract(harnessStatusSchema, { ...status, capabilities: { resume: false } })).toThrow(ContractError);
});
it('lost sessions cannot claim reconnect/resume availability', () => {
  const session = { schemaVersion: 1, sessionId: 'synthetic-session', identity, runId: 'synthetic-run', turnId: 'synthetic-turn', state: 'lost', reconnectable: false, resumable: false };
  expect(parseContract(harnessSessionSchema, session)).toEqual(session);
  expect(() => parseContract(harnessSessionSchema, { ...session, resumable: true })).toThrow(ContractError);
});
it('keeps tool approval pending and cancellation distinct from completed terminal', () => {
  const event = { schemaVersion: 1, sessionId: 'synthetic-session', runId: 'synthetic-run', turnId: 'synthetic-turn', sequence: 1 };
  expect(parseContract(harnessEventSchema, { ...event, kind: 'tool-approval-required', terminal: false, callId: 'synthetic-call', toolId: 'synthetic-tool', arguments: {}, scopeRefs: [] })).toHaveProperty('terminal', false);
  expect(parseContract(harnessEventSchema, { ...event, kind: 'cancelled', terminal: true })).toHaveProperty('kind', 'cancelled');
  expect(() => parseContract(harnessEventSchema, { ...event, kind: 'cancelled', terminal: false })).toThrow(ContractError);
  expect(() => parseContract(harnessEventSchema, { ...event, kind: 'completed', terminal: true, retry: true })).toThrow(ContractError);
});

it('uses explicit typed inspect/start/resume/turn/cancel operations', () => {
  const reference = { schemaVersion: 1, sessionId: 'synthetic-session', identity };
  for (const operation of [{ method: 'inspect', runtimeId: identity.runtimeId }, { method: 'start', submission: input() },
    { method: 'resume', reference }, { method: 'turn', reference, submission: input() }, { method: 'cancel', reference }]) {
    expect(parseContract(harnessOperationSchema, { schemaVersion: 1, ...operation })).toHaveProperty('method', operation.method);
  }
  expect(() => parseContract(harnessOperationSchema, { schemaVersion: 1, method: 'execute-shell', command: 'synthetic' })).toThrow(ContractError);
});
it('validates complete harness tool arguments with the host registry before requesting approval', () => {
  const event = { schemaVersion: 1, sessionId: 'synthetic-session', runId: 'synthetic-run', turnId: 'synthetic-turn', sequence: 1,
    kind: 'tool-approval-required', terminal: false, callId: 'synthetic-call', toolId: 'synthetic-tool', arguments: {}, scopeRefs: [] };
  const registry = new Map([['synthetic-tool', z.strictObject({ query: z.string().default('synthetic') })]]);
  expect(parseHarnessEvent(event, registry)).toHaveProperty('arguments.query', 'synthetic');
  expect(() => parseHarnessEvent(event, new Map())).toThrow(ContractError);
  expect(() => parseHarnessEvent({ ...event, arguments: { execute: 'synthetic' } }, registry)).toThrow(ContractError);
});
