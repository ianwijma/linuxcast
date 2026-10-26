import type { IpcMain,WebContents,IpcMainInvokeEvent } from 'electron';
import { WORKFLOW_EDITOR_GET_OPEN_INTENT,workflowEditorOpenIntentSchema,workflowEditorRequestSchema } from '../../../../packages/contracts/src/workflow-editor.ts';
import type { WorkflowEditorOpenIntent } from '../../../../packages/contracts/src/workflow-editor.ts';
import { trustedAppSender } from './ipc.ts';
import { WORKFLOW_EDITOR_URL } from './assets.ts';
/** Read-only navigation preference. No renderer can set an entry through IPC. */
export function registerWorkflowIntentIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,contents:()=>WebContents|undefined,intent:()=>WorkflowEditorOpenIntent){
  let disposed=false;
  ipc.handle(WORKFLOW_EDITOR_GET_OPEN_INTENT,(event:IpcMainInvokeEvent,payload:unknown)=>{
    if(disposed||!trustedAppSender(event,contents(),WORKFLOW_EDITOR_URL)||!workflowEditorRequestSchema.safeParse(payload).success)throw new Error('Workflow entry unavailable.');
    return workflowEditorOpenIntentSchema.parse(intent());
  });
  return ()=>{disposed=true;ipc.removeHandler(WORKFLOW_EDITOR_GET_OPEN_INTENT);};
}
