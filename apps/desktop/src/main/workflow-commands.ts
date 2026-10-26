import { createHash } from 'node:crypto';
import { workflowEditorRecordSchema } from '../../../../packages/contracts/src/workflow-editor.ts';
import { workflowRunStartSchema,workflowDisplayName } from '../../../../packages/contracts/src/workflow-run.ts';
import { normalizeCommandAlias,launcherCommandMetadataSchema } from '../../../../packages/contracts/src/launcher.ts';
import type { LauncherCommandMetadata } from '../../../../packages/contracts/src/launcher.ts';
import { EDITOR_NODE_REGISTRY } from '../../../../packages/workflows/src/registry.ts';
import { copyPublicJson } from '../../../../packages/workflows/src/graph/safe-json.ts';
import { stableWorkflowJson } from '../../../../packages/storage/src/workflow-editor-json.ts';
export interface WorkflowCommandSelection {commandId:string;editorRevision:number;definitionHash:string;triggerNodeId:string}
export interface WorkflowCommand {metadata:Omit<LauncherCommandMetadata,'usage'>;selection:WorkflowCommandSelection}
export class WorkflowCommandUnavailable extends Error {constructor(){super('The saved workflow changed. Reload commands and choose its current entry.');}}
/** Main-only metadata, never a graph executor or a grant. Stable IDs preserve
 * command pins/aliases across edits; the private hash/revision fences opening. */
export function compileWorkflowCommands(value:unknown):WorkflowCommand[]{
  const record=workflowEditorRecordSchema.nullable().parse(copyPublicJson(value));
  if(!record?.saved)return [];
  const definition=record.saved,definitionHash=createHash('sha256').update(stableWorkflowJson(definition)).digest('hex');
  const entries=definition.nodes.filter(node=>node.type==='input.keyword'&&!node.disabled).map(node=>{
    const triggerNodeId=workflowRunStartSchema.shape.triggerNodeId.parse(node.id),config=EDITOR_NODE_REGISTRY.get('input.keyword')!.config.parse(node.config) as {keyword:string;argument:string};
    return {triggerNodeId,keyword:config.keyword,argument:config.argument};
  });
  if(entries.length>1000)throw new WorkflowCommandUnavailable();
  const counts=new Map<string,number>();for(const entry of entries){const key=normalizeCommandAlias(entry.keyword);counts.set(key,(counts.get(key)??0)+1);}
  const commands=entries.sort((a,b)=>a.triggerNodeId<b.triggerNodeId?-1:a.triggerNodeId>b.triggerNodeId?1:0).map(entry=>{
    const commandId=`workflow:${createHash('sha256').update(JSON.stringify([definition.id,entry.triggerNodeId])).digest('hex')}`,enabled=counts.get(normalizeCommandAlias(entry.keyword))===1;
    const {usage:_usage,...metadata}=launcherCommandMetadataSchema.parse({usage:null,id:commandId,provider:'commands',title:`${workflowDisplayName(definition.name)} · ${entry.keyword}`,subtitle:`Saved workflow · ${entry.argument==='none'?'no argument':entry.argument==='required'?'text required':'optional text'} · Open, then explicitly Run`,aliases:[entry.keyword],keywords:['workflow','automation','run'],enabled,...(enabled?{}:{unavailableReason:'Another enabled Keyword uses this name. Give the entries unique keywords in the editor.'})});
    void _usage;
    return {metadata,selection:{commandId,editorRevision:record.revision,definitionHash,triggerNodeId:entry.triggerNodeId}};
  });
  if(new Set(commands.map(command=>command.metadata.id)).size!==commands.length)throw new WorkflowCommandUnavailable();
  return commands;
}
export function matchWorkflowCommand(commands:WorkflowCommand[],selection:WorkflowCommandSelection):WorkflowCommand{
  const command=commands.find(command=>command.selection.commandId===selection.commandId);
  if(!command?.metadata.enabled||command.selection.editorRevision!==selection.editorRevision||command.selection.definitionHash!==selection.definitionHash||command.selection.triggerNodeId!==selection.triggerNodeId)throw new WorkflowCommandUnavailable();
  return command;
}
