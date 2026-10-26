import * as z from 'zod';
import { workflowDefinitionSchema } from './workflow-graph.ts';
import { workflowContextSchema } from './workflows.ts';
import { MAX_ENVELOPE_BYTES } from './protocol.ts';
const bytes=(value:string,limit:number)=>new TextEncoder().encode(value).byteLength<=limit;
export const workflowRunTextSchema=z.string().max(65536).refine(value=>bytes(value,65536)&&!/[\p{Cs}]/u.test(value));
export const workflowRunInputSchema=workflowRunTextSchema.refine(value=>bytes(value,16384));
const revision=z.number().int().positive().safe();
const nodeId=z.string().min(1).max(200).refine(value=>bytes(value,200)&&!/[\p{Cc}\p{Cs}]/u.test(value));
export const workflowRunErrorCodeSchema=z.enum(['invalid-workflow','unsupported-configuration','invalid-input','invalid-binding','limit-exceeded','deadline-exceeded','permission-denied','unavailable','storage-unavailable','unknown-outcome','cancelled']);
export const workflowRunStepSchema=z.strictObject({activationId:z.uuid(),nodeId,nodeType:z.enum(['input.keyword','utility.transform','output.clipboard']),state:z.enum(['running','succeeded','failed','cancelled']),durationMs:z.number().int().nonnegative().safe().optional()});
export const workflowRunSnapshotSchema=z.strictObject({
  runId:z.uuid(),sequence:revision,editorRevision:revision,workflowName:z.string().max(128),triggerNodeId:nodeId,
  state:z.enum(['queued','running','waiting-ui','cancelling','succeeded','failed','cancelled','interrupted']),
  steps:z.array(workflowRunStepSchema).max(50),output:workflowRunTextSchema.optional(),
  prompt:z.strictObject({id:z.uuid(),permissionId:z.literal('clipboard.write'),choices:z.array(z.enum(['once','persistent','deny'])).min(1).max(3),text:workflowRunTextSchema}).optional(),
  effectOutcome:z.enum(['not-dispatched','completed','unknown']),requiresReview:z.boolean(),
  errorCode:workflowRunErrorCodeSchema.optional(),
}).refine(value=>new TextEncoder().encode(JSON.stringify(value)).byteLength<MAX_ENVELOPE_BYTES-4096)
  .refine(value=>(value.effectOutcome!=='unknown'||value.requiresReview)&&(!value.prompt||value.state==='waiting-ui'));
export const workflowRunStartSchema=z.strictObject({editorRevision:revision,triggerNodeId:nodeId,input:workflowRunInputSchema});
export const workflowRunDecisionSchema=z.strictObject({runId:z.uuid(),promptId:z.uuid(),decision:z.enum(['once','persistent','deny'])});
export const workflowRunPermissionResetSchema=z.strictObject({editorRevision:revision});
export const workflowRunReplySchema=z.union([
  z.strictObject({ok:z.literal(true),value:workflowRunSnapshotSchema.nullable()}),
  z.strictObject({ok:z.literal(false),error:z.strictObject({code:z.enum(['invalid-request','conflict','unavailable','unknown-outcome']),message:z.string().min(1).max(256)})}),
]);
export type WorkflowRunState=z.infer<typeof workflowRunSnapshotSchema>;
export type WorkflowRunStep=z.infer<typeof workflowRunStepSchema>;
export type WorkflowRunErrorCode=z.infer<typeof workflowRunErrorCodeSchema>;
export type WorkflowRunReply=z.infer<typeof workflowRunReplySchema>;
export interface WorkflowRunApi {
  getWorkflowRun():Promise<WorkflowRunReply>;
  startWorkflowRun(input:z.infer<typeof workflowRunStartSchema>):Promise<WorkflowRunReply>;
  decideWorkflowRun(input:z.infer<typeof workflowRunDecisionSchema>):Promise<WorkflowRunReply>;
  cancelWorkflowRun():Promise<WorkflowRunReply>;
  resetWorkflowClipboardPermission(input:z.infer<typeof workflowRunPermissionResetSchema>):Promise<WorkflowRunReply>;
  onWorkflowRun(listener:(state:WorkflowRunState)=>void):()=>void;
}
export const WORKFLOW_RUN_CHANNELS={get:'workflow-run:get',start:'workflow-run:start',decide:'workflow-run:decide',cancel:'workflow-run:cancel',resetPermission:'workflow-run:reset-permission'} as const;
export const WORKFLOW_RUN_UPDATED='workflow-run:updated';
export const workflowWorkerStartSchema=z.strictObject({protocolVersion:z.literal(1),type:z.literal('start'),runId:z.uuid(),definition:workflowDefinitionSchema,triggerNodeId:nodeId,input:workflowRunInputSchema,context:workflowContextSchema})
  .refine(value=>value.context.runId===value.runId&&value.context.workflowId===value.definition.id&&value.context.workflowVersion===value.definition.version&&value.context.triggerNodeId===value.triggerNodeId)
  .refine(value=>new TextEncoder().encode(JSON.stringify(value)).byteLength<MAX_ENVELOPE_BYTES-4096);
export type WorkflowWorkerStart=z.infer<typeof workflowWorkerStartSchema>;
