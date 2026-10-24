import * as z from 'zod';
import { jsonValueSchema, type JsonValue } from './json-value.ts';
import { MAX_ENVELOPE_BYTES } from './protocol.ts';
import { uiTextSchema as text } from './scalars.ts';

const id = text.min(1);
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
function safeWorkflowValue(value: JsonValue): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.length <= 10000 && value.every(safeWorkflowValue);
  return Object.entries(value).every(([key, child]) => !forbiddenKeys.has(key) && safeWorkflowValue(child));
}
/** Workflow values reject prototype-related keys in addition to the common JSON
 * boundary. The byte cap applies to each value and to the complete envelope.
 */
export const workflowValueSchema = jsonValueSchema.refine(value => safeWorkflowValue(value) &&
  new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_ENVELOPE_BYTES);
const values = z.array(workflowValueSchema).max(10000);
const variables = z.record(z.string().refine(key => !forbiddenKeys.has(key)), workflowValueSchema);
const counter = z.number().int().nonnegative();
const timezone = id.refine(value => {
  // Intl resolves the runtime's IANA database, including named aliases/UTC.
  // Recent runtimes also accept fixed offsets, which are not IANA identifiers.
  if (/^[+-]/u.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
});
const pointer = /^(input|vars|settings|context|item|error)#(?:\/(?:[^~/]|~[01])*)*$/u;

/** Template validation is syntax only: expansion resolves readonly namespaces
 * and accepts scalars at runtime. It never evaluates expressions or JS.
 */
function validTemplate(value: string): boolean {
  let offset = 0;
  while (offset < value.length) {
    if (value.startsWith('{{{{', offset) || value.startsWith('}}}}', offset)) { offset += 4; continue; }
    if (value.startsWith('{{', offset)) {
      const end = value.indexOf('}}', offset + 2);
      if (end < 0 || !/^(input|vars|settings|context|item|error)(?:\.[^\s.{}]+)+$/u.test(value.slice(offset + 2, end))) return false;
      offset = end + 2;
    } else if (value.startsWith('}}', offset)) return false;
    else offset++;
  }
  return true;
}
export const workflowBindingSchema = z.union([
  z.strictObject({ literal: workflowValueSchema }),
  z.strictObject({ ref: text.regex(pointer) }),
  z.strictObject({ template: text.refine(validTemplate) }),
]);
export const workflowContextSchema = z.strictObject({
  runId: id, workflowId: id, workflowVersion: id, triggerNodeId: id,
  invocationTime: z.iso.datetime(), locale: id, timezone,
  targetToken: id.optional(), queryRevision: counter.optional(), callChain: z.array(id).max(16),
});
function boundedWorkflow<T extends z.ZodType>(schema: T) {
  return z.preprocess((value, context) => {
    if (!workflowValueSchema.safeParse(value).success) {
      context.addIssue({ code: 'custom', message: 'Invalid workflow value.' });
      return z.NEVER;
    }
    return value;
  }, schema);
}
const envelopeShape = z.strictObject({ args: values, vars: variables, context: workflowContextSchema });
export const workflowEnvelopeSchema = boundedWorkflow(envelopeShape);
export const workflowNodeResultSchema = boundedWorkflow(z.strictObject({
  outputs: z.array(z.strictObject({ port: id, envelope: workflowEnvelopeSchema })).max(10000),
}));
export const workflowErrorSchema = boundedWorkflow(z.strictObject({
  code: id, message: text, nodeId: id, retryable: z.boolean(), details: workflowValueSchema.optional(),
}));
export const workflowRunStateSchema = z.enum(['queued', 'running', 'waiting-ui', 'cancelling',
  'succeeded', 'failed', 'cancelled', 'interrupted']);
export type WorkflowBinding = z.infer<typeof workflowBindingSchema>;
export type WorkflowEnvelope = z.infer<typeof workflowEnvelopeSchema>;
export type WorkflowNodeResult = z.infer<typeof workflowNodeResultSchema>;
export type WorkflowError = z.infer<typeof workflowErrorSchema>;
