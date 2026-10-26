import { createWorkflowDraft } from '../../../../packages/workflows/src/registry.ts';
import { WORKFLOW_EDITOR_CHANNELS, WORKFLOW_EDITOR_CLOSE_REQUESTED, WORKFLOW_EDITOR_APPEARANCE, WORKFLOW_EDITOR_CLOSE_FINISHED, workflowEditorCloseAttemptSchema,
  workflowEditorWriteSchema, workflowEditorReadResultSchema,
  workflowEditorWriteResultSchema, workflowEditorCloseReplySchema, workflowEditorAppearanceSchema } from '../../../../packages/contracts/src/workflow-editor.ts';
import type { WorkflowWorkspaceApi } from '../../../../packages/contracts/src/workflow-editor.ts';
import { stableWorkflowJson } from '../../../../packages/storage/src/workflow-editor-json.ts';
import type { ShellTransport } from '../preload/api.ts';
const failed = (code:'unavailable'|'invalid-request'|'unknown-outcome') => ({ok:false as const,error:{code,message:{
  unavailable:'Workflow draft is unavailable. Reload to try again.',
  'invalid-request':'Invalid workflow draft request.',
  'unknown-outcome':'The draft write could not be confirmed. Reload before saving again.',
}[code]}});
export function createWorkflowEditorApi(transport:Pick<ShellTransport,'invoke'|'on'|'removeListener'>):WorkflowWorkspaceApi {
  const listen=<T>(channel:string,parse:(value:unknown)=>T|undefined,listener:(value:T)=>void)=>{
    if(typeof listener!=='function')throw new TypeError('A listener is required.');
    let active=true;
    const receive=(_event:unknown,value:unknown)=>{const parsed=parse(value);if(active&&parsed!==undefined)listener(parsed);};
    transport.on(channel,receive);return()=>{active=false;transport.removeListener(channel,receive);};
  };
  return Object.freeze({
    async load(){try {const parsed=workflowEditorReadResultSchema.safeParse(await transport.invoke(WORKFLOW_EDITOR_CHANNELS.load,{protocolVersion:1}));return parsed.success?parsed.data:failed('unavailable');}catch{return failed('unavailable');}},
    async write(input){
      const parsed=workflowEditorWriteSchema.safeParse(input);if(!parsed.success)return failed('invalid-request');
      try {
        const result=workflowEditorWriteResultSchema.safeParse(await transport.invoke(WORKFLOW_EDITOR_CHANNELS.write,{protocolVersion:1,input:parsed.data}));
        if(!result.success)return failed('unknown-outcome');
        if(result.data.ok){const record=result.data.value;if(record.revision!==parsed.data.expectedRevision+1||
          (parsed.data.action!=='revert'&&stableWorkflowJson(record.draft)!==stableWorkflowJson(parsed.data.draft))||
          (parsed.data.action==='save'&&stableWorkflowJson(record.saved)!==stableWorkflowJson(parsed.data.draft))||
          (parsed.data.action==='revert'&&stableWorkflowJson(record.draft)!==stableWorkflowJson(record.saved??createWorkflowDraft())))return failed('unknown-outcome');}
        return result.data;
      }catch{return failed('unknown-outcome');}
    },
    async close(){if(!workflowEditorCloseReplySchema.safeParse(await transport.invoke(WORKFLOW_EDITOR_CHANNELS.close,{protocolVersion:1})).success)throw new Error('Workflow window could not close.');},
    onCloseRequested(listener){
      if(typeof listener!=='function')throw new TypeError('A listener is required.');
      return listen(WORKFLOW_EDITOR_CLOSE_REQUESTED,value=>{const parsed=workflowEditorCloseAttemptSchema.safeParse(value);return parsed.success?parsed.data:undefined;},attempt=>{
        void Promise.resolve().then(()=>listener()).catch(()=>false).then(allowClose=>transport.invoke(WORKFLOW_EDITOR_CLOSE_FINISHED,{...attempt,allowClose:allowClose===true})).catch(()=>{});
      });
    },
    async getAppearance(){const parsed=workflowEditorAppearanceSchema.safeParse(await transport.invoke(WORKFLOW_EDITOR_CHANNELS.appearance,{protocolVersion:1}));if(!parsed.success)throw new Error('Appearance unavailable.');return parsed.data;},
    onAppearance(listener){return listen(WORKFLOW_EDITOR_APPEARANCE,value=>{const parsed=workflowEditorAppearanceSchema.safeParse(value);return parsed.success?parsed.data:undefined;},listener);},
  });
}
