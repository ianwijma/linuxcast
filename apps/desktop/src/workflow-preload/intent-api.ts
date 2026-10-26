import { WORKFLOW_EDITOR_GET_OPEN_INTENT,WORKFLOW_EDITOR_OPEN_INTENT,workflowEditorOpenIntentSchema } from '../../../../packages/contracts/src/workflow-editor.ts';
import type { WorkflowEditorIntentApi } from '../../../../packages/contracts/src/workflow-editor.ts';
import type { ShellTransport } from '../preload/api.ts';
export function createWorkflowIntentApi(transport:Pick<ShellTransport,'invoke'|'on'|'removeListener'>):WorkflowEditorIntentApi{
  return Object.freeze<WorkflowEditorIntentApi>({
    async getOpenIntent(){try{return workflowEditorOpenIntentSchema.parse(await transport.invoke(WORKFLOW_EDITOR_GET_OPEN_INTENT,{protocolVersion:1}));}catch{throw new Error('Workflow entry unavailable. Reopen from the launcher.');}},
    onOpenIntent(listener){if(typeof listener!=='function')throw new TypeError('A listener is required.');let active=true;const receive=(_event:unknown,value:unknown)=>{const parsed=workflowEditorOpenIntentSchema.safeParse(value);if(active&&parsed.success)listener(parsed.data);};transport.on(WORKFLOW_EDITOR_OPEN_INTENT,receive);return()=>{active=false;transport.removeListener(WORKFLOW_EDITOR_OPEN_INTENT,receive);};},
  });
}
