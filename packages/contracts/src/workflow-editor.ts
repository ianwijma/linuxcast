import * as z from 'zod';
import { workflowDefinitionSchema } from './workflow-graph.ts';
import { MAX_ENVELOPE_BYTES } from './protocol.ts';
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
const bounded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_ENVELOPE_BYTES - 4096;
export const workflowEditorRecordSchema = z.strictObject({
  revision: revision.positive(), draft: workflowDefinitionSchema,
  saved: workflowDefinitionSchema.nullable(), updatedAt: z.iso.datetime(),
}).refine(bounded);
export const workflowEditorWriteSchema = z.strictObject({
  expectedRevision: revision, draft: workflowDefinitionSchema,
  action: z.enum(['draft', 'save', 'revert']),
}).refine(bounded);
export const workflowEditorErrorSchema = z.strictObject({
  code: z.enum(['invalid-request', 'conflict', 'unavailable', 'unknown-outcome']),
  message: z.string().min(1).max(256),
});
const recordResult = z.union([
  z.strictObject({ ok: z.literal(true), value: workflowEditorRecordSchema.nullable() }),
  z.strictObject({ ok: z.literal(false), error: workflowEditorErrorSchema }),
]);
export const workflowEditorReadResultSchema = recordResult;
export const workflowEditorWriteResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), value: workflowEditorRecordSchema }),
  z.strictObject({ ok: z.literal(false), error: workflowEditorErrorSchema }),
]);
export type WorkflowEditorRecord = z.infer<typeof workflowEditorRecordSchema>;
export type WorkflowEditorWrite = z.infer<typeof workflowEditorWriteSchema>;
export type WorkflowEditorApi = {
  load(): Promise<z.infer<typeof workflowEditorReadResultSchema>>;
  write(input: WorkflowEditorWrite): Promise<z.infer<typeof workflowEditorWriteResultSchema>>;
  close(): Promise<void>;
  onCloseRequested(listener: () => void): () => void;
};
