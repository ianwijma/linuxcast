import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Button,ThemeProvider} from '@linuxcast/ui';
import {ViewSession,ViewRenderer} from '@linuxcast/ui/views';
import type {QuicklinkApi,QuicklinkRecord,ViewModel} from '@linuxcast/contracts';
import type {ViewHost} from '@linuxcast/ui/views';
import {buildClockLinkUrl} from '@linuxcast/quicklinks/clock';
import {QuicklinksFlow,createQuicklinksFlowState} from '../src/presentation.ts';
import '@linuxcast/ui/styles.css';
import '@linuxcast/ui/views.css';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state'),id='00000000-0000-4000-8000-000000000001',stamp='2026-10-30T00:00:00.000Z';
let epoch=Date.parse('2026-12-31T23:59:59.999Z');Date.now=()=>epoch;Object.assign(window,{advanceClock:()=>{epoch=Date.parse('2027-01-01T12:00:01.000Z');}});
const root:ViewModel={protocolVersion:1,viewId:'root',revision:1,kind:'list',title:'Search commands',search:{query:'clock root',placeholder:'Search…',mode:'extension'},sections:[{id:'commands',items:[{id:'quicklinks',title:'Quicklinks',actions:[{id:'quicklinks',title:'Open Quicklinks',kind:'invoke',effect:'read'}]}]}]};
function Fixture(){
 const[observed,setObserved]=useState('No browser handoff requested.'),[saved,setSaved]=useState('No definition saved.'),[exported,setExported]=useState('No export requested.');
 const[connection]=useState(()=>{
  const records:QuicklinkRecord[]=[{id,revision:1,name:'Public time link',url:'https://example.invalid/events?keep=1&when=old#results',tags:['Clock sample'],clock:{source:mode==='date'?'date':mode==='timezone'?'timezone':'time',timeZone:mode==='system'||mode==='timezone'?'system':'UTC',queryParameter:'when'},createdAt:stamp,updatedAt:stamp}];
  let flow:QuicklinksFlow|null=null,sequence=0,opens=0,saves=0;const session=new ViewSession(root,id=>flow?.close(id)),state=createQuicklinksFlowState();
  const summaries=()=>records.map(({id,revision,name,url,clock,webSearch,pathArgument,tags,pinned,hidden})=>({id,revision,name,host:new URL(url).host,...(clock?{clock:true as const}:{}),...(webSearch?{webSearch:true as const}:{}),...(pathArgument?{pathArgument:true as const}:{}),...(tags?.length?{tags}:{}),...(pinned?{pinned:true}:{}),...(hidden?{hidden:true}:{})}));
  const api:QuicklinkApi={listQuicklinks:async()=>({ok:true,value:{records:summaries()}}),getQuicklink:async()=>({ok:true,value:{record:structuredClone(records[0]!)}}),
   saveQuicklink:async input=>{setSaved(`Observed save ${++saves}: configuration only.`);const record:QuicklinkRecord={id:input.id??id,revision:input.expectedRevision+1,name:input.name,url:input.url,...(input.tags?.length?{tags:input.tags}:{}),...(input.clock?{clock:input.clock}:{}),...(input.webSearch?{webSearch:input.webSearch}:{}),...(input.pathArgument?{pathArgument:input.pathArgument}:{}),...(input.pinned?{pinned:true}:{}),...(input.hidden?{hidden:true}:{}),createdAt:stamp,updatedAt:stamp};records[0]=record;return{ok:true,value:{record:structuredClone(record)}};},
   exportQuicklink:async input=>{setExported('Observed export: saved ID/version only.');return{ok:true,value:{...input,outcome:'exported'}};},
   openQuicklink:async input=>{setObserved(`Observed clock handoff ${++opens}: ${input.clock?.capturedAt} / ${input.clock?.timeZone}.`);if(mode==='pending')await new Promise<void>(resolve=>Object.assign(window,{settleClockOpen:resolve}));if(mode==='unknown'&&opens===1)throw new Error('Synthetic private handoff detail');if(mode==='unavailable')return{ok:false,error:{code:'capability-unavailable',message:'Synthetic unavailable',retryable:false}};const record=records[0]!;return{ok:true,value:{id:input.id,revision:input.revision,outcome:'dispatched',...(input.clock?{clock:{...input.clock,...buildClockLinkUrl(record.url,record.clock!,input.clock)}}:{})}};}
  };if(mode==='missing-api')delete api.openQuicklink;
  const hide=()=>{while(flow?.active&&session.getSnapshot().frames.length>1)session.pop();flow?.dispose();};
  const open=()=>{flow?.dispose();flow=new QuicklinksFlow({session,api,state,viewId:`clock-fixture-${++sequence}`,revision:7,onDismiss:async()=>{hide();return{ok:true,value:null};}});flow.open('root');};
  const host:ViewHost={action:intent=>{if(flow?.active){void flow.handle(intent);return;}if(intent.actionId==='quicklinks')open();}};
  return{session,host,hide};
 });
 return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="quicklinks-fixture"><h1 className="lc-view-announcement">Quicklink clock fixture</h1><ViewRenderer session={connection.session} host={connection.host}/><Button onClick={connection.hide}>Hide fixture flow</Button><output data-handoff>{observed}</output><output data-save>{saved}</output><output data-export>{exported}</output><p className="lc-muted">Synthetic fake-clock component fixture · public in-memory definitions, fixed Date.now and simulated browser receipts. Review does not open anything. No real browser, native dispatch, storage, clock history or network operation is used.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
