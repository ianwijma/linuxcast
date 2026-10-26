import { buildWebSearchUrl,WebSearchBuildError } from '@linuxcast/quicklinks/web-search';
import { quicklinkSelectionSchema,quicklinkListReplySchema,quicklinkNameSchema,quicklinkTagsSchema,quicklinkUrlSchema,quicklinkRecordReplySchema,quicklinkRemoveReplySchema,quicklinkOpenReplySchema,shellCommandReplySchema,webSearchParameterSchema,webSearchQuerySchema,WEB_SEARCH_TEMPLATE,MAX_QUICKLINKS } from '@linuxcast/contracts';
import type { QuicklinkSelection,QuicklinkApi,QuicklinkRecord,QuicklinkSummary,QuicklinkSave,QuicklinkWebSearch,ShellCommandReply,ViewModel } from '@linuxcast/contracts';
import type { ActionIntent,ViewSession } from '@linuxcast/ui/views';

export interface QuicklinksFlowState {metadataUnconfirmed:boolean;openUnconfirmed:boolean}
export const createQuicklinksFlowState=():QuicklinksFlowState=>({metadataUnconfirmed:false,openUnconfirmed:false});
const REVIEW='quicklinks:review-search',OPEN_SEARCH='quicklinks:open-search',EDIT_QUERY='quicklinks:edit-query';
const PIN='quicklinks:pin',UNPIN='quicklinks:unpin',HIDE='quicklinks:hide',SHOW='quicklinks:show',TOGGLE_HIDDEN='quicklinks:toggle-hidden';
const OPEN='quicklinks:open',EDIT='quicklinks:edit',REMOVE='quicklinks:remove',NEW='quicklinks:new',RELOAD='quicklinks:reload',BACK='quicklinks:back',SAVE='quicklinks:save',CANCEL='quicklinks:cancel';
const ENTRY_UNAVAILABLE='This saved quicklink changed or is unavailable. Reload quicklinks to choose a current item, or go Back.';
const METADATA_UNKNOWN='A quicklink change may have happened. Reload quicklinks before saving, removing or opening another quicklink.';
const OPEN_UNKNOWN='The browser handoff outcome is unknown. Check your browser, then reload quicklinks before opening again.';
type Status={kind:'info'|'warning'|'error';message:string};
type Search={record:QuicklinkRecord;query:string;review:boolean;target?:string;error?:string;status?:Status;missing?:boolean};
type Editor={name:string;url:string;type:string;parameter:string;tags:string;tagsError?:string;typeError?:string;parameterError?:string;record:QuicklinkRecord|null;nameError?:string;urlError?:string;status?:Status;needsReload?:boolean;missing?:boolean};
type Pending={rootQuery:string;rootSelection:string|null;controller:AbortController;kind:'list'|'get'|'save'|'remove'|'open';viewId:string;query:string;selection:string|null;editor:Editor|null;search:Search|null;searchQuery:string|undefined;searchReview:boolean|undefined;searchTarget:string|undefined};
/** Saved definitions are metadata; only explicit named API calls can write or
 * open. The retained state object fences unknown effects across Flow instances. */
export class QuicklinksFlow {
  #session:ViewSession;#api:QuicklinkApi;#state:QuicklinksFlowState;#registryRevision:number;#dismiss:()=>Promise<ShellCommandReply>;
  #listId:string;#editorId:string;#searchId:string;#search:Search|null=null;#viewRevision=0;#listOpen=false;#disposed=false;#query='';#showHidden=false;#entry:QuicklinkSelection|null=null;#entryFailed=false;#records:QuicklinkSummary[]=[];#loaded=false;
  #editor:Editor|null=null;#status:Status|undefined;#pending:Pending|null=null;#dismissal:Pending|null=null;#unsubscribe:()=>void;
  constructor({session,api,viewId,revision,state,onDismiss}:{session:ViewSession;api:QuicklinkApi;viewId:string;revision:number;state:QuicklinksFlowState;onDismiss:()=>Promise<ShellCommandReply>}){
    this.#session=session;this.#api=api;this.#listId=`${viewId}-list`;this.#editorId=`${viewId}-editor`;this.#searchId=`${viewId}-search`;this.#registryRevision=revision;this.#state=state;this.#dismiss=onDismiss;
    this.#unsubscribe=session.subscribe(()=>{
      const list=session.getSnapshot().frames.find(frame=>frame.view.viewId===this.#listId);
      if(list&&list.query!==this.#query){this.#query=list.query;this.#invalidate();this.#publish();}
      if(this.#pending&&!this.#context(this.#pending))this.#invalidate();
      if(this.#dismissal&&!this.#context(this.#dismissal)){this.#dismissal.controller.abort();this.#dismissal=null;this.#publish();}
    });
  }
  get active(){return !this.#disposed&&this.#listOpen&&this.#session.getSnapshot().frames.some(frame=>frame.view.viewId===this.#listId);}
  owns(viewId:string){return viewId===this.#listId||viewId===this.#editorId||viewId===this.#searchId;}
  open(fromViewId:string,selection?:QuicklinkSelection){if(this.#disposed||this.active)return;const parsed=selection===undefined?null:quicklinkSelectionSchema.safeParse(selection);if(selection!==undefined){this.#records=[];this.#loaded=false;}this.#entry=parsed?.success?parsed.data:null;this.#entryFailed=parsed!==null&&!parsed.success;if(this.#entryFailed)this.#status={kind:'error',message:ENTRY_UNAVAILABLE};this.#showHidden=false;this.#listOpen=this.#session.navigate({protocolVersion:1,kind:'push',fromViewId,view:this.#list()});if(this.active&&!this.#entryFailed)void this.#reload(false);}
  #warning():Status|undefined{return this.#state.metadataUnconfirmed?{kind:'error',message:METADATA_UNKNOWN}:this.#state.openUnconfirmed?{kind:'error',message:OPEN_UNKNOWN}:undefined;}
  #busy(){return !!(this.#pending||this.#dismissal);}
  #disabled(method:keyof QuicklinkApi,effect:'read'|'write'|'open'){
    if(this.#busy())return 'Wait for the current request to finish.';
    if(!this.#api[method]||effect!=='read'&&!this.#api.listQuicklinks)return 'This Quicklinks capability is unavailable. Reopen Linuxcast to reconnect.';
    if(effect!=='read'&&this.#state.metadataUnconfirmed)return METADATA_UNKNOWN;
    if(effect==='open'&&this.#state.openUnconfirmed)return OPEN_UNKNOWN;
    return undefined;
  }
  #list():ViewModel{
    const selected=this.#session?.getSnapshot().frames.find(frame=>frame.view.viewId===this.#listId)?.selection??this.#entry?.id;
    const query=this.#query.normalize('NFKC').toLocaleLowerCase('en-US').trim(),tooLong=this.#query.length>512;
    const matches=tooLong?[]:this.#records.filter(record=>(this.#showHidden||!record.hidden)&&query.split(/\s+/u).every(word=>`${record.name} ${record.host} ${(record.tags??[]).join(' ')}`.normalize('NFKC').toLocaleLowerCase('en-US').includes(word))).sort(presentationOrder);
    const rows=matches.slice(0,100),retained=matches.find(record=>record.id===selected);if(retained&&!rows.some(record=>record.id===retained.id))rows[rows.length-1]=retained;rows.sort(presentationOrder);
    const pendingStatus=this.#pending?{kind:'info' as const,message:this.#pending.kind==='open'?'Handing quicklink to the browser…':this.#pending.kind==='remove'?'Waiting for removal confirmation…':this.#pending.kind==='save'?'Saving quicklink…':this.#pending.kind==='get'?'Loading quicklink…':'Loading quicklinks…'}:undefined;
    const status=tooLong?{kind:'warning' as const,message:'Keep searches to 512 characters or fewer.'}:pendingStatus??this.#status??this.#warning()??(!this.#api.listQuicklinks?{kind:'error' as const,message:'Saved quicklinks are unavailable. Reopen Linuxcast to reconnect.'}:undefined);
    return {protocolVersion:1,viewId:this.#listId,revision:++this.#viewRevision,kind:'list',title:'Quicklinks',loading:this.#busy(),...(this.#entry&&rows.some(row=>row.id===this.#entry!.id)?{selectedId:this.#entry.id}:{}),search:{query:this.#query,placeholder:'Search saved names, hosts and tags…',mode:'extension'},
      sections:[{id:'saved',title:'Saved quicklinks · Up to 100 matches; refine your search',items:rows.map(record=>({id:record.id,title:record.name,subtitle:record.host,...((record.webSearch||record.tags?.length||record.pinned||record.hidden)?{accessories:[...(record.pinned?[{text:'Pinned'}]:[]),...(record.hidden?[{text:'Hidden'}]:[]),...(record.webSearch?[{text:'Web search'}]:[]),...(record.tags??[]).map(text=>({text}))]}:{}),icon:{kind:'builtin' as const,name:'link'},actions:[
        {id:OPEN,title:record.webSearch?'Open web search':'Open quicklink',kind:'invoke' as const,effect:record.webSearch?'read' as const:'write' as const,...reason(record.hidden?'Show this quicklink before opening it.':this.#disabled(record.webSearch?'getQuicklink':'openQuicklink','open'))},
        {id:EDIT,title:'Edit quicklink',kind:'invoke' as const,effect:'read' as const,...reason(this.#disabled('getQuicklink','read'))},
        {id:record.pinned?UNPIN:PIN,title:record.pinned?'Unpin quicklink':'Pin quicklink',kind:'invoke' as const,effect:'write' as const,...reason(this.#presentationDisabled())},
        {id:record.hidden?SHOW:HIDE,title:record.hidden?'Show quicklink':'Hide quicklink',kind:'invoke' as const,effect:'write' as const,...reason(this.#presentationDisabled())},
        {id:REMOVE,title:'Remove quicklink',kind:'invoke' as const,effect:'destructive' as const,...reason(this.#disabled('removeQuicklink','write'))},
      ]}))}],empty:{title:this.#pending?'Loading quicklinks…':this.#loaded?'No quicklinks yet':'Quicklinks unavailable',description:this.#entryFailed?'Reload the saved list to choose an item manually, or go Back.':`Create a named HTTP or HTTPS quicklink. ${this.#showHidden?'Hidden quicklinks are included; show a link before opening it.':'Hidden quicklinks are excluded; use Show hidden Quicklinks in Actions to recover them.'} Search stays local; at most 100 matches are shown. Opening requires an explicit action.`},...(status?{status}:{}),
      actions:this.#entryFailed?[{id:RELOAD,title:'Reload quicklinks',kind:'invoke',effect:'read',...reason(this.#disabled('listQuicklinks','read'))},{id:BACK,title:'Back',kind:'invoke',effect:'read'}]:[{id:NEW,title:'New quicklink',kind:'invoke',effect:'read',...reason(this.#busy()?'Wait for the current request to finish.':!this.#api.saveQuicklink||!this.#api.listQuicklinks?'Saving quicklinks is unavailable. Reopen Linuxcast to reconnect.':this.#records.length>=MAX_QUICKLINKS?'500 quicklinks are saved. Remove one before creating another.':undefined)},
        {id:TOGGLE_HIDDEN,title:this.#showHidden?'Hide hidden Quicklinks':'Show hidden Quicklinks',kind:'invoke',effect:'read'},
        {id:RELOAD,title:'Reload quicklinks',kind:'invoke',effect:'read',...reason(this.#disabled('listQuicklinks','read'))},{id:BACK,title:'Back',kind:'invoke',effect:'read'}]};
  }
  #form():ViewModel{
    const editor=this.#editor!,status=editor.status??this.#warning();
    return {protocolVersion:1,viewId:this.#editorId,revision:++this.#viewRevision,kind:'form',title:editor.record?'Edit quicklink':'New quicklink',loading:this.#busy(),
      fields:[{id:'name',kind:'text',title:'Name',required:true,value:editor.name,description:'A unique saved name, up to 128 characters.',...(editor.nameError?{error:editor.nameError}:{})},
        {id:'url',kind:'text',title:'URL',required:true,value:editor.url,description:'HTTP or HTTPS base URL. Web searches add an encoded query parameter; raw placeholders and braces are not supported.',...(editor.urlError?{error:editor.urlError}:{})},
        {id:'type',kind:'enum',title:'Type',required:true,value:editor.type==='literal'||editor.type==='search'?editor.type:null,options:[{value:'literal',label:'Literal link'},{value:'search',label:'Web search'}],...(editor.typeError?{error:editor.typeError}:{})},
        {id:'queryParameter',kind:'text',title:'Query parameter',required:false,value:editor.parameter,description:'For a web search, use an ASCII query parameter such as q. Leave blank for a literal link.',...(editor.parameterError?{error:editor.parameterError}:{})},
        {id:'tags',kind:'text',title:'Tags',required:false,value:editor.tags,description:'Optional: up to 8 unique tags, separated by commas. Each tag allows up to 32 characters and 64 UTF-8 bytes.',...(editor.tagsError?{error:editor.tagsError}:{})}],
      submitActionId:SAVE,cancelActionId:CANCEL,...(status?{status}:{}),actions:[{id:SAVE,title:'Save quicklink',kind:'invoke',effect:'write',...reason(editor.missing?'This quicklink no longer exists. Cancel, then create a new quicklink.':this.#disabled('saveQuicklink','write'))},
        {id:CANCEL,title:'Cancel',kind:'invoke',effect:'read'},{id:RELOAD,title:'Reload quicklinks',kind:'invoke',effect:'read',...reason(this.#disabled('listQuicklinks','read'))}]};
  }
  #searchView():ViewModel{
    const search=this.#search!,status=search.status??this.#warning(),disabled=search.record.hidden?'Show this quicklink before opening it.':search.missing?'This definition is no longer a saved web search. Cancel and reopen it from Quicklinks.':undefined;
    if(search.review)return {protocolVersion:1,viewId:this.#searchId,revision:++this.#viewRevision,kind:'detail',title:'Review search',loading:this.#busy(),markdown:'Review the encoded target before opening. Linuxcast does not save this query. Opening sends the target to your default browser.',metadata:[{label:'Query',value:search.query},{label:'Target URL',value:search.target!}],attachments:[],...(status?{status}:{}),actions:[
      {id:OPEN_SEARCH,title:'Open search',kind:'invoke',effect:'write',...reason(disabled??this.#disabled('openQuicklink','open'))},{id:EDIT_QUERY,title:'Edit query',kind:'invoke',effect:'read'},
      {id:CANCEL,title:'Cancel',kind:'invoke',effect:'read'},{id:RELOAD,title:'Reload quicklinks',kind:'invoke',effect:'read',...reason(this.#disabled('listQuicklinks','read'))}]};
    return {protocolVersion:1,viewId:this.#searchId,revision:++this.#viewRevision,kind:'form',title:'Search web',loading:this.#busy(),fields:[{id:'query',kind:'text',title:'Query',required:true,value:search.query,description:`Search ${search.record.name}. Review the encoded URL before opening. Up to 2048 UTF-8 bytes.`,...(search.error?{error:search.error}:{})}],submitActionId:REVIEW,cancelActionId:CANCEL,...(status?{status}:{}),actions:[
      {id:REVIEW,title:'Review search',kind:'invoke',effect:'read',...reason(disabled??(this.#busy()?'Wait for the current request to finish.':undefined))},{id:CANCEL,title:'Cancel',kind:'invoke',effect:'read'},
      {id:RELOAD,title:'Reload quicklinks',kind:'invoke',effect:'read',...reason(this.#disabled('listQuicklinks','read'))}]};
  }
  #review(intent:ActionIntent){
    const search=this.#search!,query=intent.values?.query;if(search.missing||this.#busy()||typeof query!=='string'||Object.keys(intent.values??{}).length!==1)return;
    search.query=query;delete search.target;delete search.error;delete search.status;
    if(!webSearchQuerySchema.safeParse(query).success){search.error='Enter a non-blank query up to 2048 UTF-8 bytes without control characters.';this.#publish();return;}
    try{search.target=buildWebSearchUrl(search.record.url,search.record.webSearch!,query);search.review=true;}
    catch(error){if(error instanceof WebSearchBuildError&&error.reason==='result-too-large')search.error='The encoded URL is too long. Shorten the query or edit the saved base URL.';else search.status={kind:'error',message:'The saved web search could not be reviewed. Reload quicklinks or edit its definition.'};}
    this.#publish();
  }
  #publish(){if(!this.active)return;this.#session.update(this.#listId,{protocolVersion:1,kind:'snapshot',view:this.#list()});if(this.#editor)this.#session.update(this.#editorId,{protocolVersion:1,kind:'snapshot',view:this.#form()});if(this.#search)this.#session.update(this.#searchId,{protocolVersion:1,kind:'snapshot',view:this.#searchView()});}
  #begin(kind:Pending['kind']):Pending{
    const frames=this.#session.getSnapshot().frames,list=frames.find(frame=>frame.view.viewId===this.#listId)!;
    const pending:Pending={rootQuery:frames[0]!.query,rootSelection:frames[0]!.selection,controller:new AbortController(),kind,viewId:frames.at(-1)!.view.viewId,query:list.query,selection:list.selection,editor:this.#editor,search:this.#search,searchQuery:this.#search?.query,searchReview:this.#search?.review,searchTarget:this.#search?.target};this.#pending=pending;this.#status=undefined;this.#publish();return pending;
  }
  #context(pending:Pending){const frames=this.#session.getSnapshot().frames,list=frames.find(frame=>frame.view.viewId===this.#listId);return this.active&&frames[0]?.query===pending.rootQuery&&frames[0]?.selection===pending.rootSelection&&frames.at(-1)?.view.viewId===pending.viewId&&list?.query===pending.query&&list.selection===pending.selection&&this.#editor===pending.editor&&this.#search===pending.search&&this.#search?.query===pending.searchQuery&&this.#search?.review===pending.searchReview&&this.#search?.target===pending.searchTarget;}
  #current(pending:Pending){return this.#pending===pending&&!pending.controller.signal.aborted&&this.#context(pending);}
  #unknown(kind:Pending['kind']){if(kind==='save'||kind==='remove'){this.#state.metadataUnconfirmed=true;this.#status={kind:'error',message:METADATA_UNKNOWN};}else if(kind==='open'){this.#state.openUnconfirmed=true;this.#status={kind:'error',message:OPEN_UNKNOWN};}const warning=this.#warning();if(this.#editor&&warning)this.#editor.status=warning;if(this.#search&&warning)this.#search.status=warning;}
  #invalidate(){const pending=this.#pending;if(!pending)return;this.#pending=null;if(this.#entry){this.#entry=null;this.#entryFailed=true;this.#status={kind:'error',message:ENTRY_UNAVAILABLE};}this.#unknown(pending.kind);pending.controller.abort();this.#publish();}
  #finish(pending:Pending){if(this.#pending===pending){this.#pending=null;this.#publish();}}
  async #readList(pending:Pending){const raw=await bounded(this.#api.listQuicklinks!(),pending.controller.signal),reply=quicklinkListReplySchema.parse(raw);if(!reply.ok)throw new Error('Read unavailable.');if(reply.value.records.some((record,index)=>!sameTags(record.tags,(raw as {value:{records:QuicklinkSummary[]}}).value.records[index]?.tags)))throw new Error('Noncanonical tags.');return reply.value.records;}
  async #readRecord(pending:Pending,summary:QuicklinkSummary){const reply=parseRecord(await bounded(this.#api.getQuicklink!({id:summary.id,revision:summary.revision}),pending.controller.signal));if(!reply.ok)throw new Error('Read unavailable.');const record=reply.value.record;if(record.id!==summary.id||record.revision!==summary.revision||record.name!==summary.name||new URL(record.url).host!==summary.host||Boolean(record.webSearch)!==Boolean(summary.webSearch)||!sameTags(record.tags,summary.tags)||!sameFlags(record,summary))throw new Error('Invalid record.');return record;}
  async #reload(explicit:boolean){
    if(!this.active||this.#busy()||!this.#api.listQuicklinks)return;if(explicit){this.#entry=null;this.#entryFailed=false;}const pending=this.#begin('list');
    try{const records=await this.#readList(pending);let fresh:QuicklinkRecord|null=null;const editor=this.#editor,search=this.#search,recordId=editor?.record?.id??search?.record.id,summary=recordId?records.find(record=>record.id===recordId):undefined;
      if(summary){if(!this.#api.getQuicklink)throw new Error();fresh=await this.#readRecord(pending,summary);}
      if(!this.#current(pending))return;if(this.#entry&&!records.some(record=>record.id===this.#entry!.id&&record.revision===this.#entry!.revision&&!record.hidden))throw new Error('Entry unavailable.');this.#pending=null;this.#records=records;this.#loaded=true;
      if(explicit){this.#state.metadataUnconfirmed=false;this.#state.openUnconfirmed=false;this.#status=undefined;if(editor){editor.record=fresh??editor.record;editor.missing=!!editor.record&&!summary;delete editor.nameError;delete editor.urlError;delete editor.needsReload;delete editor.typeError;delete editor.parameterError;delete editor.tagsError;editor.status={kind:editor.missing?'error':'info',message:editor.missing?'This quicklink no longer exists. Cancel, then create a new quicklink.':'Stored quicklinks reloaded. Your draft is retained; review it before saving.'};}if(search){if(fresh)search.record=fresh;search.review=false;delete search.target;delete search.error;search.missing=!fresh?.webSearch;search.status={kind:search.missing?'error':'info',message:search.missing?'This definition is no longer a saved web search. Cancel and reopen it from Quicklinks.':'Stored definitions reloaded. Your query is retained; review it again before opening.'};}}
      this.#publish();this.#entry=null;
    }catch{if(this.#current(pending)){if(this.#entry){this.#entry=null;this.#entryFailed=true;this.#records=[];this.#loaded=false;}const status:Status={kind:'error',message:this.#entryFailed?ENTRY_UNAVAILABLE:'Quicklinks could not be loaded. Reload quicklinks or reopen Linuxcast to reconnect.'};if(this.#editor)this.#editor.status=status;else if(this.#search)this.#search.status=status;else this.#status=status;}}
    finally{this.#finish(pending);}
  }
  async handle(intent:ActionIntent){
    const top=this.#session.getSnapshot().frames.at(-1);if(!this.active||!top||!this.owns(intent.viewId)||top.view.viewId!==intent.viewId||top.view.revision!==intent.revision||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId','values'].includes(key)))return;
    if(intent.viewId===this.#searchId){
      if(intent.itemId!==undefined)return;
      if(intent.actionId===CANCEL&&intent.values===undefined){this.#session.pop();return;}
      if(intent.actionId===RELOAD&&intent.values===undefined){await this.#reload(true);return;}
      const search=this.#search!;
      if(intent.actionId===EDIT_QUERY&&intent.values===undefined&&search.review){this.#invalidate();search.review=false;delete search.target;this.#publish();return;}
      if(intent.actionId===REVIEW&&!search.review){this.#review(intent);return;}
      if(intent.actionId===OPEN_SEARCH&&intent.values===undefined&&search.review&&search.target&&!search.missing&&!search.record.hidden&&!this.#disabled('openQuicklink','open'))await this.#openLink(search.record,{query:search.query,url:search.target});return;
    }
    if(intent.viewId===this.#editorId){if(intent.itemId!==undefined)return;if(intent.actionId===CANCEL&&intent.values===undefined){this.#session.pop();return;}if(intent.actionId===RELOAD&&intent.values===undefined){await this.#reload(true);return;}if(intent.actionId===SAVE&&!this.#busy())await this.#save(intent);return;}
    if(intent.values!==undefined||intent.itemId!==undefined&&intent.itemId!==top.selection||this.#entryFailed&&intent.actionId!==RELOAD&&intent.actionId!==BACK)return;
    if(intent.actionId===BACK){this.#session.pop();return;}if(intent.actionId===TOGGLE_HIDDEN){this.#invalidate();this.#showHidden=!this.#showHidden;this.#publish();return;}if(this.#busy())return;
    if(intent.actionId===RELOAD){await this.#reload(true);return;}
    if(intent.actionId===NEW){if(this.#api.saveQuicklink&&this.#records.length<MAX_QUICKLINKS){this.#editor={name:'',url:'',type:'literal',parameter:'',tags:'',record:null};this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#listId,view:this.#form()});}return;}
    const summary=this.#records.find(record=>record.id===intent.itemId);if(!summary||summary.id!==top.selection)return;
    if(intent.actionId===EDIT&&this.#api.getQuicklink){await this.#edit(summary);return;}
    if(intent.actionId===OPEN&&!summary.hidden&&!this.#disabled(summary.webSearch?'getQuicklink':'openQuicklink','open')){if(summary.webSearch)await this.#edit(summary,true);else await this.#openLink(summary);return;}
    if((intent.actionId===(summary.pinned?UNPIN:PIN)||intent.actionId===(summary.hidden?SHOW:HIDE))&&!this.#presentationDisabled()){await this.#changePresentation(summary,intent.actionId===PIN||intent.actionId===UNPIN?'pinned':'hidden');return;}
    if(intent.actionId===REMOVE&&!this.#disabled('removeQuicklink','write'))await this.#remove(summary);
  }
  async #edit(summary:QuicklinkSummary,forSearch=false){const pending=this.#begin('get');try{const record=await this.#readRecord(pending,summary);if(!this.#current(pending))return;this.#pending=null;if(forSearch){if(!record.webSearch)throw new Error();this.#search={record,query:'',review:false};this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#listId,view:this.#searchView()});}else{this.#editor={name:record.name,url:record.url,type:record.webSearch?'search':'literal',parameter:record.webSearch?.queryParameter??'',tags:(record.tags??[]).join(', '),record};this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#listId,view:this.#form()});}}catch{if(this.#current(pending))this.#status={kind:'error',message:'This quicklink could not be loaded. Reload quicklinks and select it again.'};}finally{this.#finish(pending);}}
  #checkAfterMutation(records:QuicklinkSummary[],record:QuicklinkRecord|null,removedId?:string){
    const expected=new Set(this.#records.map(value=>value.id));if(removedId)expected.delete(removedId);if(record)expected.add(record.id);
    if(expected.size!==records.length||records.some(value=>!expected.has(value.id)))throw new Error('Incomplete summaries.');
    for(const next of records){const previous=this.#records.find(value=>value.id===next.id);if(record?.id===next.id){if(next.revision!==record.revision||next.name!==record.name||next.host!==new URL(record.url).host||Boolean(next.webSearch)!==Boolean(record.webSearch)||!sameTags(next.tags,record.tags)||!sameFlags(next,record))throw new Error('Unconfirmed save.');}else if(!previous||!sameSummary(previous,next))throw new Error('Changed summary.');}
  }
  async #save(intent:ActionIntent){
    const editor=this.#editor;if(!editor||editor.missing||this.#disabled('saveQuicklink','write'))return;const name=intent.values?.name,url=intent.values?.url,type=intent.values?.type,parameter=intent.values?.queryParameter,tags=intent.values?.tags;
    if(typeof name!=='string'||typeof url!=='string'||typeof type!=='string'||typeof parameter!=='string'||typeof tags!=='string'||Object.keys(intent.values??{}).length!==5)return;editor.name=name;editor.url=url;editor.type=type;editor.parameter=parameter;editor.tags=tags;delete editor.tagsError;delete editor.nameError;delete editor.urlError;delete editor.status;delete editor.typeError;delete editor.parameterError;
    const parsedName=quicklinkNameSchema.safeParse(name.trim()),parsedUrl=quicklinkUrlSchema.safeParse(url),parsedTags=quicklinkTagsSchema.safeParse(tags.trim()===''&&!/[\p{Cc}\p{Cs}]/u.test(tags)?[]:tags.split(','));
    if(!parsedName.success)editor.nameError='Use a non-empty name up to 128 characters and 256 UTF-8 bytes, without control characters.';
    if(!parsedUrl.success)editor.urlError='Use a literal HTTP or HTTPS address without credentials, spaces or raw braces. Placeholders are not supported yet.';
    if(!parsedTags.success)editor.tagsError='Use up to 8 unique tags, each 1–32 characters and at most 64 UTF-8 bytes. Remove empty labels, duplicates and control characters.';
    if(type!=='literal'&&type!=='search')editor.typeError='Choose Literal link or Web search.';
    if(type==='literal'&&parameter!=='')editor.parameterError='Clear this field for a literal link, or choose Web search.';
    if(type==='search'&&!webSearchParameterSchema.safeParse(parameter).success)editor.parameterError='Use 1–64 ASCII letters, digits, underscores, dots or hyphens, starting with a letter.';
    if(!parsedName.success||!parsedUrl.success||!parsedTags.success||editor.typeError||editor.parameterError){this.#publish();return;}
    const request:QuicklinkSave={...(editor.record?{id:editor.record.id}:{}),expectedRevision:editor.record?.revision??0,name:parsedName.data,url:parsedUrl.data,...(editor.record?.pinned?{pinned:true}:{}),...(editor.record?.hidden?{hidden:true}:{}),...(parsedTags.data.length?{tags:parsedTags.data}:{}),...(type==='search'?{webSearch:{queryParameter:parameter,template:WEB_SEARCH_TEMPLATE}}:{})};const pending=this.#begin('save');
    try{const reply=parseRecord(await bounded(this.#api.saveQuicklink!(request),pending.controller.signal));if(!this.#current(pending))return;
      if(!reply.ok){if(['conflict','invalid-request','capability-unavailable','permission-denied'].includes(reply.error.code)){const conflict=reply.error.details?.reason;editor.needsReload=true;if(conflict==='quicklink-name-conflict'){editor.nameError='This name is already saved. Choose another name.';delete editor.needsReload;}else editor.status={kind:'error',message:conflict==='quicklink-limit-reached'?'500 quicklinks are saved. Cancel and remove one before creating another.':'The quicklink was not saved. Check the fields or reload quicklinks to reconnect and review its current version.'};return;}throw new Error();}
      const record=reply.value.record;this.#checkSavedRecord(record,request,editor.record);
      const records=await this.#readList(pending);this.#checkAfterMutation(records,record);if(!this.#current(pending))return;
      this.#pending=null;this.#records=records;this.#loaded=true;this.#editor=null;this.#session.pop();this.#session.select(this.#listId,record.id);this.#publish();
    }catch{if(this.#current(pending))this.#unknown('save');}finally{this.#finish(pending);}
  }
  #presentationDisabled(){return this.#disabled('saveQuicklink','write')??(!this.#api.getQuicklink?'This Quicklinks capability is unavailable. Reopen Linuxcast to reconnect.':undefined);}
  #checkSavedRecord(record:QuicklinkRecord,request:QuicklinkSave,previous:QuicklinkRecord|null){
    if(record.name!==request.name||record.url!==request.url||!sameSearch(record.webSearch,request.webSearch)||!sameTags(record.tags,request.tags)||!sameFlags(record,request)||record.revision!==request.expectedRevision+1||previous&&(record.id!==previous.id||record.createdAt!==previous.createdAt||record.updatedAt<previous.updatedAt)||!previous&&(this.#records.some(value=>value.id===record.id)||record.createdAt!==record.updatedAt))throw new Error('Unconfirmed save.');
  }
  async #changePresentation(summary:QuicklinkSummary,flag:'pinned'|'hidden'){
    const pending=this.#begin('get');try{
      const previous=await this.#readRecord(pending,summary);if(!this.#current(pending))return;
      const flags={pinned:!!previous.pinned,hidden:!!previous.hidden};flags[flag]=!flags[flag];
      const request:QuicklinkSave={id:previous.id,expectedRevision:previous.revision,name:previous.name,url:previous.url,...(previous.tags?.length?{tags:previous.tags}:{}),...(previous.webSearch?{webSearch:previous.webSearch}:{}),...(flags.pinned?{pinned:true}:{}),...(flags.hidden?{hidden:true}:{})};
      pending.kind='save';this.#publish();if(!this.#current(pending))return;const reply=parseRecord(await bounded(this.#api.saveQuicklink!(request),pending.controller.signal));if(!this.#current(pending))return;
      if(!reply.ok){if(['conflict','invalid-request','capability-unavailable','permission-denied'].includes(reply.error.code)){this.#status={kind:'error',message:'The quicklink preference was not saved. Reload quicklinks to review its current version or reopen Linuxcast to reconnect.'};return;}throw new Error();}
      const record=reply.value.record;this.#checkSavedRecord(record,request,previous);
      const records=await this.#readList(pending);this.#checkAfterMutation(records,record);if(!this.#current(pending))return;
      this.#pending=null;this.#records=records;this.#loaded=true;this.#publish();
    }catch{if(this.#current(pending)){if(pending.kind==='save')this.#unknown('save');else this.#status={kind:'error',message:'This quicklink could not be loaded. Reload quicklinks and select it again.'};}}finally{this.#finish(pending);}
  }
  async #remove(summary:QuicklinkSummary){const pending=this.#begin('remove');try{
      // Native confirmation awaits a human; navigation still invalidates this
      // presentation without pretending that the underlying deletion was undone.
      const reply=quicklinkRemoveReplySchema.parse(await bounded(this.#api.removeQuicklink!({id:summary.id,revision:summary.revision}),pending.controller.signal,false));if(!this.#current(pending))return;
      if(!reply.ok){if(['conflict','invalid-request','capability-unavailable','permission-denied'].includes(reply.error.code)){this.#status={kind:'error',message:'The quicklink was not removed. Reload quicklinks or reopen Linuxcast to reconnect.'};return;}throw new Error();}
      if(reply.value.id!==summary.id||reply.value.revision!==summary.revision)throw new Error('Unconfirmed removal.');
      if(reply.value.outcome==='cancelled'){this.#status={kind:'info',message:'Removal cancelled.'};return;}
      const records=await this.#readList(pending);this.#checkAfterMutation(records,null,summary.id);if(!this.#current(pending))return;this.#pending=null;this.#records=records;this.#publish();
    }catch{if(this.#current(pending))this.#unknown('remove');}finally{this.#finish(pending);}}
  async #openLink(summary:Pick<QuicklinkSummary,'id'|'revision'>,search?:{query:string;url:string}){const pending=this.#begin('open');try{
      const raw=await bounded(this.#api.openQuicklink!({id:summary.id,revision:summary.revision,launcherRevision:this.#registryRevision,...(search?{query:search.query}:{})}),pending.controller.signal);const reply=quicklinkOpenReplySchema.parse(raw);if(!this.#current(pending))return;
      if(!reply.ok){if(['conflict','invalid-request','capability-unavailable','permission-denied'].includes(reply.error.code)){this.#status={kind:'error',message:'The quicklink was not opened. Check your default browser, or reload quicklinks and reopen Quicklinks for a current launcher revision.'};if(this.#search)this.#search.status=this.#status;return;}throw new Error();}
      if(reply.value.id!==summary.id||reply.value.revision!==summary.revision)throw new Error('Unconfirmed browser handoff.');
      if(search?(reply.value.webSearch?.query!==search.query||reply.value.webSearch?.url!==search.url||(raw as {value:{webSearch?:{url:unknown}}}).value.webSearch?.url!==search.url):reply.value.webSearch!==undefined)throw new Error('Unconfirmed search target.');
      this.#pending=null;this.#dismissal=pending;
      try{const hidden=shellCommandReplySchema.parse(await bounded(this.#dismiss(),pending.controller.signal));if(!hidden.ok)throw new Error();}
      catch{if(this.#dismissal===pending&&this.#context(pending)&&!pending.controller.signal.aborted){this.#status={kind:'error',message:'The browser handoff was dispatched, but Linuxcast could not hide this window. Try Hide again.'};if(this.#search)this.#search.status=this.#status;}}
      finally{if(this.#dismissal===pending){this.#dismissal=null;this.#publish();}}
    }catch{if(this.#current(pending))this.#unknown('open');}finally{this.#finish(pending);}}
  close(viewId:string){if(!this.owns(viewId))return false;this.#invalidate();this.#dismissal?.controller.abort();this.#dismissal=null;if(viewId===this.#editorId)this.#editor=null;else if(viewId===this.#searchId)this.#search=null;else{this.#listOpen=false;this.#search=null;this.#editor=null;}this.#publish();return true;}
  dispose(){this.#disposed=true;this.#invalidate();this.#dismissal?.controller.abort();this.#dismissal=null;this.#search=null;this.#unsubscribe();}
}
function reason(disabledReason:string|undefined){return disabledReason?{disabledReason}:{};}
function parseRecord(raw:unknown){const reply=quicklinkRecordReplySchema.parse(raw);if(reply.ok&&((raw as {value:{record:{url:unknown}}}).value.record.url!==reply.value.record.url||!sameTags((raw as {value:{record:QuicklinkRecord}}).value.record.tags,reply.value.record.tags)))throw new Error('Noncanonical record.');return reply;}
function bounded<T>(promise:Promise<T>,signal:AbortSignal,deadline=true):Promise<T>{return new Promise((resolve,reject)=>{
  const finish=(fn:()=>void)=>{if(timer)clearTimeout(timer);signal.removeEventListener('abort',abort);fn();},abort=()=>finish(()=>reject(new Error('Cancelled.'))),timer=deadline?setTimeout(()=>finish(()=>reject(new Error('Deadline exceeded.'))),5000):null;
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('Request failed.'))));
});}

function sameSearch(a:QuicklinkWebSearch|undefined,b:QuicklinkWebSearch|undefined){return a?.queryParameter===b?.queryParameter&&a?.template===b?.template;}

function sameTags(a:readonly string[]|undefined,b:readonly string[]|undefined){return JSON.stringify(a??[])===JSON.stringify(b??[]);}

function sameFlags(a:{pinned?:boolean|undefined;hidden?:boolean|undefined},b:{pinned?:boolean|undefined;hidden?:boolean|undefined}){return !!a.pinned===!!b.pinned&&!!a.hidden===!!b.hidden;}
function sameSummary(a:QuicklinkSummary,b:QuicklinkSummary){return a.id===b.id&&a.revision===b.revision&&a.name===b.name&&a.host===b.host&&!!a.webSearch===!!b.webSearch&&sameTags(a.tags,b.tags)&&sameFlags(a,b);}
function presentationOrder(a:QuicklinkSummary,b:QuicklinkSummary){return Number(!!b.pinned)-Number(!!a.pinned)||(a.id<b.id?-1:a.id>b.id?1:0);}
