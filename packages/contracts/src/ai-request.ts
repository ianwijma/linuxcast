import * as z from 'zod';
import { aiPurposeSchema, aiSelectionSchema } from './ai.ts';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, parseContract } from './protocol.ts';

const id = z.string().min(1);
const count = z.number().int().nonnegative();
const jsonObject = jsonValueSchema.refine(value => value !== null && typeof value === 'object' && !Array.isArray(value));

/** Opaque broker references, never arbitrary filesystem paths or provider URLs. */
export const aiContentReferenceSchema = z.strictObject({
  id, displayName: z.string(), mimeType: id, sizeBytes: count,
});
export const aiMessagePartSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), text: z.string() }),
  z.strictObject({ type: z.literal('image'), reference: aiContentReferenceSchema }),
  z.strictObject({ type: z.literal('file'), reference: aiContentReferenceSchema }),
  z.strictObject({ type: z.literal('tool-call'), callId: id, name: id, arguments: jsonObject }),
  z.strictObject({ type: z.literal('tool-result'), callId: id, result: jsonValueSchema, isError: z.boolean() }),
  z.strictObject({ type: z.literal('reasoning'), text: z.string(), metadata: jsonObject.optional(),
    disclosure: z.literal('provider-returned') }),
]);
export const normalizedMessageSchema = z.strictObject({
  role: z.enum(['system', 'user', 'assistant', 'tool']), parts: z.array(aiMessagePartSchema).min(1),
}).superRefine((message, context) => {
  for (const part of message.parts) {
    if ((part.type === 'tool-result' && message.role !== 'tool') ||
      (message.role === 'tool' && part.type !== 'tool-result') ||
      ((part.type === 'tool-call' || part.type === 'reasoning') && message.role !== 'assistant')) {
      context.addIssue({ code: 'custom', message: 'Message part does not match its role.' });
    }
  }
});

export const contextReferenceSchema = z.strictObject({
  id, sourceKind: z.enum(['file', 'selection', 'clipboard', 'note', 'browser', 'accessibility', 'screenshot', 'calendar']),
  displayName: z.string(), capturedAtMs: count, reference: aiContentReferenceSchema,
  origin: z.strictObject({ applicationId: id.optional(), windowHandle: id.optional(), site: z.string().optional() }).optional(),
  transmissionPolicy: z.enum(['local-only', 'preview-required']),
});
export const versionedJsonSchemaSchema = z.strictObject({ schemaVersion: z.literal(1), schema: jsonObject });
const requestFields = {
  schemaVersion: z.literal(1), purpose: aiPurposeSchema, conversationId: id.optional(),
  messages: z.array(normalizedMessageSchema).min(1), context: z.array(contextReferenceSchema),
  offeredToolIds: z.array(id), outputSchema: versionedJsonSchemaSchema.optional(),
  limits: z.strictObject({ timeoutMs: z.number().int().positive(), toolSteps: count,
    outputBytes: z.number().int().positive().max(1024 * 1024) }),
};

/** Parsed content is still untrusted. The broker resolves references, checks
 * ownership, budgets, tool grants, model capabilities and transmission consent.
 */
export const aiSubmissionSchema = z.strictObject(requestFields);
export const trustedAiContextSchema = z.strictObject({
  runId: id, origin: z.strictObject({ kind: z.enum(['builtin', 'extension', 'workflow']), id }).readonly(),
  selection: aiSelectionSchema,
});
export const aiRequestSchema = z.strictObject({ ...requestFields, ...trustedAiContextSchema.shape }).readonly();
export type AiRequest = z.infer<typeof aiRequestSchema>;
export type NormalizedMessage = z.infer<typeof normalizedMessageSchema>;
export type ContextReference = z.infer<typeof contextReferenceSchema>;

/** Context comes from the authenticated broker registry and current global
 * settings, never the submitted IPC body. Copy content before the run starts so
 * caller mutation cannot change the snapshot through JSON argument references.
 */
export function createBrokerAiRequest(submission: unknown, brokerContext: unknown): AiRequest {
  const input = parseContract(aiSubmissionSchema, submission);
  const context = parseContract(trustedAiContextSchema, brokerContext);
  try {
    return parseContract(aiRequestSchema, structuredClone({ ...input, ...context }));
  } catch {
    throw new ContractError('Invalid AI request.');
  }
}
