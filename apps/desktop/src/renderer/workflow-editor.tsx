import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorState, ThemeProvider } from '@linuxcast/ui';
import { WorkflowEditor } from '../features/workflows/canvas/index.tsx';
import type { WorkflowRunWorkspaceApi } from '../../../../packages/contracts/src/workflow-editor.ts';
import '@linuxcast/ui/styles.css';
function Workspace(){
  const api=(window as unknown as {linuxcastWorkflow?:WorkflowRunWorkspaceApi}).linuxcastWorkflow;
  const [appearance,setAppearance]=useState<'dark'|'light'>();
  useEffect(()=>{let active=true;const unsubscribe=api?.onAppearance(value=>{if(active)setAppearance(value);});void api?.getAppearance().then(value=>{if(active)setAppearance(value);}).catch(()=>{});return()=>{active=false;unsubscribe?.();};},[api]);
  return <ThemeProvider appearance={appearance??'system'}>{api?<WorkflowEditor api={api} runApi={api}/>:<main><ErrorState title="Workflow editor is unavailable" description="Close and reopen Linuxcast to try again."/></main>}</ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Workspace/>);
