import type { IpcMain,IpcMainInvokeEvent,WebContents } from 'electron';
import { WORKFLOW_RUN_CHANNELS } from '../../../../packages/contracts/src/workflow-run.ts';
import { trustedAppSender } from './ipc.ts';
import { WORKFLOW_EDITOR_URL } from './assets.ts';
import type { createWorkflowRuns } from './workflow-run.ts';
/** Named, exact-workspace main-frame methods. The renderer supplies no principal,
 * operation identifier, copy text, grant inventory or generic storage access. */
export function registerWorkflowRunIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,runs:ReturnType<typeof createWorkflowRuns>,contents:()=>WebContents|undefined){
  let disposed=false;
  for(const [method,channel] of Object.entries(WORKFLOW_RUN_CHANNELS))ipc.handle(channel,async(event:IpcMainInvokeEvent,payload:unknown)=>{
    const trusted=()=>!disposed&&trustedAppSender(event,contents(),WORKFLOW_EDITOR_URL);
    const failed={ok:false,error:{code:'unavailable',message:'Workflow execution is unavailable. Reopen the editor.'}};
    if(!trusted())return failed;
    let result;
    if(method==='get'){if(payload!==undefined&&(!payload||typeof payload!=='object'||Object.keys(payload).length))return failed;result=await runs.get();}
    else if(method==='start')result=await runs.start(payload,trusted);
    else if(method==='decide')result=await runs.decide(payload);
    else if(method==='cancel')result=await runs.cancel(payload);
    else result=await runs.reset(payload,trusted);
    return trusted()?result:failed;
  });
  return ()=>{disposed=true;for(const channel of Object.values(WORKFLOW_RUN_CHANNELS))ipc.removeHandler(channel);};
}
