import { afterEach,expect,it } from 'vitest';
import { mkdtemp,rm,readdir,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { StorageOwner } from '../src/owner.ts';
import { foundationMigrations } from '../src/migrations.ts';
import { createStorageClient } from '../src/client.ts';
import { createWorkflowDraft } from '../../workflows/src/registry.ts';
import type { StorageMethod,StorageMethods } from '../src/repositories.ts';
const directories:string[]=[],owners:StorageOwner[]=[];
afterEach(async()=>{for(const owner of owners.splice(0))await owner.close();for(const directory of directories.splice(0))await rm(directory,{recursive:true,force:true});});
async function open(dir?:string,migrations?:Awaited<ReturnType<typeof foundationMigrations>>){const directory=dir??await mkdtemp(join(tmpdir(),'linuxcast-workflow-owner-'));if(!dir)directories.push(directory);const owner=await StorageOwner.open({dataDirectory:directory,applicationBuild:'synthetic-workflow-editor',...(migrations?{migrations}:{})});owners.push(owner);return {owner,dir:directory};}
function request<M extends StorageMethod>(owner:StorageOwner,method:M,params:StorageMethods[M]['params']){return owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result as StorageMethods[M]['result'];}
it('keeps draft and explicit saved state distinct through CAS, revert, clear and complete restart',async()=>{
  const {owner,dir}=await open(),draft=createWorkflowDraft();expect(request(owner,'workflows.editor.get',{})).toBeNull();
  const first=request(owner,'workflows.editor.write',{expectedRevision:0,draft,action:'draft'});expect(first).toMatchObject({revision:1,draft,saved:null});
  const saved=request(owner,'workflows.editor.write',{expectedRevision:1,draft:{...draft,name:'Public workflow'},action:'save'});expect(saved.saved).toEqual(saved.draft);
  expect(()=>request(owner,'workflows.editor.write',{expectedRevision:1,draft,action:'draft'})).toThrow();
  const edit=request(owner,'workflows.editor.write',{expectedRevision:2,draft:{...saved.draft,name:'Public unsaved edit'},action:'draft'});expect(edit.saved).toEqual(saved.saved);expect(edit.draft.name).toBe('Public unsaved edit');
  const reverted=request(owner,'workflows.editor.write',{expectedRevision:3,draft:{...draft,name:'Ignored revert payload'},action:'revert'});expect(reverted).toMatchObject({revision:4,draft:saved.saved,saved:saved.saved});
  request(owner,'dataControls.clear',{category:'command-usage'});request(owner,'dataControls.clear',{category:'file-index'});await owner.confirmSuccessfulLaunch();await owner.close();
  const final=(await open(dir)).owner;expect(request(final,'workflows.editor.get',{})).toEqual(reverted);
  const exported=request(final,'dataControls.export',{category:'command-usage'});for(const value of ['Public workflow','Public unsaved edit','Ignored revert payload'])expect(JSON.stringify(exported)).not.toContain(value);
});
it('preserves invalid drafts but refuses to replace a valid saved graph and rolls back oversized records',async()=>{
  const {owner}=await open(),draft=createWorkflowDraft();const saved=request(owner,'workflows.editor.write',{expectedRevision:0,draft,action:'save'});
  const invalid={...draft,nodes:[{id:'bad',type:'unknown.public',typeVersion:1 as const,config:{}}]};
  const edited=request(owner,'workflows.editor.write',{expectedRevision:1,draft:invalid,action:'draft'});expect(edited.saved).toEqual(saved.saved);expect(edited.draft.nodes).toHaveLength(1);
  expect(()=>request(owner,'workflows.editor.write',{expectedRevision:2,draft:invalid,action:'save'})).toThrow();expect(request(owner,'workflows.editor.get',{})).toEqual(edited);
  const large=createWorkflowDraft();large.editor.notes=Array.from({length:20},(_,i)=>({id:`note-${i}`,text:'x'.repeat(30000),x:0,y:i}));
  expect(()=>request(owner,'workflows.editor.write',{expectedRevision:2,draft:large,action:'save'})).toThrow();expect(request(owner,'workflows.editor.get',{})).toEqual(edited);
});
it('upgrades a real version7 database with a consistent recovery snapshot and preserves source definitions',async()=>{
  const migrations=await foundationMigrations(),{owner,dir}=await open(undefined,migrations.slice(0,7));
  const link=request(owner,'quicklinks.save',{expectedRevision:0,name:'Public retained link',url:'https://example.invalid/retained'});await owner.confirmSuccessfulLaunch();await owner.close();
  const next=(await open(dir)).owner;expect(next.version).toBe(9);expect(request(next,'quicklinks.get',{id:link.id,revision:1})).toEqual(link);expect(request(next,'workflows.editor.get',{})).toBeNull();
  const backups=join(dir,'backups'),journals=await Promise.all((await readdir(backups)).filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await readFile(join(backups,name),'utf8')) as {id:string;fromVersion:number;toVersion:number;state:string}));
  const journal=journals.find(item=>item.fromVersion===7&&item.toVersion===9)!;expect(journal.state).toBe('awaiting-confirmation');
  const snapshot=new Database(join(backups,`${journal.id}.db`),{readonly:true});try{expect(snapshot.pragma('user_version',{simple:true})).toBe(7);expect(snapshot.prepare("SELECT name FROM sqlite_master WHERE name='workflow_editor'").get()).toBeUndefined();expect(snapshot.prepare('SELECT name FROM quicklinks WHERE id=?').get(link.id)).toEqual({name:'Public retained link'});}finally{snapshot.close();}
});
it.each(['revision','draft','saved'])('rejects a mismatched %s write acknowledgement without replay',async field=>{
  let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[];const client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}}),draft=createWorkflowDraft(),pending=client.request('workflows.editor.write',{expectedRevision:0,draft,action:'save'});
  const envelope=sent[0] as {request:{requestId:string;method:string}},record={revision:1,draft,saved:draft,updatedAt:'2026-10-26T00:00:00.000Z',...(field==='revision'?{revision:2}:{[field]:{...draft,name:'Wrong public draft'}})};
  receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result:record}});await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(sent).toHaveLength(1);
});
it('rejects an inconsistent Revert acknowledgement without accepting its arbitrary draft',async()=>{
  let receive:(value:unknown)=>void=()=>{};const sent:unknown[]=[];const client=createStorageClient({send:value=>sent.push(value),onMessage:listener=>{receive=listener;return()=>{};}}),draft=createWorkflowDraft(),pending=client.request('workflows.editor.write',{expectedRevision:0,draft,action:'revert'});
  const envelope=sent[0] as {request:{requestId:string;method:string}};
  receive({kind:'response',response:{schemaVersion:1,requestId:envelope.request.requestId,method:envelope.request.method,outcome:'completed',result:{revision:1,draft:{...draft,name:'Wrong restored draft'},saved:null,updatedAt:'2026-10-26T00:00:00.000Z'}}});
  await expect(pending).rejects.toMatchObject({effectOutcome:'unknown',automaticReplay:false});expect(sent).toHaveLength(1);
});
