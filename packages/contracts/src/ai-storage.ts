import * as z from 'zod';
import { aiEventSchema, aiSelectionSchema } from './ai.ts';
import { contextReferenceSchema, normalizedMessageSchema } from './ai-request.ts';
import { jsonValueSchema } from './json-value.ts';
import { rpcFailureSchema } from './protocol.ts';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
const uuid = z.uuid();
const utc = z.iso.datetime();
const base = { schemaVersion: z.literal(1), id: uuid, revision: z.number().int().positive(), createdAt: utc, modifiedAt: utc };
export const blobReferenceSchema = z.strictObject({ id: uuid, sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  mimeType: id, sizeBytes: z.number().int().nonnegative() });
export const databaseMetadataSchema = z.strictObject({ recordVersion: z.literal(1), databaseSchemaVersion: z.number().int().nonnegative(), applicationBuild: id });
export const conversationRecordSchema = z.strictObject({ ...base, title: text, projectId: uuid.nullable(),
  pinned: z.boolean(), archived: z.boolean(), trashedAt: utc.nullable() });
export const aiDraftRecordSchema = z.strictObject({ ...base, conversationId: uuid,
  message: normalizedMessageSchema.refine(value => value.role === 'user') });
export const messageRevisionRecordSchema = z.strictObject({ ...base, conversationId: uuid, messageId: uuid,
  branchId: uuid, parentRevisionId: uuid.nullable(), message: normalizedMessageSchema });
export const attachmentRecordSchema = z.strictObject({ ...base, conversationId: uuid, displayName: text, blob: blobReferenceSchema, provenance: contextReferenceSchema,
}).refine(value => value.displayName === value.provenance.displayName && value.blob.mimeType === value.provenance.reference.mimeType &&
  value.blob.sizeBytes === value.provenance.reference.sizeBytes);
export const aiRunStateSchema = z.enum(['queued', 'preparing', 'streaming', 'awaiting-approval', 'running-tool',
  'completed', 'cancelled', 'failed', 'interrupted']);
const run = { ...base, conversationId: uuid.nullable(), selection: aiSelectionSchema,
  inputRevisionIds: z.array(uuid), outputRevisionIds: z.array(uuid), partialOutputRef: blobReferenceSchema.nullable() };
export const aiRunRecordSchema = z.discriminatedUnion('state', [
  z.strictObject({ ...run, state: z.literal('completed'), finishedAt: utc }),
  ...(['queued', 'preparing', 'streaming', 'awaiting-approval', 'running-tool'] as const).map(state => z.strictObject({ ...run, state: z.literal(state) })),
  z.strictObject({ ...run, state: z.literal('cancelled'), finishedAt: utc }),
  z.strictObject({ ...run, state: z.literal('failed'), finishedAt: utc, failure: rpcFailureSchema }),
  z.strictObject({ ...run, state: z.literal('interrupted'), interruptedAt: utc, effectOutcome: z.enum(['not-dispatched', 'unknown']),
    requiresReview: z.boolean(), automaticReplay: z.literal(false) }).refine(value => value.effectOutcome !== 'unknown' || value.requiresReview),
]);
const approval = { ...base, runId: uuid, callId: id, toolId: id, arguments: jsonValueSchema };
export const toolApprovalRecordSchema = z.discriminatedUnion('state', [
  z.strictObject({ ...approval, state: z.literal('pending') }),
  z.strictObject({ ...approval, state: z.literal('approved'), decisionRef: id, decidedAt: utc }),
  z.strictObject({ ...approval, state: z.literal('denied'), decisionRef: id, decidedAt: utc }),
]);
const result = { ...base, runId: uuid, callId: id, excerpt: text, artifact: blobReferenceSchema.nullable() };
export const toolResultRecordSchema = z.discriminatedUnion('effectOutcome', [
  z.strictObject({ ...result, effectOutcome: z.literal('not-dispatched'), reasonCode: id }),
  z.strictObject({ ...result, effectOutcome: z.literal('completed'), isError: z.boolean() }),
  z.strictObject({ ...result, effectOutcome: z.literal('unknown'), requiresReview: z.literal(true), automaticReplay: z.literal(false) }),
]);
export const aiEventRecordSchema = z.strictObject({ schemaVersion: z.literal(1), runId: uuid,
  sequence: z.number().int().positive(), event: aiEventSchema,
}).refine(value => value.runId === value.event.runId && value.sequence === value.event.sequence);
export const contextSummaryRecordSchema = z.strictObject({ ...base, conversationId: uuid,
  sourceRevisionIds: z.array(uuid).min(1), summaryRevisionId: uuid, selection: aiSelectionSchema });
/** Repository ownership, revision immutability, foreign keys, event ordering and
 * exactly-one terminal are storage runtime obligations, not parsing guarantees.
 * Blob/decision references never authorize access or approve tool execution.
 */
export type AiRunRecord = z.infer<typeof aiRunRecordSchema>;
export type MessageRevisionRecord = z.infer<typeof messageRevisionRecordSchema>;
