import * as z from 'zod';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, parseContract, rpcFailureSchema } from './protocol.ts';

const id = z.string().min(1);
const count = z.number().int().nonnegative();
export const aiPurposeSchema = z.enum(['chat', 'quick-ai', 'saved-command', 'workflow', 'extension',
  'translation', 'emoji-assist', 'context-summary', 'memory', 'dictation-cleanup']);

/** The host snapshots this single global selection; callers cannot add overrides. */
export const aiSelectionSchema = z.strictObject({
  revision: count, providerProfileId: id, modelId: id,
}).readonly();
export type AiSelection = z.infer<typeof aiSelectionSchema>;
export function snapshotAiSelection(value: unknown): AiSelection {
  return parseContract(aiSelectionSchema, value);
}

export const modelCapabilitiesSchema = z.strictObject({
  text: z.boolean(), imageInput: z.boolean(), fileInputMimeTypes: z.array(id),
  toolCalls: z.boolean(), structuredOutput: z.enum(['none', 'json', 'json-schema']),
  reasoningControls: z.array(id), contextTokens: z.number().int().positive().nullable(),
  outputTokens: z.number().int().positive().nullable(),
  tokenUsage: z.enum(['reported', 'estimated', 'unavailable']),
  cancellation: z.enum(['upstream', 'local-only']),
});
export type ModelCapabilities = z.infer<typeof modelCapabilitiesSchema>;

const jsonObject = jsonValueSchema.refine(value => value !== null && typeof value === 'object' && !Array.isArray(value));
const completeToolRequest = z.strictObject({ callId: id, name: id, arguments: jsonObject });
const sourceUrl = z.string().refine(value => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch { return false; }
});
const source = z.strictObject({ referenceId: id, title: z.string(), url: sourceUrl.optional() });
const base = { schemaVersion: z.literal(1), runId: id, sequence: z.number().int().positive() };
const progress = { ...base, terminal: z.literal(false) };
const terminal = { ...base, terminal: z.literal(true) };

/** A partial fragment is never a complete tool request. Provider reasoning is
 * limited to intentionally returned display text; this cannot reveal hidden reasoning.
 * The broker authenticates producers and validates complete arguments/permission
 * against its own tool registry before any execution.
 */
export const aiEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...progress, kind: z.literal('run-started'), selection: aiSelectionSchema }),
  z.strictObject({ ...progress, kind: z.literal('text-delta'), text: z.string() }),
  z.strictObject({ ...progress, kind: z.literal('reasoning-delta'), text: z.string(),
    disclosure: z.literal('provider-returned') }),
  z.strictObject({ ...progress, kind: z.literal('status-delta'), status: z.string() }),
  z.strictObject({ ...progress, kind: z.literal('tool-argument-fragment'), callId: id,
    fragment: z.string() }),
  z.strictObject({ ...progress, kind: z.literal('tool-request'), request: completeToolRequest }),
  z.strictObject({ ...progress, kind: z.literal('usage'), inputTokens: count.nullable(),
    outputTokens: count.nullable(), source: z.enum(['reported', 'estimated', 'unavailable']) })
    .refine(value => value.source !== 'unavailable' || (value.inputTokens === null && value.outputTokens === null)),
  z.strictObject({ ...progress, kind: z.literal('source'), source }),
  z.strictObject({ ...terminal, kind: z.literal('completed') }),
  z.strictObject({ ...terminal, kind: z.literal('cancelled') }),
  z.strictObject({ ...terminal, kind: z.literal('failed'), failure: rpcFailureSchema }),
]);
type WireAiEvent = z.infer<typeof aiEventSchema>;
export type AiEvent = Exclude<WireAiEvent, { kind: 'tool-request' }> |
  (Omit<Extract<WireAiEvent, { kind: 'tool-request' }>, 'request'> &
    { request: { callId: string; name: string; arguments: unknown } });

/** Use a broker-owned per-run offered-tool registry. Structural JSON alone does
 * not make a completed tool request valid and never grants execution permission.
 */
export function parseAiEvent(value: unknown, offeredTools: ReadonlyMap<string, z.ZodType>): AiEvent {
  const event = parseContract(aiEventSchema, value);
  if (event.kind !== 'tool-request') return event;
  const schema = offeredTools.get(event.request.name);
  if (!schema) throw new ContractError('Unknown or unoffered AI tool.');
  return { ...event, request: { ...event.request, arguments: parseContract(schema, event.request.arguments) } };
}
