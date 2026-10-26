import { IndexedPathCopy,COPY_INDEXED_PATH } from '@linuxcast/universal-actions';
import type { IndexedPathContext } from '@linuxcast/universal-actions';
import { formatIndexedPath } from '@linuxcast/universal-actions/path';
import { fileSearchStateReplySchema,fileSearchStateSchema,fileSearchActionReplySchema,fileSearchQueryReplySchema,fileSearchQueryRequestSchema,fileSearchOptionsKey,fileSearchMatchesOptions } from '@linuxcast/contracts';
import type { ActionModel,FileSearchApi,FileSearchRoot,FileSearchState,FileSearchResult,FileSearchOptions,ViewModel } from '@linuxcast/contracts';
import { defaultOptionsKey,optionsDraft,optionsSummary,parseOptionsDraft,parseUtcDate } from './options.ts';
import type { OptionsDraft,OptionsErrors } from './options.ts';
import { ViewSession } from '@linuxcast/ui/views';
import type { ActionIntent,ViewHost } from '@linuxcast/ui/views';
const FOLDERS='file-search-folders',CHOOSE='files:choose',ALL='files:all',REFRESH='files:refresh',SEARCH='files:search',INDEX='files:index',PAUSE='files:pause',REMOVE='files:remove',DETAIL='files:details',FILTER='files:filter',RESET='files:reset-options',APPLY='files:apply-options',CANCEL='files:cancel-options';
type Status={kind:'info'|'warning'|'error';message:string};
type Results={viewId:string;rootId:string|null;query:string;rows:FileSearchResult[];loading:boolean;options?:FileSearchOptions;status?:Status;retainSelection?:string};
const action=(id:string,title:string,effect:ActionModel['effect']='read',disabledReason?:string):ActionModel=>({id,title,kind:'invoke',effect,...(disabledReason?{disabledReason}:{})});
/** Presentation only: paths are display metadata, never file-open authority.
 * The resident main service owns indexing, native selection and SQLite access. */
export class FileSearchController {
  readonly session:ViewSession;readonly host:ViewHost;
  #pathCopy:IndexedPathCopy;
  #api:FileSearchApi;#state:FileSearchState|null=null;#active=false;#disposed=false;#unsubscribe:(()=>void)|null=null;
  #revision=0;#sequence=0;#loading=true;#busy=false;#unconfirmed=false;#status:Status|undefined;#copyWarning:Status|undefined;
  #filters:{viewId:string;draft:OptionsDraft;errors:OptionsErrors}|null=null;
  #results:Results|null=null;#detail:{viewId:string;row:FileSearchResult}|null=null;
  #load:AbortController|null=null;#mutation:AbortController|null=null;#search:AbortController|null=null;#closing:AbortController|null=null;
  #queryGeneration=0;#timer:ReturnType<typeof setTimeout>|undefined;
  constructor(api:FileSearchApi){
    this.#api=api;this.session=new ViewSession(this.#foldersView(),id=>this.#closed(id));
    this.#pathCopy=new IndexedPathCopy({api,onChange:()=>this.#publish(),isCurrent:context=>this.#currentCopy(context)});
    this.host={selectionChanged:()=>{this.#invalidateCopy();this.#publish();},queryChanged:(id,query)=>this.query(id,query),action:intent=>{void this.execute(intent);}};
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
      empty:{title:this.#loading?'Loading folders…':'Choose a folder to search',description:'Only selected folders are indexed. Choosing a folder does not make its index ready immediately.'},status:this.#busy?{kind:'info',message:'Waiting for the folder request…'}:this.#status??this.#copyWarning??{kind:'info',message:'Only selected-folder metadata is indexed. Removing a folder keeps its original files.'},actions:this.#globalActions()};
  }
  #copyContext(row:FileSearchResult,viewId:string):IndexedPathContext|undefined{
    const root=this.#root(row.rootId);return root?{viewId,root,row}:undefined;
  }
  #selectedCopy():IndexedPathContext|undefined{
    const top=this.session.getSnapshot().frames.at(-1);if(!top||!this.#results)return;
    const row=top.view.viewId===this.#detail?.viewId?this.#detail.row:top.view.viewId===this.#results.viewId?this.#results.rows.find(value=>value.id===top.selection):undefined;
    return row?this.#copyContext(row,top.view.viewId):undefined;
  }
  #currentCopy(context:IndexedPathContext):boolean{
    const selected=this.#selectedCopy();return !!selected&&this.#active&&!this.#disposed&&!this.#busy&&!this.#loading&&!this.#results?.loading&&selected.viewId===context.viewId&&selected.row.id===context.row.id&&selected.row.generation===context.row.generation&&selected.root.displayPath===context.root.displayPath&&selected.root.generation===context.row.generation&&!!this.#results?.rows.some(row=>row.id===context.row.id&&row.generation===context.row.generation);
  }
  #copyModel(row:FileSearchResult,viewId:string){
    const context=this.#copyContext(row,viewId);return context?this.#pathCopy.model(context):{action:action(COPY_INDEXED_PATH,'Copy path','write','Search again to select a current indexed result.'),loading:false};
  }
  #invalidateCopy(){if(this.#pathCopy.invalidate())this.#copyWarning={kind:'warning',message:'Copy may have occurred. Check your clipboard before copying again.'};}
  #resultsStatus():Status|undefined{
    const results=this.#results!;
    if(this.#busy)return {kind:'info',message:'Waiting for the folder request…'};
    if(this.#status)return this.#status;
    if(this.#copyWarning)return this.#copyWarning;
    const copy=this.#selectedCopy();if(copy){const status=this.#pathCopy.model(copy).status;if(status)return status;}
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
    const results=this.#results!,root=results.rootId?this.#root(results.rootId):undefined,status=this.#resultsStatus(),summary=optionsSummary(results.options);
    return {protocolVersion:1,viewId:results.viewId,revision:++this.#revision,kind:'list',title:'Search files',loading:results.loading,search:{query:results.query,placeholder:'Search indexed filenames and paths…',mode:'extension'},
      sections:[{id:'results',title:[root?.name??(results.rootId?'Removed folder':'All selected folders'),summary].filter(Boolean).join(' · '),items:results.rows.map(row=>({id:row.id,title:row.path.split('/').at(-1)!,subtitle:`${this.#root(row.rootId)?.name??'Folder'} · ${row.path}`,icon:{kind:'builtin' as const,name:row.kind==='directory'?'folder':'file'},actions:[action(DETAIL,'Show details','read',results.loading?'Updating search results.':undefined),this.#copyModel(row,results.viewId).action]}))}],
      empty:{title:results.query.trim()?'No matching files':'Search selected folders',description:[results.query.trim()?'Try another filename or path. Check whether indexing is paused or incomplete.':'Enter a filename or path to search indexed metadata. No file content is searched.',summary?`Applied: ${summary}.`:undefined].filter(Boolean).join(' ')},...(status?{status}:{}),
      actions:[action(FILTER,'Filter and sort'),action(RESET,'Reset filters and sort','read',fileSearchOptionsKey(results.options)===defaultOptionsKey?'Filters and sort are already at their defaults.':undefined),...(root?this.#rootActions(root):[]),...this.#globalActions()]};
  }
  #filtersView():ViewModel{
    const filters=this.#filters!,field=(id:keyof OptionsDraft)=>({id,value:filters.draft[id],...(filters.errors[id]?{error:filters.errors[id]}:{})});
    return {protocolVersion:1,viewId:filters.viewId,revision:++this.#revision,kind:'form',title:'Filter and sort',fields:[
      {...field('sort'),kind:'enum',title:'Sort',required:true,options:[{value:'relevance',label:'Relevance'},{value:'name',label:'Name A–Z'},{value:'modified-desc',label:'Newest first'},{value:'size-desc',label:'Largest first'}]},
      {...field('kind'),kind:'enum',title:'Kind',required:true,options:[{value:'any',label:'Any'},{value:'file',label:'Files'},{value:'directory',label:'Folders'}]},
      {...field('modifiedFrom'),kind:'date',required:false,title:'Modified from (UTC)',min:'0001-01-01',max:'9999-12-31',description:'Optional inclusive UTC date. Use YYYY-MM-DD; no local timezone or daylight-saving adjustment.'},
      {...field('modifiedThrough'),kind:'date',required:false,title:'Modified through (UTC)',min:'0001-01-01',max:'9999-12-31',description:'Optional inclusive UTC date. Includes this entire UTC day; use YYYY-MM-DD.'}],
      submitActionId:APPLY,cancelActionId:CANCEL,actions:[action(APPLY,'Apply filters and sort'),action(CANCEL,'Cancel')],...(this.#copyWarning?{status:this.#copyWarning}:{})};
  }
  #applyOptions(options?:FileSearchOptions){
    const results=this.#results!;this.#invalidateCopy();this.#status=undefined;delete results.status;
    const selected=this.session.getSnapshot().frames.find(frame=>frame.view.viewId===results.viewId)?.selection;if(selected)results.retainSelection=selected;
    if(fileSearchOptionsKey(options)===defaultOptionsKey)delete results.options;else results.options={...options!};
    if(this.#filters)this.session.pop();this.#queueSearch(0);
  }
  #detailView():ViewModel{
    const detail=this.#detail!,row=detail.row,copy=this.#copyModel(row,detail.viewId);
    let path='Unavailable. Return to results and search again.';try{const root=this.#root(row.rootId);if(root)path=formatIndexedPath(root,row);}catch{/* Fixed display fallback. */}
    const date=new Date(row.modifiedMs);
    return {protocolVersion:1,viewId:detail.viewId,revision:++this.#revision,kind:'detail',title:row.path.split('/').at(-1)!,markdown:'Indexed metadata only. Copy path copies the location shown in the index; it does not open the file or verify that it still exists. File opening, previews and other actions are unavailable in this view.',attachments:[],loading:copy.loading,...(copy.status?{status:copy.status}:this.#copyWarning?{status:this.#copyWarning}:this.#status?{status:this.#status}:{}),
      metadata:[{label:'Folder',value:this.#root(row.rootId)?.name??'Removed folder'},{label:'Relative path',value:row.path},{label:'Indexed path',value:path},{label:'Kind',value:row.kind==='file'?'File':'Directory'},{label:'Size',value:`${row.size} bytes`},{label:'Modified (UTC)',value:Number.isFinite(date.getTime())?date.toISOString():'Timestamp unavailable'}],actions:[copy.action]};
  }
  #publish(){if(!this.#active)return;this.session.update(FOLDERS,{protocolVersion:1,kind:'snapshot',view:this.#foldersView()});if(this.#results){
      const selected=()=>this.session.getSnapshot().frames.find(frame=>frame.view.viewId===this.#results?.viewId)?.selection;
      const prior=selected();this.session.update(this.#results.viewId,{protocolVersion:1,kind:'snapshot',view:this.#resultsView()});
      // Initial and replacement snapshots can select a new first result.
      if(selected()!==prior)this.session.update(this.#results.viewId,{protocolVersion:1,kind:'snapshot',view:this.#resultsView()});
    }if(this.#detail)this.session.update(this.#detail.viewId,{protocolVersion:1,kind:'snapshot',view:this.#detailView()});if(this.#filters)this.session.update(this.#filters.viewId,{protocolVersion:1,kind:'snapshot',view:this.#filtersView()});}
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
      this.#invalidateCopy();
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
    if(!this.#active || this.#detail || this.#filters || this.#results?.viewId!==viewId)return;
    this.#invalidateCopy();this.#status=undefined;this.#results.query=query;delete this.#results.status;delete this.#results.retainSelection;this.#queueSearch();
  }
  #cancelSearch(){clearTimeout(this.#timer);this.#timer=undefined;this.#search?.abort();this.#search=null;this.#queryGeneration++;}
  #queueSearch(delay=150){
    this.#cancelSearch();const results=this.#results;if(!results)return;
    if(!results.query.trim()){delete results.retainSelection;results.rows=[];results.loading=false;this.#publish();return;}
    if(!fileSearchQueryRequestSchema.safeParse({protocolVersion:1,query:results.query,...(results.rootId?{rootId:results.rootId}:{}),...(results.options?{options:results.options}:{})}).success){results.rows=[];results.loading=false;results.status={kind:'warning',message:'Keep searches to 512 UTF-8 bytes or fewer.'};this.#publish();return;}
    if(results.rootId && !this.#root(results.rootId)){results.rows=[];results.loading=false;this.#publish();return;}
    results.loading=true;this.#publish();if(this.#busy)return;const generation=this.#queryGeneration;
    this.#timer=setTimeout(()=>{void this.#runSearch(results,generation);},delay);
  }
  async #runSearch(results:Results,generation:number){
    const controller=new AbortController();this.#search=controller;
    const query=results.query,rootId=results.rootId,options=results.options?{...results.options}:undefined,optionsKey=fileSearchOptionsKey(options);
    try{
      const reply=fileSearchQueryReplySchema.parse(await bounded(this.#api.search({query,...(rootId?{rootId}:{}),...(options?{options}:{})}),controller.signal));
      if(!this.#active || controller.signal.aborted || generation!==this.#queryGeneration || this.#results!==results || fileSearchOptionsKey(results.options)!==optionsKey)return;
      if(!reply.ok || reply.value.query!==query || reply.value.rootId!==rootId || fileSearchOptionsKey(reply.value.options)!==optionsKey || reply.value.results.some(row=>this.#root(row.rootId)?.generation!==row.generation||!fileSearchMatchesOptions(row,options)))throw new Error();
      results.rows=reply.value.results;delete results.status;
    }catch{if(!controller.signal.aborted && this.#results===results){results.rows=[];results.status={kind:'error',message:'Files could not be searched. Refresh folders or change the search to try again.'};}}
    finally{if(!controller.signal.aborted && this.#results===results && generation===this.#queryGeneration){results.loading=false;this.#publish();if(results.retainSelection){if(results.rows.some(row=>row.id===results.retainSelection))this.session.select(results.viewId,results.retainSelection);delete results.retainSelection;this.#publish();}}}
  }
  #openResults(rootId:string|null){
    if(this.#results){while(this.session.getSnapshot().frames.length>1)this.session.pop();}
    this.#results={viewId:`file-search-results-${++this.#sequence}`,rootId,query:'',rows:[],loading:false};
    this.session.navigate({protocolVersion:1,kind:'push',fromViewId:FOLDERS,view:this.#resultsView()});
  }
  async execute(intent:ActionIntent){
    const top=this.session.getSnapshot().frames.at(-1);
    if(!this.#active || !top || top.view.viewId!==intent.viewId || top.view.revision!==intent.revision || this.#busy || this.#loading)return;
    if(this.#filters){
      if(top.view.viewId!==this.#filters.viewId||intent.itemId!==undefined||top.selection!==null||Object.keys(intent).some(key=>!['viewId','revision','actionId','values'].includes(key)))return;
      if(intent.actionId===CANCEL&&intent.values===undefined){this.session.pop();return;}
      if(intent.actionId!==APPLY)return;
      const parsed=parseOptionsDraft(intent.values);if(!parsed.ok){if(parsed.draft){const draft=parsed.draft,prior=this.#filters.draft;this.#filters.draft={sort:parsed.errors.sort?prior.sort:draft.sort,kind:parsed.errors.kind?prior.kind:draft.kind,modifiedFrom:!draft.modifiedFrom?null:parseUtcDate(draft.modifiedFrom)===null?prior.modifiedFrom:draft.modifiedFrom,modifiedThrough:!draft.modifiedThrough?null:parseUtcDate(draft.modifiedThrough)===null?prior.modifiedThrough:draft.modifiedThrough};}this.#filters.errors=parsed.errors;this.#publish();return;}
      this.#applyOptions(parsed.options);return;
    }
    if([FILTER,RESET].includes(intent.actionId)){
      if(!this.#results||this.#detail||top.view.viewId!==this.#results.viewId||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key))||intent.itemId!==undefined&&intent.itemId!==top.selection)return;
      if(intent.actionId===RESET){if(fileSearchOptionsKey(this.#results.options)!==defaultOptionsKey)this.#applyOptions();return;}
      this.#invalidateCopy();this.#filters={viewId:`file-search-options-${++this.#sequence}`,draft:optionsDraft(this.#results.options),errors:{}};
      this.session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#results.viewId,view:this.#filtersView()});return;
    }
    if(intent.actionId===COPY_INDEXED_PATH){
      if(intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key)))return;
      const context=this.#selectedCopy();if(!context||!this.#currentCopy(context)||(this.#detail?.viewId===top.view.viewId?intent.itemId!==undefined:intent.itemId!==top.selection))return;
      this.#status=undefined;this.#copyWarning=undefined;await this.#pathCopy.copy(context);return;
    }
    if(intent.actionId===REFRESH){await this.refresh();if(this.#results)this.#queueSearch(0);return;}
    if(intent.actionId===ALL && this.#state?.roots.length){this.#openResults(null);return;}
    if(intent.actionId===CHOOSE && !this.#unconfirmed){await this.#mutate(CHOOSE);return;}
    const root=top.view.viewId===FOLDERS && intent.itemId===top.selection?this.#root(intent.itemId):this.#results?.viewId===top.view.viewId && this.#results.rootId?this.#root(this.#results.rootId):undefined;
    if(intent.actionId===SEARCH && root){this.#openResults(root.id);return;}
    if([INDEX,PAUSE,REMOVE].includes(intent.actionId) && root && !this.#unconfirmed && !this.#rootActions(root).find(value=>value.id===intent.actionId)?.disabledReason){await this.#mutate(intent.actionId,root.id);return;}
    if(intent.actionId===DETAIL && this.#results?.viewId===top.view.viewId && !this.#results.loading && intent.itemId===top.selection){
      const row=this.#results.rows.find(value=>value.id===intent.itemId);if(!row || this.#root(row.rootId)?.generation!==row.generation)return;
      this.#detail={viewId:`file-search-detail-${++this.#sequence}`,row};if(this.session.navigate({protocolVersion:1,kind:'push',fromViewId:top.view.viewId,view:this.#detailView()}))this.#publish();
    }
  }
  async #mutate(kind:string,rootId?:string){
    this.#invalidateCopy();const controller=new AbortController();this.#mutation=controller;this.#busy=true;this.#status=undefined;this.#cancelSearch();this.#publish();
    try{
      const pending=kind===CHOOSE?this.#api.chooseFolder():kind===INDEX?this.#api.startIndex(rootId!):kind===PAUSE?this.#api.pauseIndex(rootId!):this.#api.removeFolder(rootId!);
      const reply=fileSearchActionReplySchema.parse(await bounded(pending,controller.signal,kind===CHOOSE||kind===REMOVE?null:5000));
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
    if(viewId===this.#filters?.viewId){this.#filters=null;this.#publish();return;}
    if(viewId===this.#detail?.viewId){this.#invalidateCopy();this.#detail=null;this.#publish();return;}
    if(viewId===this.#results?.viewId){this.#invalidateCopy();this.#cancelSearch();this.#results=null;this.#publish();return;}
    if(viewId===FOLDERS){this.session.navigate({protocolVersion:1,kind:'push',fromViewId:null,view:this.#foldersView()});void this.#close();}
  }
  async #close(){
    if(!this.#active || this.#closing)return;const controller=new AbortController();this.#closing=controller;
    try{const reply=fileSearchActionReplySchema.parse(await bounded(this.#api.close(),controller.signal));if(!reply.ok || !['completed','cancelled'].includes(reply.value.outcome))throw new Error();}
    catch{if(!controller.signal.aborted){this.#status={kind:'error',message:'File search could not close. Try again.'};this.#publish();}}
    finally{if(this.#closing===controller)this.#closing=null;}
  }
  dispose(){this.#pathCopy.dispose();this.#active=false;this.#disposed=true;this.#unsubscribe?.();this.#unsubscribe=null;this.#cancelSearch();this.#load?.abort();this.#mutation?.abort();this.#closing?.abort();}
}
function rootActivity(root:FileSearchRoot){const state={idle:'Not indexed',scanning:'Scanning',ready:'Ready',degraded:'Limited',unavailable:'Unavailable'}[root.state];return state+' · '+(root.activity==='paused'?'Paused · index may be outdated':root.activity==='indexing'?'Indexing':root.activity==='watching'?(root.state==='degraded'?'Watching · some paths unavailable':'Watching'): 'Unavailable · check folder access');}
function bounded<T>(promise:Promise<T>,signal:AbortSignal,timeout:number|null=5000):Promise<T>{return new Promise((resolve,reject)=>{
  const finish=(fn:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);fn();};const abort=()=>finish(()=>reject(new Error('Cancelled.')));const timer=timeout===null?undefined:setTimeout(()=>finish(()=>reject(new Error('Deadline exceeded.'))),timeout);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('Request failed.'))));
});}
