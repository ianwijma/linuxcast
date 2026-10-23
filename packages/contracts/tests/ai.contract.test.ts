import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { aiEventSchema, aiPurposeSchema, ContractError, encodeFrame, FrameDecoder,
  modelCapabilitiesSchema, parseAiEvent, parseContract, snapshotAiSelection } from '../src/index.ts';

const selection = { revision: 3, providerProfileId: 'synthetic-profile', modelId: 'synthetic-model' };
const base = { schemaVersion: 1, runId: 'synthetic-run', sequence: 1, terminal: false };
const tools = new Map([['synthetic-tool', z.strictObject({ value: z.literal(1) })]]);

describe('one global AI selection snapshot', () => {
  it('copies and freezes a run selection before later settings changes', () => {
    const current = { ...selection };
    const snapshot = snapshotAiSelection(current);
    current.revision++; current.modelId = 'synthetic-next-model';
    expect(snapshot).toEqual(selection);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
  it.each(['modelOverride', 'providerOverride', 'fallback', 'endpoint', 'apiKey'])('rejects hidden %s', key => {
    expect(() => snapshotAiSelection({ ...selection, [key]: 'synthetic-only' })).toThrow(ContractError);
  });
  it('retains every ordinary purpose on the same selection contract', () => {
    expect(aiPurposeSchema.options).toEqual(['chat', 'quick-ai', 'saved-command', 'workflow', 'extension',
      'translation', 'emoji-assist', 'context-summary', 'memory', 'dictation-cleanup']);
    for (const purpose of aiPurposeSchema.options) expect(aiPurposeSchema.parse(purpose)).toBe(purpose);
  });
});

describe('explicit model capabilities', () => {
  const capabilities = { text: true, imageInput: false, fileInputMimeTypes: [], toolCalls: false,
    structuredOutput: 'none', reasoningControls: [], contextTokens: null, outputTokens: null,
    tokenUsage: 'unavailable', cancellation: 'local-only' };
  it('keeps unknown limits null and unsupported flags false', () => {
    expect(parseContract(modelCapabilitiesSchema, capabilities)).toEqual(capabilities);
  });
  it('does not infer capabilities from a compatible endpoint label or missing fields', () => {
    expect(() => parseContract(modelCapabilitiesSchema, { ...capabilities, compatible: true })).toThrow(ContractError);
    const missing: Partial<typeof capabilities> = { ...capabilities }; delete missing.toolCalls;
    expect(() => parseContract(modelCapabilitiesSchema, missing)).toThrow(ContractError);
    expect(() => parseContract(modelCapabilitiesSchema, { ...capabilities, contextTokens: 0 })).toThrow(ContractError);
  });
});

describe('versioned AI stream messages', () => {
  const events = [
    { kind: 'run-started', selection }, { kind: 'text-delta', text: 'Synthetic.' },
    { kind: 'reasoning-delta', text: 'Synthetic display text.', disclosure: 'provider-returned' },
    { kind: 'status-delta', status: 'Synthetic status.' },
    { kind: 'tool-argument-fragment', callId: 'synthetic-call', fragment: '{"value":' },
    { kind: 'tool-request', request: { callId: 'synthetic-call', name: 'synthetic-tool', arguments: { value: 1 } } },
    { kind: 'usage', inputTokens: null, outputTokens: null, source: 'unavailable' },
    { kind: 'source', source: { referenceId: 'synthetic-source', title: 'Synthetic source' } },
    { kind: 'completed', terminal: true }, { kind: 'cancelled', terminal: true },
    { kind: 'failed', terminal: true, failure: { code: 'internal', message: 'Synthetic failure.', retryable: false } },
  ];
  for (const event of events) it(`round-trips ${event.kind} over bounded framing`, () => {
    const value = { ...base, ...event }; const decoder = new FrameDecoder(); let actual: unknown;
    decoder.push(encodeFrame(value), v => { actual = parseAiEvent(v, tools); }); decoder.finish();
    expect(actual).toEqual(value);
  });
  it.each([
    { kind: 'tool-argument-fragment', callId: 'synthetic-call', fragment: '{}', execute: true },
    { kind: 'tool-request', request: { callId: 'synthetic-call', name: 'synthetic-tool', arguments: '{}' } },
    { kind: 'tool-request', request: { callId: 'synthetic-call', name: 'synthetic-tool', arguments: [] } },
    { kind: 'completed', terminal: false }, { kind: 'text-delta', text: 'Synthetic.', terminal: true },
    { kind: 'reasoning-delta', text: 'Synthetic.', disclosure: 'hidden' },
    { kind: 'unknown' }, { kind: 'completed', terminal: true, schemaVersion: 2 },
    { kind: 'completed', terminal: true, sequence: 0 },
    { kind: 'source', source: { referenceId: 'fixture', title: 'Synthetic.', url: 'javascript:alert(1)' } },
    { kind: 'source', source: { referenceId: 'fixture', title: 'Synthetic.', url: 'https://synthetic:synthetic@example.invalid/' } },
    { kind: 'usage', inputTokens: 1, outputTokens: 2, source: 'unavailable' },
  ])('rejects malformed/unsafe event $kind', event => {
    expect(() => parseContract(aiEventSchema, { ...base, ...event })).toThrow(ContractError);
  });
  it('rejects unoffered tools and invalid complete arguments before treating them as ready', () => {
    const event = { ...base, kind: 'tool-request', request: { callId: 'fixture', name: 'synthetic-tool', arguments: { value: 1 } } };
    expect(() => parseAiEvent(event, new Map())).toThrow(ContractError);
    expect(() => parseAiEvent({ ...event, request: { ...event.request, arguments: { value: 2 } } }, tools)).toThrow(ContractError);
  });
  it('passes the offered tool schema output to the host, without dispatching an effect', () => {
    const normalized = new Map([['synthetic-tool', z.object({ value: z.number().default(1) })]]);
    const event = parseAiEvent({ ...base, kind: 'tool-request',
      request: { callId: 'fixture', name: 'synthetic-tool', arguments: { discarded: 'synthetic' } } }, normalized);
    expect(event).toMatchObject({ request: { arguments: { value: 1 } } });
    if (event.kind === 'tool-request') expect(event.request.arguments).toEqual({ value: 1 });
  });
});
