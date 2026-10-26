import { WORKFLOW_RUN_CHANNELS,WORKFLOW_RUN_UPDATED,workflowRunStartSchema,workflowRunCancelSchema,workflowRunDecisionSchema,workflowRunPermissionResetSchema,workflowRunReplySchema,workflowRunSnapshotSchema } from '../../../../packages/contracts/src/workflow-run.ts';
import type { WorkflowRunApi,WorkflowRunReply } from '../../../../packages/contracts/src/workflow-run.ts';
import type { ShellTransport } from '../preload/api.ts';
const failed=(code:'invalid-request'|'unknown-outcome'|'unavailable'):WorkflowRunReply=>({ok:false,error:{code,message:code==='invalid-request'?'Review the run request.':code==='unavailable'?'Workflow execution is unavailable. Reopen the editor.':'The run could not be confirmed. Refresh and inspect the clipboard before starting a new run.'}});
export function createWorkflowRunApi(transport:Pick<ShellTransport,'invoke'|'on'|'removeListener'>):WorkflowRunApi{
  async function invoke(channel:string,payload:unknown,write=true){try{const parsed=workflowRunReplySchema.safeParse(await transport.invoke(channel,payload));return parsed.success?parsed.data:failed(write?'unknown-outcome':'unavailable');}catch{return failed(write?'unknown-outcome':'unavailable');}}
  return Object.freeze<WorkflowRunApi>({
    getWorkflowRun:()=>invoke(WORKFLOW_RUN_CHANNELS.get,{},false),
    startWorkflowRun(input){const parsed=workflowRunStartSchema.safeParse(input);return parsed.success?invoke(WORKFLOW_RUN_CHANNELS.start,parsed.data):Promise.resolve(failed('invalid-request'));},
    decideWorkflowRun(input){const parsed=workflowRunDecisionSchema.safeParse(input);return parsed.success?invoke(WORKFLOW_RUN_CHANNELS.decide,parsed.data):Promise.resolve(failed('invalid-request'));},
    cancelWorkflowRun(input){const parsed=workflowRunCancelSchema.safeParse(input);return parsed.success?invoke(WORKFLOW_RUN_CHANNELS.cancel,parsed.data):Promise.resolve(failed('invalid-request'));},
    resetWorkflowClipboardPermission(input){const parsed=workflowRunPermissionResetSchema.safeParse(input);return parsed.success?invoke(WORKFLOW_RUN_CHANNELS.resetPermission,parsed.data):Promise.resolve(failed('invalid-request'));},
    onWorkflowRun(listener){if(typeof listener!=='function')throw new TypeError('A listener is required.');let active=true;const receive=(_event:unknown,value:unknown)=>{const parsed=workflowRunSnapshotSchema.safeParse(value);if(active&&parsed.success)listener(parsed.data);};transport.on(WORKFLOW_RUN_UPDATED,receive);return()=>{active=false;transport.removeListener(WORKFLOW_RUN_UPDATED,receive);};},
  });
}
