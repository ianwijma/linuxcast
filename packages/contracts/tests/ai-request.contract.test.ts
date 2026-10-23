import { expect, it } from 'vitest';
import { ContractError, createBrokerAiRequest, encodeFrame, FrameDecoder, aiRequestSchema,
  normalizedMessageSchema, parseContract } from '../src/index.ts';

const context = { runId: 'synthetic-run', origin: { kind: 'extension', id: 'org.synthetic.fixture' },
  selection: { revision: 3, providerProfileId: 'synthetic-profile', modelId: 'synthetic-model' } };
const reference = { id: 'synthetic-reference', displayName: 'Synthetic file', mimeType: 'text/plain', sizeBytes: 10 };
const submission = { schemaVersion: 1, purpose: 'chat', messages: [{ role: 'user', parts: [{ type: 'text', text: 'Synthetic.' }] }],
  context: [{ id: 'synthetic-context', sourceKind: 'file', displayName: 'Synthetic context', capturedAtMs: 1000,
    reference, transmissionPolicy: 'preview-required' }], offeredToolIds: [],
  limits: { timeoutMs: 1000, toolSteps: 0, outputBytes: 1024 } };

it('combines untrusted content with broker-owned identity and one frozen global selection', () => {
  const broker = structuredClone(context); const input = structuredClone(submission);
  const request = createBrokerAiRequest(input, broker);
  broker.selection.modelId = 'synthetic-later-model'; input.messages[0]!.parts[0]!.text = 'Changed.';
  expect(request.selection).toEqual(context.selection);
  expect(request.origin).toEqual(context.origin);
  expect(request.messages[0]!.parts[0]).toEqual({ type: 'text', text: 'Synthetic.' });
  expect(Object.isFrozen(request)).toBe(true); expect(Object.isFrozen(request.selection)).toBe(true);
  const decoder = new FrameDecoder(); let actual: unknown;
  decoder.push(encodeFrame(request), value => { actual = parseContract(aiRequestSchema, value); }); decoder.finish();
  expect(actual).toEqual(request);
});
it.each(['selection', 'providerProfileId', 'modelId', 'modelOverride', 'fallback', 'origin', 'runId', 'apiKey', 'endpoint'])(
  'rejects caller-supplied routing/authority field %s', field => {
    expect(() => createBrokerAiRequest({ ...submission, [field]: 'synthetic-only' }, context)).toThrow(ContractError);
  });
it('copies JSON tool arguments instead of retaining a caller-owned object', () => {
  const arguments_ = { value: 'Synthetic.' };
  const request = createBrokerAiRequest({ ...submission, messages: [
    { role: 'assistant', parts: [{ type: 'tool-call', callId: 'synthetic-call', name: 'synthetic-tool', arguments: arguments_ }] },
  ] }, context);
  arguments_.value = 'Changed.';
  expect(request.messages[0]!.parts[0]).toMatchObject({ arguments: { value: 'Synthetic.' } });
});
it.each([
  { role: 'user', parts: [{ type: 'image', reference }] },
  { role: 'user', parts: [{ type: 'file', reference }] },
  { role: 'assistant', parts: [{ type: 'tool-call', callId: 'synthetic-call', name: 'synthetic-tool', arguments: {} }] },
  { role: 'tool', parts: [{ type: 'tool-result', callId: 'synthetic-call', result: { value: 1 }, isError: false }] },
  { role: 'assistant', parts: [{ type: 'reasoning', text: 'Synthetic provider display.', disclosure: 'provider-returned', metadata: {} }] },
])('accepts normalized $role message parts', message => {
  expect(() => parseContract(normalizedMessageSchema, message)).not.toThrow();
});
it.each([
  { role: 'tool', parts: [{ type: 'text', text: 'Synthetic.' }] },
  { role: 'user', parts: [{ type: 'tool-call', callId: 'fixture', name: 'fixture', arguments: {} }] },
  { role: 'user', parts: [{ type: 'tool-result', callId: 'fixture', result: null, isError: false }] },
  { role: 'user', parts: [{ type: 'file', reference: { ...reference, path: '/synthetic-only' } }] },
  { role: 'assistant', parts: [{ type: 'tool-call', callId: 'fixture', name: 'fixture', arguments: '{}' }] },
  { role: 'assistant', parts: [{ type: 'reasoning', text: 'Synthetic.', disclosure: 'hidden' }] },
])('rejects malformed or role-mismatched $role message parts', message => {
  expect(() => parseContract(normalizedMessageSchema, message)).toThrow(ContractError);
});
it('rejects over-budget output and execution fields hidden in context references', () => {
  expect(() => createBrokerAiRequest({ ...submission, limits: { ...submission.limits, outputBytes: 1024 * 1024 + 1 } }, context)).toThrow(ContractError);
  expect(() => createBrokerAiRequest({ ...submission, context: [{ ...submission.context[0], execute: true }] }, context)).toThrow(ContractError);
});

it('returns a safe typed error when an in-memory argument changes during copying', () => {
  let reads = 0;
  const arguments_ = Object.defineProperty({}, 'value', { enumerable: true, get() {
    return ++reads === 1 ? 1 : function syntheticPrivateCanary() { return 'synthetic-private-canary'; };
  } });
  try {
    createBrokerAiRequest({ ...submission, messages: [
      { role: 'assistant', parts: [{ type: 'tool-call', callId: 'synthetic-call', name: 'synthetic-tool', arguments: arguments_ }] },
    ] }, context);
    expect.fail('Expected invalid request.');
  } catch (error) {
    expect(error).toBeInstanceOf(ContractError);
    expect((error as ContractError).failure).toEqual({ code: 'invalid-request', message: 'Invalid AI request.', retryable: false });
    expect(String(error)).not.toContain('synthetic-private-canary');
  }
});
