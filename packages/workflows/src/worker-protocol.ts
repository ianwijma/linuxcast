import * as z from 'zod';
import { MAX_ENVELOPE_BYTES } from '../../contracts/src/protocol.ts';
import { workflowRunTextSchema,workflowRunStepSchema,workflowRunErrorCodeSchema } from '../../contracts/src/workflow-run.ts';
const requestId=z.number().int().positive().safe();
export const textRunResultSchema=z.strictObject({state:z.enum(['succeeded','failed','cancelled']),output:workflowRunTextSchema.optional(),errorCode:workflowRunErrorCodeSchema.optional(),effectOutcome:z.enum(['not-dispatched','completed','unknown']),requiresReview:z.boolean()}).refine(v=>v.effectOutcome!=='unknown'||v.requiresReview);
export const workerMessageSchema=z.discriminatedUnion('type',[
  z.strictObject({type:z.literal('abort-request'),runId:z.uuid(),requestId}),
  z.strictObject({type:z.literal('step'),runId:z.uuid(),requestId,step:workflowRunStepSchema}),
  z.strictObject({type:z.literal('value'),runId:z.uuid(),text:workflowRunTextSchema}),
  z.strictObject({type:z.literal('copy'),runId:z.uuid(),requestId,activationId:z.uuid(),nodeId:workflowRunStepSchema.shape.nodeId,text:workflowRunTextSchema}),
  z.strictObject({type:z.literal('result'),runId:z.uuid(),result:textRunResultSchema}),
]).refine(v=>Buffer.byteLength(JSON.stringify(v))<MAX_ENVELOPE_BYTES-4096);
export const parentMessageSchema=z.discriminatedUnion('type',[
  z.strictObject({type:z.literal('cancel'),runId:z.uuid()}),
  z.strictObject({type:z.literal('ack'),runId:z.uuid(),requestId,errorCode:workflowRunErrorCodeSchema.optional(),effectOutcome:z.enum(['not-dispatched','unknown']).optional()}),
]);
