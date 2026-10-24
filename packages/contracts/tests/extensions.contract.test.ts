import * as z from 'zod';
import { expect, it } from 'vitest';
import { ContractError, encodeFrame, FrameDecoder, parseContract, parseExtensionRequest, parseExtensionResponse,
  parseExtensionEvent, extensionViewEventSchema } from '../src/index.ts';

const identity = { protocolVersion: 1, requestId: 'synthetic-request', sessionId: 'synthetic-session', method: 'synthetic.read' };
const request = { ...identity, kind: 'request', params: { query: 'Synthetic' }, deadlineMs: 1000 };
const sessions = new Set([identity.sessionId]);
const schema = z.strictObject({ query: z.string(), limit: z.number().int().positive().default(5) });
const methods = new Map([[identity.method, schema]]);
const resultSchema = z.strictObject({ value: z.string(), count: z.number().int().positive().default(5) });
const error = { code: 'cancelled', message: 'Cancelled.', retryable: false };

it('dispatches framed extension requests only to registered sessions and normalized method parameters', () => {
  let actual: unknown; const decoder = new FrameDecoder();
  decoder.push(encodeFrame(request), value => { actual = parseExtensionRequest(value, sessions, methods); }); decoder.finish();
  expect(actual).toEqual({ ...request, params: { query: 'Synthetic', limit: 5 } });
});
it.each([
  { ...request, protocolVersion: 2 }, { ...request, sessionId: 'foreign' }, { ...request, method: 'unknown' },
  { ...request, params: { query: 'Synthetic', path: '/synthetic-only' } }, { ...request, params: null },
  { ...request, principal: 'builtin' }, { ...request, packageId: 'org.synthetic.impersonation' },
  { ...request, deadlineMs: -1 }, { ...request, deadlineMs: 0.5 },
])('rejects malformed or unregistered extension request %#', value => {
  expect(() => parseExtensionRequest(value, sessions, methods)).toThrow(ContractError);
});
it.each([
  { outcome: 'completed', result: { value: 'Synthetic' } },
  { outcome: 'cancelled', error },
  { outcome: 'failed', error: { ...error, code: 'permission-denied' } },
])('binds a terminal $outcome to its outstanding invocation', outcome => {
  expect(parseExtensionResponse({ ...identity, kind: 'response', terminal: true, ...outcome }, identity, resultSchema)).toMatchObject(outcome);
});
it.each([
  { outcome: 'completed', terminal: false, result: null },
  { outcome: 'completed', result: null, error },
  { outcome: 'cancelled', error: { ...error, retryable: true } },
  { outcome: 'cancelled', error: { ...error, code: 'internal' } },
  { outcome: 'failed', error },
  { outcome: 'completed', result: { value: 'Synthetic' }, sessionId: 'foreign' },
  { outcome: 'completed', result: { value: 'Synthetic' }, requestId: 'foreign' },
  { outcome: 'completed', result: { value: 'Synthetic' }, method: 'foreign' },
])('rejects forged or inconsistent terminal %#', outcome => {
  expect(() => parseExtensionResponse({ ...identity, kind: 'response', terminal: true, ...outcome }, identity, resultSchema)).toThrow(ContractError);
});
it('binds event payload normalization to a connection-owned subscription', () => {
  const event = { ...identity, kind: 'event', subscriptionId: 'synthetic-subscription', sequence: 1, terminal: false, payload: { query: 'Synthetic' } };
  const subscriptions = new Map([[event.subscriptionId, { ...identity, payload: schema }]]);
  expect(parseExtensionEvent(event, subscriptions).payload).toEqual({ query: 'Synthetic', limit: 5 });
  for (const changed of [{ ...event, subscriptionId: 'foreign' }, { ...event, sessionId: 'foreign' },
    { ...event, requestId: 'foreign' }, { ...event, method: 'foreign' }, { ...event, sequence: 0 },
    { ...event, terminal: true }, { ...event, payload: { query: 1 } }]) {
    expect(() => parseExtensionEvent(changed, subscriptions)).toThrow(ContractError);
  }
});
it.each([
  { type: 'queryChanged', viewId: 'synthetic-view', query: 'Synthetic', queryRevision: 1 },
  { type: 'selectionChanged', viewId: 'synthetic-view', itemId: 'synthetic-item' },
  { type: 'action', viewId: 'synthetic-view', revision: 1, actionId: 'synthetic-action' },
  { type: 'formSubmitted', viewId: 'synthetic-view', values: { name: 'Synthetic' } },
  { type: 'cancel', reason: 'Synthetic user cancellation.' },
])('accepts declarative $type events without executing them', value => {
  expect(parseContract(extensionViewEventSchema, value)).toEqual(value);
  expect(() => parseContract(extensionViewEventSchema, { ...value, handler: 'synthetic-code' })).toThrow(ContractError);
});

it('returns normalized response data and rejects invalid registered results', () => {
  const response = { ...identity, kind: 'response', outcome: 'completed', terminal: true, result: { value: 'Synthetic' } };
  expect(parseExtensionResponse(response, identity, resultSchema)).toMatchObject({ result: { value: 'Synthetic', count: 5 } });
  expect(() => parseExtensionResponse({ ...response, result: { value: 1 } }, identity, resultSchema)).toThrow(ContractError);
});

it('keeps event text within the same64KiB UTF-8 boundary as its view', () => {
  const event = { type: 'queryChanged', viewId: 'synthetic-view', query: 'é'.repeat(32768), queryRevision: 1 };
  expect(() => parseContract(extensionViewEventSchema, event)).not.toThrow();
  expect(() => parseContract(extensionViewEventSchema, { ...event, query: event.query + 'é' })).toThrow(ContractError);
  expect(() => parseContract(extensionViewEventSchema, { type: 'cancel', reason: 'é'.repeat(32769) })).toThrow(ContractError);
});
