import { expect, test } from 'vitest';
import * as z from 'zod';
import selection from '../fixtures/ai/selection-snapshot.json' with { type: 'json' };
import multipart from '../fixtures/ai/multipart-success.json' with { type: 'json' };
import truncated from '../fixtures/ai/truncated-stream.json' with { type: 'json' };
import approved from '../fixtures/ai/tool-approval.json' with { type: 'json' };
import denied from '../fixtures/ai/tool-denial.json' with { type: 'json' };
import refresh from '../fixtures/ai/authentication-refresh.json' with { type: 'json' };
import rejected from '../fixtures/ai/capability-rejection.json' with { type: 'json' };
import interrupted from '../fixtures/ai/interrupted-recovery.json' with { type: 'json' };
import { aiRunRecordSchema, ContractError, createBrokerAiRequest, encodeFrame, FrameDecoder, modelCapabilitiesSchema,
  normalizedMessageSchema, parseAiEvent, parseContract, providerStatusSchema, snapshotAiSelection,
  toolApprovalRecordSchema, toolResultRecordSchema, type AiEvent } from '../src/index.ts';
const tools = new Map([['linuxcast:synthetic-tool', z.strictObject({ value: z.literal(1) })]]);
const fixtures = [selection, multipart, truncated, approved, denied, refresh, rejected, interrupted];
function decode(events: unknown[], chunkSizes: number[] = [1, 2, 3, 5, 8]) {
  const decoder = new FrameDecoder(); const received: AiEvent[] = [];
  const bytes = Buffer.concat(events.map(event => encodeFrame(event)));
  for (let offset = 0, n = 0; offset < bytes.length; n++) {
    const length = chunkSizes[n % chunkSizes.length]!;
    decoder.push(bytes.subarray(offset, offset + length), value => received.push(parseAiEvent(value, tools)));
    offset += length;
  }
  decoder.finish(); return received;
}
function text(events: AiEvent[]) { return events.filter(event => event.kind === 'text-delta').map(event => event.text).join(''); }
test('all eight reusable AI scenarios are synthetic versioned JSON with distinct identities', () => {
  expect(new Set(fixtures.map(value => value.id)).size).toBe(8);
  for (const fixture of fixtures) {
    expect(fixture).toMatchObject({ fixtureVersion: 1, synthetic: true });
    expect(fixture.id).toMatch(/^[a-z-]+$/u);
  }
});
test('shared selection scenario freezes original run identity across later settings changes', () => {
  const broker = structuredClone(selection.brokerContext);
  const submission = structuredClone(selection.submission);
  const request = createBrokerAiRequest(submission, broker);
  broker.selection = structuredClone(selection.changedGlobalSelection);
  submission.context[0]!.capturedAtMs = 2000;
  submission.context[0]!.reference.id = 'synthetic-replaced-context';
  expect(request.selection).toEqual(selection.expected.capturedSelection);
  expect(request.context).toEqual(selection.submission.context);
  expect(snapshotAiSelection(broker.selection)).not.toEqual(request.selection);
  expect(selection.expected.reroute).toBe(false);
});
test('shared multipart stream preserves attachments and ordered events across arbitrary frame splits', () => {
  const request = createBrokerAiRequest(multipart.submission, multipart.brokerContext);
  const capabilities = parseContract(modelCapabilitiesSchema, multipart.capabilities);
  expect(request.messages[0]?.parts.map(part => part.type)).toEqual(['text', 'image', 'file']);
  expect(capabilities.imageInput).toBe(true); expect(capabilities.fileInputMimeTypes).toContain('text/plain');
  const events = decode(multipart.events, multipart.chunkSizes);
  expect(events.map(event => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(events.every(event => event.runId === request.runId)).toBe(true);
  expect(events[0]).toMatchObject({ kind: 'run-started', selection: request.selection });
  expect(events.filter(event => event.terminal)).toEqual([events.at(-1)]);
  expect(events.at(-1)?.kind).toBe(multipart.expected.terminal);
  expect(text(events)).toBe(multipart.expected.text);
});
test('shared truncation scenario retains complete partial output but fails framing instead of completing', () => {
  const events: AiEvent[] = []; const decoder = new FrameDecoder();
  const consume = (value: unknown) => events.push(parseAiEvent(value, tools));
  for (const event of truncated.completeEvents) decoder.push(encodeFrame(event), consume);
  const last = encodeFrame(truncated.truncatedEvent);
  decoder.push(last.subarray(0, last.length - truncated.dropTailBytes), consume);
  expect(() => decoder.finish()).toThrow(ContractError);
  expect(text(events)).toBe(truncated.expected.partialText);
  expect(events.some(event => event.terminal)).toBe(false);
  expect(() => decoder.push(last, consume)).toThrow(ContractError);
  expect(truncated.expected).toMatchObject({ terminal: 'failed', failureCode: 'invalid-request', automaticReplay: false });
});
test.each([approved, denied])('shared $id binds complete arguments, decision and committed result to one call', fixture => {
  const request = createBrokerAiRequest(fixture.submission, fixture.brokerContext);
  const events = decode(fixture.events);
  expect(events[1]?.kind).toBe('tool-argument-fragment');
  const call = events[2]; if (call?.kind !== 'tool-request') throw new Error('Missing fixture tool call.');
  expect(request.offeredToolIds).toContain(call.request.name);
  const pending = parseContract(toolApprovalRecordSchema, fixture.pendingApproval);
  const decision = parseContract(toolApprovalRecordSchema, fixture.decision);
  const result = parseContract(toolResultRecordSchema, fixture.committedResult);
  const message = parseContract(normalizedMessageSchema, fixture.committedMessage);
  expect(pending.state).toBe('pending');
  for (const record of [pending, decision, result]) { expect(record.runId).toBe(request.runId); expect(record.callId).toBe(call.request.callId); }
  expect(decision.arguments).toEqual(call.request.arguments);
  expect(decision.revision).toBeGreaterThan(pending.revision);
  expect(message.parts[0]).toMatchObject({ type: 'tool-result', callId: call.request.callId });
  expect(fixture.expected).toMatchObject({ dispatchBeforeDecision: 0, equivalentFallbackDispatches: 0, appendMessageOnlyAfterCommit: true });
  if (decision.state === 'denied') {
    expect(result).toMatchObject({ effectOutcome: 'not-dispatched', reasonCode: 'permission-denied' });
    expect(fixture.expected.toolDispatches).toBe(0); expect(message.parts[0]).toMatchObject({ isError: true });
  } else {
    expect(decision.state).toBe('approved'); expect(result.effectOutcome).toBe('completed'); expect(fixture.expected.toolDispatches).toBe(1);
  }
  expect(() => parseAiEvent(fixture.events[2], new Map())).toThrow(ContractError);
});
test('shared refresh outcomes preserve provider/model identity and actionable failed authentication', () => {
  const request = createBrokerAiRequest(refresh.submission, refresh.brokerContext);
  const before = parseContract(providerStatusSchema, refresh.before);
  const ready = parseContract(providerStatusSchema, refresh.afterSuccessfulRefresh);
  const failed = parseContract(providerStatusSchema, refresh.afterFailedRefresh);
  for (const status of [before, ready, failed]) expect(status.providerProfileId).toBe(request.selection.providerProfileId);
  expect(before.state).toBe('authentication-required'); expect(ready.state).toBe('ready'); expect(failed.state).toBe('authentication-required');
  expect(decode(refresh.successEvents)[0]).toMatchObject({ selection: request.selection });
  expect(parseAiEvent(refresh.failureEvent, tools)).toMatchObject({ terminal: true, failure: { code: 'permission-denied', retryable: false } });
  expect(refresh.expected).toMatchObject({ refreshRequests: 1, inferenceBeforeReady: 0, inferenceAfterFailedRefresh: 0, fallbackProviderRequests: 0 });
});
test('shared capability rejection retains the image draft and specifies no provider request or fallback', () => {
  const request = createBrokerAiRequest(rejected.submission, rejected.brokerContext);
  const capabilities = parseContract(modelCapabilitiesSchema, rejected.capabilities);
  expect(request.messages[0]?.parts.some(part => part.type === 'image')).toBe(true); expect(capabilities.imageInput).toBe(false);
  expect(parseAiEvent(rejected.failureEvent, tools)).toMatchObject({ terminal: true, kind: 'failed', failure: { code: 'capability-unavailable', retryable: false } });
  expect(rejected.expected).toEqual({ providerRequests: 0, preserveDraft: true, preserveAttachments: true, fallbackProviderRequests: 0 });
});
test('shared interrupted recovery records reject automatic replay and require review for unknown effects', () => {
  const run = parseContract(aiRunRecordSchema, interrupted.persistedRun);
  const result = parseContract(toolResultRecordSchema, interrupted.persistedToolResult);
  expect(result.runId).toBe(run.id); expect(run.state).toBe(interrupted.expected.state);
  expect(run).toMatchObject({ effectOutcome: 'unknown', requiresReview: true, automaticReplay: false });
  for (const patch of [{ automaticReplay: true }, { requiresReview: false }]) {
    expect(() => parseContract(aiRunRecordSchema, { ...interrupted.persistedRun, ...patch })).toThrow(ContractError);
    expect(() => parseContract(toolResultRecordSchema, { ...interrupted.persistedToolResult, ...patch })).toThrow(ContractError);
  }
});
