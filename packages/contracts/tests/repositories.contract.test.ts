import { expect, it } from 'vitest';
import * as z from 'zod';
import { ContractError, createAiRepositoryContracts, parseRepositoryRequest, parseRepositoryResponse } from '../src/index.ts';
const request = { schemaVersion: 1, requestId: 'synthetic-request', method: 'ai.conversations.get', params: { id: '00000000-0000-4000-8000-000000000001' } };
const contracts = createAiRepositoryContracts();
it('validates a concrete repository request and explicit not-found result', () => {
  expect(parseRepositoryRequest(request, contracts)).toEqual(request);
  expect(parseRepositoryResponse({ schemaVersion: 1, requestId: request.requestId, method: request.method, outcome: 'completed', result: null }, request, contracts)).toHaveProperty('result', null);
});
it.each([{ method: 'sql.execute', params: { sql: 'synthetic SQL' } }, { schemaVersion: 2 }, { principal: 'builtin' },
  { params: { id: 'not-a-uuid' } }, { params: { ...request.params, path: '/synthetic-only' } }])('rejects unknown/incompatible/claimed authority request %#', patch => {
  expect(() => parseRepositoryRequest({ ...request, ...patch }, contracts)).toThrow(ContractError);
});
it('binds response identity/method and validates typed result rather than trusting success', () => {
  const response = { schemaVersion: 1, requestId: request.requestId, method: request.method, outcome: 'completed', result: null };
  for (const patch of [{ requestId: 'other' }, { method: 'other' }, { result: { arbitrary: true } }, { schemaVersion: 2 }]) {
    expect(() => parseRepositoryResponse({ ...response, ...patch }, request, contracts)).toThrow(ContractError);
  }
});
it('keeps cancelled unknown writes distinct and requires review with no replay', () => {
  const response = { schemaVersion: 1, requestId: request.requestId, method: request.method, outcome: 'cancelled', effectOutcome: 'unknown', requiresReview: true, automaticReplay: false };
  expect(parseRepositoryResponse(response, request, contracts)).toHaveProperty('outcome', 'cancelled');
  expect(() => parseRepositoryResponse({ ...response, automaticReplay: true }, request, contracts)).toThrow(ContractError);
  expect(() => parseRepositoryResponse({ ...response, requiresReview: false }, request, contracts)).toThrow(ContractError);
  expect(() => parseRepositoryResponse({ ...response, outcome: 'completed' }, request, contracts)).toThrow(ContractError);
});
it('preserves host schema normalization without creating execution authority', () => {
  const registry = new Map([['synthetic.get', { params: z.strictObject({ page: z.number().default(1) }), result: z.strictObject({ items: z.array(z.string()).default([]) }) }]]);
  const pending = { ...request, method: 'synthetic.get', params: {} };
  expect(parseRepositoryRequest(pending, registry)).toHaveProperty('params.page', 1);
  expect(parseRepositoryResponse({ schemaVersion: 1, requestId: request.requestId, method: pending.method, outcome: 'completed', result: {} }, pending, registry)).toHaveProperty('result.items', []);
});
it('defines append-only message revisions as a typed repository operation', () => {
  const record = { schemaVersion: 1, id: request.params.id, revision: 1, createdAt: '2026-10-23T00:00:00Z', modifiedAt: '2026-10-23T00:00:00Z',
    conversationId: request.params.id, messageId: request.params.id, branchId: request.params.id, parentRevisionId: null,
    message: { role: 'user', parts: [{ type: 'text', text: 'Synthetic' }] } };
  const append = { schemaVersion: 1, requestId: 'synthetic-append', method: 'ai.messages.appendRevision', params: { record } };
  expect(parseRepositoryRequest(append, contracts)).toHaveProperty('params.record', record);
  expect(parseRepositoryResponse({ schemaVersion: 1, requestId: append.requestId, method: append.method, outcome: 'completed', result: record }, append, contracts)).toHaveProperty('result', record);
  expect(() => parseRepositoryRequest({ ...append, params: { record, overwrite: true } }, contracts)).toThrow(ContractError);
});
