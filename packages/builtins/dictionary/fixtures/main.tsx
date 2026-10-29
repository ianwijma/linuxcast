import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from '@linuxcast/ui';
import {ViewRenderer,ViewSession} from '@linuxcast/ui/views';
import type {DictionaryApi,DictionaryLanguage,ViewModel} from '@linuxcast/contracts';
import {DictionaryFlow} from '../src/presentation.ts';
import '@linuxcast/ui/styles.css';
import '@linuxcast/ui/views.css';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state');
const english:DictionaryLanguage={id:'language:'+'a'.repeat(64),name:'en_AU',state:'available',encoding:'UTF-8'},french:DictionaryLanguage={...english,id:'language:'+'b'.repeat(64),name:'fr_FR'},unsupported:DictionaryLanguage={...english,id:'language:'+'c'.repeat(64),name:'legacy_XX',state:'unsupported-encoding',message:'synthetic private /home/source'};
const words=['café','cafe\u0301','notebook','snowman'].map((word,index)=>({id:'word:'+String(index+1).repeat(64),word}));
const root:ViewModel={protocolVersion:1,viewId:'root',revision:1,kind:'list',title:'Search commands',search:{query:'dictionary',placeholder:'Search commands…',mode:'host'},sections:[{id:'commands',items:[{id:'dictionary',title:'Dictionary',actions:[{id:'open-dictionary',title:'Dictionary',kind:'invoke',effect:'read'}]}]}]};
function Fixture(){
 const [observed,setObserved]=useState('No copy request observed.'),[released,setReleased]=useState('No search released.');
 const [connection]=useState(()=>{
  let searches=0,copies=0;const session=new ViewSession(root,id=>flow.closed(id));
  const api:DictionaryApi={searchDictionary:async input=>{const searchId=++searches;if(mode==='loading')await new Promise<void>(resolve=>Object.assign(window,{resolveDictionarySearch:resolve}));if(mode==='search-error')throw new Error('synthetic private read');const languages=mode==='no-languages'?[]:[english,french,unsupported],language=languages.find(row=>row.id===input.languageId)??languages[0]??null;return{ok:true,value:{revision:input.revision,searchId,query:input.query,requestedLanguageId:input.languageId??null,language,languages,languagesTruncated:false,snapshotId:language?.state==='available'?'d'.repeat(64):null,records:language?.state==='available'&&mode!=='empty'?words.filter(row=>row.word.toLowerCase().includes(input.query.toLowerCase())):[],truncated:false}};},
   copyDictionaryWord:async input=>{setObserved(`Observed copy request ${++copies}: ${words.find(row=>row.id===input.id)!.word}.`);if(mode==='pending')await new Promise<void>(resolve=>Object.assign(window,{resolveDictionaryCopy:resolve}));if(mode==='unknown'&&copies===1)throw new Error('synthetic private copy');if(mode==='denied')return{ok:false,error:{code:'permission-denied',message:'synthetic private refusal',retryable:false}};return{ok:true,value:{...input,outcome:'copied',word:words.find(row=>row.id===input.id)!.word}};},
   releaseDictionarySearch:async input=>{setReleased(`Released search ${input.searchId}.`);return{ok:true,value:{outcome:'released',searchId:input.searchId}};}};
  if(mode==='missing-search')delete api.searchDictionary;if(mode==='missing-copy')delete api.copyDictionaryWord;
  const flow=new DictionaryFlow({session,api,viewId:'fixture-dictionary',revision:7});return{session,host:{action:(intent:Parameters<DictionaryFlow['handle']>[0])=>{if(flow.owns(intent.viewId)){void flow.handle(intent);return;}if(intent.actionId==='open-dictionary')flow.open('root');},queryChanged:(viewId:string,query:string)=>flow.query(viewId,query)}};
 });
 return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="dictionary-fixture"><h1 className="lc-view-announcement">Dictionary fixture</h1><ViewRenderer session={connection.session} host={connection.host}/><output data-copy>{observed}</output><output data-release>{released}</output><p className="lc-muted">Synthetic component fixture · four public sample headwords and simulated installed-language, search and clipboard replies. No host dictionary files are read and no real clipboard write, definition or spell check is performed here.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
