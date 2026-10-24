import { expect, it } from 'vitest';
import { ContractError, parseContract, aiRunRecordSchema, messageRevisionRecordSchema, conversationRecordSchema, aiDraftRecordSchema,
  attachmentRecordSchema, blobReferenceSchema, databaseMetadataSchema, toolApprovalRecordSchema, toolResultRecordSchema,
  aiEventRecordSchema, contextSummaryRecordSchema } from '../src/index.ts';
const a = '00000000-0000-4000-8000-000000000001'; const b = '00000000-0000-4000-8000-000000000002';
const stamp = '2026-10-23T00:00:00Z';
const base = { schemaVersion: 1, id: a, revision: 1, createdAt: stamp, modifiedAt: stamp };
const selection = { revision: 1, providerProfileId: 'synthetic-profile', modelId: 'synthetic-model' };
const blob = { id: b, sha256: 'a'.repeat(64), mimeType: 'text/plain', sizeBytes: 100000 };
const provenance = { id: 'synthetic-context', sourceKind: 'file', displayName: 'Synthetic', capturedAtMs: 0,
  reference: { id: 'synthetic-reference', displayName: 'Synthetic', mimeType: blob.mimeType, sizeBytes: blob.sizeBytes },
  origin: { applicationId: 'synthetic.desktop' }, transmissionPolicy: 'preview-required' };
const run = { ...base, conversationId: b, selection, inputRevisionIds: [a], outputRevisionIds: [], partialOutputRef: blob };
it.each(['queued', 'preparing', 'streaming', 'awaiting-approval', 'running-tool'])('preserves nonterminal %s with partial output reference', state => {
  expect(parseContract(aiRunRecordSchema, { ...run, state })).toHaveProperty('partialOutputRef', blob);
});
it('preserves interrupted partial output and unknown effects without inventing completion', () => {
  expect(parseContract(aiRunRecordSchema, { ...run, state: 'interrupted', interruptedAt: stamp, effectOutcome: 'unknown', requiresReview: true, automaticReplay: false })).toHaveProperty('partialOutputRef', blob);
  expect(() => parseContract(aiRunRecordSchema, { ...run, state: 'interrupted', interruptedAt: stamp, effectOutcome: 'completed' })).toThrow(ContractError);
  expect(() => parseContract(aiRunRecordSchema, { ...run, state: 'completed' })).toThrow(ContractError);
  expect(parseContract(aiRunRecordSchema, { ...run, state: 'cancelled', finishedAt: stamp })).toHaveProperty('state', 'cancelled');
});
it('records conversation state, a user draft and immutable revision/branch references', () => {
  const message = { role: 'user', parts: [{ type: 'text', text: 'Synthetic' }] };
  expect(parseContract(conversationRecordSchema, { ...base, title: 'Synthetic', projectId: null, pinned: false, archived: false, trashedAt: null })).toHaveProperty('title');
  expect(parseContract(aiDraftRecordSchema, { ...base, conversationId: b, message })).toHaveProperty('message', message);
  expect(() => parseContract(aiDraftRecordSchema, { ...base, conversationId: b, message: { ...message, role: 'assistant' } })).toThrow(ContractError);
  expect(parseContract(messageRevisionRecordSchema, { ...base, conversationId: b, messageId: a, branchId: b, parentRevisionId: null, message })).toHaveProperty('branchId', b);
});
it('uses content-identified blob references instead of arbitrary paths', () => {
  expect(parseContract(attachmentRecordSchema, { ...base, conversationId: b, displayName: 'Synthetic', blob, provenance })).toHaveProperty('blob', blob);
  expect(() => parseContract(blobReferenceSchema, { ...blob, path: '/synthetic-arbitrary-path' })).toThrow(ContractError);
  expect(() => parseContract(blobReferenceSchema, { ...blob, sha256: 'not-a-hash' })).toThrow(ContractError);
});
it('separates denial, pending approval, committed results and unknown effects', () => {
  const approval = { ...base, runId: a, callId: 'synthetic-call', toolId: 'synthetic-tool', arguments: {} };
  expect(parseContract(toolApprovalRecordSchema, { ...approval, state: 'denied', decisionRef: 'synthetic-decision', decidedAt: stamp })).toHaveProperty('state', 'denied');
  expect(() => parseContract(toolApprovalRecordSchema, { ...approval, state: 'pending', executed: true })).toThrow(ContractError);
  const result = { ...base, runId: a, callId: 'synthetic-call', excerpt: 'Bounded synthetic excerpt', artifact: blob };
  expect(parseContract(toolResultRecordSchema, { ...result, effectOutcome: 'unknown', requiresReview: true, automaticReplay: false })).toHaveProperty('artifact', blob);
  expect(() => parseContract(toolResultRecordSchema, { ...result, effectOutcome: 'unknown', requiresReview: false, automaticReplay: true })).toThrow(ContractError);
  expect(() => parseContract(toolResultRecordSchema, { ...result, effectOutcome: 'not-dispatched', reasonCode: 'denied', isError: false })).toThrow(ContractError);
});
it('binds stored event sequence/run identity and keeps summary source history references', () => {
  const event = { schemaVersion: 1, runId: a, sequence: 1, kind: 'cancelled', terminal: true };
  expect(parseContract(aiEventRecordSchema, { schemaVersion: 1, runId: a, sequence: 1, event })).toHaveProperty('event.kind', 'cancelled');
  expect(() => parseContract(aiEventRecordSchema, { schemaVersion: 1, runId: b, sequence: 1, event })).toThrow(ContractError);
  expect(() => parseContract(aiEventRecordSchema, { schemaVersion: 1, runId: a, sequence: 2, event })).toThrow(ContractError);
  expect(parseContract(contextSummaryRecordSchema, { ...base, conversationId: b, sourceRevisionIds: [a], summaryRevisionId: b, selection })).toHaveProperty('sourceRevisionIds', [a]);
});
it('keeps database schema integer separate from build and rejects unsupported record fields/version', () => {
  expect(parseContract(databaseMetadataSchema, { recordVersion: 1, databaseSchemaVersion: 2, applicationBuild: 'synthetic-build' })).toHaveProperty('databaseSchemaVersion', 2);
  expect(() => parseContract(databaseMetadataSchema, { recordVersion: 1, databaseSchemaVersion: '1.0.0', applicationBuild: 'synthetic' })).toThrow(ContractError);
  expect(() => parseContract(aiRunRecordSchema, { ...run, state: 'queued', schemaVersion: 2 })).toThrow(ContractError);
  expect(() => parseContract(aiRunRecordSchema, { ...run, state: 'queued', apiKey: 'synthetic-private-canary' })).toThrow(ContractError);
});

it('round-trips attachment provenance/transmission policy and rejects lost or inconsistent metadata', () => {
  const record = { ...base, conversationId: b, displayName: 'Synthetic', blob, provenance };
  expect(parseContract(attachmentRecordSchema, record)).toHaveProperty('provenance', provenance);
  const { provenance: removed, ...missing } = record; void removed;
  expect(() => parseContract(attachmentRecordSchema, missing)).toThrow(ContractError);
  expect(() => parseContract(attachmentRecordSchema, { ...record, blob: { ...blob, sizeBytes: 1 } })).toThrow(ContractError);
});
it('requires review and no replay for interrupted work with unknown effects', () => {
  const interrupted = { ...run, state: 'interrupted', interruptedAt: stamp, effectOutcome: 'unknown' };
  for (const patch of [{}, { requiresReview: false, automaticReplay: false }, { requiresReview: true, automaticReplay: true }]) {
    expect(() => parseContract(aiRunRecordSchema, { ...interrupted, ...patch })).toThrow(ContractError);
  }
  expect(parseContract(aiRunRecordSchema, { ...interrupted, requiresReview: true, automaticReplay: false })).toHaveProperty('effectOutcome', 'unknown');
  expect(parseContract(aiRunRecordSchema, { ...interrupted, effectOutcome: 'not-dispatched', requiresReview: false, automaticReplay: false })).toHaveProperty('requiresReview', false);
});
