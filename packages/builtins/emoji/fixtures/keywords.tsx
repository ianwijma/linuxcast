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
 const [saved,setSaved]=useState('No keyword save observed.'),[copied,setCopied]=useState('No copy observed.'),[favourite,setFavourite]=useState('No favourite update observed.'),[released,setReleased]=useState('No search released.');
 const [connection]=useState(()=>{
  let searchId=0,revision=3,saves=0;const keywords=new Map([[rows[0]!.id,['public grin']]]),favourites=new Set<string>(),session=new ViewSession(root,id=>flow.closed(id));
  const api:EmojiApi={searchEmoji:async input=>({ok:true,value:{...input,searchId:++searchId,group:input.group??null,datasetVersion:'17.0',groups,favourites:{available:true,revision:2},...(mode==='absent'?{}:{keywords:mode==='unavailable'?{available:false as const}:{available:true as const,revision}}),records:source.filter(row=>(!input.group||input.group===row.group)&&(!input.tone||emojiMatchesTone(row.value,input.tone))&&(!input.favouritesOnly||favourites.has(row.id))&&`${row.name} ${row.subgroup} ${row.value} ${(keywords.get(row.id)??[]).join(' ')}`.toLocaleLowerCase('en-US').includes(input.query.toLocaleLowerCase('en-US'))).map(row=>({...row,favourite:favourites.has(row.id),...(mode==='unavailable'||mode==='absent'?{}:{customKeywords:keywords.get(row.id)??[]})}))}}),
   setEmojiKeywords:async input=>{setSaved(`Observed keyword save ${++saves}: ${source.find(row=>row.id===input.id)!.name}; ${input.keywords.length} phrases.`);if(mode==='pending')await new Promise<void>(resolve=>Object.assign(window,{resolveKeywordSave:resolve}));if(mode==='denied')return{ok:false,error:{code:'permission-denied',message:'synthetic private refusal',retryable:false}};keywords.set(input.id,[...input.keywords]);revision++;if(mode==='unknown'&&saves===1)throw new Error('synthetic private keyword result');return{ok:true,value:{...input,group:input.group??null,outcome:'updated',keywordsRevision:revision}};},
   copyEmoji:async input=>{setCopied(`Observed exact canonical Copy: ${source.find(row=>row.id===input.id)!.name}.`);return{ok:true,value:{...input,group:input.group??null,outcome:'copied',value:source.find(row=>row.id===input.id)!.value}};},
   setEmojiFavourite:async input=>{setFavourite('Observed explicit favourite update.');if(input.favourite)favourites.add(input.id);else favourites.delete(input.id);return{ok:true,value:{...input,group:input.group??null,outcome:'updated',favouritesRevision:3}};},
   releaseEmojiSearch:async input=>{setReleased(`Released search ${input.searchId}.`);return{ok:true,value:{outcome:'released',searchId:input.searchId}};}};
  if(mode==='missing-api')delete api.setEmojiKeywords;
  const flow=new EmojiFlow({session,api,viewId:'fixture-emoji',revision:7});return{session,host:{action:(intent:Parameters<EmojiFlow['handle']>[0])=>{if(flow.owns(intent.viewId)){void flow.handle(intent);return;}if(intent.actionId==='open-emoji')flow.open('root');},queryChanged:(viewId:string,query:string)=>flow.query(viewId,query)}};
 });
 return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="emoji-fixture"><h1 className="lc-view-announcement">Emoji keywords fixture</h1><ViewRenderer session={connection.session} host={connection.host}/><output data-save>{saved}</output><output data-copy>{copied}</output><output data-favourite>{favourite}</output><output data-release>{released}</output><p className="lc-muted">Synthetic component fixture · sixteen public emoji examples and authored public phrases; simulated revisioned preferences, search, save and clipboard replies. No real persistence, host storage or clipboard write is performed here. Production main owns the full 3944-entry catalogue.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
