import type { WorkflowRunApi } from './workflow-run.ts';
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
  onCloseRequested(listener: () => boolean | Promise<boolean>): () => void;
};
export const WORKFLOW_EDITOR_CHANNELS = {
  load: 'workflow-editor:load', write: 'workflow-editor:write', close: 'workflow-editor:close',
  appearance: 'workflow-editor:appearance',
} as const;
export const WORKFLOW_EDITOR_CLOSE_REQUESTED = 'workflow-editor:close-requested';
export const WORKFLOW_EDITOR_APPEARANCE = 'workflow-editor:appearance-changed';
export const workflowEditorRequestSchema = z.strictObject({protocolVersion:z.literal(1)});
export const workflowEditorWriteRequestSchema = z.strictObject({protocolVersion:z.literal(1),input:workflowEditorWriteSchema});
export const workflowEditorCloseReplySchema = z.strictObject({ok:z.literal(true)});
export const workflowEditorAppearanceSchema = z.enum(['dark','light']);
export type WorkflowWorkspaceApi = WorkflowEditorApi & {
  getAppearance(): Promise<'dark'|'light'>;
  onAppearance(listener: (appearance:'dark'|'light') => void): () => void;
};
export const WORKFLOW_EDITOR_CLOSE_FINISHED = 'workflow-editor:close-finished';
export const workflowEditorCloseAttemptSchema = z.strictObject({protocolVersion:z.literal(1),attemptId:z.number().int().positive().safe()});
export const workflowEditorCloseFinishedSchema = workflowEditorCloseAttemptSchema.extend({allowClose:z.boolean()});

/** Production workspace exposes only named, validated authoring, run and navigation surfaces. */
export type WorkflowRunWorkspaceApi=WorkflowWorkspaceApi&WorkflowRunApi&WorkflowEditorIntentApi;

/** Main-created navigation preference only. No Run, input, definition or grants. */
export const workflowEditorOpenIntentSchema=z.discriminatedUnion('view',[
  z.strictObject({requestId:revision.positive(),view:z.literal('editor')}),
  z.strictObject({requestId:revision.positive(),view:z.literal('run'),editorRevision:revision.positive(),triggerNodeId:z.string().min(1).max(200).refine(value=>new TextEncoder().encode(value).length<=200&&!/[\p{Cc}\p{Cs}]/u.test(value))}),
]);
export type WorkflowEditorOpenIntent=z.infer<typeof workflowEditorOpenIntentSchema>;
export const WORKFLOW_EDITOR_OPEN_INTENT='workflow-editor:open-intent';
export const WORKFLOW_EDITOR_GET_OPEN_INTENT='workflow-editor:get-open-intent';
export interface WorkflowEditorIntentApi {getOpenIntent():Promise<WorkflowEditorOpenIntent>;onOpenIntent(listener:(intent:WorkflowEditorOpenIntent)=>void):()=>void}
