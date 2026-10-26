import { expect,it } from 'vitest';
import { workflowDisplayName,workflowRunCancelSchema,workflowRunStartSchema,workflowRunDecisionSchema,workflowRunInputSchema,workflowRunSnapshotSchema,workflowWorkerStartSchema } from '../src/workflow-run.ts';
import { createWorkflowDraft } from '../../workflows/src/registry.ts';
const runId='00000000-0000-4000-8000-000000000001',promptId='00000000-0000-4000-8000-000000000002';
it('accepts only fresh editor identity, selected entry and transient input as run authority',()=>{
  const value={editorRevision:1,triggerNodeId:'node-1',input:'  Public text  '};expect(workflowRunStartSchema.parse(value)).toEqual(value);
  for(const extra of [{principal:{kind:'builtin',id:'host'}},{definition:createWorkflowDraft()},{grants:['clipboard.write']},{textForCopy:'other'},{operationId:'arbitrary'},{editorRevision:0}])expect(workflowRunStartSchema.safeParse({...value,...extra}).success).toBe(false);
});
it('bounds input by UTF8 bytes and rejects lone surrogates without trimming intentional text',()=>{
  expect(workflowRunInputSchema.parse('  Public\ntext  ')).toBe('  Public\ntext  ');expect(workflowRunInputSchema.parse('😀'.repeat(4096))).toHaveLength(8192);
  for(const value of ['😀'.repeat(4097),'x'.repeat(16385),'\ud800'])expect(workflowRunInputSchema.safeParse(value).success).toBe(false);
});
it('binds permission decisions to exact run/prompt IDs with no generic grant or text payload',()=>{
  for(const decision of ['once','persistent','deny'])expect(workflowRunDecisionSchema.parse({runId,promptId,decision})).toHaveProperty('decision',decision);
  for(const extra of [{principal:'other'},{permissionId:'files.write'},{text:'other'},{decision:'execute'},{runId:'not-an-id'}])expect(workflowRunDecisionSchema.safeParse({runId,promptId,decision:'once',...extra}).success).toBe(false);
});
it('cannot label unknown effects as unreviewed success or show an approval outside the waiting state',()=>{
  const value={runId,sequence:1,editorRevision:1,workflowName:'Public workflow',triggerNodeId:'node-1',state:'running',steps:[],effectOutcome:'not-dispatched',requiresReview:false};
  expect(workflowRunSnapshotSchema.parse(value)).toEqual(value);
  expect(workflowRunSnapshotSchema.safeParse({...value,effectOutcome:'unknown'}).success).toBe(false);
  expect(workflowRunSnapshotSchema.safeParse({...value,prompt:{id:promptId,permissionId:'clipboard.write',choices:['once'],text:'Public result'}}).success).toBe(false);
});
it('binds worker identity/context to the supplied immutable definition and rejects extra channels',()=>{
  const definition=createWorkflowDraft(),value={protocolVersion:1,type:'start',runId,definition,triggerNodeId:'node-1',input:'Public',context:{runId,workflowId:definition.id,workflowVersion:definition.version,triggerNodeId:'node-1',invocationTime:'2026-10-26T00:00:00.000Z',locale:'en',timezone:'UTC',callChain:[]}};
  expect(workflowWorkerStartSchema.parse(value)).toEqual(value);
  for(const extra of [{command:'eval'},{credentials:{}},{env:{HOME:'/other'}},{context:{...value.context,runId:promptId}}])expect(workflowWorkerStartSchema.safeParse({...value,...extra}).success).toBe(false);
});

it('requires exact cancellation run identity without current-run authority',()=>{
  expect(workflowRunCancelSchema.parse({runId})).toEqual({runId});
  for(const input of [{},{runId:'other'},{runId,all:true}])expect(workflowRunCancelSchema.safeParse(input).success).toBe(false);
});

it('projects oversized Unicode saved names for bounded run display without splitting code points',()=>{expect(workflowDisplayName('😀'.repeat(200))).toBe('😀'.repeat(63)+'…');expect(workflowDisplayName('Public workflow')).toBe('Public workflow');});
