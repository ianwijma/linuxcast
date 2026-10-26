import { createWorkflowDraft } from '../../../../packages/workflows/src/registry.ts';
import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { WORKFLOW_EDITOR_CHANNELS, workflowEditorRequestSchema, workflowEditorWriteRequestSchema,
  workflowEditorReadResultSchema, workflowEditorWriteResultSchema } from '../../../../packages/contracts/src/workflow-editor.ts';
import type { WorkflowEditorRecord, WorkflowEditorWrite } from '../../../../packages/contracts/src/workflow-editor.ts';
import { stableWorkflowJson } from '../../../../packages/storage/src/workflow-editor-json.ts';
import { WORKFLOW_EDITOR_URL } from './assets.ts';
import { trustedAppSender } from './ipc.ts';
export interface WorkflowEditorActions {
  contents():WebContents|undefined; active():boolean; ready():boolean;
  appearance():'dark'|'light'; close():void;
  load():Promise<WorkflowEditorRecord|null>;
  write(input:WorkflowEditorWrite):Promise<WorkflowEditorRecord>;
}
const failure=(code:'invalid-request'|'conflict'|'unavailable'|'unknown-outcome')=>({ok:false as const,error:{code,message:{
  'invalid-request':'This workflow cannot be saved. Review its fields and connections.',
  conflict:'The draft changed. Reload before saving again.',
  unavailable:'Workflow storage is unavailable. Reload to try again.',
  'unknown-outcome':'The draft write could not be confirmed. Reload before saving again.',
}[code]}});
/** Authenticated named authoring methods only. Never executes a graph. */
export function registerWorkflowEditorIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,actions:WorkflowEditorActions){
  let disposed=false,active:Promise<unknown>|undefined;
  for(const channel of Object.values(WORKFLOW_EDITOR_CHANNELS))ipc.handle(channel,async(event:IpcMainInvokeEvent,payload:unknown)=>{
    if(disposed||!actions.active()||!trustedAppSender(event,actions.contents(),WORKFLOW_EDITOR_URL))return failure('unavailable');
    const parsed=(channel===WORKFLOW_EDITOR_CHANNELS.write?workflowEditorWriteRequestSchema:workflowEditorRequestSchema).safeParse(payload);
    if(!parsed.success)return failure('invalid-request');
    if(channel===WORKFLOW_EDITOR_CHANNELS.appearance)return actions.appearance();
    if(channel===WORKFLOW_EDITOR_CHANNELS.close){setImmediate(()=>{if(!disposed&&actions.active()&&trustedAppSender(event,actions.contents(),WORKFLOW_EDITOR_URL))actions.close();});return {ok:true};}
    if(!actions.ready()||active)return failure('unavailable');
    const write=channel===WORKFLOW_EDITOR_CHANNELS.write;
    const operation=(async()=>{
      try {
        const input=write?workflowEditorWriteRequestSchema.parse(payload).input:undefined;
        const value=input?await actions.write(input):await actions.load();
        if(disposed||!actions.active()||!trustedAppSender(event,actions.contents(),WORKFLOW_EDITOR_URL))return failure(write?'unknown-outcome':'unavailable');
        const reply=(write?workflowEditorWriteResultSchema:workflowEditorReadResultSchema).safeParse({ok:true,value});
        if(!reply.success||!reply.data.ok)return failure(write?'unknown-outcome':'unavailable');
        if(input){const record=reply.data.value;if(!record||record.revision!==input.expectedRevision+1||
          (input.action!=='revert'&&stableWorkflowJson(record.draft)!==stableWorkflowJson(input.draft))||
          (input.action==='save'&&stableWorkflowJson(record.saved)!==stableWorkflowJson(input.draft))||
          (input.action==='revert'&&stableWorkflowJson(record.draft)!==stableWorkflowJson(record.saved??createWorkflowDraft())))return failure('unknown-outcome');}
        return reply.data;
      }catch(error){
        const code=error&&typeof error==='object'&&'reasonCode'in error?error.reasonCode:undefined;
        if(code==='conflict')return failure('conflict');
        if(code==='invalid-request')return failure('invalid-request');
        return failure(write?'unknown-outcome':'unavailable');
      }
    })();
    active=operation;try{return await operation;}finally{if(active===operation)active=undefined;}
  });
  return {remove(){disposed=true;for(const channel of Object.values(WORKFLOW_EDITOR_CHANNELS))ipc.removeHandler(channel);},async drain(){await active;}};
}
