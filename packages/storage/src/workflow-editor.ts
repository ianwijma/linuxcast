import type Database from 'better-sqlite3';
import { validateWorkflow } from '../../workflows/src/graph/index.ts';
import { createWorkflowDraft, EDITOR_NODE_REGISTRY } from '../../workflows/src/registry.ts';
import { workflowEditorRecordSchema, workflowEditorWriteSchema } from '../../contracts/src/workflow-editor.ts';
import type { WorkflowEditorRecord } from '../../contracts/src/workflow-editor.ts';
import { StorageError } from './errors.ts';

import { stableWorkflowJson } from './workflow-editor-json.ts';

export function loadWorkflowEditor(db: Database.Database): WorkflowEditorRecord | null {
  const row = db.prepare('SELECT revision,draft,saved,updated_at FROM workflow_editor WHERE singleton=1').get() as
    {revision:number;draft:string;saved:string|null;updated_at:string}|undefined;
  if (!row) return null;
  try {return workflowEditorRecordSchema.parse({revision:row.revision,draft:JSON.parse(row.draft),saved:row.saved===null?null:JSON.parse(row.saved),updatedAt:row.updated_at});}
  catch {throw new StorageError('invalid-request');}
}
export function writeWorkflowEditor(db: Database.Database, value: unknown): WorkflowEditorRecord {
  const parsed=workflowEditorWriteSchema.safeParse(value);
  if (!parsed.success) throw new StorageError('invalid-request');
  const input=parsed.data,current=loadWorkflowEditor(db);
  if ((current?.revision??0)!==input.expectedRevision) throw new StorageError('conflict');
  let draft=input.draft,saved=current?.saved??null;
  if (input.action==='save') {
    try {draft=validateWorkflow(draft,EDITOR_NODE_REGISTRY);saved=draft;}
    catch {throw new StorageError('invalid-request');}
  } else if (input.action==='revert') draft=saved??createWorkflowDraft();
  const record=workflowEditorRecordSchema.safeParse({revision:input.expectedRevision+1,draft,saved,updatedAt:new Date().toISOString()});
  if (!record.success) throw new StorageError('invalid-request');
  db.prepare('INSERT INTO workflow_editor(singleton,revision,draft,saved,updated_at) VALUES(1,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET revision=excluded.revision,draft=excluded.draft,saved=excluded.saved,updated_at=excluded.updated_at')
    .run(record.data.revision,stableWorkflowJson(draft),saved===null?null:stableWorkflowJson(saved),record.data.updatedAt);
  return record.data;
}
