import {dictionaryLanguageSchema,dictionaryWordSchema,dictionarySpellingInputSchema,dictionarySpellingReplySchema,dictionarySpellingCopyReplySchema} from '@linuxcast/contracts';
import type {DictionarySpellingApi,DictionarySpellingValue,DictionaryLanguage,ViewModel} from '@linuxcast/contracts';
import type {ActionIntent,ViewSession} from '@linuxcast/ui/views';
const CHECK='spelling:check',CANCEL='spelling:cancel',COPY='spelling:copy',AGAIN='spelling:again',BACK='spelling:back';
const UNKNOWN='The copy outcome is unknown. Check your clipboard. Wait for the pending request to settle, then choose Check another word and explicitly Check spelling before another Copy. Nothing will be replayed.';
const UNAVAILABLE='Spelling is unavailable. Reopen Linuxcast to reconnect, or return to Dictionary and choose an available installed language. Nothing is downloaded.';
const LIMITS='Local installed language only · No typing requests or saved word history · Copy only; paste explicitly.';
type Status={kind:'info'|'warning'|'error';message:string};
type Origin={viewId:string;revision:number;query:string;selection:string|null;queryRevision:number};
type Check={generation:number;requestId:string;word:string;viewRevision:number;controller:AbortController};
type Copy={generation:number;data:DictionarySpellingValue;row:DictionarySpellingValue['records'][number];query:string;queryRevision:number;viewRevision:number;controller:AbortController};
/** One host Form/List frame; installed files, engine and canonical clipboard authority stay in main. */
export class SpellingFlow {
 #session:ViewSession;#api:DictionarySpellingApi;#revision:number;#id:string;#language:DictionaryLanguage;#onChange:()=>void;#unsubscribe:()=>void;
 #opened=false;#disposed=false;#stale=false;#origin:Origin[]=[];#viewRevision=0;#generation=0;#phase:'form'|'results'='form';#word='';#status:Status|undefined;#fieldError:string|undefined;#unknown=false;
 #data:DictionarySpellingValue|undefined;#check:Check|undefined;#copy:Copy|undefined;#actualCheck:object|undefined;#actualCopy:object|undefined;#released=new Set<string>();
 constructor({session,api,viewId,revision,language,onChange}:{session:ViewSession;api:DictionarySpellingApi;viewId:string;revision:number;language:DictionaryLanguage;onChange?:()=>void}){
  this.#session=session;this.#api=api;this.#revision=revision;this.#id=`${viewId}-spelling`;this.#language=dictionaryLanguageSchema.parse(language);this.#onChange=onChange??(()=>{});
  this.#unsubscribe=session.subscribe(()=>{
   if(!this.#opened||this.#disposed)return;
   if(!this.#frame()||!this.#originCurrent()){this.#abandon();if(this.#frame()&&!this.#stale){this.#stale=true;this.#status={kind:'error',message:'The Dictionary context changed. Cancel or Back, then reopen Check spelling from the current Dictionary language.'};this.#publish();}return;}
   if(this.#check&&!this.#checkCurrent(this.#check)){const old=this.#check;this.#check=undefined;old.controller.abort();this.#release(old.requestId);this.#status={kind:'warning',message:'The spelling context changed. Wait for any pending check to settle, then Check spelling explicitly.'};if(this.#current())this.#publish();}
   if(this.#copy&&!this.#copyCurrent(this.#copy)){const old=this.#copy;this.#copy=undefined;old.controller.abort();this.#unknown=true;this.#dropData();this.#status={kind:'error',message:UNKNOWN};if(this.#current())this.#publish();}
  });
 }
 get active(){return this.#opened&&!this.#disposed&&!!this.#frame();}
 get pending(){return !!this.#check||!!this.#copy||!!this.#actualCheck||!!this.#actualCopy;}
 owns(viewId:string){return viewId===this.#id;}
 #frame(){return this.#session.getSnapshot().frames.find(frame=>frame.view.viewId===this.#id);}
 #top(){return this.#session.getSnapshot().frames.at(-1);}
 #originCurrent(){const frames=this.#session.getSnapshot().frames;return this.#origin.length>0&&this.#origin.every((origin,index)=>{const frame=frames[index];return frame?.view.viewId===origin.viewId&&frame.view.revision===origin.revision&&frame.query===origin.query&&frame.queryRevision===origin.queryRevision&&frame.selection===origin.selection;});}
 #current(){return this.active&&this.#originCurrent()&&this.#top()?.view.viewId===this.#id;}
 open(fromViewId:string){
  if(this.#disposed||this.#opened||this.#top()?.view.viewId!==fromViewId)return;
  this.#origin=this.#session.getSnapshot().frames.map(frame=>({viewId:frame.view.viewId,revision:frame.view.revision,query:frame.query,queryRevision:frame.queryRevision,selection:frame.selection}));
  this.#word='';this.#phase='form';this.#stale=false;this.#fieldError=undefined;this.#status=undefined;this.#unknown=!!this.#actualCopy;this.#opened=true;
  if(!this.#session.navigate({protocolVersion:1,kind:'push',fromViewId,view:this.#view()}))this.#opened=false;
 }
 /** Results filter is local only; typing never invokes the spelling backend. */
 query(viewId:string,query:string){if(this.#current()&&viewId===this.#id&&this.#phase==='results'&&this.#frame()?.query!==query)this.#session.setQuery(viewId,query);}
 #release(requestId:string){if(this.#released.has(requestId)||!this.#api.releaseDictionarySpelling)return;this.#released.add(requestId);try{void this.#api.releaseDictionarySpelling({revision:this.#revision,requestId}).catch(()=>{});}catch{/* No clipboard authority is granted by a failed release. */}}
 #dropData(){const old=this.#data;this.#data=undefined;if(old)this.#release(old.requestId);}
 #abandon(){++this.#generation;const check=this.#check;this.#check=undefined;if(check){check.controller.abort();this.#release(check.requestId);}const copy=this.#copy;this.#copy=undefined;if(copy){copy.controller.abort();this.#unknown=true;}this.#dropData();}
 #checkReason(){return this.#stale?'Cancel or Back, then reopen Check spelling from the current Dictionary language.':this.pending?'Wait for the current spelling or clipboard request to settle.':!this.#api.checkDictionarySpelling||!this.#api.releaseDictionarySpelling?UNAVAILABLE:this.#language.state!=='available'?'Return to Dictionary and choose an available installed language, then open Check spelling again.':undefined;}
 #copyReason(){return this.#stale?'Back, then reopen Check spelling from the current Dictionary language.':this.pending?'Wait for the current spelling or clipboard request to settle.':this.#unknown?UNKNOWN:!this.#api.copyDictionarySpellingSuggestion?'Clipboard copying is unavailable. Reopen Linuxcast to reconnect.':!this.#data?'Choose Check another word and explicitly Check spelling to confirm current results.':undefined;}
 #view():ViewModel{
  const status=this.#status??(this.#unknown?{kind:'error' as const,message:UNKNOWN}:this.#checkReason()?{kind:'warning' as const,message:this.#checkReason()!}:{kind:'info' as const,message:'Enter one word, then explicitly Check spelling. Results are not definitions or a guarantee of usage.'});
  const common={protocolVersion:1 as const,viewId:this.#id,revision:++this.#viewRevision,loading:!!this.#check||!!this.#copy,status:{...status,message:`Language: ${this.#language.name}. ${status.message} ${LIMITS}`}};
  if(this.#phase==='form')return{...common,kind:'form',title:'Check spelling',fields:[{id:'word',kind:'text',title:'Word',required:true,value:this.#word,description:'One word, at most 128 Unicode characters and 512 UTF-8 bytes; no spaces, controls or directional formatting. Text is not trimmed or normalised. Cancel keeps the Dictionary search and selection.',...(this.#fieldError?{error:this.#fieldError}:{})}],submitActionId:CHECK,cancelActionId:CANCEL,actions:[{id:CHECK,title:'Check spelling',kind:'invoke',effect:'read',...reason(this.#checkReason())},{id:CANCEL,title:'Cancel',kind:'invoke',effect:'read'}]};
  const data=this.#data,copyReason=this.#copyReason();
  return{...common,kind:'list',title:'Spelling results',search:{query:this.#frame()?.query??'',placeholder:'Filter spelling suggestions…',mode:'host'},sections:[{id:'spelling-results',title:data?.correct?'Recognised word':'Suggestions',items:(data?.records??[]).map(row=>({id:row.id,title:row.text,subtitle:data?.correct?'Recognised in the installed language':'Suggested by the installed language',icon:{kind:'builtin' as const,name:'file'},actions:[{id:COPY,title:'Copy suggestion',kind:'invoke' as const,effect:'write' as const,...reason(copyReason)},{id:BACK,title:'Back',kind:'invoke' as const,effect:'read' as const}]}))}],empty:{title:this.#unknown?'Clipboard outcome unknown':data?'No spelling suggestions':'Spelling results unavailable',description:this.#unknown?UNKNOWN:data?'No suggestions were returned. Try another word or return to Dictionary to choose another language. No corrected word is invented.':'Choose Check another word to explicitly check a word against the current installed source.'},actions:[{id:BACK,title:'Back',kind:'invoke',effect:'read'},{id:AGAIN,title:'Check another word',kind:'invoke',effect:'read',...reason(this.pending?'Wait for the current spelling or clipboard request to settle.':undefined)}]};
 }
 #publish(){if(this.active)this.#session.update(this.#id,{protocolVersion:1,kind:'snapshot',view:this.#view()});}
 #checkCurrent(context:Check){return this.#current()&&this.#phase==='form'&&this.#check===context&&this.#generation===context.generation&&!context.controller.signal.aborted&&this.#top()?.view.revision===context.viewRevision&&this.#top()?.selection===null;}
 #copyCurrent(context:Copy,revision=true){const frame=this.#top();return this.#current()&&this.#phase==='results'&&this.#copy===context&&this.#data===context.data&&this.#generation===context.generation&&!context.controller.signal.aborted&&frame?.query===context.query&&frame.queryRevision===context.queryRevision&&frame.selection===context.row.id&&(!revision||frame.view.revision===context.viewRevision);}
 async handle(intent:ActionIntent){
  const top=this.#top();if(!this.active||!top||top.view.viewId!==this.#id||intent.viewId!==this.#id||intent.revision!==top.view.revision||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId','values'].includes(key)))return;
  if(!this.#originCurrent()){if(intent.values===undefined&&(intent.actionId===CANCEL&&this.#phase==='form'&&intent.itemId===undefined||intent.actionId===BACK&&this.#phase==='results'&&intent.itemId===(top.selection??undefined)))this.#session.pop();return;}
  if(this.#phase==='form'){
   if(intent.itemId!==undefined||top.selection!==null)return;
   if(intent.actionId===CANCEL&&intent.values===undefined){this.#session.pop();return;}
   if(intent.actionId!==CHECK||this.#checkReason()||!plainWord(intent.values))return;
   const word=intent.values.word;if(word.length<=256)this.#word=word;
   if(!dictionaryWordSchema.safeParse(word).success){this.#fieldError='Enter one word within the stated limits, without spaces, controls or directional formatting.';this.#status={kind:'error',message:'The word was not checked. Fix the word and explicitly Check spelling.'};this.#publish();return;}
   await this.#runCheck(word);return;
  }
  if(intent.values!==undefined||intent.itemId!==(top.selection??undefined))return;
  if(intent.actionId===BACK){this.#session.pop();return;}
  if(intent.actionId===AGAIN){if(this.pending)return;this.#abandon();this.#phase='form';this.#fieldError=undefined;this.#status=this.#unknown?{kind:'error',message:UNKNOWN}:undefined;this.#session.setQuery(this.#id,'');this.#publish();return;}
  if(intent.actionId!==COPY||this.#copyReason()||!this.#data||!this.#api.copyDictionarySpellingSuggestion)return;
  const row=this.#data.records.find(row=>row.id===top.selection);if(row)await this.#runCopy(this.#data,row,top.query,top.queryRevision);
 }
 async #runCheck(word:string){
  let requestId:string;try{requestId=crypto.randomUUID();}catch{this.#status={kind:'error',message:'A fresh spelling request could not be created. Reopen Linuxcast to reconnect.'};this.#publish();return;}
  const input={revision:this.#revision,requestId,languageId:this.#language.id,word};if(!dictionarySpellingInputSchema.safeParse(input).success)return;
  this.#dropData();this.#fieldError=undefined;const context:Check={generation:++this.#generation,requestId,word,viewRevision:this.#viewRevision+1,controller:new AbortController()};this.#check=context;this.#status={kind:'info',message:'Checking spelling against the installed language…'};this.#publish();
  try{
   if(!this.#checkCurrent(context))return;const token={};this.#actualCheck=token;let actual:Promise<unknown>;
   try{actual=this.#api.checkDictionarySpelling!(input);}catch{this.#actualCheck=undefined;throw new Error('unconfirmed');}
   const settled=()=>{if(this.#actualCheck===token){this.#actualCheck=undefined;if(this.#current()&&!this.#check&&!this.#copy)this.#publish();this.#onChange();}};void actual.then(settled,settled);
   const parsed=dictionarySpellingReplySchema.safeParse(await bounded(actual,context.controller.signal));if(!this.#checkCurrent(context))return;
   if(!parsed.success||!parsed.data.ok||!sameInput(parsed.data.value,input))throw new Error('unconfirmed');
   this.#data=parsed.data.value;this.#unknown=false;this.#check=undefined;this.#phase='results';this.#status={kind:'info',message:`${parsed.data.value.correct?'Recognised':'Not recognised'} by ${parsed.data.value.language.name}.${parsed.data.value.truncated?' Only the first 32 suggestions are shown.':''}`};this.#publish();
  }catch{if(this.#checkCurrent(context)){this.#status={kind:'error',message:this.#unknown||this.#actualCopy?UNKNOWN:'Spelling could not be confirmed. The installed source or spelling service may be unavailable, unsupported or changed. Wait for any pending request, then Check spelling again, or Cancel and choose another installed language. No word was copied.'};}}
  finally{if(this.#data?.requestId!==requestId)this.#release(requestId);if(this.#check===context){const current=this.#checkCurrent(context);this.#check=undefined;if(current)this.#publish();}this.#onChange();}
 }
 async #runCopy(data:DictionarySpellingValue,row:DictionarySpellingValue['records'][number],query:string,queryRevision:number){
  const context:Copy={generation:this.#generation,data,row,query,queryRevision,viewRevision:this.#viewRevision+1,controller:new AbortController()};this.#copy=context;this.#status={kind:'info',message:`Copying ${row.text}…`};this.#publish();
  try{
   if(!this.#copyCurrent(context))return;const token={};this.#actualCopy=token;let actual:Promise<unknown>;const input={revision:data.revision,requestId:data.requestId,languageId:data.languageId,word:data.word,checkId:data.checkId,snapshotId:data.snapshotId,id:row.id};
   try{actual=this.#api.copyDictionarySpellingSuggestion!(input);}catch{this.#actualCopy=undefined;throw new Error('unconfirmed');}
   const settled=()=>{if(this.#actualCopy===token){this.#actualCopy=undefined;if(this.#current()&&!this.#copy&&!this.#check)this.#publish();this.#onChange();}};void actual.then(settled,settled);
   const parsed=dictionarySpellingCopyReplySchema.safeParse(await bounded(actual,context.controller.signal));if(!this.#copyCurrent(context))return;
   if(!parsed.success)throw new Error('unconfirmed');if(!parsed.data.ok){if(['invalid-request','capability-unavailable','permission-denied','conflict','cancelled'].includes(parsed.data.error.code)){this.#status={kind:'error',message:'The suggestion was not copied. The source or clipboard may be unavailable or changed. Choose Check another word, then explicitly Check spelling before another Copy.'};this.#dropData();return;}throw new Error('unconfirmed');}
   const value=parsed.data.value;if(!sameInput(value,input)||value.checkId!==data.checkId||value.snapshotId!==data.snapshotId||value.id!==row.id||value.text!==row.text)throw new Error('unconfirmed');this.#status={kind:'info',message:`Copied ${row.text}. Paste it explicitly where you need it; nothing was inserted automatically.`};
  }catch{if(this.#copyCurrent(context)){this.#unknown=true;this.#dropData();this.#status={kind:'error',message:UNKNOWN};}}
  finally{if(this.#copy===context){const current=this.#current();this.#copy=undefined;if(current)this.#publish();else this.#unknown=true;}this.#onChange();}
 }
 closed(viewId:string){if(!this.owns(viewId))return false;this.#opened=false;this.#abandon();this.#word='';this.#phase='form';this.#status=undefined;this.#fieldError=undefined;this.#origin=[];return true;}
 dispose(){if(this.#disposed)return;this.#disposed=true;this.#opened=false;this.#unsubscribe();this.#abandon();this.#word='';this.#origin=[];}
}
function reason(message:string|undefined){return message?{disabledReason:message}:{};}
function sameInput(value:{revision:number;requestId:string;languageId:string;word:string},input:{revision:number;requestId:string;languageId:string;word:string}){return value.revision===input.revision&&value.requestId===input.requestId&&value.languageId===input.languageId&&value.word===input.word;}
function plainWord(values:unknown):values is {word:string}{if(!values||typeof values!=='object'||(Object.getPrototypeOf(values)!==Object.prototype&&Object.getPrototypeOf(values)!==null))return false;const fields=Object.getOwnPropertyDescriptors(values);return Reflect.ownKeys(fields).length===1&&!!fields.word&&'value'in fields.word&&typeof fields.word.value==='string';}
function bounded<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{const finish=(run:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);run();},abort=()=>finish(()=>reject(new Error('cancelled'))),timer=setTimeout(()=>finish(()=>reject(new Error('deadline'))),5000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('unavailable'))));});}
