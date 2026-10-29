import { DictionaryFlow } from '@linuxcast/dictionary/presentation';
import { EmojiFlow } from '@linuxcast/emoji/presentation';
import { evaluateExpression } from '@linuxcast/calculator/evaluate';
import { formatCalculationText } from '@linuxcast/calculator/result';
import {RateConversionFlow,createRateConversionFlowState} from '@linuxcast/calculator/rate-presentation';
import { CalculatorFlow } from '@linuxcast/calculator/presentation';
import { QuicklinksFlow,createQuicklinksFlowState } from '@linuxcast/quicklinks/presentation';
import { collectCatalogue,mergePinReply,mergeAliasReply,mergeVisibilityCatalogue,parsePage } from './catalogue.ts';
import type { Catalogue } from './catalogue.ts';
import { httpUrlSchema,launcherOpenUrlReplySchema,commandAliasSchema,launcherCommandsReplySchema,launcherExecuteReplySchema,shellCommandReplySchema,launcherApplicationActionReplySchema,isLauncherVisibilityProtected,webSearchQuerySchema,calculatorExpressionSchema,notesRootQuerySchema,launcherNotesSearchReplySchema,launcherNoteOpenReplySchema } from '@linuxcast/contracts';
import type { LauncherApi,QuicklinkApi,ViewModel,ShellCommandReply,LauncherCommandMetadata,NotesRootSearch,NotesLauncherSelection } from '@linuxcast/contracts';
import { ViewSession } from '@linuxcast/ui/views';
import type { ActionIntent,ViewHost } from '@linuxcast/ui/views';
import { QueryGenerations,rankCommands,rankManagedCommands,MAX_QUERY_LENGTH } from '@linuxcast/search';
const VIEW_ID='linuxcast-launcher';
const RETRY='launcher:retry',MANAGE='launcher:manage',BACK_MANAGE='launcher:back-manage',HIDE_COMMAND='launcher:hide-command',SHOW_COMMAND='launcher:show-command';
const APPLICATION_ACTION_PREFIX='launcher:application:',APPLICATION_ACTION_UNAVAILABLE='launcher:application-actions-unavailable';
const APPLICATION_ACTION_UNKNOWN='The application action outcome is unknown. Check the application, then reload commands before trying again.';
const APPLICATION_ACTION_UNAVAILABLE_REASON='Application actions are unavailable. Open the application to use its other actions.';
type ApplicationActionPending={controller:AbortController;commandId:string;actionId:string;revision:number;query:string;frameQuery:string};
const CALCULATE='launcher:calculation';
const NOTE_PREFIX='note:',NOTES_MORE='launcher:notes-more',NOTES_PARENT='linuxcast:open-notes';
const NOTE_UNKNOWN='The selected note opening could not be confirmed. Check Notes, then reload commands before selecting a note again.';
type NotePending={controller:AbortController;selection:NotesLauncherSelection;revision:number;query:string;frameQuery:string};
const FALLBACK_PREFIX='launcher:web-search:';
const QUICKLINK_PREFERENCES='Use the Quicklinks list actions to edit saved-link preferences.';
const VISIBILITY_UNKNOWN='Visibility may have changed. Reload commands before trying again.';
const PIN='launcher:pin',UNPIN='launcher:unpin';
const OPEN_URL='linuxcast:open-url',SUBMIT_URL='launcher:submit-url',CANCEL_URL='launcher:cancel-url';
const URL_UNKNOWN='The browser handoff outcome is unknown. Check your browser before trying again, then reload commands for a new request.';
type UrlEditor={viewId:string;revision:number;value:string;error?:string;status?:Status;needsReload?:boolean};
const ALIAS='launcher:alias',SAVE_ALIAS='launcher:save-alias',CANCEL_ALIAS='launcher:cancel-alias';
type AliasEditor={viewId:string;commandId:string;revision:number;value:string;error?:string;status?:Status;needsReload?:boolean};
type Status={kind:'info'|'warning'|'error';message:string};
/** Renderer presentation controller; the main registry is the only source of
 * commands and execution authority. Command matching is local; Notes queries go only to the named local owner search. */
export class LauncherController {
  readonly session:ViewSession;
  readonly host:ViewHost;
  #api:LauncherApi&QuicklinkApi;#dismiss:()=>Promise<ShellCommandReply>;
  #snapshot:Catalogue|null=null;#query='';#viewRevision=0;
  #generations=new QueryGenerations();#load:AbortController|null=null;#execution:AbortController|null=null;#dismissal:AbortController|null=null;
  #active=false;#busy=false;#loading=true;#metadataUnconfirmed=false;#status:Status|undefined;
  #dictionary:DictionaryFlow|null=null;#dictionarySequence=0;
  #emoji:EmojiFlow|null=null;#emojiSequence=0;
  #calculator:CalculatorFlow|null=null;#calculatorSequence=0;
  #rates:RateConversionFlow|null=null;#ratesSequence=0;#ratesState=createRateConversionFlowState();
  #quicklinks:QuicklinksFlow|null=null;#quicklinksSequence=0;#quicklinksState=createQuicklinksFlowState();
  #url:UrlEditor|null=null;#urlSequence=0;#urlUnconfirmed=false;
  #manager:{viewId:string;query:string;selectedId:string|null}|null=null;#managerSequence=0;#visibilityPending:{controller:AbortController;viewId:string}|null=null;#visibilityWarning:Status|undefined;
  #applicationPending:ApplicationActionPending|null=null;#applicationNeedsReload=false;#applicationWarning:Status|undefined;
  #notesRead:AbortController|null=null;#notes: {query:string;revision:number;records:NotesRootSearch['records'];hasMore:boolean;state:'idle'|'loading'|'available'|'error'|'unavailable'}|null=null;
  #notePending:NotePending|null=null;#noteNeedsReload=false;#noteWarning:Status|undefined;
  #priorSelection:string|null=null;#alias:AliasEditor|null=null;#aliasSequence=0;
  constructor(api:LauncherApi&QuicklinkApi,dismiss:()=>Promise<ShellCommandReply>) {
    this.#api=api;this.#dismiss=dismiss;
    this.session=new ViewSession(this.#view(),id=>{void this.#closeView(id);});
    this.session.subscribe(()=>{const frame=this.session.getSnapshot().frames[0];if(frame&&!(frame.selection===null&&this.#loading&&(this.#priorSelection===CALCULATE||this.#priorSelection?.startsWith(FALLBACK_PREFIX))))this.#priorSelection=frame.selection;if(this.#applicationPending&&!this.#applicationContextCurrent(this.#applicationPending))this.#abortApplicationAction();if(this.#notePending&&!this.#noteContextCurrent(this.#notePending))this.#abortNote();if(this.session.getSnapshot().frames.at(-1)?.view.viewId!==VIEW_ID){this.#cancelNotesRead();}else if(!this.#loading&&!this.#busy&&(!this.#notes||this.#notes.state==='idle'))queueMicrotask(()=>void this.#searchNotes());});
    this.host={queryChanged:(id,query)=>{if(this.#dictionary?.owns(id)){this.#dictionary.query(id,query);}else if(this.#emoji?.owns(id)){this.#emoji.query(id,query);}else if(this.#manager?.viewId===id){this.#manager.query=query;this.#publish();}else if(id===VIEW_ID)this.query(query);},action:intent=>{void this.execute(intent);}};
  }
  #view():ViewModel {
    const tooLong=this.#query.length>MAX_QUERY_LENGTH;
    const commands=this.#snapshot && !tooLong?rankCommands(this.#snapshot.commands,this.#query,Date.now(),this.#priorSelection):[];
    const calculation=commands.length?null:this.#calculationCandidate(),notes=this.#noteRows().slice(0,Math.max(0,100-commands.length-(calculation?1:0)));
    const retainedNote=this.#noteRows().find(row=>NOTE_PREFIX+row.id===this.#priorSelection);if(retainedNote&&notes.length&&!notes.includes(retainedNote))notes[notes.length-1]=retainedNote;
    const fallback=commands.length?[]:this.#fallbacks(100-commands.length-notes.length-(calculation?1:0));
    const status=tooLong?{kind:'warning' as const,message:`Keep searches to ${MAX_QUERY_LENGTH} characters or fewer.`}:this.#applicationPending?{kind:'info' as const,message:'Requesting application action…'}:this.#notePending?{kind:'info' as const,message:'Opening selected note…'}:this.#status??this.#noteWarning??this.#applicationWarning??this.#visibilityWarning??this.#notesStatus();
    return {protocolVersion:1,viewId:VIEW_ID,revision:++this.#viewRevision,kind:'list',title:'Search commands',loading:this.#loading,...((calculation&&this.#priorSelection===CALCULATE)||fallback.some(command=>FALLBACK_PREFIX+command.quicklink!.id===this.#priorSelection)?{selectedId:this.#priorSelection!}:{}),
      search:{query:this.#query,placeholder:'Search commands…',mode:'extension'},
      sections:[...[...new Set(commands.map(command=>command.provider??(command.id.startsWith('application:')?'applications':'commands')))].map(provider=>({id:provider,title:provider==='applications'?'Applications':'Linuxcast',items:commands.filter(command=>(command.provider??(command.id.startsWith('application:')?'applications':'commands'))===provider).map(command=>({id:command.id,title:command.title,...(command.subtitle?{subtitle:command.subtitle}:{}),icon:{kind:'builtin' as const,name:command.id==='linuxcast:open-local-data'?'settings':command.id===OPEN_URL?'link':'search'},
        ...(this.#quicklinkUnavailable(command)?{disabledReason:this.#quicklinkUnavailable(command)}:!command.enabled?{disabledReason:command.unavailableReason??'This command is unavailable.'}:this.#busy?{disabledReason:'Wait for the current command to finish.'}:this.#loading?{disabledReason:'Refreshing commands…'}:{}),
        ...(command.quicklink?{accessories:[{text:'Quicklink',tooltip:QUICKLINK_PREFERENCES}]}:command.usage?.pinned?{accessories:[{text:'Pinned',icon:{kind:'builtin' as const,name:'star'},tooltip:'Pinned command'}]}:{}),
        actions:[{id:command.id,title:command.id==='linuxcast:hide'?'Hide':command.id==='linuxcast:quit'?'Quit Linuxcast':command.id===OPEN_URL?'Open URL':'Open',kind:'invoke' as const,effect:'read' as const},...(command.quicklink?[]:[
          {id:command.usage?.pinned?UNPIN:PIN,title:command.usage?.pinned?'Unpin command':'Pin command',kind:'invoke' as const,effect:'write' as const,icon:{kind:'builtin' as const,name:'star'},
            ...(!this.#snapshot?.rankingAvailable?{disabledReason:'Pinning is unavailable. Reload commands to reconnect to storage.'}:this.#metadataUnconfirmed?{disabledReason:'Reload commands to check the last metadata change before trying again.'}:{})},
          {id:ALIAS,title:'Edit search alias',kind:'invoke' as const,effect:'read' as const,icon:{kind:'builtin' as const,name:'search'},
            ...(!this.#snapshot?.rankingAvailable?{disabledReason:'Aliases are unavailable. Reload commands to reconnect to storage.'}:this.#metadataUnconfirmed?{disabledReason:'Reload commands to check the last metadata change before trying again.'}:{})},this.#visibilityAction(command),...this.#applicationActions(command)])]}))})),...(calculation?[{id:'calculation',title:'Calculation · Local evaluation; Copy is a separate action',items:[{id:CALCULATE,title:'Calculate expression',subtitle:calculation,icon:{kind:'builtin' as const,name:'search'},actions:[{id:CALCULATE,title:'Calculate expression',kind:'invoke' as const,effect:'read' as const}]}]}]:[]),...(notes.length?[{id:'notes',title:'Notes · Local title and body matches',items:notes.map(row=>({id:NOTE_PREFIX+row.id,title:row.title,subtitle:row.excerpt||'Empty note',icon:{kind:'builtin' as const,name:'search'},accessories:[...(row.pinned?[{text:'Pinned'}]:[]),...(row.hasDraft?[{text:'Draft'}]:[])],...(this.#busy?{disabledReason:'Wait for the current command to finish.'}:this.#loading||this.#notes?.state!=='available'?{disabledReason:'Refreshing local Notes…'}:{}),actions:[{id:NOTE_PREFIX+row.id,title:'Open note',kind:'invoke' as const,effect:'read' as const,...(this.#noteNeedsReload?{disabledReason:'Check Notes, then reload commands before selecting a note again.'}:!this.#api.openLauncherNote?{disabledReason:'Opening selected notes is unavailable. Open Notes or reload commands to reconnect.'}:{})}]}))}]:[]),...(fallback.length?[{id:'web-search-fallback',title:`Configured web searches${this.#snapshot!.commands.filter(command=>command.quicklink?.webSearch&&!command.hidden&&command.enabled).length>100?' · Up to 100 providers':''} · Choosing opens a local form; only Open search sends the query`,items:fallback.map(command=>({id:FALLBACK_PREFIX+command.quicklink!.id,title:`Search with ${command.title}`,subtitle:command.subtitle??'Configured web search',icon:{kind:'builtin' as const,name:'search'},actions:[{id:FALLBACK_PREFIX+command.quicklink!.id,title:`Search with ${command.title}`,kind:'invoke' as const,effect:'read' as const}]}))}]:[])],
      empty:{title:this.#loading?'Loading commands…':'No commands available',description:this.#loading?'Getting commands from Linuxcast.':'Reload commands to try again.'},
      ...(status?{status}:{}),actions:[{id:MANAGE,title:'Manage commands',kind:'invoke',effect:'read',...(this.#busy?{disabledReason:'Wait for the current command to finish.'}:this.#loading?{disabledReason:'Refreshing commands…'}:{})},...(this.#notesParent()?[{id:NOTES_MORE,title:'Open Notes',kind:'invoke' as const,effect:'read' as const,...(this.#busy||this.#loading?{disabledReason:'Wait for the current command to finish.'}:{})}]:[]),...((this.#status?.kind==='error' || this.#metadataUnconfirmed || this.#applicationNeedsReload || this.#noteNeedsReload || this.#notes?.state==='error' || this.#notes?.state==='unavailable' || this.#urlUnconfirmed || this.#snapshot && (!this.#snapshot.rankingAvailable || this.#snapshot.applicationState==='unavailable' || this.#snapshot.visibilityAvailable!==true)) && !this.#busy?[{id:RETRY,title:'Reload commands',kind:'invoke' as const,effect:'read' as const}]:[])]};
  }
  #calculationCandidate(){
    if(!this.#active||this.#loading||this.#busy||!this.#snapshot||this.#status?.kind==='error'||this.#query.length>MAX_QUERY_LENGTH||!calculatorExpressionSchema.safeParse(this.#query).success||![...this.#query].some(character=>'0123456789#()+-*/^%'.includes(character))||rankCommands(this.#snapshot.commands,this.#query).length)return null;
    const command=this.#snapshot.commands.find(command=>command.id==='linuxcast:calculator');if(!command?.enabled||command.hidden)return null;
    try{const result=evaluateExpression(this.#query);return result.ok?formatCalculationText(result):null;}catch{return null;}
  }
  #fallbacks(limit=100){
    if(!this.#active||this.#loading||this.#busy||!this.#snapshot||this.#status?.kind==='error'||this.#query.length>MAX_QUERY_LENGTH||!webSearchQuerySchema.safeParse(this.#query).success||rankCommands(this.#snapshot.commands,this.#query,Date.now(),this.#priorSelection).length)return [];
    const parent=this.#snapshot.commands.find(command=>command.id==='linuxcast:open-quicklinks');if(!parent?.enabled||parent.hidden)return [];
    const all=this.#snapshot.commands.filter(command=>command.quicklink?.webSearch&&command.enabled&&!command.hidden).sort((a,b)=>a.title.localeCompare(b.title,'en')||a.id.localeCompare(b.id,'en'));
    if(limit<=0)return [];const rows=all.slice(0,limit),retained=all.find(command=>FALLBACK_PREFIX+command.quicklink!.id===this.#priorSelection);if(retained&&!rows.includes(retained)){rows[rows.length-1]=retained;rows.sort((a,b)=>all.indexOf(a)-all.indexOf(b));}return rows;
  }
  #notesParent(){const parent=this.#snapshot?.commands.find(command=>command.id===NOTES_PARENT);return !!parent?.enabled&&!parent.hidden;}
  #noteRows(){return this.#notesParent()&&this.#notes?.query===this.#query?this.#notes.records:[];}
  #notesStatus():Status|undefined{
    if(!this.#notesParent()||!notesRootQuerySchema.safeParse(this.#query).success)return;
    const state=this.#notes?.state;
    return {kind:state==='error'?'error':state==='unavailable'?'warning':'info',message:state==='loading'||!state?'Searching local Notes…':state==='error'?'Local Notes search failed. Reload commands or open Notes to retry.':state==='unavailable'?'Local Notes search is unavailable. Open Notes or reload commands to reconnect.':this.#notes?.hasMore?'More local Notes matches are available. Open Notes to search the full library.':!this.#notes?.records.length?'No matching local Notes. Open Notes to search or create a note.':'Notes match stored titles and body text locally. Open a selected note explicitly.'};
  }
  #cancelNotesRead(){this.#notesRead?.abort();this.#notesRead=null;if(this.#notes?.state==='loading')this.#notes={...this.#notes,state:'idle'};}
  async #searchNotes(){
    if(!this.#active||this.#busy||this.#loading||!this.#snapshot||!this.#notesParent()||!notesRootQuerySchema.safeParse(this.#query).success||this.session.getSnapshot().frames.at(-1)?.view.viewId!==VIEW_ID||this.#notesRead)return;
    const query=this.#query,revision=this.#snapshot.revision;if(this.#notes?.query===query&&this.#notes.revision===revision&&this.#notes.state!=='idle')return;
    const controller=new AbortController();this.#notesRead=controller;this.#notes={query,revision,records:this.#notes?.query===query?this.#notes.records:[],hasMore:false,state:this.#api.searchLauncherNotes?'loading':'unavailable'};this.#publish();
    const current=()=>this.#active&&!controller.signal.aborted&&this.#notesRead===controller&&this.#query===query&&this.#snapshot?.revision===revision&&this.#notesParent()&&this.session.getSnapshot().frames.at(-1)?.view.viewId===VIEW_ID;
    try{if(!current()||!this.#api.searchLauncherNotes)return;const reply=launcherNotesSearchReplySchema.parse(await bounded(this.#api.searchLauncherNotes({revision,query}),controller.signal));if(!current())return;
      if(!reply.ok||reply.value.query!==query||reply.value.revision!==revision)throw new Error('search');this.#notes={...reply.value,state:'available'};
    }catch{if(current())this.#notes={query,revision,records:[],hasMore:false,state:'error'};}
    finally{if(this.#notesRead===controller){this.#notesRead=null;if(this.#active)this.#publish();}}
  }
  #noteContextCurrent(pending:NotePending){const frame=this.session.getSnapshot().frames.at(-1);return this.#active&&this.#notesParent()&&this.#snapshot?.revision===pending.revision&&this.#query===pending.query&&frame?.view.viewId===VIEW_ID&&frame.query===pending.frameQuery&&frame.selection===NOTE_PREFIX+pending.selection.id&&this.#notes?.state==='available'&&this.#noteRows().some(row=>row.id===pending.selection.id&&row.revision===pending.selection.revision);}
  #abortNote(){const pending=this.#notePending;if(!pending)return;this.#notePending=null;pending.controller.abort();this.#noteNeedsReload=true;this.#noteWarning={kind:'error',message:NOTE_UNKNOWN};if(this.#execution===pending.controller)this.#busy=false;this.#publish();}
  async #openNote(intent:ActionIntent){
    const frame=this.session.getSnapshot().frames.at(-1),row=this.#noteRows().find(row=>NOTE_PREFIX+row.id===intent.actionId);
    if(!row||!frame||frame.query!==this.#query||frame.selection!==intent.actionId||intent.itemId!==frame.selection||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key))||!this.#api.openLauncherNote||this.#noteNeedsReload||this.#notes?.state!=='available')return;
    const pending:NotePending={controller:new AbortController(),selection:{id:row.id,revision:row.revision},revision:this.#snapshot!.revision,query:this.#query,frameQuery:frame.query};this.#notePending=pending;this.#execution=pending.controller;this.#busy=true;this.#status=undefined;this.#publish();
    try{if(this.#notePending!==pending||!this.#noteContextCurrent(pending))return;const reply=launcherNoteOpenReplySchema.parse(await bounded(this.#api.openLauncherNote({revision:pending.revision,selection:pending.selection}),pending.controller.signal));if(this.#notePending!==pending||!this.#noteContextCurrent(pending))return;
      if(!reply.ok){this.#noteNeedsReload=true;this.#noteWarning={kind:'error',message:['invalid-request','conflict','capability-unavailable','permission-denied','cancelled'].includes(reply.error.code)?'The selected note was not opened. Resolve any pending Notes edits, then reload commands and select it again.':NOTE_UNKNOWN};return;}
      if(reply.value.selection.id!==row.id||reply.value.selection.revision!==row.revision)throw new Error('receipt');this.#notePending=null;this.#noteWarning=undefined;
      await this.#hideWindow('The selected note was opened, but Linuxcast could not hide this window. Try Hide again.');
    }catch{if(!pending.controller.signal.aborted){this.#noteNeedsReload=true;this.#noteWarning={kind:'error',message:NOTE_UNKNOWN};}}
    finally{if(this.#execution===pending.controller&&!pending.controller.signal.aborted){this.#notePending=null;this.#busy=false;this.#publish();}}
  }
  #quicklinkUnavailable(command:LauncherCommandMetadata){const parent=this.#snapshot?.commands.find(value=>value.id==='linuxcast:open-quicklinks');return command.quicklink&&(!parent?.enabled||parent.hidden)?'Quicklinks is unavailable or hidden. Reload commands or show Quicklinks in Manage commands.':undefined;}
  #applicationActions(command:LauncherCommandMetadata){
    const metadata=command.applicationActions;if(!metadata)return [];
    if(!metadata.available)return [{id:APPLICATION_ACTION_UNAVAILABLE,title:'Application actions',kind:'invoke' as const,effect:'write' as const,disabledReason:APPLICATION_ACTION_UNAVAILABLE_REASON}];
    const disabledReason=this.#busy?'Wait for the current command to finish.':this.#loading?'Refreshing commands…':this.#applicationNeedsReload?'Check the application if needed, then reload commands before another application action.':!this.#api.executeApplicationAction?APPLICATION_ACTION_UNAVAILABLE_REASON:undefined;
    return metadata.actions.map(action=>({id:`${APPLICATION_ACTION_PREFIX}${action.id}`,title:action.title,kind:'invoke' as const,effect:'write' as const,...(disabledReason?{disabledReason}:{})}));
  }
  #applicationContextCurrent(pending:ApplicationActionPending){
    const frame=this.session.getSnapshot().frames.at(-1),command=this.#snapshot?.commands.find(value=>value.id===pending.commandId);
    return this.#active&&frame?.view.viewId===VIEW_ID&&frame.selection===pending.commandId&&frame.query===pending.frameQuery&&this.#query===pending.query&&this.#snapshot?.revision===pending.revision&&command?.enabled&&!command.hidden&&command.applicationActions?.available&&command.applicationActions.actions.some(action=>action.id===pending.actionId);
  }
  #abortApplicationAction(){
    const pending=this.#applicationPending;if(!pending)return;
    this.#applicationPending=null;this.#applicationNeedsReload=true;this.#applicationWarning={kind:'error',message:APPLICATION_ACTION_UNKNOWN};this.#status=this.#applicationWarning;
    pending.controller.abort();if(this.#execution===pending.controller)this.#busy=false;this.#publish();
  }
  async #executeApplicationAction(intent:ActionIntent){
    const frame=this.session.getSnapshot().frames.at(-1),command=this.#snapshot?.commands.find(value=>value.id===intent.itemId),actionId=intent.actionId.slice(APPLICATION_ACTION_PREFIX.length);
    if(!this.#api.executeApplicationAction||!frame||!command?.id.startsWith('application:')||!command.enabled||command.hidden||command.id!==frame.selection||!command.applicationActions?.available||!command.applicationActions.actions.some(action=>action.id===actionId)||this.#applicationNeedsReload||this.#query.length>MAX_QUERY_LENGTH||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key)))return;
    const controller=new AbortController(),pending:ApplicationActionPending={controller,commandId:command.id,actionId,revision:this.#snapshot!.revision,query:this.#query,frameQuery:frame.query};
    this.#applicationPending=pending;this.#execution=controller;this.#busy=true;this.#status=undefined;this.#publish();
    try{
      const reply=launcherApplicationActionReplySchema.parse(await bounded(this.#api.executeApplicationAction({commandId:command.id,revision:pending.revision,actionId}),controller.signal));
      if(controller.signal.aborted||this.#execution!==controller||this.#applicationPending!==pending)return;
      if(!this.#applicationContextCurrent(pending)){this.#abortApplicationAction();return;}
      if(!reply.ok){
        this.#applicationNeedsReload=true;this.#applicationWarning={kind:'error',message:['invalid-request','capability-unavailable','permission-denied','conflict'].includes(reply.error.code)?'The application action was not requested. Open the application to use its other actions, or reload commands and try again.':APPLICATION_ACTION_UNKNOWN};this.#status=this.#applicationWarning;return;
      }
      if(reply.value.actionId!==actionId)throw new Error('Unconfirmed application action.');
      // GIO confirms a request only. Hide is a separate operation after a current
      // exact receipt; a failed Hide must not imply the action was cancelled.
      this.#applicationPending=null;this.#applicationWarning=undefined;this.#status=catalogueStatus(this.#snapshot!);
      await this.#hideWindow('The application action was requested, but Linuxcast could not hide this window. Try Hide again.');
    }catch{if(!controller.signal.aborted){this.#applicationNeedsReload=true;this.#applicationWarning={kind:'error',message:APPLICATION_ACTION_UNKNOWN};this.#status=this.#applicationWarning;}}
    finally{if(this.#execution===controller&&!controller.signal.aborted){this.#applicationPending=null;this.#busy=false;this.#publish();}}
  }
  #visibilityAction(command:LauncherCommandMetadata){
    const disabledReason=command.quicklink?QUICKLINK_PREFERENCES:isLauncherVisibilityProtected(command.id)?'Always shown for recovery. Hide Linuxcast and Quit Linuxcast cannot be hidden.':this.#busy?'Wait for the current command to finish.':this.#loading?'Refreshing commands…':this.#metadataUnconfirmed?'Reload commands to check the last metadata change before trying again.':!this.#api.setLauncherHidden || this.#snapshot?.visibilityAvailable!==true?'Visibility editing is unavailable. Reload commands to reconnect to storage.':undefined;
    return {id:command.hidden?SHOW_COMMAND:HIDE_COMMAND,title:command.hidden?'Show command':'Hide command',kind:'invoke' as const,effect:'write' as const,...(disabledReason?{disabledReason}:{})};
  }
  #managedView():ViewModel{
    const manager=this.#manager!,tooLong=manager.query.length>MAX_QUERY_LENGTH,selected=this.session.getSnapshot().frames.find(frame=>frame.view.viewId===manager.viewId)?.selection??manager.selectedId;
    const commands=this.#snapshot&&!tooLong?rankManagedCommands(this.#snapshot.commands,manager.query,selected):[];
    const status=tooLong?{kind:'warning' as const,message:`Keep searches to ${MAX_QUERY_LENGTH} characters or fewer.`}:this.#busy?{kind:'info' as const,message:'Changing command visibility…'}:this.#status??this.#applicationWarning??this.#visibilityWarning??(!this.#api.setLauncherHidden || this.#snapshot?.visibilityAvailable!==true?{kind:'warning' as const,message:'Visibility editing is unavailable. Reload commands to reconnect to storage.'}:{kind:'info' as const,message:'Manage visibility without running commands. Refine your search to find up to 100 matching commands.'});
    return {protocolVersion:1,viewId:manager.viewId,revision:++this.#viewRevision,kind:'list',title:'Manage commands',loading:this.#busy||this.#loading,search:{query:manager.query,placeholder:'Find shown or hidden registered commands…',mode:'extension'},...(selected&&commands.some(command=>command.id===selected)?{selectedId:selected}:{}),
      sections:[{id:'managed',title:'Registered commands · Up to 100 matches',items:commands.map(command=>({id:command.id,title:command.title,...(command.subtitle?{subtitle:command.subtitle}:{}),icon:{kind:'builtin' as const,name:'search'},accessories:[{text:command.hidden?'Hidden':'Shown'},...(isLauncherVisibilityProtected(command.id)?[{text:'Always shown for recovery'}]:[]),...(!command.enabled?[{text:'Unavailable',tooltip:command.unavailableReason??'This command is unavailable.'}]:[])],actions:[this.#visibilityAction(command)]}))}],
      empty:{title:this.#loading?'Loading commands…':'No matching commands',description:'Search both shown and hidden registered commands. At most 100 matches are displayed; refine your search.'},status,
      actions:[{id:BACK_MANAGE,title:'Back',kind:'invoke',effect:'read'},{id:RETRY,title:'Reload commands',kind:'invoke',effect:'read',...(this.#busy?{disabledReason:'Wait for the current command to finish.'}:this.#loading?{disabledReason:'Refreshing commands…'}:{})}]};
  }
  #openManager(){
    if(this.#manager || this.#alias || this.#url || this.#calculator?.active || this.#rates?.active || this.#quicklinks?.active || this.#emoji?.active || this.#dictionary?.active)return;
    this.#manager={viewId:`launcher-management-${++this.#managerSequence}`,query:'',selectedId:this.session.getSnapshot().frames[0]?.selection??null};
    this.session.navigate({protocolVersion:1,kind:'push',fromViewId:VIEW_ID,view:this.#managedView()});
  }
  #abortVisibility(){
    const pending=this.#visibilityPending;if(!pending)return;
    this.#metadataUnconfirmed=true;this.#visibilityWarning={kind:'error',message:VISIBILITY_UNKNOWN};this.#status=this.#visibilityWarning;
    pending.controller.abort();this.#visibilityPending=null;if(this.#execution===pending.controller)this.#busy=false;
  }
  async #setHidden(intent:ActionIntent){
    const frame=this.session.getSnapshot().frames.at(-1),command=this.#snapshot?.commands.find(value=>value.id===intent.itemId),hidden=intent.actionId===HIDE_COMMAND;
    if(!frame||!command||intent.itemId!==frame.selection||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key))||this.#visibilityAction(command).disabledReason||Boolean(command.hidden)===hidden||!this.#manager&&!hidden)return;
    const before=this.#snapshot!,controller=new AbortController();this.#execution=controller;this.#visibilityPending={controller,viewId:intent.viewId};this.#busy=true;this.#status=undefined;this.#publish();
    try{
      const outcome=await bounded((async()=>{
        const reply=launcherCommandsReplySchema.parse(await this.#api.setLauncherHidden!({commandId:command.id,revision:before.revision,hidden}));
        if(!reply.ok)return reply;
        let initial=true;
        const next=await collectCatalogue(cursor=>{if(controller.signal.aborted)throw new Error();if(initial){initial=false;return Promise.resolve(reply);}return this.#api.getLauncherCommands(cursor?{cursor}:undefined);});
        return {ok:true as const,value:next};
      })(),controller.signal);
      if(!this.#active||controller.signal.aborted||this.#execution!==controller)return;
      if(!outcome.ok){this.#metadataUnconfirmed=true;this.#visibilityWarning={kind:'error',message:outcome.error.code==='capability-unavailable'?'Visibility editing is unavailable. Reload commands to reconnect to storage.':['invalid-request','conflict','permission-denied','cancelled'].includes(outcome.error.code)?'The visibility change was not accepted. Reload commands and select the command again.':VISIBILITY_UNKNOWN};this.#status=this.#visibilityWarning;return;}
      this.#snapshot=mergeVisibilityCatalogue(before,outcome.value,command.id,hidden);this.#status=catalogueStatus(this.#snapshot);
    }catch{if(!controller.signal.aborted){this.#metadataUnconfirmed=true;this.#visibilityWarning={kind:'error',message:VISIBILITY_UNKNOWN};this.#status=this.#visibilityWarning;}}
    finally{if(this.#execution===controller&&!controller.signal.aborted){this.#visibilityPending=null;this.#busy=false;this.#publish();}}
  }
  #aliasView():ViewModel {
    const editor=this.#alias!;
    return {protocolVersion:1,viewId:editor.viewId,revision:++this.#viewRevision,kind:'form',title:'Edit search alias',loading:this.#busy,
      fields:[{id:'alias',kind:'text',title:'Search alias',required:false,value:editor.value,description:`Find ${this.#snapshot?.commands.find(command=>command.id===editor.commandId)?.title??'this command'} by an exact alias. Leave empty to remove it. Up to 64 characters.`,...(editor.error?{error:editor.error}:{})}],
      submitActionId:SAVE_ALIAS,cancelActionId:CANCEL_ALIAS,...(editor.status?{status:editor.status}:{}),
      actions:[{id:SAVE_ALIAS,title:'Save alias',kind:'invoke',effect:'write',...(this.#busy?{disabledReason:'Saving alias…'}:this.#metadataUnconfirmed?{disabledReason:'Reload commands to check the last change.'}:{})},
        {id:CANCEL_ALIAS,title:'Cancel',kind:'invoke',effect:'read'},...(this.#metadataUnconfirmed || editor.needsReload?[{id:RETRY,title:'Reload commands',kind:'invoke' as const,effect:'read' as const}]:[])]};
  }
  #urlView():ViewModel {
    const editor=this.#url!;
    return {protocolVersion:1,viewId:editor.viewId,revision:++this.#viewRevision,kind:'form',title:'Open URL',loading:this.#busy,
      fields:[{id:'url',kind:'text',title:'URL',required:true,value:editor.value,description:'Enter an HTTP or HTTPS address. Open URL hands it to your default browser.',...(editor.error?{error:editor.error}:{})}],
      submitActionId:SUBMIT_URL,cancelActionId:CANCEL_URL,...(editor.status?{status:editor.status}:{}),
      actions:[{id:SUBMIT_URL,title:'Open URL',kind:'invoke',effect:'write',...(this.#busy?{disabledReason:'Handing URL to the browser…'}:this.#urlUnconfirmed?{disabledReason:'Check your browser, then reload commands before a new request.'}:{})},
        {id:CANCEL_URL,title:'Cancel',kind:'invoke',effect:'read'},...(this.#urlUnconfirmed || editor.needsReload?[{id:RETRY,title:'Reload commands',kind:'invoke' as const,effect:'read' as const}]:[])]};
  }
  #publish(){if(!this.#active)return;this.session.update(VIEW_ID,{protocolVersion:1,kind:'snapshot',view:this.#view()});if(this.#alias)this.session.update(this.#alias.viewId,{protocolVersion:1,kind:'snapshot',view:this.#aliasView()});if(this.#manager)this.session.update(this.#manager.viewId,{protocolVersion:1,kind:'snapshot',view:this.#managedView()});if(this.#url)this.session.update(this.#url.viewId,{protocolVersion:1,kind:'snapshot',view:this.#urlView()});}
  query(query:string){
    if(this.#manager || this.#alias || this.#url || this.#calculator?.active || this.#rates?.active || this.#emoji?.active || this.#dictionary?.active)return;
    if(query!==this.#query){this.#abortApplicationAction();this.#abortNote();this.#cancelNotesRead();this.#notes=null;}this.#query=query;
    if(query.length>MAX_QUERY_LENGTH){this.#generations.cancel();this.#publish();return;}
    const token=this.#generations.begin(query);
    queueMicrotask(()=>{if(this.#active && this.#generations.current(token.generation)){this.#publish();void this.#searchNotes();}});
  }
  setVisible(visible:boolean){
    if(visible===this.#active)return;
    this.#active=visible;
    if(visible){void this.refresh(false);return;}
    this.#abortNote();this.#cancelNotesRead();this.#notes=null;this.#abortApplicationAction();this.#abortVisibility();if(this.#manager)this.session.pop();
    if(this.#alias || this.#url)this.session.pop();
    for(let depth=0;depth<2 && this.#calculator?.active;depth++)this.session.pop();
    for(let depth=0;depth<4 && this.#dictionary?.active;depth++)this.session.pop();
    this.#dictionary?.dispose();this.#dictionary=null;
    for(let depth=0;depth<2 && this.#emoji?.active;depth++)this.session.pop();
    this.#emoji?.dispose();this.#emoji=null;
    this.#calculator?.dispose();this.#calculator=null;
    for(let depth=0;depth<2 && this.#rates?.active;depth++)this.session.pop();
    this.#rates?.dispose();this.#rates=null;
    for(let depth=0;depth<2 && this.#quicklinks?.active;depth++)this.session.pop();
    this.#quicklinks?.dispose();this.#quicklinks=null;
    this.#generations.cancel();this.#load?.abort();this.#execution?.abort();this.#dismissal?.abort();this.#dismissal=null;this.#busy=false;
  }
  async refresh(explicit=true){
    if(!this.#active || this.#busy || this.#alias || this.#url || this.#calculator?.active || this.#rates?.active || this.#quicklinks?.active || this.#emoji?.active || this.#dictionary?.active)return;
    this.#cancelNotesRead();if(this.#notes)this.#notes={...this.#notes,state:'idle'};this.#load?.abort();const controller=new AbortController();this.#load=controller;
    this.#loading=true;this.#status=undefined;this.#publish();
    try{
      const next=await collectCatalogue(cursor=>{if(controller.signal.aborted)throw new Error();return bounded(this.#api.getLauncherCommands(cursor?{cursor}:undefined),controller.signal);});
      if(!this.#active || controller.signal.aborted)return;
      if(this.#snapshot && next.revision<this.#snapshot.revision)throw new Error();
      this.#snapshot=next;if(explicit){this.#metadataUnconfirmed=false;this.#visibilityWarning=undefined;this.#applicationNeedsReload=false;this.#applicationWarning=undefined;this.#noteNeedsReload=false;this.#noteWarning=undefined;}this.#status=this.#applicationWarning??this.#visibilityWarning??catalogueStatus(next);
    }catch{if(!controller.signal.aborted)this.#status={kind:'error',message:'Commands could not be loaded. Reload commands to try again.'};}
    finally{if(this.#load===controller && !controller.signal.aborted){this.#loading=false;this.#publish();void this.#searchNotes();}}
  }
  async execute(intent:ActionIntent){
    const frame=this.session.getSnapshot().frames.at(-1);
    if(!this.#active || this.#busy && !(this.#alias && intent.actionId===CANCEL_ALIAS || this.#url && intent.actionId===CANCEL_URL || this.#manager && intent.actionId===BACK_MANAGE) || this.#loading && !(this.#manager && intent.actionId===BACK_MANAGE) || !frame || intent.viewId!==frame.view.viewId || intent.revision!==frame.view.revision)return;
    if(this.#dictionary?.active){const parent=this.#snapshot?.commands.find(command=>command.id==='linuxcast:dictionary');if(!parent?.enabled||parent.hidden)return;await this.#dictionary.handle(intent);return;}
    if(this.#emoji?.active){const parent=this.#snapshot?.commands.find(command=>command.id==='linuxcast:emoji');if(!parent?.enabled||parent.hidden)return;await this.#emoji.handle(intent);return;}
    if(this.#calculator?.active){if(this.#snapshot?.commands.find(command=>command.id==='linuxcast:calculator')?.hidden)return;await this.#calculator.handle(intent);return;}
    if(this.#rates?.active){const parent=this.#snapshot?.commands.find(command=>command.id==='linuxcast:currency-conversion');if(!parent?.enabled||parent.hidden)return;await this.#rates.handle(intent);return;}
    if(this.#quicklinks?.active){const parent=this.#snapshot?.commands.find(command=>command.id==='linuxcast:open-quicklinks');if(!parent?.enabled||parent.hidden)return;await this.#quicklinks.handle(intent);return;}
    if(this.#manager){
      if(intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key)))return;
      if(intent.actionId===BACK_MANAGE){this.session.pop();return;}
      if(intent.actionId===RETRY){await this.refresh();return;}
      if(intent.actionId===HIDE_COMMAND||intent.actionId===SHOW_COMMAND)await this.#setHidden(intent);return;
    }
    if(this.#alias){await this.#editAlias(intent);return;}
    if(this.#url){await this.#submitUrl(intent);return;}
    if(intent.viewId!==VIEW_ID)return;
    if(intent.actionId.startsWith(NOTE_PREFIX)){await this.#openNote(intent);return;}
    if(intent.actionId===NOTES_MORE){if(intent.itemId!==undefined&&intent.itemId!==frame.selection||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key))||!this.#notesParent())return;const query=this.#query,selection=frame.selection,revision=this.#snapshot!.revision,controller=new AbortController();this.#busy=true;this.#execution=controller;this.#publish();try{if(!this.#active||controller.signal.aborted||!this.#notesParent()||this.session.getSnapshot().frames.at(-1)?.view.viewId!==VIEW_ID||this.#query!==query||this.session.getSnapshot().frames.at(-1)?.selection!==selection)return;const reply=launcherExecuteReplySchema.parse(await bounded(this.#api.executeLauncherCommand({commandId:NOTES_PARENT,revision}),controller.signal));if(!reply.ok)throw new Error('unavailable');}catch{if(this.#active&&!controller.signal.aborted)this.#status={kind:'error',message:'Notes could not be opened. Check Notes and reload commands before trying again.'};}finally{if(this.#active&&this.#execution===controller&&!controller.signal.aborted){this.#busy=false;this.#publish();}}return;}
    if(intent.actionId===CALCULATE){
      if(!this.#calculationCandidate()||frame.query!==this.#query||frame.selection!==CALCULATE||intent.itemId!==CALCULATE||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key)))return;
      this.#calculator?.dispose();this.#calculator=new CalculatorFlow({session:this.session,api:this.#api,viewId:`launcher-calculator-${++this.#calculatorSequence}`,revision:this.#snapshot!.revision});this.#calculator.openExpression(VIEW_ID,this.#query);return;
    }
    if(intent.actionId.startsWith(FALLBACK_PREFIX)){
      const command=this.#fallbacks().find(command=>FALLBACK_PREFIX+command.quicklink!.id===intent.actionId);
      if(!command||frame.query!==this.#query||frame.selection!==intent.actionId||intent.itemId!==frame.selection||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key)))return;
      const selection={id:command.quicklink!.id,revision:command.quicklink!.revision},query=this.#query;
      this.#quicklinks?.dispose();this.#quicklinks=new QuicklinksFlow({session:this.session,api:this.#api,viewId:`launcher-quicklinks-${++this.#quicklinksSequence}`,revision:this.#snapshot!.revision,state:this.#quicklinksState,onDismiss:this.#dismiss});this.#quicklinks.openWebSearch(VIEW_ID,selection,query);return;
    }
    if(intent.actionId.startsWith(APPLICATION_ACTION_PREFIX)){await this.#executeApplicationAction(intent);return;}
    if(intent.actionId===MANAGE){if(intent.values===undefined)this.#openManager();return;}
    if(intent.actionId===HIDE_COMMAND){await this.#setHidden(intent);return;}
    if(intent.actionId===RETRY){this.#urlUnconfirmed=false;await this.refresh();return;}
    if(intent.actionId===ALIAS){this.#openAlias(intent);return;}
    if(intent.actionId===PIN || intent.actionId===UNPIN){await this.#setPinned(intent);return;}
    const command=this.#snapshot?.commands.find(command=>command.id===intent.actionId);
    if(!command || command.hidden || !command.enabled || intent.itemId!==frame.selection || command.id!==frame.selection || this.#query.length>MAX_QUERY_LENGTH)return;
    if(command.id===OPEN_URL){this.#openUrl();return;}
    if(command.id==='linuxcast:open-quicklinks'||command.quicklink){
      if(this.#quicklinkUnavailable(command)||intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key)))return;
      this.#quicklinks?.dispose();this.#quicklinks=new QuicklinksFlow({session:this.session,api:this.#api,viewId:`launcher-quicklinks-${++this.#quicklinksSequence}`,revision:this.#snapshot!.revision,state:this.#quicklinksState,onDismiss:this.#dismiss});
      this.#quicklinks.open(VIEW_ID,command.quicklink?{id:command.quicklink.id,revision:command.quicklink.revision}:undefined);return;
    }
    if(command.id==='linuxcast:currency-conversion'){
      if(intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key)))return;
      this.#rates?.dispose();this.#rates=new RateConversionFlow({session:this.session,api:this.#api,viewId:`launcher-rates-${++this.#ratesSequence}`,revision:this.#snapshot!.revision,state:this.#ratesState});this.#rates.open(VIEW_ID);return;
    }
    if(command.id==='linuxcast:dictionary'){
      if(intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key)))return;
      this.#dictionary?.dispose();this.#dictionary=new DictionaryFlow({session:this.session,api:this.#api,viewId:`launcher-dictionary-${++this.#dictionarySequence}`,revision:this.#snapshot!.revision});this.#dictionary.open(VIEW_ID);return;
    }

    if(command.id==='linuxcast:emoji'){
      if(intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key)))return;
      this.#emoji?.dispose();this.#emoji=new EmojiFlow({session:this.session,api:this.#api,viewId:`launcher-emoji-${++this.#emojiSequence}`,revision:this.#snapshot!.revision});this.#emoji.open(VIEW_ID);return;
    }
    if(command.id==='linuxcast:calculator'){
      this.#calculator?.dispose();this.#calculator=new CalculatorFlow({session:this.session,api:this.#api,viewId:`launcher-calculator-${++this.#calculatorSequence}`,revision:this.#snapshot!.revision});
      this.#calculator.open(VIEW_ID);return;
    }
    const revision=this.#snapshot!.revision,controller=new AbortController();this.#execution=controller;this.#busy=true;this.#status=undefined;this.#publish();
    try{
      const reply=launcherExecuteReplySchema.parse(await bounded(this.#api.executeLauncherCommand({commandId:command.id,revision}),controller.signal));
      if(!this.#active || controller.signal.aborted)return;
      if(!reply.ok){this.#status={kind:'error',message:reply.error.code==='deadline-exceeded'?'The command outcome is unknown. Check its result before trying again.':'This command could not run. Reload commands and try again.'};return;}
      // A dispatched application or Quit is receipt only. No effect-completion toast is shown.
      this.#status=undefined;
    }catch{if(!controller.signal.aborted)this.#status={kind:'error',message:'The command outcome is unknown. Check its result before trying again.'};}
    finally{if(this.#execution===controller && !controller.signal.aborted){this.#busy=false;this.#publish();}}
  }
  async #setPinned(intent:ActionIntent){
    const frame=this.session.getSnapshot().frames[0];
    const command=this.#snapshot?.commands.find(command=>command.id===intent.itemId);
    const pinned=intent.actionId===PIN;
    if(!frame || !command?.enabled || command.quicklink || command.hidden || command.id!==frame.selection || !this.#snapshot?.rankingAvailable || this.#metadataUnconfirmed || Boolean(command.usage?.pinned)===pinned || this.#query.length>MAX_QUERY_LENGTH)return;
    const revision=this.#snapshot.revision,controller=new AbortController();this.#execution=controller;this.#busy=true;this.#status=undefined;this.#publish();
    try{
      const reply=parsePage(await bounded(this.#api.setLauncherPinned({commandId:command.id,revision,pinned}),controller.signal));
      if(!this.#active || controller.signal.aborted || this.#execution!==controller)return;
      this.#snapshot=mergePinReply(this.#snapshot,reply,command.id,pinned);this.#metadataUnconfirmed=false;this.#status=catalogueStatus(this.#snapshot);
    }catch{if(!controller.signal.aborted){this.#metadataUnconfirmed=true;this.#status={kind:'error',message:'The pin change could not be confirmed. Reload commands before trying again.'};}}
    finally{if(this.#execution===controller && !controller.signal.aborted){this.#busy=false;this.#publish();}}
  }
  #openAlias(intent:ActionIntent){
    const frame=this.session.getSnapshot().frames[0],command=this.#snapshot?.commands.find(value=>value.id===intent.itemId);
    if(!command?.enabled || command.quicklink || command.hidden || command.id!==frame?.selection || !this.#snapshot?.rankingAvailable || this.#metadataUnconfirmed || this.#query.length>MAX_QUERY_LENGTH)return;
    this.#alias={viewId:`launcher-alias-${++this.#aliasSequence}`,commandId:command.id,revision:this.#snapshot.revision,value:command.usage?.alias??''};
    this.session.navigate({protocolVersion:1,kind:'push',fromViewId:VIEW_ID,view:this.#aliasView()});
  }
  async #editAlias(intent:ActionIntent){
    const editor=this.#alias!;
    if(intent.actionId===CANCEL_ALIAS){this.session.pop();return;}
    if(intent.actionId===RETRY && (this.#metadataUnconfirmed || editor.needsReload)){this.session.pop();await this.refresh();return;}
    if(intent.actionId!==SAVE_ALIAS || this.#snapshot?.commands.find(command=>command.id===editor.commandId)?.hidden || this.#metadataUnconfirmed || !this.#snapshot || intent.itemId!==undefined)return;
    const raw=intent.values?.alias;
    if(typeof raw!=='string' || Object.keys(intent.values??{}).length!==1){editor.error='Enter a valid search alias.';this.#publish();return;}
    const alias=raw.trim()||null;editor.value=raw;
    if(alias!==null && !commandAliasSchema.safeParse(alias).success){editor.error='Use up to 64 characters without control characters.';this.#publish();return;}
    delete editor.error;delete editor.status;delete editor.needsReload;
    const controller=new AbortController();this.#execution=controller;this.#busy=true;this.#publish();
    try{
      const reply=launcherCommandsReplySchema.parse(await bounded(this.#api.setLauncherAlias({commandId:editor.commandId,revision:editor.revision,alias}),controller.signal));
      if(!this.#active || controller.signal.aborted || this.#alias!==editor || this.#execution!==controller)return;
      if(!reply.ok){
        if(['conflict','invalid-request','capability-unavailable'].includes(reply.error.code)){
          editor.needsReload=reply.error.code!=='conflict';
          editor.error=reply.error.code==='conflict'?'This alias is already used by another command. Choose another alias.':reply.error.code==='invalid-request'?'The alias could not be accepted. Check it or reload commands.':'Aliases are unavailable. Reload commands to reconnect to storage.';
          return;
        }
        throw new Error('Unconfirmed alias.');
      }
      this.#snapshot=mergeAliasReply(this.#snapshot,reply.value,editor.commandId,alias);this.#status=catalogueStatus(this.#snapshot);
      this.#alias=null;this.session.pop();
    }catch{if(!controller.signal.aborted){this.#metadataUnconfirmed=true;editor.status={kind:'error',message:'The alias change could not be confirmed. Reload commands before trying again.'};this.#status=editor.status;}}
    finally{if(this.#execution===controller && !controller.signal.aborted){this.#busy=false;this.#publish();}}
  }
  #openUrl(){
    const parsed=httpUrlSchema.safeParse(this.#query);
    this.#url={viewId:`launcher-url-${++this.#urlSequence}`,revision:this.#snapshot!.revision,value:parsed.success?parsed.data:'',...(this.#urlUnconfirmed?{status:{kind:'error',message:URL_UNKNOWN}}:{})};
    this.session.navigate({protocolVersion:1,kind:'push',fromViewId:VIEW_ID,view:this.#urlView()});
  }
  async #submitUrl(intent:ActionIntent){
    const editor=this.#url!;
    if(intent.actionId===CANCEL_URL){this.session.pop();return;}
    if(intent.actionId===RETRY && (this.#urlUnconfirmed || editor.needsReload)){this.session.pop();this.#urlUnconfirmed=false;await this.refresh();return;}
    if(intent.actionId!==SUBMIT_URL || this.#snapshot?.commands.find(command=>command.id===OPEN_URL)?.hidden || this.#urlUnconfirmed || !this.#snapshot || intent.itemId!==undefined)return;
    const raw=intent.values?.url;
    if(typeof raw!=='string' || Object.keys(intent.values??{}).length!==1){editor.error='Enter a valid HTTP or HTTPS address.';this.#publish();return;}
    editor.value=raw;const parsed=httpUrlSchema.safeParse(raw);
    if(!parsed.success){editor.error='Enter an HTTP or HTTPS address without credentials, spaces or control characters.';this.#publish();return;}
    editor.value=parsed.data;delete editor.error;delete editor.status;delete editor.needsReload;
    const controller=new AbortController();this.#execution=controller;this.#busy=true;this.#publish();
    try{
      const reply=launcherOpenUrlReplySchema.parse(await bounded(this.#api.openLauncherUrl({revision:editor.revision,url:parsed.data}),controller.signal));
      if(!this.#active || controller.signal.aborted || this.#url!==editor || this.#execution!==controller)return;
      if(!reply.ok){
        if(['invalid-request','capability-unavailable'].includes(reply.error.code)){
          editor.needsReload=true;
          if(reply.error.code==='invalid-request')editor.error='The URL request was not accepted. Check the address or reload commands.';
          else editor.status={kind:'error',message:'Browser handoff is unavailable. Check your default browser settings, then try again or reload commands.'};
          return;
        }
        throw new Error('Unconfirmed URL handoff.');
      }
      // Receipt only: no claim about a new tab, loaded page or focused browser.
      this.#url=null;this.#urlUnconfirmed=false;this.session.pop();this.#status=catalogueStatus(this.#snapshot);
      await this.#hideWindow();
    }catch{if(!controller.signal.aborted){this.#urlUnconfirmed=true;editor.status={kind:'error',message:URL_UNKNOWN};this.#status=editor.status;}}
    finally{if(this.#execution===controller && !controller.signal.aborted){this.#busy=false;this.#publish();}}
  }
  async #closeView(viewId:string){
    if(this.#dictionary?.closed(viewId)){if(!this.#dictionary.active){this.#dictionary.dispose();this.#dictionary=null;void this.refresh(false);}return;}
    if(this.#emoji?.closed(viewId)){if(!this.#emoji.active){this.#emoji.dispose();this.#emoji=null;void this.refresh(false);}return;}
    if(this.#rates?.closed(viewId)){if(!this.#rates.active){this.#rates.dispose();this.#rates=null;void this.refresh(false);}return;}
    if(this.#quicklinks?.owns(viewId)){this.#quicklinks.close(viewId);if(!this.#quicklinks.active){this.#quicklinks.dispose();this.#quicklinks=null;void this.refresh(false);}return;}
    if(this.#calculator?.closed(viewId)){if(!this.#calculator.active){this.#calculator.dispose();this.#calculator=null;void this.refresh(false);}return;}
    if(this.#manager?.viewId===viewId){this.#abortVisibility();this.#manager=null;this.#publish();return;}
    if(viewId!==VIEW_ID){
      if(this.#url?.viewId===viewId){
        if(this.#busy){this.#urlUnconfirmed=true;this.#status={kind:'error',message:URL_UNKNOWN};this.#execution?.abort();this.#busy=false;}
        this.#url=null;this.#publish();
      }
      if(this.#alias?.viewId===viewId){
        if(this.#busy){this.#metadataUnconfirmed=true;this.#status={kind:'error',message:'The alias change could not be confirmed. Reload commands before trying again.'};this.#execution?.abort();this.#busy=false;}
        this.#alias=null;this.#publish();
      }
      return;
    }
    // The shared view pops its root on Escape. Restore the local presentation
    // before requesting Hide so a denied/failed hide never leaves a blank window.
    this.#abortNote();this.#cancelNotesRead();this.#notes=null;this.#abortApplicationAction();this.#abortVisibility();const selection=this.#priorSelection;
    this.session.navigate({protocolVersion:1,kind:'push',fromViewId:null,view:this.#view()});
    if(selection)this.session.select(VIEW_ID,selection);
    await this.#hideWindow();
  }
  async #hideWindow(failureMessage='Linuxcast could not hide this window. Try again.'){
    if(!this.#active || this.#dismissal)return;
    const controller=new AbortController();this.#dismissal=controller;
    try{const reply=shellCommandReplySchema.parse(await bounded(this.#dismiss(),controller.signal));if(!reply.ok)throw new Error();}
    catch{if(!controller.signal.aborted){this.#status={kind:'error',message:failureMessage};this.#publish();}}
    finally{if(this.#dismissal===controller)this.#dismissal=null;}
  }
  dispose(){this.#dictionary?.dispose();this.#dictionary=null;this.#emoji?.dispose();this.#emoji=null;this.#notesRead?.abort();this.#notePending?.controller.abort();this.#notePending=null;this.#applicationPending?.controller.abort();this.#applicationPending=null;this.#visibilityPending?.controller.abort();this.#visibilityPending=null;this.#calculator?.dispose();this.#calculator=null;this.#rates?.dispose();this.#rates=null;this.#quicklinks?.dispose();this.#quicklinks=null;this.#active=false;this.#generations.cancel();this.#load?.abort();this.#execution?.abort();this.#dismissal?.abort();this.#dismissal=null;}
}
function bounded<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  return new Promise((resolve,reject)=>{
    const finish=(fn:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);fn();};
    const abort=()=>finish(()=>reject(new Error('Cancelled.')));
    const timer=setTimeout(()=>finish(()=>reject(new Error('Deadline exceeded.'))),5000);
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
    void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('Request failed.'))));
  });
}

function catalogueStatus(snapshot:Catalogue):Status|undefined {
  if(snapshot.applicationState==='unavailable')return {kind:'warning',message:'Applications are unavailable. Reload commands to try again.'};
  if(!snapshot.rankingAvailable)return {kind:'info',message:'Recent usage and pinning are unavailable. Reload commands to try again.'};
  return undefined;
}
