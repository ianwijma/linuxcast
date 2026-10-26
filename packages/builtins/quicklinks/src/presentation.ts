import { quicklinkListReplySchema,quicklinkNameSchema,quicklinkUrlSchema,quicklinkRecordReplySchema,quicklinkRemoveReplySchema,quicklinkOpenReplySchema,shellCommandReplySchema,MAX_QUICKLINKS } from '@linuxcast/contracts';
import type { QuicklinkApi,QuicklinkRecord,QuicklinkSummary,QuicklinkSave,ShellCommandReply,ViewModel } from '@linuxcast/contracts';
import type { ActionIntent,ViewSession } from '@linuxcast/ui/views';

export interface QuicklinksFlowState {metadataUnconfirmed:boolean;openUnconfirmed:boolean}
export const createQuicklinksFlowState=():QuicklinksFlowState=>({metadataUnconfirmed:false,openUnconfirmed:false});
const OPEN='quicklinks:open',EDIT='quicklinks:edit',REMOVE='quicklinks:remove',NEW='quicklinks:new',RELOAD='quicklinks:reload',BACK='quicklinks:back',SAVE='quicklinks:save',CANCEL='quicklinks:cancel';
const METADATA_UNKNOWN='A quicklink change may have happened. Reload quicklinks before saving, removing or opening another quicklink.';
const OPEN_UNKNOWN='The browser handoff outcome is unknown. Check your browser, then reload quicklinks before opening again.';
type Status={kind:'info'|'warning'|'error';message:string};
type Editor={name:string;url:string;record:QuicklinkRecord|null;nameError?:string;urlError?:string;status?:Status;needsReload?:boolean;missing?:boolean};
type Pending={controller:AbortController;kind:'list'|'get'|'save'|'remove'|'open';viewId:string;query:string;selection:string|null;editor:Editor|null};
/** Saved definitions are metadata; only explicit named API calls can write or
 * open. The retained state object fences unknown effects across Flow instances. */
export class QuicklinksFlow {
  #session:ViewSession;#api:QuicklinkApi;#state:QuicklinksFlowState;#registryRevision:number;#dismiss:()=>Promise<ShellCommandReply>;
  #listId:string;#editorId:string;#viewRevision=0;#listOpen=false;#disposed=false;#query='';#records:QuicklinkSummary[]=[];#loaded=false;
  #editor:Editor|null=null;#status:Status|undefined;#pending:Pending|null=null;#dismissal:Pending|null=null;#unsubscribe:()=>void;
  constructor({session,api,viewId,revision,state,onDismiss}:{session:ViewSession;api:QuicklinkApi;viewId:string;revision:number;state:QuicklinksFlowState;onDismiss:()=>Promise<ShellCommandReply>}){
    this.#session=session;this.#api=api;this.#listId=`${viewId}-list`;this.#editorId=`${viewId}-editor`;this.#registryRevision=revision;this.#state=state;this.#dismiss=onDismiss;
    this.#unsubscribe=session.subscribe(()=>{
      const list=session.getSnapshot().frames.find(frame=>frame.view.viewId===this.#listId);
      if(list&&list.query!==this.#query){this.#query=list.query;this.#invalidate();this.#publish();}
      if(this.#pending&&!this.#context(this.#pending))this.#invalidate();
      if(this.#dismissal&&!this.#context(this.#dismissal)){this.#dismissal.controller.abort();this.#dismissal=null;this.#publish();}
    });
  }
  get active(){return !this.#disposed&&this.#listOpen&&this.#session.getSnapshot().frames.some(frame=>frame.view.viewId===this.#listId);}
  owns(viewId:string){return viewId===this.#listId||viewId===this.#editorId;}
  open(fromViewId:string){if(this.#disposed||this.active)return;this.#listOpen=this.#session.navigate({protocolVersion:1,kind:'push',fromViewId,view:this.#list()});if(this.active)void this.#reload(false);}
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
    const selected=this.#session?.getSnapshot().frames.find(frame=>frame.view.viewId===this.#listId)?.selection;
    const query=this.#query.normalize('NFKC').toLocaleLowerCase('en-US').trim(),tooLong=this.#query.length>512;
    const matches=tooLong?[]:this.#records.filter(record=>query.split(/\s+/u).every(word=>`${record.name} ${record.host}`.normalize('NFKC').toLocaleLowerCase('en-US').includes(word)));
    const rows=matches.slice(0,100),retained=matches.find(record=>record.id===selected);if(retained&&!rows.some(record=>record.id===retained.id))rows[rows.length-1]=retained;rows.sort((a,b)=>a.id<b.id?-1:1);
    const pendingStatus=this.#pending?{kind:'info' as const,message:this.#pending.kind==='open'?'Handing quicklink to the browser…':this.#pending.kind==='remove'?'Waiting for removal confirmation…':this.#pending.kind==='save'?'Saving quicklink…':this.#pending.kind==='get'?'Loading quicklink…':'Loading quicklinks…'}:undefined;
    const status=tooLong?{kind:'warning' as const,message:'Keep searches to 512 characters or fewer.'}:pendingStatus??this.#status??this.#warning()??(!this.#api.listQuicklinks?{kind:'error' as const,message:'Saved quicklinks are unavailable. Reopen Linuxcast to reconnect.'}:undefined);
    return {protocolVersion:1,viewId:this.#listId,revision:++this.#viewRevision,kind:'list',title:'Quicklinks',loading:this.#busy(),search:{query:this.#query,placeholder:'Search saved names and hosts…',mode:'extension'},
      sections:[{id:'saved',title:'Saved quicklinks · Up to 100 matches; refine your search',items:rows.map(record=>({id:record.id,title:record.name,subtitle:record.host,icon:{kind:'builtin' as const,name:'link'},actions:[
        {id:OPEN,title:'Open quicklink',kind:'invoke' as const,effect:'write' as const,...reason(this.#disabled('openQuicklink','open'))},
        {id:EDIT,title:'Edit quicklink',kind:'invoke' as const,effect:'read' as const,...reason(this.#disabled('getQuicklink','read'))},
        {id:REMOVE,title:'Remove quicklink',kind:'invoke' as const,effect:'destructive' as const,...reason(this.#disabled('removeQuicklink','write'))},
      ]}))}],empty:{title:this.#pending?'Loading quicklinks…':this.#loaded?'No quicklinks yet':'Quicklinks unavailable',description:'Create a named HTTP or HTTPS quicklink. Search stays local; at most 100 matches are shown. Opening requires an explicit action.'},...(status?{status}:{}),
      actions:[{id:NEW,title:'New quicklink',kind:'invoke',effect:'read',...reason(this.#busy()?'Wait for the current request to finish.':!this.#api.saveQuicklink||!this.#api.listQuicklinks?'Saving quicklinks is unavailable. Reopen Linuxcast to reconnect.':this.#records.length>=MAX_QUICKLINKS?'500 quicklinks are saved. Remove one before creating another.':undefined)},
        {id:RELOAD,title:'Reload quicklinks',kind:'invoke',effect:'read',...reason(this.#disabled('listQuicklinks','read'))},{id:BACK,title:'Back',kind:'invoke',effect:'read'}]};
  }
  #form():ViewModel{
    const editor=this.#editor!,status=editor.status??this.#warning();
    return {protocolVersion:1,viewId:this.#editorId,revision:++this.#viewRevision,kind:'form',title:editor.record?'Edit quicklink':'New quicklink',loading:this.#busy(),
      fields:[{id:'name',kind:'text',title:'Name',required:true,value:editor.name,description:'A unique saved name, up to 128 characters.',...(editor.nameError?{error:editor.nameError}:{})},
        {id:'url',kind:'text',title:'URL',required:true,value:editor.url,description:'Literal HTTP or HTTPS only. Placeholders and raw braces are not supported yet.',...(editor.urlError?{error:editor.urlError}:{})}],
      submitActionId:SAVE,cancelActionId:CANCEL,...(status?{status}:{}),actions:[{id:SAVE,title:'Save quicklink',kind:'invoke',effect:'write',...reason(editor.missing?'This quicklink no longer exists. Cancel, then create a new quicklink.':this.#disabled('saveQuicklink','write'))},
        {id:CANCEL,title:'Cancel',kind:'invoke',effect:'read'},{id:RELOAD,title:'Reload quicklinks',kind:'invoke',effect:'read',...reason(this.#disabled('listQuicklinks','read'))}]};
  }
  #publish(){if(!this.active)return;this.#session.update(this.#listId,{protocolVersion:1,kind:'snapshot',view:this.#list()});if(this.#editor)this.#session.update(this.#editorId,{protocolVersion:1,kind:'snapshot',view:this.#form()});}
  #begin(kind:Pending['kind']):Pending{
    const frames=this.#session.getSnapshot().frames,list=frames.find(frame=>frame.view.viewId===this.#listId)!;
    const pending:Pending={controller:new AbortController(),kind,viewId:frames.at(-1)!.view.viewId,query:list.query,selection:list.selection,editor:this.#editor};this.#pending=pending;this.#status=undefined;this.#publish();return pending;
  }
  #context(pending:Pending){const frames=this.#session.getSnapshot().frames,list=frames.find(frame=>frame.view.viewId===this.#listId);return this.active&&frames.at(-1)?.view.viewId===pending.viewId&&list?.query===pending.query&&list.selection===pending.selection&&this.#editor===pending.editor;}
  #current(pending:Pending){return this.#pending===pending&&!pending.controller.signal.aborted&&this.#context(pending);}
  #unknown(kind:Pending['kind']){if(kind==='save'||kind==='remove'){this.#state.metadataUnconfirmed=true;this.#status={kind:'error',message:METADATA_UNKNOWN};}else if(kind==='open'){this.#state.openUnconfirmed=true;this.#status={kind:'error',message:OPEN_UNKNOWN};}const warning=this.#warning();if(this.#editor&&warning)this.#editor.status=warning;}
  #invalidate(){const pending=this.#pending;if(!pending)return;this.#pending=null;this.#unknown(pending.kind);pending.controller.abort();this.#publish();}
  #finish(pending:Pending){if(this.#pending===pending){this.#pending=null;this.#publish();}}
  async #readList(pending:Pending){const reply=quicklinkListReplySchema.parse(await bounded(this.#api.listQuicklinks!(),pending.controller.signal));if(!reply.ok)throw new Error('Read unavailable.');return reply.value.records;}
  async #readRecord(pending:Pending,summary:QuicklinkSummary){const reply=parseRecord(await bounded(this.#api.getQuicklink!({id:summary.id,revision:summary.revision}),pending.controller.signal));if(!reply.ok)throw new Error('Read unavailable.');const record=reply.value.record;if(record.id!==summary.id||record.revision!==summary.revision||record.name!==summary.name||new URL(record.url).host!==summary.host)throw new Error('Invalid record.');return record;}
  async #reload(explicit:boolean){
    if(!this.active||this.#busy()||!this.#api.listQuicklinks)return;const pending=this.#begin('list');
    try{const records=await this.#readList(pending);let fresh:QuicklinkRecord|null=null;const editor=this.#editor,summary=editor?.record?records.find(record=>record.id===editor.record!.id):undefined;
      if(summary){if(!this.#api.getQuicklink)throw new Error();fresh=await this.#readRecord(pending,summary);}
      if(!this.#current(pending))return;this.#pending=null;this.#records=records;this.#loaded=true;
      if(explicit){this.#state.metadataUnconfirmed=false;this.#state.openUnconfirmed=false;this.#status=undefined;if(editor){editor.record=fresh??editor.record;editor.missing=!!editor.record&&!summary;delete editor.nameError;delete editor.urlError;delete editor.needsReload;editor.status={kind:editor.missing?'error':'info',message:editor.missing?'This quicklink no longer exists. Cancel, then create a new quicklink.':'Stored quicklinks reloaded. Your draft is retained; review it before saving.'};}}
      this.#publish();
    }catch{if(this.#current(pending)){const status:Status={kind:'error',message:'Quicklinks could not be loaded. Reload quicklinks or reopen Linuxcast to reconnect.'};if(this.#editor)this.#editor.status=status;else this.#status=status;}}
    finally{this.#finish(pending);}
  }
  async handle(intent:ActionIntent){
    const top=this.#session.getSnapshot().frames.at(-1);if(!this.active||!top||!this.owns(intent.viewId)||top.view.viewId!==intent.viewId||top.view.revision!==intent.revision||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId','values'].includes(key)))return;
    if(intent.viewId===this.#editorId){if(intent.itemId!==undefined)return;if(intent.actionId===CANCEL&&intent.values===undefined){this.#session.pop();return;}if(intent.actionId===RELOAD&&intent.values===undefined){await this.#reload(true);return;}if(intent.actionId===SAVE&&!this.#busy())await this.#save(intent);return;}
    if(intent.values!==undefined||intent.itemId!==undefined&&intent.itemId!==top.selection)return;
    if(intent.actionId===BACK){this.#session.pop();return;}if(this.#busy())return;
    if(intent.actionId===RELOAD){await this.#reload(true);return;}
    if(intent.actionId===NEW){if(this.#api.saveQuicklink&&this.#records.length<MAX_QUICKLINKS){this.#editor={name:'',url:'',record:null};this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#listId,view:this.#form()});}return;}
    const summary=this.#records.find(record=>record.id===intent.itemId);if(!summary||summary.id!==top.selection)return;
    if(intent.actionId===EDIT&&this.#api.getQuicklink){await this.#edit(summary);return;}
    if(intent.actionId===OPEN&&!this.#disabled('openQuicklink','open')){await this.#openLink(summary);return;}
    if(intent.actionId===REMOVE&&!this.#disabled('removeQuicklink','write'))await this.#remove(summary);
  }
  async #edit(summary:QuicklinkSummary){const pending=this.#begin('get');try{const record=await this.#readRecord(pending,summary);if(!this.#current(pending))return;this.#pending=null;this.#editor={name:record.name,url:record.url,record};this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#listId,view:this.#form()});}catch{if(this.#current(pending))this.#status={kind:'error',message:'This quicklink could not be loaded. Reload quicklinks and select it again.'};}finally{this.#finish(pending);}}
  #checkAfterMutation(records:QuicklinkSummary[],record:QuicklinkRecord|null,removedId?:string){
    const expected=new Set(this.#records.map(value=>value.id));if(removedId)expected.delete(removedId);if(record)expected.add(record.id);
    if(expected.size!==records.length||records.some(value=>!expected.has(value.id)))throw new Error('Incomplete summaries.');
    for(const next of records){const previous=this.#records.find(value=>value.id===next.id);if(record?.id===next.id){if(next.revision!==record.revision||next.name!==record.name||next.host!==new URL(record.url).host)throw new Error('Unconfirmed save.');}else if(!previous||JSON.stringify(previous)!==JSON.stringify(next))throw new Error('Changed summary.');}
  }
  async #save(intent:ActionIntent){
    const editor=this.#editor;if(!editor||editor.missing||this.#disabled('saveQuicklink','write'))return;const name=intent.values?.name,url=intent.values?.url;
    if(typeof name!=='string'||typeof url!=='string'||Object.keys(intent.values??{}).length!==2)return;editor.name=name;editor.url=url;delete editor.nameError;delete editor.urlError;delete editor.status;
    const parsedName=quicklinkNameSchema.safeParse(name.trim()),parsedUrl=quicklinkUrlSchema.safeParse(url);
    if(!parsedName.success)editor.nameError='Use a non-empty name up to 128 characters and 256 UTF-8 bytes, without control characters.';
    if(!parsedUrl.success)editor.urlError='Use a literal HTTP or HTTPS address without credentials, spaces or raw braces. Placeholders are not supported yet.';
    if(!parsedName.success||!parsedUrl.success){this.#publish();return;}
    const request:QuicklinkSave={...(editor.record?{id:editor.record.id}:{}),expectedRevision:editor.record?.revision??0,name:parsedName.data,url:parsedUrl.data};const pending=this.#begin('save');
    try{const reply=parseRecord(await bounded(this.#api.saveQuicklink!(request),pending.controller.signal));if(!this.#current(pending))return;
      if(!reply.ok){if(['conflict','invalid-request','capability-unavailable','permission-denied'].includes(reply.error.code)){const conflict=reply.error.details?.reason;editor.needsReload=true;if(conflict==='quicklink-name-conflict'){editor.nameError='This name is already saved. Choose another name.';delete editor.needsReload;}else editor.status={kind:'error',message:conflict==='quicklink-limit-reached'?'500 quicklinks are saved. Cancel and remove one before creating another.':'The quicklink was not saved. Check the fields or reload quicklinks to reconnect and review its current version.'};return;}throw new Error();}
      const record=reply.value.record,previous=editor.record;if(record.name!==request.name||record.url!==request.url||record.revision!==request.expectedRevision+1||previous&&(record.id!==previous.id||record.createdAt!==previous.createdAt||record.updatedAt<previous.updatedAt)||!previous&&(this.#records.some(value=>value.id===record.id)||record.createdAt!==record.updatedAt))throw new Error('Unconfirmed save.');
      const records=await this.#readList(pending);this.#checkAfterMutation(records,record);if(!this.#current(pending))return;
      this.#pending=null;this.#records=records;this.#loaded=true;this.#editor=null;this.#session.pop();this.#session.select(this.#listId,record.id);this.#publish();
    }catch{if(this.#current(pending))this.#unknown('save');}finally{this.#finish(pending);}
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
  async #openLink(summary:QuicklinkSummary){const pending=this.#begin('open');try{
      const reply=quicklinkOpenReplySchema.parse(await bounded(this.#api.openQuicklink!({id:summary.id,revision:summary.revision,launcherRevision:this.#registryRevision}),pending.controller.signal));if(!this.#current(pending))return;
      if(!reply.ok){if(['conflict','invalid-request','capability-unavailable','permission-denied'].includes(reply.error.code)){this.#status={kind:'error',message:'The quicklink was not opened. Check your default browser, or reload quicklinks and reopen Quicklinks for a current launcher revision.'};return;}throw new Error();}
      if(reply.value.id!==summary.id||reply.value.revision!==summary.revision)throw new Error('Unconfirmed browser handoff.');
      this.#pending=null;this.#dismissal=pending;
      try{const hidden=shellCommandReplySchema.parse(await bounded(this.#dismiss(),pending.controller.signal));if(!hidden.ok)throw new Error();}
      catch{if(this.#dismissal===pending&&this.#context(pending)&&!pending.controller.signal.aborted)this.#status={kind:'error',message:'The browser handoff was dispatched, but Linuxcast could not hide this window. Try Hide again.'};}
      finally{if(this.#dismissal===pending){this.#dismissal=null;this.#publish();}}
    }catch{if(this.#current(pending))this.#unknown('open');}finally{this.#finish(pending);}}
  close(viewId:string){if(!this.owns(viewId))return false;this.#invalidate();this.#dismissal?.controller.abort();this.#dismissal=null;if(viewId===this.#editorId)this.#editor=null;else this.#listOpen=false;this.#publish();return true;}
  dispose(){this.#disposed=true;this.#invalidate();this.#dismissal?.controller.abort();this.#dismissal=null;this.#unsubscribe();}
}
function reason(disabledReason:string|undefined){return disabledReason?{disabledReason}:{};}
function parseRecord(raw:unknown){const reply=quicklinkRecordReplySchema.parse(raw);if(reply.ok&&(raw as {value:{record:{url:unknown}}}).value.record.url!==reply.value.record.url)throw new Error('Noncanonical record.');return reply;}
function bounded<T>(promise:Promise<T>,signal:AbortSignal,deadline=true):Promise<T>{return new Promise((resolve,reject)=>{
  const finish=(fn:()=>void)=>{if(timer)clearTimeout(timer);signal.removeEventListener('abort',abort);fn();},abort=()=>finish(()=>reject(new Error('Cancelled.'))),timer=deadline?setTimeout(()=>finish(()=>reject(new Error('Deadline exceeded.'))),5000):null;
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('Request failed.'))));
});}
