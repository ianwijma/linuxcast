import { expect, it } from 'vitest';
import { ContractError, parseContract, workflowBindingSchema, workflowEnvelopeSchema,
  workflowErrorSchema, workflowNodeResultSchema, workflowRunStateSchema, workflowValueSchema } from '../src/index.ts';
const envelope = () => ({ args: ['synthetic', null, { kind: 'file', grantId: 'synthetic-grant', entryId: 'synthetic-entry', displayName: 'Synthetic' }],
  vars: { synthetic: 1 }, context: { runId: 'synthetic-run', workflowId: 'org.linuxcast.synthetic', workflowVersion: '1.0.0',
    triggerNodeId: 'synthetic-trigger', invocationTime: '2026-10-23T00:00:00Z', locale: 'en-AU', timezone: 'Australia/Sydney', callChain: [] } });
it('preserves typed values, null and opaque references without granting access', () => {
  expect(parseContract(workflowEnvelopeSchema, envelope())).toEqual(envelope());
  expect(parseContract(workflowNodeResultSchema, { outputs: [{ port: 'out', envelope: envelope() }] })).toHaveProperty('outputs.0.port', 'out');
});
it.each([{ literal: { ref: 'ordinary-data' } }, { literal: null }, { ref: 'input#/0' }, { ref: 'vars#/a~1b/~0name' },
  { ref: 'context#' }, { template: '{{vars.name}}: {{{{literal}}}}' }, { template: 'Synthetic plain text' }])('accepts explicit binding %#', value => {
  expect(parseContract(workflowBindingSchema, value)).toEqual(value);
});
it.each([{ ref: 'implicit' }, { ref: 'unknown#/0' }, { ref: 'vars#/bad~2escape' }, { ref: 'vars#not-pointer' },
  { literal: null, ref: 'vars#/synthetic' }, { template: '{{vars.name' }, { template: 'synthetic}}' },
  { template: '{{vars.name + 1}}' }, { template: '{{vars..name}}' }, { template: '{{process.exit()}}' }])('rejects ambiguous/executable/malformed bindings %#', value => {
  expect(() => parseContract(workflowBindingSchema, value)).toThrow(ContractError);
});
it.each(['__proto__', 'constructor', 'prototype'])('rejects nested workflow prototype key %s', key => {
  const value = JSON.parse(`{"nested":{"${key}":"synthetic"}}`);
  expect(() => parseContract(workflowValueSchema, value)).toThrow(ContractError);
  expect(() => parseContract(workflowEnvelopeSchema, { ...envelope(), vars: value })).toThrow(ContractError);
  expect(() => parseContract(workflowEnvelopeSchema, { ...envelope(), vars: JSON.parse(`{"${key}":"synthetic"}`) })).toThrow(ContractError);
});
it('rejects non-JSON values and array/value/envelope size excess without truncation', () => {
  for (const value of [Infinity, new Date(), () => 1, Array(10001).fill(null), 'é'.repeat(524288)]) {
    expect(() => parseContract(workflowValueSchema, value)).toThrow(ContractError);
  }
  expect(parseContract(workflowValueSchema, Array(10000).fill(null))).toHaveLength(10000);
  expect(() => parseContract(workflowEnvelopeSchema, { ...envelope(), args: ['x'.repeat(600000), 'y'.repeat(600000)] })).toThrow(ContractError);
});
it('rejects invented authority, invalid context, and excessive call depth', () => {
  for (const context of [{ ...envelope().context, principal: 'builtin' }, { ...envelope().context, invocationTime: 'yesterday' },
    { ...envelope().context, callChain: Array(17).fill('synthetic') }, { ...envelope().context, queryRevision: -1 }]) {
    expect(() => parseContract(workflowEnvelopeSchema, { ...envelope(), context })).toThrow(ContractError);
  }
});
it('keeps cancellation/interruption distinct from success and validates safe error shape', () => {
  for (const state of ['cancelled', 'interrupted', 'failed', 'succeeded']) expect(parseContract(workflowRunStateSchema, state)).toBe(state);
  const error = { code: 'BINDING_NOT_FOUND', message: 'A configured value is missing.', nodeId: 'synthetic', retryable: false };
  expect(parseContract(workflowErrorSchema, error)).toEqual(error);
  expect(() => parseContract(workflowErrorSchema, { ...error, stack: 'synthetic-private-canary' })).toThrow(ContractError);
});

it('accepts named IANA zones/UTC and rejects arbitrary names or fixed offsets', () => {
  for (const timezone of ['Australia/Sydney', 'America/New_York', 'UTC']) {
    expect(parseContract(workflowEnvelopeSchema, { ...envelope(), context: { ...envelope().context, timezone } })).toHaveProperty('context.timezone', timezone);
  }
  for (const timezone of ['Not/A_Zone', '+10:00', '-05', '']) {
    expect(() => parseContract(workflowEnvelopeSchema, { ...envelope(), context: { ...envelope().context, timezone } })).toThrow(ContractError);
  }
});

it('rejects a long invalid pointer without ambiguous slash backtracking', () => {
  expect(() => parseContract(workflowBindingSchema, { ref: 'vars#' + '/'.repeat(10000) + '~2' })).toThrow(ContractError);
  expect(parseContract(workflowBindingSchema, { ref: 'vars#' + '/'.repeat(10000) })).toHaveProperty('ref');
}, 1000);
