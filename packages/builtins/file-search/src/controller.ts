import { IndexedPathCopy,COPY_INDEXED_PATH } from '@linuxcast/universal-actions';
import type { IndexedPathContext } from '@linuxcast/universal-actions';
import { formatIndexedPath } from '@linuxcast/universal-actions/path';
import { fileSearchStateReplySchema,fileSearchStateSchema,fileSearchActionReplySchema,fileSearchQueryReplySchema,fileSearchQueryRequestSchema,fileSearchOptionsKey,fileSearchMatchesOptions,fileSearchMatchesDirectory,indexedTextPreviewReplySchema,indexedTextCopyReplySchema } from '@linuxcast/contracts';
import type { ActionModel,FileSearchApi,FileSearchRoot,FileSearchState,FileSearchResult,FileSearchOptions,ViewModel } from '@linuxcast/contracts';
import { defaultOptionsKey,optionsDraft,optionsSummary,parseOptionsDraft,parseUtcDate } from './options.ts';
import type { OptionsDraft,OptionsErrors } from './options.ts';
import { ViewSession } from '@linuxcast/ui/views';
import type { ActionIntent,ViewHost } from '@linuxcast/ui/views';
const FOLDERS='file-search-folders',CHOOSE='files:choose',ALL='files:all',REFRESH='files:refresh',SEARCH='files:search',INDEX='files:index',PAUSE='files:pause',REMOVE='files:remove',DETAIL='files:details',FILTER='files:filter',RESET='files:reset-options',APPLY='files:apply-options',CANCEL='files:cancel-options',BROWSE='files:browse',BROWSE_ROOT='files:browse-root',PARENT='files:parent',RETURN='files:return-scope',PREVIEW='files:preview-text',RETRY_PREVIEW='files:retry-preview',BACK_PREVIEW='files:back-preview',COPY_PREVIEW='files:copy-preview-text';
type Status={kind:'info'|'warning'|'error';message:string};
type TextPreview={viewId:string;fromViewId:string;row:FileSearchResult;rootPath:string;query:string;optionsKey:string;directory:string|undefined;text:string;loading:boolean;status:Status;controller:AbortController|null;previewId:string|null;loaded:boolean;copyController:AbortController|null;copyStatus:Status|undefined;copyBlocked:boolean};
type Results={viewId:string;rootId:string|null;query:string;rows:FileSearchResult[];loading:boolean;options?:FileSearchOptions;directory?:string;origin?:{rootId:string|null;query:string;selection:string|null};status?:Status;retainSelection?:string};
const action=(id:string,title:string,effect:ActionModel['effect']='read',disabledReason?:string):ActionModel=>({id,title,kind:'invoke',effect,...(disabledReason?{disabledReason}:{})});
/** Presentation only: paths are display metadata, never file-open authority.
 * The resident main service owns indexing, native selection and SQLite access. */
export class FileSearchController {
  readonly session:ViewSession;readonly host:ViewHost;
  #pathCopy:IndexedPathCopy;
  #api:FileSearchApi;#state:FileSearchState|null=null;#active=false;#disposed=false;#unsubscribe:(()=>void)|null=null;
  #revision=0;#sequence=0;#loading=true;#busy=false;#unconfirmed=false;#status:Status|undefined;#copyWarning:Status|undefined;
  #filters:{viewId:string;draft:OptionsDraft;errors:OptionsErrors}|null=null;
  #preview:TextPreview|null=null;#previewSubscription:()=>void;
  #results:Results|null=null;#detail:{viewId:string;row:FileSearchResult}|null=null;
  #load:AbortController|null=null;#mutation:AbortController|null=null;#search:AbortController|null=null;#closing:AbortController|null=null;
  #queryGeneration=0;#timer:ReturnType<typeof setTimeout>|undefined;
  constructor(api:FileSearchApi){
    this.#api=api;this.session=new ViewSession(this.#foldersView(),id=>this.#closed(id));
    this.#pathCopy=new IndexedPathCopy({api,onChange:()=>this.#publish(),isCurrent:context=>this.#currentCopy(context)});
    this.#previewSubscription=this.session.subscribe(()=>{const preview=this.#preview;if(preview&&!this.#currentPreview(preview))this.#discardPreview();});
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
    const results=this.#results!,root=results.rootId?this.#root(results.rootId):undefined,status=this.#resultsStatus(),summary=optionsSummary(results.options),browsing=results.directory!==undefined,scope=[root?.name??(results.rootId?'Removed folder':'All selected folders'),browsing?`Indexed folder: ${results.directory||'(root)'}`:undefined].filter(Boolean).join(' · ');
    return {protocolVersion:1,viewId:results.viewId,revision:++this.#revision,kind:'list',title:'Search files',loading:results.loading,search:{query:results.query,placeholder:browsing?'Search this indexed folder’s direct children…':'Search indexed filenames and paths…',mode:'extension'},
      sections:[{id:'results',title:[scope,summary].filter(Boolean).join(' · '),items:results.rows.map(row=>({id:row.id,title:row.path.split('/').at(-1)!,subtitle:`${this.#root(row.rootId)?.name??'Folder'} · ${row.path}`,icon:{kind:'builtin' as const,name:row.kind==='directory'?'folder':'file'},actions:[...(row.kind==='directory'?[action(BROWSE,'Browse folder','read',results.loading?'Updating search results.':undefined)]:[]),action(DETAIL,'Show details','read',results.loading?'Updating search results.':undefined),this.#copyModel(row,results.viewId).action,...(row.kind==='file'?[action(PREVIEW,'Preview text','read',this.#previewReason(row))]:[])]}))}],
      empty:{title:results.query.trim()?'No matching files':browsing?'No indexed children':'Search selected folders',description:[browsing?`${scope}. Browsing direct indexed children only; no file is opened or read.`:undefined,results.query.trim()?'Try another filename or path. Check whether indexing is paused or incomplete.':browsing?'This scope has no matching indexed children. Check filters or whether indexing is paused or incomplete.':'Enter a filename or path to search indexed metadata. No file content is searched.',summary?`Applied: ${summary}.`:undefined].filter(Boolean).join(' ')},...(status?{status}:{}),
      actions:[...(root?[action(BROWSE_ROOT,'Browse root folder','read',results.directory===''?'Already browsing this root folder.':undefined)]:[]),...(browsing?[action(PARENT,'Parent folder','read',results.directory===''?'Already at the selected root folder.':undefined),action(RETURN,'Return to search scope')]:[]),action(FILTER,'Filter and sort'),action(RESET,'Reset filters and sort','read',fileSearchOptionsKey(results.options)===defaultOptionsKey?'Filters and sort are already at their defaults.':undefined),...(root?this.#rootActions(root):[]),...this.#globalActions()]};
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
  #browse(rootId:string,directory:string){
    const results=this.#results!,frame=this.session.getSnapshot().frames.find(value=>value.view.viewId===results.viewId);
    if(results.directory===undefined)results.origin={rootId:results.rootId,query:results.query,selection:frame?.selection??null};
    const priorDirectory=results.directory;
    this.#invalidateCopy();this.#cancelSearch();this.#status=undefined;delete results.status;delete results.retainSelection;
    if(priorDirectory && priorDirectory.slice(0,Math.max(0,priorDirectory.lastIndexOf('/')))===directory && results.rootId===rootId)results.retainSelection=`${rootId}:${priorDirectory}`;
    results.rootId=rootId;results.directory=directory;results.query='';results.rows=[];this.session.setQuery(results.viewId,'');this.#queueSearch(0);
  }
  #returnScope(){
    const results=this.#results!,origin=results.origin;if(!origin)return;
    this.#invalidateCopy();this.#cancelSearch();this.#status=undefined;delete results.status;delete results.retainSelection;
    results.rootId=origin.rootId;results.query=origin.query;results.rows=[];delete results.directory;delete results.origin;
    if(origin.selection)results.retainSelection=origin.selection;this.session.setQuery(results.viewId,origin.query);this.#queueSearch(0);
  }
  #detailView():ViewModel{
    const detail=this.#detail!,row=detail.row,copy=this.#copyModel(row,detail.viewId);
    let path='Unavailable. Return to results and search again.';try{const root=this.#root(row.rootId);if(root)path=formatIndexedPath(root,row);}catch{/* Fixed display fallback. */}
    const date=new Date(row.modifiedMs);
    return {protocolVersion:1,viewId:detail.viewId,revision:++this.#revision,kind:'detail',title:row.path.split('/').at(-1)!,markdown:'Indexed metadata only. Copy path copies the location shown in the index; it does not open the file or verify that it still exists. For a supported text file, return to Results and choose Preview text in Actions. File opening and other actions remain unavailable.',attachments:[],loading:copy.loading,...(copy.status?{status:copy.status}:this.#copyWarning?{status:this.#copyWarning}:this.#status?{status:this.#status}:{}),
      metadata:[{label:'Folder',value:this.#root(row.rootId)?.name??'Removed folder'},{label:'Relative path',value:row.path},{label:'Indexed path',value:path},{label:'Kind',value:row.kind==='file'?'File':'Directory'},{label:'Size',value:`${row.size} bytes`},{label:'Modified (UTC)',value:Number.isFinite(date.getTime())?date.toISOString():'Timestamp unavailable'}],actions:[copy.action]};
  }
  #previewReason(row:FileSearchResult):string|undefined{
    if(typeof this.#api.previewText!=='function')return 'Text preview is unavailable. Reopen Linuxcast to reconnect.';
    const root=this.#root(row.rootId);if(!root||root.generation!==row.generation||root.state==='unavailable'||root.activity==='unavailable')return 'Refresh folders and select a current indexed file.';
    if(row.kind!=='file'||!/[.](txt|text|md|csv|json|log)$/iu.test(row.path)||row.size>65536)return 'Preview supports non-executable UTF-8 .txt, .text, .md, .csv, .json or .log files up to 64 KiB. Select a supported file.';
    return this.#results?.loading?'Wait for the current search results.':undefined;
  }
  #previewCopyReason(preview:TextPreview):string|undefined{
    if(preview.copyController)return 'Wait for the current Copy text request.';
    if(!preview.loaded||preview.loading)return 'Wait for a confirmed text preview.';
    if(preview.copyBlocked)return 'Return to Results and choose Preview text again to refresh the expired or changed preview.';
    if(!preview.previewId)return 'Copy text needs a current preview token. Return to Results and choose Preview text again, or reopen Linuxcast to reconnect.';
    if(typeof this.#api.copyPreviewText!=='function')return 'Preview text copying is unavailable. Reopen Linuxcast to reconnect.';
    return undefined;
  }
  #previewView():ViewModel{const preview=this.#preview!,reason=this.#previewCopyReason(preview);return {protocolVersion:1,viewId:preview.viewId,revision:++this.#revision,kind:'text',title:`Text preview · ${preview.row.path.split('/').at(-1)!}`,text:preview.text,editable:false,loading:preview.loading||!!preview.copyController,status:preview.copyStatus??preview.status,actions:[action(BACK_PREVIEW,'Back to results'),...(preview.loaded?[action(COPY_PREVIEW,'Copy text','write',reason)]:[]),...(!preview.loaded&&preview.status.kind==='error'?[action(RETRY_PREVIEW,'Retry preview','read',this.#previewReason(preview.row))]:[])]};}
  #currentPreview(preview:TextPreview){const top=this.session.getSnapshot().frames.at(-1),results=this.#results,frame=this.session.getSnapshot().frames.find(value=>value.view.viewId===preview.fromViewId),row=results?.rows.find(value=>value.id===preview.row.id),root=this.#root(preview.row.rootId);return this.#active&&!this.#disposed&&this.#preview===preview&&top?.view.viewId===preview.viewId&&!this.#loading&&!this.#busy&&!results?.loading&&results?.viewId===preview.fromViewId&&frame?.query===preview.query&&results.query===preview.query&&frame.selection===preview.row.id&&fileSearchOptionsKey(results.options)===preview.optionsKey&&results.directory===preview.directory&&row?.generation===preview.row.generation&&row.kind==='file'&&row.path===preview.row.path&&row.size===preview.row.size&&row.modifiedMs===preview.row.modifiedMs&&root?.generation===preview.row.generation&&root.displayPath===preview.rootPath&&root.state!=='unavailable'&&root.activity!=='unavailable';}
  #discardPreview(){const preview=this.#preview;if(!preview)return;this.#preview=null;if(preview.copyController){this.#copyWarning={kind:'warning',message:'Copy may have occurred. Check your clipboard before copying again.'};preview.copyController.abort();preview.copyController=null;}preview.controller?.abort();preview.controller=null;preview.text='';preview.previewId=null;preview.loaded=false;if(this.session.getSnapshot().frames.at(-1)?.view.viewId===preview.viewId)this.session.pop();this.#publish();}
  async #readPreview(preview:TextPreview){
    if(!this.#currentPreview(preview)||preview.controller||this.#previewReason(preview.row))return;
    const controller=new AbortController();preview.controller=controller;preview.loading=true;preview.text='';preview.previewId=null;preview.loaded=false;preview.copyStatus=undefined;preview.copyBlocked=false;preview.status={kind:'info',message:'Loading text preview…'};this.#publish();
    try{
      if(!this.#currentPreview(preview)||controller.signal.aborted)return;
      const selection={resultId:preview.row.id,rootId:preview.row.rootId,generation:preview.row.generation};
      const reply=indexedTextPreviewReplySchema.parse(await bounded(this.#api.previewText!(selection),controller.signal));
      if(!this.#currentPreview(preview)||controller.signal.aborted||preview.controller!==controller)return;
      if(!reply.ok){preview.status={kind:'error',message:['invalid-request','conflict','capability-unavailable','permission-denied','cancelled'].includes(reply.error.code)?'Text preview was not read. Return to Results, refresh folders and check file access, UTF-8 format and the 64 KiB limit; retry only explicitly.':'Text preview could not be confirmed. Choose Retry preview explicitly or return to Results.'};return;}
      if(reply.value.resultId!==selection.resultId||reply.value.rootId!==selection.rootId||reply.value.generation!==selection.generation)throw new Error('Unconfirmed preview.');
      preview.text=reply.value.text;preview.previewId=reply.value.previewId??null;preview.loaded=true;preview.status={kind:'info',message:preview.text?'Read-only text preview. Content is not saved, indexed or added to history.':'This text file is empty. Copying empty text deliberately clears the clipboard. Content is not saved, indexed or added to history.'};
    }catch{if(this.#currentPreview(preview)&&!controller.signal.aborted)preview.status={kind:'error',message:'Text preview could not be confirmed. Choose Retry preview explicitly or return to Results.'};}
    finally{if(this.#currentPreview(preview)&&preview.controller===controller){preview.controller=null;preview.loading=false;this.#publish();}}
  }
  async #copyPreview(preview:TextPreview){
    if(!this.#currentPreview(preview)||this.#previewCopyReason(preview))return;
    const previewId=preview.previewId!,selection={resultId:preview.row.id,rootId:preview.row.rootId,generation:preview.row.generation,previewId},controller=new AbortController();preview.copyController=controller;preview.copyStatus={kind:'info',message:'Copying text…'};this.#copyWarning=undefined;this.#publish();
    const current=()=>this.#currentPreview(preview)&&!controller.signal.aborted&&preview.copyController===controller&&preview.previewId===previewId;
    try{
      if(!current())return;
      const reply=indexedTextCopyReplySchema.parse(await bounded(this.#api.copyPreviewText!(selection),controller.signal));if(!current())return;
      if(!reply.ok){if(['conflict','invalid-request'].includes(reply.error.code)){preview.copyBlocked=true;preview.copyStatus={kind:'error',message:'Text was not copied. Return to Results and choose Preview text again to refresh the expired or changed preview.'};}else preview.copyStatus={kind:'error',message:['capability-unavailable','permission-denied','cancelled'].includes(reply.error.code)?'Text was not copied. Check clipboard access, then choose Copy text again explicitly.':'The copy outcome is unknown. Check your clipboard before choosing Copy text again.'};return;}
      if(reply.value.resultId!==selection.resultId||reply.value.rootId!==selection.rootId||reply.value.generation!==selection.generation||reply.value.previewId!==previewId)throw new Error('Unconfirmed text copy.');
      preview.copyStatus={kind:'info',message:'Text copied.'};
    }catch{if(current())preview.copyStatus={kind:'error',message:'The copy outcome is unknown. Check your clipboard before choosing Copy text again.'};}
    finally{if(current()){preview.copyController=null;this.#publish();}}
  }
  async #openPreview(row:FileSearchResult,fromViewId:string){
    if(this.#previewReason(row)||this.#preview||!this.#results)return;const results=this.#results;
    this.#invalidateCopy();const frame=this.session.getSnapshot().frames.at(-1);if(!this.#active||this.#results!==results||frame?.view.viewId!==fromViewId||frame.selection!==row.id)return;
    const preview:TextPreview={viewId:`file-search-preview-${++this.#sequence}`,fromViewId,row:{...row},rootPath:this.#root(row.rootId)!.displayPath,query:results.query,optionsKey:fileSearchOptionsKey(results.options),directory:results.directory,text:'',loading:false,status:{kind:'info',message:'Preparing read-only text preview…'},controller:null,previewId:null,loaded:false,copyController:null,copyStatus:undefined,copyBlocked:false};this.#preview=preview;
    if(!this.session.navigate({protocolVersion:1,kind:'push',fromViewId,view:this.#previewView()})){this.#discardPreview();return;}await this.#readPreview(preview);
  }
  #publish(){if(!this.#active)return;this.session.update(FOLDERS,{protocolVersion:1,kind:'snapshot',view:this.#foldersView()});if(!this.#active)return;const results=this.#results;if(results){
      const selected=()=>this.session.getSnapshot().frames.find(frame=>frame.view.viewId===results.viewId)?.selection;
      const prior=selected();this.session.update(results.viewId,{protocolVersion:1,kind:'snapshot',view:this.#resultsView()});
      if(!this.#active||this.#results!==results)return;
      if(selected()!==prior)this.session.update(results.viewId,{protocolVersion:1,kind:'snapshot',view:this.#resultsView()});
    }if(!this.#active)return;if(this.#detail)this.session.update(this.#detail.viewId,{protocolVersion:1,kind:'snapshot',view:this.#detailView()});if(this.#filters)this.session.update(this.#filters.viewId,{protocolVersion:1,kind:'snapshot',view:this.#filtersView()});if(this.#preview)this.session.update(this.#preview.viewId,{protocolVersion:1,kind:'snapshot',view:this.#previewView()});}
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
    if(!results.query.trim() && results.directory===undefined){delete results.retainSelection;results.rows=[];results.loading=false;this.#publish();return;}
    if(!fileSearchQueryRequestSchema.safeParse({protocolVersion:1,query:results.query,...(results.rootId?{rootId:results.rootId}:{}),...(results.options?{options:results.options}:{}),...(results.directory!==undefined?{directory:results.directory}:{})}).success){results.rows=[];results.loading=false;results.status={kind:'warning',message:'Keep searches to 512 UTF-8 bytes or fewer.'};this.#publish();return;}
    if(results.rootId && !this.#root(results.rootId)){results.rows=[];results.loading=false;this.#publish();return;}
    results.loading=true;this.#publish();if(this.#busy)return;const generation=this.#queryGeneration;
    this.#timer=setTimeout(()=>{void this.#runSearch(results,generation);},delay);
  }
  async #runSearch(results:Results,generation:number){
    const controller=new AbortController();this.#search=controller;
    const query=results.query,rootId=results.rootId,options=results.options?{...results.options}:undefined,optionsKey=fileSearchOptionsKey(options),directory=results.directory;
    try{
      const reply=fileSearchQueryReplySchema.parse(await bounded(this.#api.search({query,...(rootId?{rootId}:{}),...(options?{options}:{}),...(directory!==undefined?{directory}:{})}),controller.signal));
      if(!this.#active || controller.signal.aborted || generation!==this.#queryGeneration || this.#results!==results || fileSearchOptionsKey(results.options)!==optionsKey || results.directory!==directory)return;
      if(!reply.ok || reply.value.query!==query || reply.value.rootId!==rootId || reply.value.directory!==directory || fileSearchOptionsKey(reply.value.options)!==optionsKey || reply.value.results.some(row=>this.#root(row.rootId)?.generation!==row.generation||!fileSearchMatchesOptions(row,options)||!fileSearchMatchesDirectory(row,directory)))throw new Error();
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
    if(this.#preview){if(top.view.viewId!==this.#preview.viewId||intent.itemId!==undefined||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId'].includes(key)))return;if(intent.actionId===BACK_PREVIEW){this.session.pop();return;}if(intent.actionId===COPY_PREVIEW){await this.#copyPreview(this.#preview);return;}if(intent.actionId===RETRY_PREVIEW&&!this.#preview.loaded&&this.#preview.status.kind==='error')await this.#readPreview(this.#preview);return;}
    if(this.#filters){
      if(top.view.viewId!==this.#filters.viewId||intent.itemId!==undefined||top.selection!==null||Object.keys(intent).some(key=>!['viewId','revision','actionId','values'].includes(key)))return;
      if(intent.actionId===CANCEL&&intent.values===undefined){this.session.pop();return;}
      if(intent.actionId!==APPLY)return;
      const parsed=parseOptionsDraft(intent.values);if(!parsed.ok){if(parsed.draft){const draft=parsed.draft,prior=this.#filters.draft;this.#filters.draft={sort:parsed.errors.sort?prior.sort:draft.sort,kind:parsed.errors.kind?prior.kind:draft.kind,modifiedFrom:!draft.modifiedFrom?null:parseUtcDate(draft.modifiedFrom)===null?prior.modifiedFrom:draft.modifiedFrom,modifiedThrough:!draft.modifiedThrough?null:parseUtcDate(draft.modifiedThrough)===null?prior.modifiedThrough:draft.modifiedThrough};}this.#filters.errors=parsed.errors;this.#publish();return;}
      this.#applyOptions(parsed.options);return;
    }
    if([BROWSE,BROWSE_ROOT,PARENT,RETURN].includes(intent.actionId)){
      const results=this.#results;
      if(!results||this.#detail||top.view.viewId!==results.viewId||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key))||intent.itemId!==undefined&&intent.itemId!==top.selection)return;
      if(intent.actionId===RETURN){if(results.directory!==undefined)this.#returnScope();return;}
      if(intent.actionId===PARENT){if(results.directory && results.rootId && this.#root(results.rootId))this.#browse(results.rootId,results.directory.slice(0,Math.max(0,results.directory.lastIndexOf('/'))));return;}
      if(intent.actionId===BROWSE_ROOT){if(results.rootId&&this.#root(results.rootId)&&results.directory!=='')this.#browse(results.rootId,'');return;}
      if(results.loading||intent.itemId!==top.selection)return;
      const row=results.rows.find(value=>value.id===intent.itemId);if(row?.kind==='directory'&&this.#root(row.rootId)?.generation===row.generation)this.#browse(row.rootId,row.path);return;
    }
    if([FILTER,RESET].includes(intent.actionId)){
      if(!this.#results||this.#detail||top.view.viewId!==this.#results.viewId||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key))||intent.itemId!==undefined&&intent.itemId!==top.selection)return;
      if(intent.actionId===RESET){if(fileSearchOptionsKey(this.#results.options)!==defaultOptionsKey)this.#applyOptions();return;}
      this.#invalidateCopy();this.#filters={viewId:`file-search-options-${++this.#sequence}`,draft:optionsDraft(this.#results.options),errors:{}};
      this.session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#results.viewId,view:this.#filtersView()});return;
    }
    if(intent.actionId===PREVIEW){if(!this.#results||this.#detail||top.view.viewId!==this.#results.viewId||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key))||intent.itemId!==top.selection)return;const row=this.#results.rows.find(value=>value.id===intent.itemId);if(row)await this.#openPreview(row,top.view.viewId);return;}
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
  dispose(){this.#active=false;this.#disposed=true;this.#previewSubscription();this.#discardPreview();if(this.#copyWarning&&this.#results){const frame=this.session.getSnapshot().frames.find(value=>value.view.viewId===this.#results?.viewId);if(frame)this.session.update(frame.view.viewId,{protocolVersion:1,kind:'snapshot',view:{...frame.view,revision:++this.#revision,status:this.#copyWarning}});}this.#pathCopy.dispose();this.#unsubscribe?.();this.#unsubscribe=null;this.#cancelSearch();this.#load?.abort();this.#mutation?.abort();this.#closing?.abort();}
}
function rootActivity(root:FileSearchRoot){const state={idle:'Not indexed',scanning:'Scanning',ready:'Ready',degraded:'Limited',unavailable:'Unavailable'}[root.state];return state+' · '+(root.activity==='paused'?'Paused · index may be outdated':root.activity==='indexing'?'Indexing':root.activity==='watching'?(root.state==='degraded'?'Watching · some paths unavailable':'Watching'): 'Unavailable · check folder access');}
function bounded<T>(promise:Promise<T>,signal:AbortSignal,timeout:number|null=5000):Promise<T>{return new Promise((resolve,reject)=>{
  const finish=(fn:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);fn();};const abort=()=>finish(()=>reject(new Error('Cancelled.')));const timer=timeout===null?undefined:setTimeout(()=>finish(()=>reject(new Error('Deadline exceeded.'))),timeout);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('Request failed.'))));
});}
