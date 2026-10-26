import { afterEach,expect,it } from 'vitest';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StorageOwner } from '../src/owner.ts';
import type { StorageMethod,StorageMethods } from '../src/repositories.ts';
import type { JournalRun,JournalStep } from '../../workflows/src/journal/contracts.ts';
const owners:StorageOwner[]=[],directories:string[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
async function open(){const dir=await mkdtemp(join(tmpdir(),'linuxcast-run-journal-'));directories.push(dir);const owner=await StorageOwner.open({dataDirectory:dir,applicationBuild:'synthetic-journal'});owners.push(owner);return owner;}
function request<M extends StorageMethod>(owner:StorageOwner,method:M,params:StorageMethods[M]['params']){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result as StorageMethods[M]['result'];}
function run(date=new Date().toISOString()):JournalRun{return{runId:randomUUID(),workflowId:'org.linuxcast.public',workflowVersion:'1.0.0',definitionHash:'a'.repeat(64),editorRevision:1,triggerNodeId:'entry',state:'queued',effectOutcome:'not-dispatched',requiresReview:false,revision:1,createdAt:date,updatedAt:date};}
function step(run:JournalRun):JournalStep{return{runId:run.runId,activationId:randomUUID(),nodeId:'copy',nodeType:'output.clipboard',state:'pending',revision:1,createdAt:run.createdAt,updatedAt:run.updatedAt};}
function saveRun(owner:StorageOwner,record:JournalRun){return request(owner,'workflows.runs.put',{expectedRevision:record.revision-1,record});}
function saveStep(owner:StorageOwner,record:JournalStep){return request(owner,'workflows.steps.put',{expectedRevision:record.revision-1,record});}
it.each(['dispatched','unknown','completed'] as const)('recovers %s effect evidence after crash before aggregate acknowledgement without replay',async state=>{
  const owner=await open(),initial=run();saveRun(owner,initial);saveRun(owner,{...initial,state:'running',revision:2});
  let current=step(initial);saveStep(owner,current);for(const next of ['prepared','dispatched',...(state==='dispatched'?[]:[state])] as const){current={...current,state:next,revision:current.revision+1};saveStep(owner,current);}
  const recovered=request(owner,'workflows.runs.recover',{})!;expect(recovered.run).toMatchObject({runId:initial.runId,state:'interrupted',effectOutcome:state==='completed'?'completed':'unknown',requiresReview:state!=='completed'});expect(recovered.steps[0]?.state).toBe(state==='completed'?'completed':'unknown');
  expect(request(owner,'workflows.runs.recover',{})).toEqual(recovered);expect(()=>saveStep(owner,{...current,state:'completed',revision:current.revision+1})).toThrow();
});
it('enforces exact metadata identities, strict privacy, CAS and terminal transition boundaries',async()=>{
  const owner=await open(),initial=run();saveRun(owner,initial);
  expect(()=>request(owner,'workflows.runs.put',{expectedRevision:0,record:initial})).toThrow();
  expect(()=>saveRun(owner,{...initial,state:'running',revision:2,workflowId:'org.other'})).toThrow();
  expect(()=>saveRun(owner,{...initial,state:'running',revision:2,input:'private'} as JournalRun)).toThrow();
  expect(()=>saveRun(owner,{...initial,state:'running',revision:2,output:'private'} as JournalRun)).toThrow();
  saveRun(owner,{...initial,state:'running',revision:2});const activation=step(initial);saveStep(owner,activation);
  expect(()=>saveStep(owner,{...activation,state:'dispatched',revision:2})).toThrow();expect(()=>saveStep(owner,{...activation,state:'completed',nodeId:'other',revision:2})).toThrow();
  saveStep(owner,{...activation,state:'completed',revision:2});saveRun(owner,{...initial,state:'succeeded',revision:3});expect(()=>saveRun(owner,{...initial,state:'running',revision:4})).toThrow();
});
it('expires terminal metadata on idle startup while preserving active recovery evidence',async()=>{
  const owner=await open(),old=new Date(Date.now()-31*86400000).toISOString(),expired=run(old);saveRun(owner,expired);saveRun(owner,{...expired,state:'cancelled',revision:2});
  expect(request(owner,'workflows.runs.recover',{})).toBeNull();
  const active=run(old);saveRun(owner,active);expect(request(owner,'workflows.runs.recover',{})?.run).toMatchObject({runId:active.runId,state:'interrupted'});
});
