import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from '@linuxcast/ui';
import {ViewRenderer,ViewSession} from '@linuxcast/ui/views';
import {emojiMatchesTone} from '@linuxcast/contracts';
import type {EmojiApi,ViewModel} from '@linuxcast/contracts';
import {EmojiFlow} from '../src/presentation.ts';
import {groups,rows,toneRows} from './sample.ts';
import '@linuxcast/ui/styles.css';
import '@linuxcast/ui/views.css';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state'),source=[...rows,...toneRows];
const root:ViewModel={protocolVersion:1,viewId:'root',revision:1,kind:'list',title:'Search commands',search:{query:'emoji',placeholder:'Search commands…',mode:'host'},sections:[{id:'commands',items:[{id:'emoji',title:'Emoji',actions:[{id:'open-emoji',title:'Emoji',kind:'invoke',effect:'read'}]}]}]};
function Fixture(){
 const [updated,setUpdated]=useState('No ranking update observed.'),[copied,setCopied]=useState('No copy observed.'),[tracked,setTracked]=useState('No Copy usage recorded.'),[other,setOther]=useState('No favourite or keyword update observed.'),[released,setReleased]=useState('No search released.');
 const [connection]=useState(()=>{
  let searchId=0,revision=3,enabled=true,updates=0,copies=0,uses=0,pending=false,copiedId:string|undefined;const entries=new Set([rows[0]!.id,rows[1]!.id]),session=new ViewSession(root,id=>flow.closed(id));
  const api:EmojiApi={searchEmoji:async input=>{if(pending)throw new Error('synthetic private busy');if(mode==='refresh-failed'&&copies>0)throw new Error('synthetic private read');return{ok:true,value:{...input,searchId:++searchId,group:input.group??null,datasetVersion:'17.0',groups,favourites:{available:true,revision:2},keywords:{available:true,revision:1},...(mode==='absent'?{}:{frecency:mode==='unavailable'?{available:false as const}:{available:true as const,revision,enabled,entryCount:entries.size}}),records:source.filter(row=>(!input.group||input.group===row.group)&&(!input.tone||emojiMatchesTone(row.value,input.tone))&&`${row.name} ${row.value}`.toLocaleLowerCase('en-US').includes(input.query.toLocaleLowerCase('en-US'))).sort((a,b)=>enabled?Number(b.id===copiedId)-Number(a.id===copiedId):0).map(row=>({...row,favourite:true,customKeywords:[]}))}};},
   updateEmojiFrecency:async input=>{setUpdated(`Observed ranking update ${++updates}: ${input.action}.`);if(mode==='pending'){pending=true;await new Promise<void>(resolve=>Object.assign(window,{resolveRankingUpdate:resolve}));pending=false;}if(mode==='denied')return{ok:false,error:{code:'permission-denied',message:'synthetic private refusal',retryable:false}};if(input.action==='reset')entries.clear();else enabled=input.action==='resume';revision++;if(mode==='unknown'&&updates===1)throw new Error('synthetic private update result');const{action:_action,...context}=input;void _action;return{ok:true,value:{...context,group:input.group??null,outcome:'updated',frecencyRevision:revision,enabled,entryCount:entries.size}};},
   copyEmoji:async input=>{setCopied(`Observed explicit Copy ${++copies}: ${source.find(row=>row.id===input.id)!.name}.`);const frecency=mode==='unavailable'||mode==='tracking-failed'?'unavailable' as const:enabled?'recorded' as const:'paused' as const;if(frecency==='recorded'){setTracked(`Recorded Copy usage ${++uses}.`);copiedId=input.id;entries.add(input.id);revision++;}return{ok:true,value:{...input,group:input.group??null,outcome:'copied',value:source.find(row=>row.id===input.id)!.value,...(mode==='absent'?{}:{frecency})}};},
   setEmojiFavourite:async()=>{setOther('Observed favourite update.');return{ok:false,error:{code:'capability-unavailable',message:'public synthetic no-effect',retryable:false}};},setEmojiKeywords:async()=>{setOther('Observed keyword update.');return{ok:false,error:{code:'capability-unavailable',message:'public synthetic no-effect',retryable:false}};},
   releaseEmojiSearch:async input=>{setReleased(`Released search ${input.searchId}.`);return{ok:true,value:{outcome:'released',searchId:input.searchId}};}};
  if(mode==='missing-api')delete api.updateEmojiFrecency;
  const flow=new EmojiFlow({session,api,viewId:'fixture-emoji',revision:7});return{session,host:{action:(intent:Parameters<EmojiFlow['handle']>[0])=>{if(flow.owns(intent.viewId)){void flow.handle(intent);return;}if(intent.actionId==='open-emoji')flow.open('root');},queryChanged:(viewId:string,query:string)=>flow.query(viewId,query)}};
 });
 return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="emoji-fixture"><h1 className="lc-view-announcement">Emoji ranking fixture</h1><ViewRenderer session={connection.session} host={connection.host}/><output data-update>{updated}</output><output data-copy>{copied}</output><output data-usage>{tracked}</output><output data-other>{other}</output><output data-release>{released}</output><p className="lc-muted">Synthetic component fixture · sixteen public sample emoji and simulated aggregate ranking, preferences, search and clipboard receipts. The fixture models a reorder for selection tests, not the production ranking formula. No host usage history, real storage, clipboard write or paste is used.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
