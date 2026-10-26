import { BrowserWindow, ipcMain, nativeTheme, screen, session } from 'electron';
import { join } from 'node:path';
import { WORKFLOW_EDITOR_CLOSE_REQUESTED, WORKFLOW_EDITOR_APPEARANCE, WORKFLOW_EDITOR_CLOSE_FINISHED, workflowEditorCloseFinishedSchema,
  } from '../../../../packages/contracts/src/workflow-editor.ts';
import type { WorkflowEditorRecord, WorkflowEditorWrite } from '../../../../packages/contracts/src/workflow-editor.ts';
import { WORKFLOW_EDITOR_URL } from './assets.ts';
import { trustedAppSender } from './ipc.ts';
import { registerWorkflowEditorIpc } from './workflow-editor-ipc.ts';
import { restrictContents, securePreferences } from './security.ts';
import type { ResidentService } from './lifecycle.ts';
import tokens from '../../../../docs/design/tokens.json' with {type:'json'};
export interface WorkflowEditorOptions {
  resourcesDirectory:string; isReady():boolean;
  load():Promise<WorkflowEditorRecord|null>;
  write(input:WorkflowEditorWrite):Promise<WorkflowEditorRecord>;
}
/** Named local authoring methods only. No graph execution, file path or grant authority. */
export function createWorkflowEditorWorkspace(options:WorkflowEditorOptions):ResidentService&{open():Promise<void>;prepareClose():Promise<boolean>} {
  let window:BrowserWindow|undefined,creating:Promise<void>|undefined;
  let stopped=false,stopping=false,approvedClose=false,stopPromise:Promise<void>|undefined;
  let closeSequence=0,attempt:{id:number;owner:BrowserWindow;promise:Promise<boolean>;resolve(value:boolean):void}|undefined;
  const finishAttempt=(value:boolean)=>{const pending=attempt;attempt=undefined;pending?.resolve(value);};
  const appearance=()=>nativeTheme.shouldUseDarkColors?'dark' as const:'light' as const;
  const alive=(owner:BrowserWindow)=>!stopped&&window===owner&&!owner.isDestroyed();
  const ipc=registerWorkflowEditorIpc(ipcMain,{
    contents:()=>window?.webContents,active:()=>!stopped&&!!window&&!window.isDestroyed(),ready:options.isReady,
    appearance,load:options.load,write:options.write,
    close(){if(window&&!window.isDestroyed()){approvedClose=true;window.close();}},
  });
  const updated=()=>{if(window&&!window.isDestroyed()){window.setBackgroundColor(tokens.themes[appearance()].background);if(window.webContents.getURL()===WORKFLOW_EDITOR_URL)window.webContents.send(WORKFLOW_EDITOR_APPEARANCE,appearance());}};
  nativeTheme.on('updated',updated);
  const dispose=()=>{stopped=true;nativeTheme.off('updated',updated);ipc.remove();ipcMain.removeHandler(WORKFLOW_EDITOR_CLOSE_FINISHED);finishAttempt(false);};
  const requestClose=():Promise<boolean>=>{
    const owner=window;if(!owner||owner.isDestroyed())return Promise.resolve(true);
    if(attempt?.owner===owner)return attempt.promise;
    if(owner.webContents.getURL()!==WORKFLOW_EDITOR_URL)return Promise.resolve(false);
    let resolve!:(value:boolean)=>void;const promise=new Promise<boolean>(done=>{resolve=done;});
    attempt={id:++closeSequence,owner,promise,resolve};
    owner.webContents.send(WORKFLOW_EDITOR_CLOSE_REQUESTED,{protocolVersion:1,attemptId:attempt.id});return promise;
  };
  ipcMain.handle(WORKFLOW_EDITOR_CLOSE_FINISHED,(event,payload)=>{
    const parsed=workflowEditorCloseFinishedSchema.safeParse(payload),pending=attempt;
    if(!pending||!parsed.success||parsed.data.attemptId!==pending.id||pending.owner!==window||!trustedAppSender(event,pending.owner.webContents,WORKFLOW_EDITOR_URL))return {ok:false};
    if(!parsed.data.allowClose)finishAttempt(false); // Successful Close settles on this exact owner's closed event.
    return {ok:true};
  });
  return {
    async open(){
      if(stopped||stopping)throw new Error('Workflow editor is unavailable.');
      if(creating)return creating;
      if(window&&!window.isDestroyed()){window.show();window.focus();return;}
      creating=(async()=>{
        const area=screen.getPrimaryDisplay().workArea,owner=new BrowserWindow({
          width:Math.max(1,Math.min(1200,area.width-32)),height:Math.max(1,Math.min(800,area.height-32)),minWidth:Math.min(640,area.width),minHeight:Math.min(400,area.height),
          show:false,title:'Workflow draft — Linuxcast',backgroundColor:tokens.themes[appearance()].background,
          webPreferences:securePreferences(join(options.resourcesDirectory,'workflow-preload.cjs'),session.fromPartition('linuxcast-shell')),
        });
        window=owner;approvedClose=false;owner.setMenu(null);restrictContents(owner.webContents);
        owner.on('close',event=>{if(!approvedClose&&!stopped){event.preventDefault();void requestClose();}});
        owner.on('closed',()=>{if(window===owner)window=undefined;if(attempt?.owner===owner)finishAttempt(true);});
        try{await owner.loadURL(WORKFLOW_EDITOR_URL);if(alive(owner))owner.show();}catch{owner.destroy();throw new Error('Workflow editor is unavailable.');}
      })().finally(()=>{creating=undefined;});
      return creating;
    },
    prepareClose:requestClose,
    stop(){
      return stopPromise??=(async()=>{stopping=true;await creating?.catch(()=>{});if(window&&!window.isDestroyed())throw new Error('Workflow editor close preflight is incomplete.');await ipc.drain();dispose();})();
    },
    async terminate(){dispose();if(window&&!window.isDestroyed())window.destroy();await ipc.drain();},
  };
}
