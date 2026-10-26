import { expect, it } from 'vitest';
import { createWorkflowDraft, EDITOR_NODE_REGISTRY } from '../../workflows/src/registry.ts';
import { parseWorkflowDefinition } from '../src/workflow-graph.ts';
import { workflowEditorRecordSchema, workflowEditorWriteSchema, workflowEditorWriteResultSchema } from '../src/workflow-editor.ts';
it('keeps an unsaved draft distinct from an explicitly saved definition', () => {
  const draft = createWorkflowDraft();
  expect(workflowEditorRecordSchema.parse({revision:1,draft,saved:null,updatedAt:'2026-10-26T00:00:00.000Z'}).saved).toBeNull();
  expect(workflowEditorWriteSchema.parse({expectedRevision:0,draft,action:'draft'})).toHaveProperty('action','draft');
  for (const action of ['save','revert']) expect(workflowEditorWriteSchema.parse({expectedRevision:1,draft,action})).toHaveProperty('action',action);
});
it('rejects unknown execution/authority fields, missing revisions and unsafe budgets', () => {
  const draft=createWorkflowDraft(), write={expectedRevision:0,draft,action:'save'};
  for(const change of [{expectedRevision:-1},{expectedRevision:Number.MAX_SAFE_INTEGER},{action:'run'},{grants:['clipboard.write']},{path:'/tmp/workflow.json'},{enabled:true}])
    expect(workflowEditorWriteSchema.safeParse({...write,...change}).success).toBe(false);
  expect(workflowEditorWriteSchema.safeParse({draft,action:'draft'}).success).toBe(false);
  expect(workflowEditorWriteSchema.safeParse({...write,draft:{...draft,execute:true}}).success).toBe(false);
});
it('bounds complete combined record and write envelopes, not just each graph', () => {
  const draft=createWorkflowDraft();
  draft.editor.notes=Array.from({length:20},(_,index)=>({id:`note-${index}`,text:'x'.repeat(30000),x:0,y:index}));
  expect(workflowEditorWriteSchema.safeParse({expectedRevision:0,draft,action:'draft'}).success).toBe(true);
  expect(workflowEditorRecordSchema.safeParse({revision:1,draft,saved:draft,updatedAt:'2026-10-26T00:00:00.000Z'}).success).toBe(false);
});
it('shares exact initial config schemas without granting node execution', () => {
  const draft=createWorkflowDraft();
  draft.nodes.push({id:'start',type:'input.keyword',typeVersion:1,config:{keyword:'public',argument:'required',trimQuery:false}});
  expect(parseWorkflowDefinition(draft,EDITOR_NODE_REGISTRY).nodes).toHaveLength(1);
  draft.nodes.push({id:'copy',type:'output.clipboard',typeVersion:1,config:{text:{ref:'input#/0'},paste:true,history:'exclude'}});
  expect(()=>parseWorkflowDefinition(draft,EDITOR_NODE_REGISTRY)).toThrow();
});
it('rejects fabricated run success and malformed write acknowledgements', () => {
  expect(workflowEditorWriteResultSchema.safeParse({ok:true,value:{outcome:'executed'}}).success).toBe(false);
  expect(workflowEditorWriteResultSchema.safeParse({ok:false,error:{code:'unknown-outcome',message:'Reload before saving again.'}}).success).toBe(true);
});
