import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from '@linuxcast/ui';
import {ViewRenderer,ViewSession} from '@linuxcast/ui/views';
import type {DictionaryApi,DefinitionsSearchValue,ViewModel} from '@linuxcast/contracts';
import {DictionaryFlow} from '../src/presentation.ts';
import '@linuxcast/ui/styles.css';
import '@linuxcast/ui/views.css';
import './preview.css';
const params=new URLSearchParams(location.search),mode=params.get('state');
const source={id:'stardict:'+'a'.repeat(64),name:'Public sample dictionary',wordCount:2,snapshotId:'b'.repeat(64)},language={id:'language:'+'c'.repeat(64),name:'en_AU',state:'available' as const};
const words=[{id:'entry:'+'1'.repeat(64),word:'notebook'},{id:'entry:'+'2'.repeat(64),word:'café'}];
const text='A book of blank or ruled pages for notes.\n\nPublic literal-text example: **not bold** [not a link](https://example.invalid).\n<script>public sample</script> ![not an image](sample.png)\n  Indented source line.\nFinal source line.';
const root:ViewModel={protocolVersion:1,viewId:'root',revision:1,kind:'list',title:'Search commands',search:{query:'dictionary',placeholder:'Search commands…',mode:'host'},sections:[{id:'commands',items:[{id:'dictionary',title:'Dictionary',actions:[{id:'open-dictionary',title:'Dictionary',kind:'invoke',effect:'read'}]}]}]};
function Fixture(){
 const [reads,setReads]=useState('No definition read requested.'),[changes,setChanges]=useState('No source change requested.'),[copies,setCopies]=useState('No word copy requested.'),[released,setReleased]=useState('No definition search released.');
 const [connection]=useState(()=>{
  let searches=0,baseSearches=0,configurationRevision=1,configured=mode!=='unconfigured',configureCount=0,readCount=0;const session=new ViewSession(root,id=>flow.closed(id));
  const api:DictionaryApi={searchDictionary:async input=>({ok:true,value:{revision:input.revision,searchId:++baseSearches,query:input.query,requestedLanguageId:input.languageId??null,language,languages:[language],languagesTruncated:false,snapshotId:'d'.repeat(64),records:[{id:'word:'+'e'.repeat(64),word:'notebook'}].filter(row=>row.word.includes(input.query)),truncated:false}}),
   copyDictionaryWord:async input=>{setCopies('Observed exact base word Copy request.');return{ok:true,value:{...input,outcome:'copied',word:'notebook'}};},
   releaseDictionarySearch:async input=>({ok:true,value:{outcome:'released',searchId:input.searchId}}),
   searchDictionaryDefinitions:async input=>{const searchId=++searches;if(mode==='loading')await new Promise<void>(resolve=>Object.assign(window,{resolveDefinitionsSearch:resolve}));const sourceState:DefinitionsSearchValue['sourceState']=['unavailable','unsupported-format','invalid','changed'].includes(mode??'')?mode as DefinitionsSearchValue['sourceState']:configured?'available':'unconfigured';return{ok:true,value:{revision:input.revision,searchId,query:input.query,configurationRevision,sourceState,source:sourceState==='available'?source:null,records:sourceState==='available'&&mode!=='empty'?words.filter(row=>row.word.toLowerCase().includes(input.query.toLowerCase())):[],truncated:false}};},
   readDictionaryDefinition:async input=>{setReads(`Observed definition read ${++readCount}: ${words.find(row=>row.id===input.id)!.word}.`);return{ok:true,value:{...input,word:words.find(row=>row.id===input.id)!.word,parts:[{kind:'meaning',text:mode==='long'?'Public line with punctuation [text].\n'.repeat(450):text},{kind:'phonetic',text:'/ˈnəʊtbʊk/'}]}};},
   configureDictionaryDefinitions:async input=>{setChanges(`Observed source change ${++configureCount}: ${input.action}.`);if(mode==='cancelled')return{ok:true,value:{...input,outcome:'cancelled',nextConfigurationRevision:configurationRevision,source:configured?source:null}};if(mode==='pending')await new Promise<void>(resolve=>Object.assign(window,{resolveDefinitionsConfigure:resolve}));configured=input.action==='choose';configurationRevision++;if(mode==='unknown'&&configureCount===1)throw new Error('synthetic private source result');return{ok:true,value:{...input,outcome:configured?'configured':'forgotten',nextConfigurationRevision:configurationRevision,source:configured?source:null}};},
   releaseDictionaryDefinitionsSearch:async input=>{setReleased(`Released definition search ${input.searchId}.`);return{ok:true,value:{outcome:'released',searchId:input.searchId}};}};
  if(mode==='missing-read')delete api.readDictionaryDefinition;if(mode==='missing-configure')delete api.configureDictionaryDefinitions;
  const flow=new DictionaryFlow({session,api,viewId:'fixture-dictionary',revision:7});return{session,host:{action:(intent:Parameters<DictionaryFlow['handle']>[0])=>{if(flow.owns(intent.viewId)){void flow.handle(intent);return;}if(intent.actionId==='open-dictionary')flow.open('root');},queryChanged:(viewId:string,query:string)=>flow.query(viewId,query)}};
 });
 return <ThemeProvider appearance={params.get('theme')==='light'?'light':'dark'}><main className="dictionary-fixture"><h1 className="lc-view-announcement">Local definitions fixture</h1><ViewRenderer session={connection.session} host={connection.host}/><output data-read>{reads}</output><output data-configure>{changes}</output><output data-copy>{copies}</output><output data-release>{released}</output><p className="lc-muted">Synthetic component fixture · public sample words and literal definition parts; simulated local-source metadata, native chooser, consent and preferences. No host files, native dialog, stored preference, real clipboard or network lookup is used here.</p></main></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
