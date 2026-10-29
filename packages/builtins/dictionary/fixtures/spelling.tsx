import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from '@linuxcast/ui';
import {ViewRenderer,ViewSession} from '@linuxcast/ui/views';
import type {DictionarySpellingApi,ViewModel} from '@linuxcast/contracts';
import {SpellingFlow} from '../src/spelling.ts';
import '@linuxcast/ui/styles.css';
import '@linuxcast/ui/views.css';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state'),language={id:'language:'+'a'.repeat(64),name:'en_AU',state:'available' as const};
const records=[{id:'spelling:'+'1'.repeat(64),text:'notebook'},{id:'spelling:'+'2'.repeat(64),text:'note book'},{id:'spelling:'+'3'.repeat(64),text:'<b>literal</b> [text](https://example.invalid)'}];
const base:ViewModel={protocolVersion:1,viewId:'base',revision:1,kind:'list',title:'Dictionary',search:{query:'note',placeholder:'Search installed base entries…',mode:'extension'},sections:[{id:'entries',items:[{id:'base-word',title:'notebook',subtitle:'en_AU',actions:[{id:'fixture:spelling',title:'Check spelling',kind:'invoke',effect:'read'}]}]}]};
function Fixture(){
 const [checks,setChecks]=useState('No spelling check requested.'),[copies,setCopies]=useState('No suggestion Copy requested.'),[release,setRelease]=useState('No spelling invocation released.'),[pending,setPending]=useState('No spelling request pending.');
 const [connection]=useState(()=>{
  let count=0,copyCount=0;const session=new ViewSession(base,id=>flow.closed(id));
  const api:DictionarySpellingApi={
   checkDictionarySpelling:async input=>{setPending('A spelling request is still pending.');setChecks(`Observed explicit check ${++count}: ${input.word}.`);if(mode==='loading')await new Promise<void>(resolve=>Object.assign(window,{resolveSpellingCheck:resolve}));if(mode==='unavailable')return{ok:false,error:{code:'capability-unavailable',message:'Synthetic unavailable source',retryable:false}};const correct=input.word==='café';return{ok:true,value:{...input,checkId:count,language,snapshotId:'b'.repeat(64),backend:'hunspell-1.7',correct,records:correct?[{id:records[0]!.id,text:input.word}]:mode==='empty'?[]:records,truncated:false}};},
   copyDictionarySpellingSuggestion:async input=>{setPending('A spelling request is still pending.');const text=input.word==='café'?'café':records.find(row=>row.id===input.id)!.text;setCopies(`Observed explicit Copy ${++copyCount}: ${text}.`);if(mode==='pending-copy')await new Promise<void>(resolve=>Object.assign(window,{resolveSpellingCopy:resolve}));if(mode==='unknown'&&copyCount===1)throw new Error('synthetic uncertain receipt');if(mode==='denied')return{ok:false,error:{code:'permission-denied',message:'Synthetic denial',retryable:false}};return{ok:true,value:{...input,outcome:'copied',text}};},
   releaseDictionarySpelling:async input=>{setRelease(`Released spelling invocation ${input.requestId}.`);return{ok:true,value:{outcome:'released',requestId:input.requestId}};}
  };
  if(mode==='missing-check')delete api.checkDictionarySpelling;if(mode==='missing-copy')delete api.copyDictionarySpellingSuggestion;
  const flow=new SpellingFlow({session,api,viewId:'fixture',revision:7,language,onChange:()=>setPending(flow.pending?'A spelling request is still pending.':'No spelling request pending.')});
  Object.assign(window,{hideSpelling:()=>{while(session.getSnapshot().frames.length>1)session.pop();},openSpelling:()=>flow.open('base')});
  return{session,host:{action:(intent:Parameters<SpellingFlow['handle']>[0])=>{if(flow.owns(intent.viewId)){void flow.handle(intent);return;}if(intent.actionId==='fixture:spelling'&&!flow.pending)flow.open('base');},queryChanged:(id:string,query:string)=>flow.query(id,query)}};
 });
 return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="dictionary-fixture"><h1 className="lc-view-announcement">Spelling component fixture</h1><ViewRenderer session={connection.session} host={connection.host}/><output data-check>{checks}</output><output data-copy>{copies}</output><output data-release>{release}</output><output data-pending>{pending}</output><p className="lc-muted">Synthetic component fixture · public sample words and suggestions; simulated installed language, spelling engine and clipboard receipts. No installed files, native spelling, clipboard writes, storage, usage recording or network lookup is used here.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
