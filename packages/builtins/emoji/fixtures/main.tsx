import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from '@linuxcast/ui';
import {ViewRenderer,ViewSession} from '@linuxcast/ui/views';
import type {ViewHost} from '@linuxcast/ui/views';
import type {EmojiApi,ViewModel} from '@linuxcast/contracts';
import {EmojiFlow} from '../src/presentation.ts';
import {emojiMatchesTone} from '@linuxcast/contracts';
import {groups,rows,toneRows} from './sample.ts';
import '@linuxcast/ui/styles.css';
import '@linuxcast/ui/views.css';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state');
const root:ViewModel={protocolVersion:1,viewId:'root',revision:1,kind:'list',title:'Search commands',search:{query:'emoji',placeholder:'Search commands…',mode:'host'},sections:[{id:'commands',items:[{id:'emoji',title:'Emoji',actions:[{id:'open-emoji',title:'Emoji',kind:'invoke',effect:'read'}]}]}]};
function Fixture(){
 const [searched,setSearched]=useState('No search request observed.');const [observed,setObserved]=useState('No copy request observed.');const [released,setReleased]=useState('No search released.');const [connection]=useState(()=>{
  const sampleRows=mode?.startsWith('tone')?[...rows,...toneRows]:rows;let searches=0,copies=0;const session=new ViewSession(root,id=>flow.closed(id));
  const api:EmojiApi={searchEmoji:async input=>{const searchId=++searches;setSearched(`Observed search ${searchId}: ${input.tone??'All tones'}.`);if(mode==='tone-pending'&&input.tone)await new Promise<void>(resolve=>Object.assign(window,{resolveEmojiToneSearch:resolve}));if(mode==='loading')await new Promise<void>(resolve=>Object.assign(window,{resolveEmojiSearch:resolve}));if(mode==='search-error')throw new Error('synthetic private transport');return{ok:true,value:{...input,group:input.group??null,searchId,datasetVersion:'17.0',groups,records:mode==='empty'?[]:sampleRows.filter(row=>(!input.tone||emojiMatchesTone(row.value,input.tone))&&(!input.group||input.group===row.group)&&`${row.name} ${row.subgroup} ${row.group} ${row.value}`.toLocaleLowerCase('en-US').includes(input.query.toLocaleLowerCase('en-US')))}};},copyEmoji:async input=>{setObserved(`Observed copy request ${++copies}: ${sampleRows.find(row=>row.id===input.id)!.name}.`);if(mode==='pending')await new Promise<void>(resolve=>Object.assign(window,{resolveEmojiCopy:resolve}));if((mode==='unknown'||mode==='tone-unknown')&&copies===1)throw new Error('synthetic private copy');if(mode==='denied')return{ok:false,error:{code:'permission-denied',message:'synthetic private refusal',retryable:false}};if(mode==='unsupported')return{ok:false,error:{code:'capability-unavailable',message:'synthetic private unsupported',retryable:false}};return{ok:true,value:{...input,group:input.group??null,outcome:'copied',value:sampleRows.find(row=>row.id===input.id)!.value}};},releaseEmojiSearch:async input=>{setReleased(`Released search ${input.searchId}.`);return{ok:true,value:{outcome:'released',searchId:input.searchId}};}};
  if(mode==='missing-search')delete api.searchEmoji;if(mode==='missing-copy')delete api.copyEmoji;
  const flow=new EmojiFlow({session,api,viewId:'fixture-emoji',revision:7});const host:ViewHost={action:intent=>{if(flow.owns(intent.viewId)){void flow.handle(intent);return;}if(intent.actionId==='open-emoji')flow.open('root');},queryChanged:(viewId,query)=>flow.query(viewId,query)};return{session,host};
 });
 return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="emoji-fixture"><h1 className="lc-view-announcement">Emoji fixture</h1><ViewRenderer session={connection.session} host={connection.host}/><output data-search>{searched}</output><output data-copy>{observed}</output><output data-release>{released}</output><p className="lc-muted">Synthetic component fixture · {mode?.startsWith('tone')?'sixteen':'ten'} public examples, simulated transport and clipboard receipts. Production uses the full pinned 3944-entry offline dataset from main. No real copy or paste is performed here.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
