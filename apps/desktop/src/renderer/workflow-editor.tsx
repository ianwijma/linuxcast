import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorState, LoadingState, ThemeProvider } from '@linuxcast/ui';
import { WorkflowEditor } from '../features/workflows/canvas/index.tsx';
import type { WorkflowRunWorkspaceApi,WorkflowEditorOpenIntent } from '../../../../packages/contracts/src/workflow-editor.ts';
import '@linuxcast/ui/styles.css';
function Workspace(){
  const api=(window as unknown as {linuxcastWorkflow?:WorkflowRunWorkspaceApi}).linuxcastWorkflow;
  const [intent,setIntent]=useState<WorkflowEditorOpenIntent>(),[intentError,setIntentError]=useState(false);
  useEffect(()=>{let active=true,sequence=0;const accept=(value:WorkflowEditorOpenIntent)=>{if(active&&value.requestId>sequence){sequence=value.requestId;setIntent(value);setIntentError(false);}};const off=api?.onOpenIntent(accept);void api?.getOpenIntent().then(accept).catch(()=>{if(active&&!sequence)setIntentError(true);});return()=>{active=false;off?.();};},[api]);
  const [appearance,setAppearance]=useState<'dark'|'light'>();
  useEffect(()=>{let active=true;const unsubscribe=api?.onAppearance(value=>{if(active)setAppearance(value);});void api?.getAppearance().then(value=>{if(active)setAppearance(value);}).catch(()=>{});return()=>{active=false;unsubscribe?.();};},[api]);
  return <ThemeProvider appearance={appearance??'system'}>{intentError?<main><ErrorState title="Workflow entry unavailable" description="Reopen the command from the launcher. No run was started."/></main>:api&&!intent?<main><LoadingState label="Opening workflow workspace…"/></main>:api?<WorkflowEditor api={api} runApi={api} {...(intent?{launchIntent:intent}:{})}/>:<main><ErrorState title="Workflow editor is unavailable" description="Close and reopen Linuxcast to try again."/></main>}</ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Workspace/>);
