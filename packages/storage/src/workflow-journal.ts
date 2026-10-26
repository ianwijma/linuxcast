import type Database from 'better-sqlite3';
import { journalRunSchema,journalStepSchema } from '../../workflows/src/journal/contracts.ts';
import type { JournalRun,JournalStep,JournalMethods } from '../../workflows/src/journal/contracts.ts';
import { StorageError } from './errors.ts';
const terminal=new Set(['succeeded','failed','cancelled','interrupted']);
const runTransitions:Record<string,readonly string[]>={queued:['running','failed','cancelled','interrupted'],running:['waiting-ui','cancelling','succeeded','failed','cancelled','interrupted'],'waiting-ui':['running','cancelling','failed','cancelled','interrupted'],cancelling:['cancelled','failed','interrupted']};
const stepTransitions:Record<string,readonly string[]>={pending:['prepared','completed','failed','cancelled'],prepared:['dispatched','failed','cancelled'],dispatched:['completed','failed','unknown']};
function loadRun(db:Database.Database,id:string){const row=db.prepare('SELECT record FROM workflow_runs WHERE run_id=?').get(id) as {record:string}|undefined;return row?journalRunSchema.parse(JSON.parse(row.record)):null;}
function saveRun(db:Database.Database,record:JournalRun){db.prepare('INSERT INTO workflow_runs(run_id,state,created_at,record) VALUES(?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET state=excluded.state,record=excluded.record').run(record.runId,record.state,record.createdAt,JSON.stringify(record));}
function saveStep(db:Database.Database,record:JournalStep){db.prepare('INSERT INTO workflow_steps(activation_id,run_id,state,created_at,record) VALUES(?,?,?,?,?) ON CONFLICT(activation_id) DO UPDATE SET state=excluded.state,record=excluded.record').run(record.activationId,record.runId,record.state,record.createdAt,JSON.stringify(record));}
export function dispatchWorkflowJournal(db:Database.Database,method:keyof JournalMethods,input:unknown):unknown{
  if(method==='workflows.runs.put'){
    const {record,expectedRevision}=input as JournalMethods['workflows.runs.put']['params'],current=loadRun(db,record.runId);
    if(record.revision!==expectedRevision+1||(current?.revision??0)!==expectedRevision)throw new StorageError('conflict');
    if(current){
      for(const key of ['runId','workflowId','workflowVersion','definitionHash','editorRevision','triggerNodeId','createdAt'] as const)if(record[key]!==current[key])throw new StorageError('conflict');
      if(record.updatedAt<current.updatedAt||(!runTransitions[current.state]?.includes(record.state))||current.effectOutcome==='unknown'&&record.effectOutcome!=='unknown'||current.effectOutcome==='completed'&&record.effectOutcome==='not-dispatched')throw new StorageError('conflict');
    }else{
      if(record.state!=='queued'||record.effectOutcome!=='not-dispatched'||record.requiresReview||record.errorCode)throw new StorageError('invalid-request');
      // Only terminal metadata is pruned. Active recovery records cannot disappear.
      db.prepare("DELETE FROM workflow_runs WHERE state IN ('succeeded','failed','cancelled','interrupted') AND (created_at<? OR run_id IN (SELECT run_id FROM workflow_runs ORDER BY created_at DESC,run_id DESC LIMIT -1 OFFSET 9999))").run(new Date(Date.now()-30*86400000).toISOString());
      if((db.prepare('SELECT count(*) AS n FROM workflow_runs').get() as {n:number}).n>=10000)throw new StorageError('conflict');
    }
    saveRun(db,record);return record;
  }
  if(method==='workflows.steps.put'){
    const {record,expectedRevision}=input as JournalMethods['workflows.steps.put']['params'],run=loadRun(db,record.runId);
    const row=db.prepare('SELECT record FROM workflow_steps WHERE activation_id=?').get(record.activationId) as {record:string}|undefined,current=row?journalStepSchema.parse(JSON.parse(row.record)):null;
    if(!run||terminal.has(run.state)||record.revision!==expectedRevision+1||(current?.revision??0)!==expectedRevision)throw new StorageError('conflict');
    if(current){
      for(const key of ['runId','activationId','nodeId','nodeType','createdAt'] as const)if(record[key]!==current[key])throw new StorageError('conflict');
      if(record.updatedAt<current.updatedAt||!stepTransitions[current.state]?.includes(record.state))throw new StorageError('conflict');
    }else if(record.state!=='pending'||(db.prepare('SELECT count(*) AS n FROM workflow_steps WHERE run_id=?').get(record.runId) as {n:number}).n>=10000)throw new StorageError('conflict');
    saveStep(db,record);return record;
  }
  db.prepare("DELETE FROM workflow_runs WHERE state IN ('succeeded','failed','cancelled','interrupted') AND created_at<?").run(new Date(Date.now()-30*86400000).toISOString());
  const now=new Date().toISOString();
  const rows=db.prepare("SELECT record FROM workflow_runs WHERE state NOT IN ('succeeded','failed','cancelled','interrupted')").all() as {record:string}[];
  for(const row of rows){const run=journalRunSchema.parse(JSON.parse(row.record));let unknown=run.effectOutcome==='unknown';
    let completed=run.effectOutcome==='completed';
    for(const evidence of db.prepare('SELECT record FROM workflow_steps WHERE run_id=?').all(run.runId) as {record:string}[]){const step=journalStepSchema.parse(JSON.parse(evidence.record));if(step.state==='unknown')unknown=true;if(step.nodeType==='output.clipboard'&&step.state==='completed')completed=true;}
    const steps=db.prepare("SELECT record FROM workflow_steps WHERE run_id=? AND state IN ('pending','prepared','dispatched')").all(run.runId) as {record:string}[];
    for(const stepRow of steps){const step=journalStepSchema.parse(JSON.parse(stepRow.record));if(step.state==='dispatched')unknown=true;saveStep(db,{...step,state:step.state==='dispatched'?'unknown':'cancelled',revision:step.revision+1,updatedAt:now,errorCode:step.state==='dispatched'?'unknown-outcome':'cancelled'});}
    saveRun(db,{...run,state:'interrupted',effectOutcome:unknown?'unknown':completed?'completed':run.effectOutcome,requiresReview:unknown,errorCode:unknown?'unknown-outcome':'cancelled',revision:run.revision+1,updatedAt:now});
  }
  const latest=db.prepare('SELECT record FROM workflow_runs ORDER BY created_at DESC,run_id DESC LIMIT 1').get() as {record:string}|undefined;
  if(!latest)return null;
  const run=journalRunSchema.parse(JSON.parse(latest.record)),steps=(db.prepare('SELECT record FROM workflow_steps WHERE run_id=? ORDER BY created_at DESC,activation_id DESC LIMIT 50').all(run.runId) as {record:string}[]).reverse().map(row=>journalStepSchema.parse(JSON.parse(row.record)));
  return {run,steps};
}
