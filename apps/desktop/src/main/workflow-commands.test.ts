import { expect,it } from 'vitest';
import { createWorkflowDraft,EDITOR_NODE_TYPES } from '../../../../packages/workflows/src/registry.ts';
import { workflowDisplayName } from '../../../../packages/contracts/src/workflow-run.ts';
import { workflowEditorRecordSchema } from '../../../../packages/contracts/src/workflow-editor.ts';
import { compileWorkflowCommands,matchWorkflowCommand,WorkflowCommandUnavailable } from './workflow-commands.ts';
function record(){const definition=createWorkflowDraft();definition.name='Public automation';definition.nodes=[{id:'first',type:'input.keyword',typeVersion:1,config:{...EDITOR_NODE_TYPES[0].config,keyword:'first'}},{id:'second',type:'input.keyword',typeVersion:1,config:{...EDITOR_NODE_TYPES[0].config,keyword:'second'}}];return {revision:1,draft:structuredClone(definition),saved:definition,updatedAt:'2026-10-27T00:00:00.000Z'};}
it('projects only saved enabled Keywords into opaque stable IDs and keeps freshness authority private',()=>{
 const value=record();value.draft.nodes[0]!.config.keyword='unsaved';const before=compileWorkflowCommands(value);expect(before).toHaveLength(2);expect(before[0]!.metadata).toMatchObject({id:expect.stringMatching(/^workflow:[a-f0-9]{64}$/u),aliases:['first'],enabled:true});
 const metadata=JSON.stringify(before.map(command=>command.metadata));for(const field of ['definitionHash','editorRevision','triggerNodeId','nodes','permissions','unsaved'])expect(metadata).not.toContain(field);
 value.revision++;value.saved.name='Renamed';const after=compileWorkflowCommands(value);expect(after[0]!.metadata.id).toBe(before[0]!.metadata.id);expect(after[0]!.selection.definitionHash).not.toBe(before[0]!.selection.definitionHash);expect(()=>matchWorkflowCommand(after,before[0]!.selection)).toThrow(WorkflowCommandUnavailable);
 value.saved.nodes[0]!.disabled=true;expect(compileWorkflowCommands(value)).toHaveLength(1);expect(compileWorkflowCommands({...value,saved:null})).toEqual([]);expect(compileWorkflowCommands(null)).toEqual([]);
});
it('disables ambiguous normalized keywords and rejects malformed metadata before publication',()=>{
 const value=record();value.saved.nodes[1]!.config.keyword='FIRST';const commands=compileWorkflowCommands(value);expect(commands.every(command=>!command.metadata.enabled)).toBe(true);expect(()=>matchWorkflowCommand(commands,commands[0]!.selection)).toThrow(WorkflowCommandUnavailable);
 value.saved.nodes[1]!.id='first';expect(()=>compileWorkflowCommands(value)).toThrow(WorkflowCommandUnavailable);value.saved.nodes[1]!.id='second';
 value.saved.nodes[1]!.config.keyword='invalid keyword';expect(()=>compileWorkflowCommands(value)).toThrow();
 let reads=0;expect(()=>compileWorkflowCommands({get saved(){reads++;return null;}})).toThrow();expect(reads).toBe(0);
});
it('bounds valid oversized Unicode names without changing saved documents or splitting code points',()=>{
 const value=record();value.saved.name='x'.repeat(126)+'😀'.repeat(1000);expect(workflowEditorRecordSchema.safeParse(value).success).toBe(true);const canonical=JSON.stringify(value),command=compileWorkflowCommands(value)[0]!;
 expect(command.metadata.title).toBe('x'.repeat(126)+'… · first');expect(JSON.stringify(value)).toBe(canonical);expect(workflowDisplayName('😀'.repeat(65))).toBe('😀'.repeat(63)+'…');expect(workflowDisplayName('x'.repeat(128))).toHaveLength(128);expect(workflowDisplayName('😀'.repeat(64))).toHaveLength(128);
});
