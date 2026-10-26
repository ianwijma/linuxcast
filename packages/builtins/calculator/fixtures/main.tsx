import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@linuxcast/ui';
import { ViewSession,ViewRenderer } from '@linuxcast/ui/views';
import type { ViewHost } from '@linuxcast/ui/views';
import type { LauncherApi,ViewModel } from '@linuxcast/contracts';
import { CalculatorFlow } from '../src/presentation.ts';
import { evaluateExpression } from '../src/evaluate.ts';
import '@linuxcast/ui/styles.css';
import '@linuxcast/ui/views.css';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state');
const root:ViewModel={protocolVersion:1,viewId:'root',revision:1,kind:'list',title:'Search commands',search:{query:'',placeholder:'Search commands…',mode:'host'},sections:[{id:'commands',items:[{id:'calculator',title:'Calculator',actions:[{id:'calculator',title:'Open Calculator',kind:'invoke',effect:'read'}]}]}]};
function Fixture(){
  const [requested,setRequested]=useState('No clipboard request observed.');
  const [connection]=useState(()=>{
    const session=new ViewSession(root,id=>{flow?.closed(id);});
    const api:Pick<LauncherApi,'copyCalculatorResult'>=mode==='missing-api'?{}:{copyCalculatorResult:async request=>{
      setRequested(`Requested numeric result copy for ${request.expression}.`);
      if(mode==='pending')await new Promise(resolve=>setTimeout(resolve,600));
      if(mode==='unknown')throw new Error('synthetic private detail');
      if(mode==='unavailable')return {ok:false,error:{code:'capability-unavailable',message:'synthetic private detail',retryable:false}};
      if(mode==='unit-mismatch')return {ok:true,value:{outcome:'copied',text:'5000',unit:'km'}};
      if(mode==='unit-missing')return {ok:true,value:{outcome:'copied',text:'5000'}};
      if(mode==='unit-unknown')return {ok:true,value:{outcome:'copied',text:'5000',unit:'not-a-unit'}} as never;
      if(mode==='mismatch')return {ok:true,value:{outcome:'copied',text:'999'}};
      const result=evaluateExpression(request.expression);if(!result.ok)return {ok:false,error:{code:'invalid-request',message:'synthetic private detail',retryable:false}};
      return {ok:true,value:{outcome:'copied',text:result.text,...(result.unit?{unit:result.unit}:{})}};
    }};
    const flow=new CalculatorFlow({session,api,viewId:'fixture-calculator',revision:7});
    const host:ViewHost={action:intent=>{if(flow.active){void flow.handle(intent);return;}if(intent.actionId==='calculator')flow.open('root');}};
    return {session,host};
  });
  return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="calculator-fixture" onKeyDownCapture={event=>{if(event.key==='Enter' && event.repeat){event.preventDefault();event.stopPropagation();}}}><h1 className="lc-view-announcement">Calculator fixture</h1><ViewRenderer session={connection.session} host={connection.host}/><output aria-live="polite">{requested}</output><p className="lc-muted">Component fixture · arithmetic runs locally; clipboard requests are observed, not performed.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
