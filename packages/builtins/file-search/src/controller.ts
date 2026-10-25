import { fileSearchStateReplySchema,fileSearchStateSchema,fileSearchActionReplySchema,fileSearchQueryReplySchema,fileSearchQueryRequestSchema } from '@linuxcast/contracts';
import type { ActionModel,FileSearchApi,FileSearchRoot,FileSearchState,FileSearchResult,ViewModel } from '@linuxcast/contracts';
import { ViewSession } from '@linuxcast/ui/views';
import type { ActionIntent,ViewHost } from '@linuxcast/ui/views';
const FOLDERS='file-search-folders',CHOOSE='files:choose',ALL='files:all',REFRESH='files:refresh',SEARCH='files:search',INDEX='files:index',PAUSE='files:pause',REMOVE='files:remove',DETAIL='files:details';
type Status={kind:'info'|'warning'|'error';message:string};
type Results={viewId:string;rootId:string|null;query:string;rows:FileSearchResult[];loading:boolean;status?:Status;retainSelection?:string};
const action=(id:string,title:string,effect:ActionModel['effect']='read',disabledReason?:string):ActionModel=>({id,title,kind:'invoke',effect,...(disabledReason?{disabledReason}:{})});
/** Presentation only: paths are display metadata, never file-open authority.
 * The resident main service owns indexing, native selection and SQLite access. */
export class FileSearchController {
  readonly session:ViewSession;readonly host:ViewHost;
  #api:FileSearchApi;#state:FileSearchState|null=null;#active=false;#disposed=false;#unsubscribe:(()=>void)|null=null;
  #revision=0;#sequence=0;#loading=true;#busy=false;#unconfirmed=false;#status:Status|undefined;
  #results:Results|null=null;#detail:{viewId:string;row:FileSearchResult}|null=null;
  #load:AbortController|null=null;#mutation:AbortController|null=null;#search:AbortController|null=null;#closing:AbortController|null=null;
  #queryGeneration=0;#timer:ReturnType<typeof setTimeout>|undefined;
  constructor(api:FileSearchApi){
    this.#api=api;this.session=new ViewSession(this.#foldersView(),id=>this.#closed(id));
    this.host={queryChanged:(id,query)=>this.query(id,query),action:intent=>{void this.execute(intent);}};
  }
  getAppearance=()=>this.#state?.appearance??'dark';
  start(){if(this.#active || this.#disposed)return;this.#active=true;this.#unsubscribe=this.#api.onState(state=>{if(this.#active)this.#acceptState(state);});void this.refresh();}
  #root(id:string){return this.#state?.roots.find(root=>root.id===id);}
  #globalActions():ActionModel[]{return [action(CHOOSE,'Choose folder','read',this.#busy?'Wait for the folder request.':this.#loading?'Loading folders…':this.#unconfirmed?'Refresh folders to check the previous request.':undefined),action(ALL,'Search all folders','read',!this.#state?.roots.length?'Choose a folder first.':this.#loading?'Loading folders…':this.#busy?'Wait for the folder request.':undefined),action(REFRESH,'Refresh folders','read',this.#busy?'Wait for the folder request.':this.#loading?'Loading folders…':undefined)];}
  #rootActions(root:FileSearchRoot):ActionModel[]{
    const blocked=this.#busy?'Wait for the folder request.':this.#unconfirmed?'Refresh folders to check the previous request.':undefined;
    const running=root.activity==='indexing'||root.activity==='watching';
    return [action(INDEX,'Index folder','write',blocked??(running?'Indexing is already active. Pause it first.':undefined)),action(PAUSE,'Pause indexing','write',blocked??(!running?'Indexing is not running.':undefined)),action(REMOVE,'Remove folder','write',blocked)];
  }
  #foldersView():ViewModel{
    return {protocolVersion:1,viewId:FOLDERS,revision:++this.#revision,kind:'list',title:'Folders',loading:this.#loading,search:{query:'',placeholder:'Find a selected folder…',mode:'host'},
      sections:[{id:'folders',title:'Selected folders',items:(this.#state?.roots??[]).map(root=>({id:root.id,title:root.name,subtitle:root.displayPath,icon:{kind:'builtin' as const,name:'folder'},accessories:[{text:rootActivity(root)},...(root.progress?[{text:`${root.progress.indexed} indexed · ${root.progress.visited} visited`,tooltip:`${root.progress.excluded} excluded · ${root.progress.denied} denied · ${root.progress.vanished} vanished · ${root.progress.unsupported} unsupported · ${root.progress.watchFailures} watch failures`}]:[])],
        actions:[action(SEARCH,'Search folder','read',this.#busy?'Wait for the folder request.':undefined),...this.#rootActions(root)]}))}],
      empty:{title:this.#loading?'Loading folders…':'Choose a folder to search',description:'Only selected folders are indexed. Choosing a folder does not make its index ready immediately.'},status:this.#busy?{kind:'info',message:'Waiting for the folder request…'}:this.#status??{kind:'info',message:'Only selected-folder metadata is indexed. Removing a folder keeps its original files.'},actions:this.#globalActions()};
  }
  #resultsStatus():Status|undefined{
    const results=this.#results!;
    if(this.#busy)return {kind:'info',message:'Waiting for the folder request…'};
    if(this.#status)return this.#status;
    if(results.status)return results.status;
    if(results.rootId && !this.#root(results.rootId))return {kind:'warning',message:'This folder was removed. Return to Folders to choose a search scope.'};
    const roots=results.rootId?[this.#root(results.rootId)!]:this.#state?.roots??[];
    if(roots.some(root=>root.activity==='unavailable'||root.state==='unavailable'))return {kind:'warning',message:'A folder is unavailable. Check access and index it again. Indexed metadata may be outdated.'};
    if(roots.some(root=>root.activity==='paused'))return {kind:'info',message:'Indexing is paused. Results may be outdated. Use Index folder to update the selected folder.'};
    if(roots.some(root=>root.state==='degraded'))return {kind:'warning',message:'Some paths could not be indexed. Check folder access and index it again.'};
    if(roots.some(root=>root.activity==='indexing'))return {kind:'info',message:'Indexing is in progress. Results may be incomplete.'};
    return undefined;
  }
  #resultsView():ViewModel{
    const results=this.#results!,root=results.rootId?this.#root(results.rootId):undefined,status=this.#resultsStatus();
    return {protocolVersion:1,viewId:results.viewId,revision:++this.#revision,kind:'list',title:'Search files',loading:results.loading,search:{query:results.query,placeholder:'Search indexed filenames and paths…',mode:'extension'},
      sections:[{id:'results',title:root?.name??(results.rootId?'Removed folder':'All selected folders'),items:results.rows.map(row=>({id:row.id,title:row.path.split('/').at(-1)!,subtitle:`${this.#root(row.rootId)?.name??'Folder'} · ${row.path}`,icon:{kind:'builtin' as const,name:row.kind==='directory'?'folder':'file'},actions:[action(DETAIL,'Show details','read',results.loading?'Updating search results.':undefined)]}))}],
      empty:{title:results.query.trim()?'No matching files':'Search selected folders',description:results.query.trim()?'Try another filename or path. Check whether indexing is paused or incomplete.':'Enter a filename or path to search indexed metadata. No file content is searched.'},...(status?{status}:{}),
      actions:[...(root?this.#rootActions(root):[]),...this.#globalActions()]};
  }
  #detailView():ViewModel{
    const detail=this.#detail!,row=detail.row;
    const date=new Date(row.modifiedMs);
    return {protocolVersion:1,viewId:detail.viewId,revision:++this.#revision,kind:'detail',title:row.path.split('/').at(-1)!,markdown:'Indexed metadata only. File opening, previews and other file actions are unavailable in this view.',attachments:[],
      metadata:[{label:'Folder',value:this.#root(row.rootId)?.name??'Removed folder'},{label:'Relative path',value:row.path},{label:'Kind',value:row.kind==='file'?'File':'Directory'},{label:'Size',value:`${row.size} bytes`},{label:'Modified (UTC)',value:Number.isFinite(date.getTime())?date.toISOString():'Timestamp unavailable'}],actions:[]};
  }
  #publish(){if(!this.#active)return;this.session.update(FOLDERS,{protocolVersion:1,kind:'snapshot',view:this.#foldersView()});if(this.#results)this.session.update(this.#results.viewId,{protocolVersion:1,kind:'snapshot',view:this.#resultsView()});if(this.#detail)this.session.update(this.#detail.viewId,{protocolVersion:1,kind:'snapshot',view:this.#detailView()});}
  #signature(state:FileSearchState|null,scope:string|null){return JSON.stringify((state?.roots??[]).filter(root=>scope===null||root.id===scope).map(root=>[root.id,root.generation,root.state,root.activity]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));}
  #acceptState(raw:unknown){
    const parsed=fileSearchStateSchema.safeParse(raw);if(!parsed.success){this.#status={kind:'error',message:'Folder state could not be read. Refresh folders to try again.'};this.#publish();return false;}
    const state=parsed.data;
    if(this.#state && state.revision<this.#state.revision)return false;
    if(this.#state && state.revision===this.#state.revision){
      // Native appearance changes do not advance the service's root revision.
      // Equal-revision messages may update appearance, never cached root data.
      if(state.appearance!==this.#state.appearance){this.#state={...this.#state,appearance:state.appearance};this.#publish();}
      return true;
    }
    const prior=this.#state;this.#state=state;
    if(this.#results && this.#signature(prior,this.#results.rootId)!==this.#signature(state,this.#results.rootId)){
      const current=(row:FileSearchResult)=>this.#root(row.rootId)?.generation===row.generation;
      const selected=this.session.getSnapshot().frames.find(frame=>frame.view.viewId===this.#results?.viewId)?.selection;
      if(selected && this.#results.rows.some(row=>row.id===selected && !current(row)))this.#results.retainSelection=selected;
      this.#results.rows=this.#results.rows.filter(current);
      if(this.#detail && !current(this.#detail.row))this.session.pop();
      this.#queueSearch(0);
    }
    this.#publish();return true;
  }
  async refresh(){if(!this.#active || this.#busy)return;await this.#readState(true);}
  async #readState(explicit:boolean){
    this.#load?.abort();const controller=new AbortController();this.#load=controller;this.#loading=true;this.#publish();
    try{
      const reply=fileSearchStateReplySchema.parse(await bounded(this.#api.getState(),controller.signal));
      if(!this.#active || controller.signal.aborted || this.#load!==controller)return false;
      if(!reply.ok || this.#state && reply.value.revision<this.#state.revision)throw new Error();
      this.#acceptState(reply.value);if(explicit)this.#unconfirmed=false;this.#status=undefined;return true;
    }catch{if(!controller.signal.aborted)this.#status={kind:'error',message:'Folders could not be refreshed. Try Refresh folders again.'};return false;}
    finally{if(this.#load===controller && !controller.signal.aborted){this.#loading=false;this.#publish();}}
  }
  query(viewId:string,query:string){
    if(!this.#active || this.#detail || this.#results?.viewId!==viewId)return;
    this.#results.query=query;delete this.#results.status;delete this.#results.retainSelection;this.#queueSearch();
  }
  #cancelSearch(){clearTimeout(this.#timer);this.#timer=undefined;this.#search?.abort();this.#search=null;this.#queryGeneration++;}
  #queueSearch(delay=150){
    this.#cancelSearch();const results=this.#results;if(!results)return;
    if(!results.query.trim()){results.rows=[];results.loading=false;this.#publish();return;}
    if(!fileSearchQueryRequestSchema.safeParse({protocolVersion:1,query:results.query,...(results.rootId?{rootId:results.rootId}:{})}).success){results.rows=[];results.loading=false;results.status={kind:'warning',message:'Keep searches to 512 UTF-8 bytes or fewer.'};this.#publish();return;}
    if(results.rootId && !this.#root(results.rootId)){results.rows=[];results.loading=false;this.#publish();return;}
    results.loading=true;this.#publish();if(this.#busy)return;const generation=this.#queryGeneration;
    this.#timer=setTimeout(()=>{void this.#runSearch(results,generation);},delay);
  }
  async #runSearch(results:Results,generation:number){
    const controller=new AbortController();this.#search=controller;
    const query=results.query,rootId=results.rootId;
    try{
      const reply=fileSearchQueryReplySchema.parse(await bounded(this.#api.search({query,...(rootId?{rootId}:{})}),controller.signal));
      if(!this.#active || controller.signal.aborted || generation!==this.#queryGeneration || this.#results!==results)return;
      if(!reply.ok || reply.value.query!==query || reply.value.rootId!==rootId || reply.value.results.some(row=>this.#root(row.rootId)?.generation!==row.generation))throw new Error();
      results.rows=reply.value.results;delete results.status;
    }catch{if(!controller.signal.aborted && this.#results===results){results.rows=[];results.status={kind:'error',message:'Files could not be searched. Refresh folders or change the search to try again.'};}}
    finally{if(!controller.signal.aborted && this.#results===results && generation===this.#queryGeneration){results.loading=false;this.#publish();if(results.retainSelection){if(results.rows.some(row=>row.id===results.retainSelection))this.session.select(results.viewId,results.retainSelection);delete results.retainSelection;}}}
  }
  #openResults(rootId:string|null){
    if(this.#results){while(this.session.getSnapshot().frames.length>1)this.session.pop();}
    this.#results={viewId:`file-search-results-${++this.#sequence}`,rootId,query:'',rows:[],loading:false};
    this.session.navigate({protocolVersion:1,kind:'push',fromViewId:FOLDERS,view:this.#resultsView()});
  }
  async execute(intent:ActionIntent){
    const top=this.session.getSnapshot().frames.at(-1);
    if(!this.#active || !top || top.view.viewId!==intent.viewId || top.view.revision!==intent.revision || this.#busy || this.#loading)return;
    if(intent.actionId===REFRESH){await this.refresh();if(this.#results)this.#queueSearch(0);return;}
    if(intent.actionId===ALL && this.#state?.roots.length){this.#openResults(null);return;}
    if(intent.actionId===CHOOSE && !this.#unconfirmed){await this.#mutate(CHOOSE);return;}
    const root=top.view.viewId===FOLDERS && intent.itemId===top.selection?this.#root(intent.itemId):this.#results?.viewId===top.view.viewId && this.#results.rootId?this.#root(this.#results.rootId):undefined;
    if(intent.actionId===SEARCH && root){this.#openResults(root.id);return;}
    if([INDEX,PAUSE,REMOVE].includes(intent.actionId) && root && !this.#unconfirmed && !this.#rootActions(root).find(value=>value.id===intent.actionId)?.disabledReason){await this.#mutate(intent.actionId,root.id);return;}
    if(intent.actionId===DETAIL && this.#results?.viewId===top.view.viewId && !this.#results.loading && intent.itemId===top.selection){
      const row=this.#results.rows.find(value=>value.id===intent.itemId);if(!row || this.#root(row.rootId)?.generation!==row.generation)return;
      this.#detail={viewId:`file-search-detail-${++this.#sequence}`,row};this.session.navigate({protocolVersion:1,kind:'push',fromViewId:top.view.viewId,view:this.#detailView()});
    }
  }
  async #mutate(kind:string,rootId?:string){
    const controller=new AbortController();this.#mutation=controller;this.#busy=true;this.#status=undefined;this.#cancelSearch();this.#publish();
    try{
      const pending=kind===CHOOSE?this.#api.chooseFolder():kind===INDEX?this.#api.startIndex(rootId!):kind===PAUSE?this.#api.pauseIndex(rootId!):this.#api.removeFolder(rootId!);
      const reply=fileSearchActionReplySchema.parse(await bounded(pending,controller.signal,kind===CHOOSE?null:5000));
      if(!this.#active || controller.signal.aborted || this.#mutation!==controller)return;
      if(!reply.ok){if(['invalid-request','capability-unavailable','permission-denied','conflict'].includes(reply.error.code)){this.#status={kind:'error',message:'The folder request was not accepted. Check folder access, or refresh folders to try again.'};return;}throw new Error();}
      if(reply.value.outcome==='cancelled')return;
      if(kind===CHOOSE?reply.value.outcome!=='selected':reply.value.outcome!=='completed')throw new Error();
      if(!await this.#readState(false))throw new Error();
      if(kind===CHOOSE && reply.value.outcome==='selected'){if(!this.#root(reply.value.rootId))throw new Error();this.#openResults(reply.value.rootId);}
    }catch{if(!controller.signal.aborted){this.#unconfirmed=true;this.#status={kind:'error',message:'The folder request could not be confirmed. Refresh folders before trying again.'};}}
    finally{if(!controller.signal.aborted && this.#mutation===controller){this.#busy=false;this.#publish();if(this.#results?.loading)this.#queueSearch(0);}}
  }
  #closed(viewId:string){
    if(viewId===this.#detail?.viewId){this.#detail=null;return;}
    if(viewId===this.#results?.viewId){this.#cancelSearch();this.#results=null;return;}
    if(viewId===FOLDERS){this.session.navigate({protocolVersion:1,kind:'push',fromViewId:null,view:this.#foldersView()});void this.#close();}
  }
  async #close(){
    if(!this.#active || this.#closing)return;const controller=new AbortController();this.#closing=controller;
    try{const reply=fileSearchActionReplySchema.parse(await bounded(this.#api.close(),controller.signal));if(!reply.ok || !['completed','cancelled'].includes(reply.value.outcome))throw new Error();}
    catch{if(!controller.signal.aborted){this.#status={kind:'error',message:'File search could not close. Try again.'};this.#publish();}}
    finally{if(this.#closing===controller)this.#closing=null;}
  }
  dispose(){this.#active=false;this.#disposed=true;this.#unsubscribe?.();this.#unsubscribe=null;this.#cancelSearch();this.#load?.abort();this.#mutation?.abort();this.#closing?.abort();}
}
function rootActivity(root:FileSearchRoot){const state={idle:'Not indexed',scanning:'Scanning',ready:'Ready',degraded:'Limited',unavailable:'Unavailable'}[root.state];return state+' · '+(root.activity==='paused'?'Paused · index may be outdated':root.activity==='indexing'?'Indexing':root.activity==='watching'?(root.state==='degraded'?'Watching · some paths unavailable':'Watching'): 'Unavailable · check folder access');}
function bounded<T>(promise:Promise<T>,signal:AbortSignal,timeout:number|null=5000):Promise<T>{return new Promise((resolve,reject)=>{
  const finish=(fn:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);fn();};const abort=()=>finish(()=>reject(new Error('Cancelled.')));const timer=timeout===null?undefined:setTimeout(()=>finish(()=>reject(new Error('Deadline exceeded.'))),timeout);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('Request failed.'))));
});}
