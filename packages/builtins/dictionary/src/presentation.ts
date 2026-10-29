import {dictionarySearchInputSchema,dictionarySearchReplySchema,dictionaryCopyReplySchema} from '@linuxcast/contracts';
import type {DictionaryApi,DictionarySearchValue,DictionaryLanguage,ViewModel} from '@linuxcast/contracts';
import type {ActionIntent,ViewSession} from '@linuxcast/ui/views';
import {DefinitionsFlow} from './definitions.ts';
import {SpellingFlow} from './spelling.ts';
const COPY='dictionary:copy',LANGUAGE='dictionary:language',APPLY='dictionary:apply-language',CANCEL='dictionary:cancel-language',RELOAD='dictionary:reload',BACK='dictionary:back';
const LIMITS='Installed base entries · Up to 100 matches; refine your search. Definitions and full spell checking are not available yet. Copy only; paste explicitly.';
const UNKNOWN='The copy outcome is unknown. Check your clipboard. Wait for any pending copy to settle, then Reload dictionary or enter a new search before explicitly choosing Copy word again. Nothing will be replayed.';
type Status={kind:'info'|'warning'|'error';message:string};
type Search={generation:number;query:string;languageId:string|null;viewRevision:number;controller:AbortController;received?:DictionarySearchValue};
type Copy={generation:number;data:DictionarySearchValue;row:DictionarySearchValue['records'][number];viewRevision:number;queryRevision:number;controller:AbortController};
/** Bounded metadata only: main owns installed files, snapshots and canonical copy authority. */
export class DictionaryFlow {
 #session:ViewSession;#api:DictionaryApi;#revision:number;#listId:string;#languageId:string;#viewRevision=0;#opened=false;#disposed=false;#languageOpen=false;
 #origin:{viewId:string;revision:number;query:string;selection:string|null}|undefined;#query='';#requested:string|null=null;#data:DictionarySearchValue|undefined;#languages:DictionaryLanguage[]=[];#preferred:string|null=null;#status:Status|undefined;#unknown=false;#generation=0;
 #search:Search|undefined;#copy:Copy|undefined;#actualCopy:object|undefined;#released=new Set<number>();#unsubscribe:()=>void;
 #definitions:DefinitionsFlow|undefined;#definitionsSequence=0;#spelling:SpellingFlow|undefined;#spellingSequence=0;
 constructor({session,api,viewId,revision}:{session:ViewSession;api:DictionaryApi;viewId:string;revision:number}){
  this.#session=session;this.#api=api;this.#revision=revision;this.#listId=`${viewId}-list`;this.#languageId=`${viewId}-language`;
  this.#unsubscribe=session.subscribe(()=>{
   if(!this.#opened||this.#disposed)return;
   const frame=this.#frame();if(!frame||!this.#originCurrent()){this.#abandon();return;}
   if(frame.query!==this.#query){this.#query=frame.query;this.#replace();return;}
   if(this.#copy&&!this.#copyCurrent(this.#copy,false)){this.#copy.controller.abort();this.#copy=undefined;this.#unknown=true;this.#status={kind:'error',message:UNKNOWN};this.#publish();}
  });
 }
 get active(){return this.#opened&&!this.#disposed&&!!this.#frame();}
 owns(viewId:string){return viewId===this.#listId||viewId===this.#languageId||this.#definitions?.owns(viewId)===true||this.#spelling?.owns(viewId)===true;}
 #frame(){return this.#session.getSnapshot().frames.find(frame=>frame.view.viewId===this.#listId);}
 #top(){return this.#session.getSnapshot().frames.at(-1);}
 #originCurrent(){const root=this.#session.getSnapshot().frames[0],origin=this.#origin;return !!origin&&root?.view.viewId===origin.viewId&&root.view.revision===origin.revision&&root.query===origin.query&&root.selection===origin.selection;}
 #listCurrent(){return this.active&&this.#originCurrent()&&this.#top()?.view.viewId===this.#listId&&!this.#languageOpen;}
 open(fromViewId:string){
  if(this.#disposed||this.#opened||this.#top()?.view.viewId!==fromViewId)return;
  const root=this.#session.getSnapshot().frames[0]!;this.#origin={viewId:root.view.viewId,revision:root.view.revision,query:root.query,selection:root.selection};this.#query='';this.#requested=null;this.#languages=[];this.#status=undefined;this.#preferred=null;this.#unknown=false;this.#opened=true;
  if(!this.#session.navigate({protocolVersion:1,kind:'push',fromViewId,view:this.#list()})){this.#opened=false;return;}void this.#load();
 }
 query(viewId:string,query:string){if(this.#spelling?.owns(viewId)){this.#spelling.query(viewId,query);return;}if(this.#definitions?.owns(viewId)){this.#definitions.query(viewId,query);return;}if(!this.#listCurrent()||viewId!==this.#listId)return;if(this.#frame()?.query!==query)this.#session.setQuery(viewId,query);else if(this.#query!==query){this.#query=query;this.#replace();}}
 #release(searchId:number){if(this.#released.has(searchId)||this.#data?.searchId===searchId||!this.#api.releaseDictionarySearch)return;this.#released.add(searchId);try{void this.#api.releaseDictionarySearch({revision:this.#revision,searchId}).catch(()=>{});}catch{/* Release failure does not copy; main still validates current issued context. */}}
 #dropData(){const old=this.#data;this.#data=undefined;if(old)this.#release(old.searchId);}
 #abandon(){++this.#generation;this.#search?.controller.abort();this.#search=undefined;if(this.#copy){this.#copy.controller.abort();this.#copy=undefined;this.#unknown=true;}this.#dropData();}
 #replace(){this.#preferred=this.#frame()?.selection??null;this.#abandon();this.#status=undefined;if(this.#listCurrent())void this.#load();}
 #copyReason(){return this.#spelling?.pending?'Wait for the pending spelling request to settle.':this.#definitions?.pending?'Wait for the pending definition source operation to settle.':this.#copy||this.#actualCopy?'Wait for the current clipboard request to settle.':this.#search?'Wait for dictionary search to finish.':this.#unknown?UNKNOWN:!this.#api.copyDictionaryWord?'Clipboard copying is unavailable. Reopen Linuxcast to reconnect.':this.#data?.language?.state!=='available'||!this.#data.snapshotId?'Choose an available installed language and Reload dictionary.':undefined;}
 #languageReason(){return this.#search||this.#copy||this.#actualCopy||this.#definitions?.pending||this.#spelling?.pending?'Wait for the current request to settle.':!this.#languages.length?'Install a Hunspell language dictionary through your system package manager, then Reload dictionary.':undefined;}
 #hasDefinitions(){return !!this.#api.searchDictionaryDefinitions&&!!this.#api.releaseDictionaryDefinitionsSearch;}
 #hasSpelling(){return !!this.#api.checkDictionarySpelling&&!!this.#api.copyDictionarySpellingSuggestion&&!!this.#api.releaseDictionarySpelling;}
 #spellingReason(){return this.#search||this.#copy||this.#actualCopy||this.#definitions?.pending||this.#spelling?.pending?'Wait for the current request to settle.':!this.#hasSpelling()?'Spelling is unavailable. Reopen Linuxcast to reconnect.':this.#data?.language?.state!=='available'?'Choose an available installed UTF-8 language, then Reload dictionary.':undefined;}
 #limits(){if(this.#hasSpelling())return `Installed base entries · Up to 100 matches; refine your search. Use Check spelling to interpret the selected UTF-8 language with Hunspell.${this.#hasDefinitions()?' Open Local definitions for your configured source.':''} Other encodings and thesaurus are not available yet. Copy only; paste explicitly.`;return this.#hasDefinitions()?'Installed base entries · Up to 100 matches; refine your search. Open Local definitions for your configured source. Full spell checking is not available yet. Copy only; paste explicitly.':LIMITS;}
 #sourceStatus():Status{
  const data=this.#data,language=data?.language;
  if(!language)return{kind:'warning',message:this.#languages.length?'Choose an installed language, then Reload dictionary.':'No installed language data was found. Install a Hunspell language dictionary through your system package manager, then Reload dictionary. No data is downloaded here.'};
  if(language.state==='unsupported-encoding')return{kind:'warning',message:'This installed language encoding is unsupported. Choose another language or install a UTF-8 Hunspell dictionary, then Reload dictionary.'};
  if(language.state!=='available')return{kind:'warning',message:`This installed language source is ${language.state==='invalid'?'invalid':'unavailable'}. Choose another language or repair its system package, then Reload dictionary.`};
  return{kind:'info',message:!this.#api.copyDictionaryWord?'Clipboard copying is unavailable. Reopen Linuxcast to reconnect.':data?.truncated?'More base entries match than can be shown. Refine your search.':'Search installed base entries locally. No download or network lookup is performed.'};
 }
 #list():ViewModel{
  const data=this.#data,status=this.#status??(this.#unknown?{kind:'error' as const,message:UNKNOWN}:this.#sourceStatus()),languageReason=this.#languageReason(),copyReason=this.#copyReason();
  return{protocolVersion:1,viewId:this.#listId,revision:++this.#viewRevision,kind:'list',title:'Dictionary',loading:!!this.#search||!!this.#copy,search:{query:this.#query,placeholder:'Search installed base entries…',mode:'extension'},
   ...(this.#preferred&&data?.records.some(row=>row.id===this.#preferred)?{selectedId:this.#preferred}:{}),
   status:{...status,message:`${data?.language?`Language: ${data.language.name}. `:''}${status.message} ${this.#limits()}${data?.languagesTruncated?' Only the first 64 installed languages are listed.':''}`},
   sections:[{id:'dictionary-entries',title:'Installed base entries',items:(data?.records??[]).map(row=>({id:row.id,title:row.word,subtitle:data?.language?.name??'Installed base entry',icon:{kind:'builtin' as const,name:'file'},actions:[{id:COPY,title:'Copy word',kind:'invoke' as const,effect:'write' as const,...reason(copyReason)},{id:LANGUAGE,title:'Choose language',kind:'invoke' as const,effect:'read' as const,...reason(languageReason)}]}))}],
   empty:{title:this.#search?'Searching installed base entries…':data?.language?.state==='available'?'No matching base entries':'Installed language unavailable',description:this.#hasSpelling()?'Change your search, choose another installed language, or use Check spelling for one word.':this.#hasDefinitions()?'Change your search or choose another installed language. Open Local definitions for your configured source; full spell checking is not available yet.':'Choose another installed language or Reload dictionary after installing or repairing a Hunspell language package. Definitions and full spell checking are not available yet.'},
   actions:[{id:LANGUAGE,title:'Choose language',kind:'invoke',effect:'read',...reason(languageReason)},{id:RELOAD,title:'Reload dictionary',kind:'invoke',effect:'read',...reason(this.#search||this.#copy||this.#actualCopy||this.#definitions?.pending||this.#spelling?.pending?'Wait for the current request to settle.':!this.#api.searchDictionary||!this.#api.releaseDictionarySearch?'Dictionary search is unavailable. Reopen Linuxcast to reconnect.':undefined)},{id:'dictionary:definitions',title:'Local definitions',kind:'invoke',effect:'read',...reason(this.#search||this.#copy||this.#actualCopy||this.#definitions?.pending||this.#spelling?.pending?'Wait for the current request to settle.':!this.#hasDefinitions()?'Local definitions are unavailable. Reopen Linuxcast to reconnect.':undefined)},{id:'dictionary:spelling',title:'Check spelling',kind:'invoke',effect:'read',...reason(this.#spellingReason())},{id:BACK,title:'Back',kind:'invoke',effect:'read'}]};
 }
 #publish(){if(this.active)this.#session.update(this.#listId,{protocolVersion:1,kind:'snapshot',view:this.#list()});}
 #searchCurrent(context:Search){return this.#listCurrent()&&this.#search===context&&this.#generation===context.generation&&!context.controller.signal.aborted&&this.#query===context.query&&this.#requested===context.languageId&&this.#top()?.view.revision===context.viewRevision;}
 #matches(data:DictionarySearchValue,context:Search){return data.revision===this.#revision&&data.query===context.query&&data.requestedLanguageId===context.languageId;}
 async #load(){
  if(!this.#listCurrent())return;const input={revision:this.#revision,query:this.#query,...(this.#requested?{languageId:this.#requested}:{})};
  if(!dictionarySearchInputSchema.safeParse(input).success){this.#status={kind:'error',message:'Keep searches to 512 characters and 2048 UTF-8 bytes, without control or directional formatting characters.'};this.#publish();return;}
  if(!this.#api.searchDictionary||!this.#api.releaseDictionarySearch){this.#status={kind:'error',message:'Dictionary search is unavailable. Reopen Linuxcast to reconnect.'};this.#publish();return;}
  const context:Search={generation:++this.#generation,query:this.#query,languageId:this.#requested,viewRevision:this.#viewRevision+1,controller:new AbortController()};this.#search=context;this.#status={kind:'info',message:'Searching installed base entries…'};this.#publish();
  try{
   if(!this.#searchCurrent(context))return;
   const actual=this.#api.searchDictionary(input).then(reply=>{const parsed=dictionarySearchReplySchema.safeParse(reply);if(parsed.success&&parsed.data.ok&&this.#matches(parsed.data.value,context)){context.received=parsed.data.value;if(!this.#searchCurrent(context))this.#release(parsed.data.value.searchId);}return reply;});
   const parsed=dictionarySearchReplySchema.safeParse(await bounded(actual,context.controller.signal));if(!this.#searchCurrent(context)){if(parsed.success&&parsed.data.ok&&this.#matches(parsed.data.value,context))this.#release(parsed.data.value.searchId);return;}
   if(!parsed.success||!parsed.data.ok||!this.#matches(parsed.data.value,context))throw new Error('unconfirmed');this.#data=parsed.data.value;this.#languages=parsed.data.value.languages;this.#unknown=!!this.#actualCopy;this.#status=this.#unknown?{kind:'warning',message:UNKNOWN}:undefined;
  }catch{if(this.#searchCurrent(context))this.#status={kind:'error',message:this.#unknown||this.#actualCopy?UNKNOWN:'Installed base entries could not be loaded. Wait for pending requests to settle, then Reload dictionary or choose another installed language.'};}
  finally{if(context.received&&this.#data?.searchId!==context.received.searchId)this.#release(context.received.searchId);if(this.#search===context){const current=this.#searchCurrent(context);this.#search=undefined;if(current){if(this.#requested===null&&this.#data?.searchId===context.received?.searchId&&this.#data?.language)this.#requested=this.#data.language.id;this.#publish();}}}
 }
 #language():ViewModel{return{protocolVersion:1,viewId:this.#languageId,revision:++this.#viewRevision,kind:'form',title:'Dictionary language',fields:[{id:'languageId',kind:'enum',title:'Installed language',required:true,value:this.#requested??'*',description:this.#hasSpelling()?'Select installed base entries and an explicit UTF-8 spelling check. Cancel preserves your query and selection.':this.#hasDefinitions()?'Use installed base entries only. Cancel preserves your query and selection. Open Local definitions for your configured source; full spell checking is not available yet.':'Use installed base entries only. Cancel preserves your query and selection. Definitions and full spell checking are not available yet.',options:[{value:'*',label:'Automatic installed language'},...this.#languages.map(language=>({value:language.id,label:`${language.name}${language.state==='available'?'':` (${language.state})`}`}))]}],submitActionId:APPLY,cancelActionId:CANCEL,actions:[{id:APPLY,title:'Apply language',kind:'invoke',effect:'read'},{id:CANCEL,title:'Cancel',kind:'invoke',effect:'read'}]};}
 async handle(intent:ActionIntent){
  if(this.#spelling?.owns(intent.viewId)){await this.#spelling.handle(intent);return;}
  if(this.#definitions?.owns(intent.viewId)){await this.#definitions.handle(intent);return;}
  const top=this.#top();if(!this.active||!this.#originCurrent()||!top||!this.owns(intent.viewId)||top.view.viewId!==intent.viewId||top.view.revision!==intent.revision||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId','values'].includes(key)))return;
  if(intent.viewId===this.#languageId){
   if(!this.#languageOpen||intent.itemId!==undefined||top.selection!==null)return;
   if(intent.actionId===CANCEL&&intent.values===undefined){this.#session.pop();return;}
   if(intent.actionId!==APPLY||!intent.values||Object.keys(intent.values).length!==1||typeof intent.values.languageId!=='string'||!['*',...this.#languages.map(language=>language.id)].includes(intent.values.languageId))return;
   const selected=intent.values.languageId==='*'?null:intent.values.languageId;if(selected===this.#requested){this.#session.pop();return;}this.#requested=selected;this.#session.pop();if(this.#listCurrent())this.#replace();return;
  }
  if(!this.#listCurrent()||intent.values!==undefined||intent.itemId!==(top.selection??undefined))return;
  if(top.view.actions?.find(action=>action.id===intent.actionId)?.disabledReason)return;
  if(intent.actionId===BACK){this.#session.pop();return;}
  if(intent.actionId==='dictionary:spelling'){
   if(this.#spellingReason()||!this.#data?.language)return;this.#spelling?.dispose();this.#spelling=new SpellingFlow({session:this.#session,api:this.#api,viewId:`${this.#listId}-check-${++this.#spellingSequence}`,revision:this.#revision,language:this.#data.language,onChange:()=>{if(!this.#listCurrent()||this.#spelling?.active)return;if(this.#spelling?.pending)this.#publish();else this.#replace();}});this.#spelling.open(this.#listId);return;
  }
  if(intent.actionId==='dictionary:definitions'){
   if(!this.#hasDefinitions()||this.#search||this.#copy||this.#actualCopy||this.#definitions?.pending||this.#spelling?.pending)return;this.#definitions?.dispose();this.#definitions=new DefinitionsFlow({session:this.#session,api:this.#api,viewId:`${this.#listId}-definitions-${++this.#definitionsSequence}`,revision:this.#revision,onChange:()=>{if(!this.#activeForDefinitionsReturn())return;if(this.#definitions?.pending)this.#publish();else this.#replace();}});this.#definitions.open(this.#listId);return;
  }
  if(intent.actionId===RELOAD){if(!this.#copy&&!this.#actualCopy&&!this.#search&&!this.#spelling?.pending&&!this.#definitions?.pending)this.#replace();return;}
  if(intent.actionId===LANGUAGE){if(this.#languageReason())return;this.#languageOpen=true;if(!this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#listId,view:this.#language()}))this.#languageOpen=false;return;}
  if(intent.actionId!==COPY||this.#copyReason()||!this.#data||!this.#api.copyDictionaryWord)return;const row=this.#data.records.find(row=>row.id===top.selection);if(!row)return;
  const context:Copy={generation:this.#generation,data:this.#data,row,viewRevision:this.#viewRevision+1,queryRevision:top.queryRevision,controller:new AbortController()};this.#copy=context;this.#status={kind:'info',message:`Copying ${row.word}…`};this.#publish();
  try{
   if(!this.#copyCurrent(context))return;const token={};this.#actualCopy=token;
   let actual:Promise<unknown>;try{actual=this.#api.copyDictionaryWord({revision:this.#revision,searchId:context.data.searchId,query:context.data.query,languageId:context.data.language!.id,snapshotId:context.data.snapshotId!,id:row.id});}catch{this.#actualCopy=undefined;throw new Error('unconfirmed');}
   const settled=()=>{if(this.#actualCopy===token){this.#actualCopy=undefined;if(this.#listCurrent()&&!this.#copy&&!this.#search)this.#publish();}};void actual.then(settled,settled);
   const parsed=dictionaryCopyReplySchema.safeParse(await bounded(actual,context.controller.signal));if(!this.#copyCurrent(context))return;
   if(!parsed.success)throw new Error('receipt');if(!parsed.data.ok){if(['invalid-request','capability-unavailable','permission-denied','conflict','cancelled'].includes(parsed.data.error.code)){this.#status={kind:'error',message:'The word was not copied. Check clipboard access or Reload dictionary, then choose Copy word explicitly. Paste manually; nothing was inserted.'};return;}throw new Error('unknown');}
   const value=parsed.data.value;if(value.revision!==this.#revision||value.searchId!==context.data.searchId||value.query!==context.data.query||value.languageId!==context.data.language!.id||value.snapshotId!==context.data.snapshotId||value.id!==row.id||value.word!==row.word)throw new Error('receipt');this.#status={kind:'info',message:`Copied ${row.word}. Paste it explicitly where you need it; nothing was inserted automatically.`};
  }catch{if(this.#copyCurrent(context)){this.#unknown=true;this.#status={kind:'error',message:UNKNOWN};}}
  finally{if(this.#copy===context){const current=this.#copyCurrent(context);this.#copy=undefined;if(current)this.#publish();else this.#unknown=true;}}
 }
 #copyCurrent(context:Copy,revision=true){const top=this.#top();return this.#listCurrent()&&this.#copy===context&&!context.controller.signal.aborted&&this.#generation===context.generation&&this.#data===context.data&&top?.query===context.data.query&&top.selection===context.row.id&&top.queryRevision===context.queryRevision&&(!revision||top.view.revision===context.viewRevision);}
 #activeForDefinitionsReturn(){return this.#listCurrent()&&!this.#definitions?.active;}
 closed(viewId:string){if(this.#spelling?.owns(viewId)){this.#spelling.closed(viewId);if(!this.#spelling.active){this.#spelling.dispose();if(this.#spelling.pending)this.#publish();else this.#replace();}return true;}if(this.#definitions?.owns(viewId)){this.#definitions.closed(viewId);if(!this.#definitions.active){this.#definitions.dispose();if(this.#definitions.pending)this.#publish();else this.#replace();}return true;}if(!this.owns(viewId))return false;if(viewId===this.#languageId){this.#languageOpen=false;return true;}this.#opened=false;this.#languageOpen=false;this.#definitions?.dispose();this.#spelling?.dispose();this.#abandon();this.#origin=undefined;return true;}
 dispose(){if(this.#disposed)return;this.#disposed=true;this.#opened=false;this.#languageOpen=false;this.#definitions?.dispose();this.#spelling?.dispose();this.#unsubscribe();this.#abandon();this.#origin=undefined;}
}
function reason(message:string|undefined){return message?{disabledReason:message}:{};}
function bounded<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{const finish=(run:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);run();},abort=()=>finish(()=>reject(new Error('cancelled'))),timer=setTimeout(()=>finish(()=>reject(new Error('deadline'))),5000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('unavailable'))));});}
