import * as z from 'zod';
import { workflowRunErrorCodeSchema,workflowRunSnapshotSchema,workflowRunStepSchema } from '../../../contracts/src/workflow-run.ts';
const revision=z.number().int().nonnegative().safe();
const identity=z.string().min(1).max(200).refine(v=>new TextEncoder().encode(v).length<=200&&!/[\p{Cc}\p{Cs}]/u.test(v));
const outcome=z.enum(['not-dispatched','completed','unknown']);
export const journalRunSchema=z.strictObject({runId:z.uuid(),workflowId:identity,workflowVersion:identity,definitionHash:z.string().regex(/^[0-9a-f]{64}$/u),editorRevision:revision.positive(),triggerNodeId:identity,
  state:workflowRunSnapshotSchema.shape.state,effectOutcome:outcome,requiresReview:z.boolean(),errorCode:workflowRunErrorCodeSchema.optional(),revision:revision.positive(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()})
  .refine(v=>v.effectOutcome!=='unknown'||v.requiresReview).refine(v=>v.updatedAt>=v.createdAt);
export const journalStepSchema=z.strictObject({runId:z.uuid(),activationId:z.uuid(),nodeId:identity,nodeType:workflowRunStepSchema.shape.nodeType,
  state:z.enum(['pending','prepared','dispatched','completed','failed','cancelled','unknown']),durationMs:z.number().int().nonnegative().safe().optional(),errorCode:workflowRunErrorCodeSchema.optional(),revision:revision.positive(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()}).refine(v=>v.updatedAt>=v.createdAt);
export const journalSnapshotSchema=z.strictObject({run:journalRunSchema,steps:z.array(journalStepSchema).max(50)});
export type JournalRun=z.infer<typeof journalRunSchema>;
export type JournalStep=z.infer<typeof journalStepSchema>;
export type JournalSnapshot=z.infer<typeof journalSnapshotSchema>;
export interface JournalMethods {
  'workflows.runs.put':{params:{expectedRevision:number;record:JournalRun};result:JournalRun};
  'workflows.steps.put':{params:{expectedRevision:number;record:JournalStep};result:JournalStep};
  'workflows.runs.recover':{params:Record<string,never>;result:JournalSnapshot|null};
}
export const JOURNAL_METHODS=['workflows.runs.put','workflows.steps.put','workflows.runs.recover'] as const;
export const journalContracts=new Map<string,{params:z.ZodType;result:z.ZodType}>([
  ['workflows.runs.put',{params:z.strictObject({expectedRevision:revision,record:journalRunSchema}),result:journalRunSchema}],
  ['workflows.steps.put',{params:z.strictObject({expectedRevision:revision,record:journalStepSchema}),result:journalStepSchema}],
  ['workflows.runs.recover',{params:z.strictObject({}),result:journalSnapshotSchema.nullable()}],
]);
