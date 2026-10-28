import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from '@linuxcast/ui';
import {ViewSession,ViewRenderer,type ViewHost} from '@linuxcast/ui/views';
import {RATE_ENDPOINT,type RateConfiguration,type RateConversionApi,type ViewModel} from '@linuxcast/contracts';
import {RateConversionFlow,createRateConversionFlowState} from '../src/rate-presentation.ts';
import '@linuxcast/ui/styles.css';
import '@linuxcast/ui/views.css';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state');
const root:ViewModel={protocolVersion:1,viewId:'root',revision:1,kind:'list',title:'Search commands',search:{query:'',placeholder:'Search commands…',mode:'host'},sections:[{id:'commands',items:[{id:'rates',title:'Currency conversion',actions:[{id:'rates',title:'Open Currency conversion',kind:'invoke',effect:'read'}]}]}]};
const id='123e4567-e89b-42d3-a456-426614174000';
function Fixture(){
 const [observed,setObserved]=useState({read:0,save:0,convert:0,copy:0,clear:0});
 const [connection]=useState(()=>{
  let configuration:RateConfiguration={revision:0,source:params.has('enabled')?'frankfurter':'disabled',endpoint:RATE_ENDPOINT};
  let amount='100',base='USD',quote='EUR';
  const observe=(key:keyof typeof observed)=>setObserved(previous=>({...previous,[key]:previous[key]+1}));
  const unavailable=()=>({ok:false as const,error:{code:'capability-unavailable' as const,message:'synthetic private diagnostic',retryable:false}});
  const api:Partial<RateConversionApi>=mode==='missing-api'?{}:{
   getRateConfiguration:async()=>{observe('read');return {ok:true,value:configuration};},
   configureRateSource:async request=>{observe('save');if(mode==='save-pending')await new Promise(resolve=>setTimeout(resolve,800));if(mode==='configuration-unknown')throw new Error('synthetic private diagnostic');if(mode==='conflict')return {ok:false,error:{code:'conflict',message:'synthetic private diagnostic',retryable:false}};configuration={...configuration,revision:request.expectedRevision+1,source:request.source};return {ok:true,value:configuration};},
   convertRate:async request=>{observe('convert');if(mode==='convert-pending')await new Promise(resolve=>setTimeout(resolve,800));if(mode==='unavailable')return unavailable();amount=request.amount;base=request.base;quote=request.quote;return {ok:true,value:{id,configurationRevision:configuration.revision,amount,base,quote,text:'92',provider:'frankfurter',endpoint:RATE_ENDPOINT,asOfDate:mode==='offline'?'2026-10-20':'2026-10-28',fetchedAt:mode==='offline'?'2026-10-20T00:00:00Z':new Date().toISOString(),connection:mode==='offline'?'offline':'online',stale:mode==='offline',expiresAt:new Date(Date.now()+240000).toISOString()}};},
   copyRateResult:async()=>{observe('copy');if(mode==='copy-pending')await new Promise(resolve=>setTimeout(resolve,800));if(mode==='copy-unknown')throw new Error('synthetic private diagnostic');if(mode==='copy-unavailable')return unavailable();return {ok:true,value:{outcome:'copied',quoteId:id,text:mode==='copy-mismatch'?'93':'92',currency:quote}};},
   clearRateCache:async()=>{observe('clear');if(mode==='clear-unknown')throw new Error('synthetic private diagnostic');return {ok:true,value:{outcome:'cleared'}};},
  };
  if(mode==='missing-copy')delete api.copyRateResult;
  const state=createRateConversionFlowState(),session=new ViewSession(root,viewId=>{flow?.closed(viewId);});
  const flow=new RateConversionFlow({session,api,viewId:'fixture-rates',revision:7,state});
  const host:ViewHost={action:intent=>{if(flow.active){void flow.handle(intent);return;}if(intent.actionId==='rates')flow.open('root');}};
  return {session,host};
 });
 return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="calculator-fixture"><h1 className="lc-view-announcement">Currency conversion component fixture</h1><ViewRenderer session={connection.session} host={connection.host}/><output aria-live="polite">Observed requests: {JSON.stringify(observed)}</output><p className="lc-muted">Synthetic component fixture · configuration, rate and clipboard requests are observed; no network, storage or clipboard effects occur.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
