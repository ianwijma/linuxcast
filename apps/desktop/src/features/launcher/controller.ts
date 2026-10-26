import { CalculatorFlow } from '@linuxcast/calculator/presentation';
import { collectCatalogue,mergePinReply,mergeAliasReply,mergeVisibilityCatalogue,parsePage } from './catalogue.ts';
import type { Catalogue } from './catalogue.ts';
import { httpUrlSchema,launcherOpenUrlReplySchema,commandAliasSchema,launcherCommandsReplySchema,launcherExecuteReplySchema,shellCommandReplySchema,isLauncherVisibilityProtected } from '@linuxcast/contracts';
import type { LauncherApi,ViewModel,ShellCommandReply,LauncherCommandMetadata } from '@linuxcast/contracts';
import { ViewSession } from '@linuxcast/ui/views';
import type { ActionIntent,ViewHost } from '@linuxcast/ui/views';
import { QueryGenerations,rankCommands,rankManagedCommands,MAX_QUERY_LENGTH } from '@linuxcast/search';
const VIEW_ID='linuxcast-launcher';
const RETRY='launcher:retry',MANAGE='launcher:manage',BACK_MANAGE='launcher:back-manage',HIDE_COMMAND='launcher:hide-command',SHOW_COMMAND='launcher:show-command';
const VISIBILITY_UNKNOWN='Visibility may have changed. Reload commands before trying again.';
const PIN='launcher:pin',UNPIN='launcher:unpin';
const OPEN_URL='linuxcast:open-url',SUBMIT_URL='launcher:submit-url',CANCEL_URL='launcher:cancel-url';
const URL_UNKNOWN='The browser handoff outcome is unknown. Check your browser before trying again, then reload commands for a new request.';
type UrlEditor={viewId:string;revision:number;value:string;error?:string;status?:Status;needsReload?:boolean};
const ALIAS='launcher:alias',SAVE_ALIAS='launcher:save-alias',CANCEL_ALIAS='launcher:cancel-alias';
type AliasEditor={viewId:string;commandId:string;revision:number;value:string;error?:string;status?:Status;needsReload?:boolean};
type Status={kind:'info'|'warning'|'error';message:string};
/** Renderer presentation controller; the main registry is the only source of
 * commands and execution authority. Queries never leave this process. */
export class LauncherController {
  readonly session:ViewSession;
  readonly host:ViewHost;
  #api:LauncherApi;#dismiss:()=>Promise<ShellCommandReply>;
  #snapshot:Catalogue|null=null;#query='';#viewRevision=0;
  #generations=new QueryGenerations();#load:AbortController|null=null;#execution:AbortController|null=null;#dismissal:AbortController|null=null;
  #active=false;#busy=false;#loading=true;#metadataUnconfirmed=false;#status:Status|undefined;
  #calculator:CalculatorFlow|null=null;#calculatorSequence=0;
  #url:UrlEditor|null=null;#urlSequence=0;#urlUnconfirmed=false;
  #manager:{viewId:string;query:string;selectedId:string|null}|null=null;#managerSequence=0;#visibilityPending:{controller:AbortController;viewId:string}|null=null;#visibilityWarning:Status|undefined;
  #priorSelection:string|null=null;#alias:AliasEditor|null=null;#aliasSequence=0;
  constructor(api:LauncherApi,dismiss:()=>Promise<ShellCommandReply>) {
    this.#api=api;this.#dismiss=dismiss;
    this.session=new ViewSession(this.#view(),id=>{void this.#closeView(id);});
    this.session.subscribe(()=>{const frame=this.session.getSnapshot().frames[0];if(frame)this.#priorSelection=frame.selection;});
    this.host={queryChanged:(id,query)=>{if(this.#manager?.viewId===id){this.#manager.query=query;this.#publish();}else if(id===VIEW_ID)this.query(query);},action:intent=>{void this.execute(intent);}};
  }
  #view():ViewModel {
    const tooLong=this.#query.length>MAX_QUERY_LENGTH;
    const commands=this.#snapshot && !tooLong?rankCommands(this.#snapshot.commands,this.#query,Date.now(),this.#priorSelection):[];
    const status=tooLong?{kind:'warning' as const,message:`Keep searches to ${MAX_QUERY_LENGTH} characters or fewer.`}:this.#status??this.#visibilityWarning;
    return {protocolVersion:1,viewId:VIEW_ID,revision:++this.#viewRevision,kind:'list',title:'Search commands',loading:this.#loading,
      search:{query:this.#query,placeholder:'Search commands…',mode:'extension'},
      sections:[...new Set(commands.map(command=>command.provider??(command.id.startsWith('application:')?'applications':'commands')))].map(provider=>({id:provider,title:provider==='applications'?'Applications':'Linuxcast',items:commands.filter(command=>(command.provider??(command.id.startsWith('application:')?'applications':'commands'))===provider).map(command=>({id:command.id,title:command.title,...(command.subtitle?{subtitle:command.subtitle}:{}),icon:{kind:'builtin' as const,name:command.id==='linuxcast:open-local-data'?'settings':command.id===OPEN_URL?'link':'search'},
        ...(!command.enabled?{disabledReason:command.unavailableReason??'This command is unavailable.'}:this.#busy?{disabledReason:'Wait for the current command to finish.'}:this.#loading?{disabledReason:'Refreshing commands…'}:{}),
        ...(command.usage?.pinned?{accessories:[{text:'Pinned',icon:{kind:'builtin' as const,name:'star'},tooltip:'Pinned command'}]}:{}),
        actions:[{id:command.id,title:command.id==='linuxcast:hide'?'Hide':command.id==='linuxcast:quit'?'Quit Linuxcast':command.id===OPEN_URL?'Open URL':'Open',kind:'invoke' as const,effect:'read' as const},
          {id:command.usage?.pinned?UNPIN:PIN,title:command.usage?.pinned?'Unpin command':'Pin command',kind:'invoke' as const,effect:'write' as const,icon:{kind:'builtin' as const,name:'star'},
            ...(!this.#snapshot?.rankingAvailable?{disabledReason:'Pinning is unavailable. Reload commands to reconnect to storage.'}:this.#metadataUnconfirmed?{disabledReason:'Reload commands to check the last metadata change before trying again.'}:{})},
          {id:ALIAS,title:'Edit search alias',kind:'invoke' as const,effect:'read' as const,icon:{kind:'builtin' as const,name:'search'},
            ...(!this.#snapshot?.rankingAvailable?{disabledReason:'Aliases are unavailable. Reload commands to reconnect to storage.'}:this.#metadataUnconfirmed?{disabledReason:'Reload commands to check the last metadata change before trying again.'}:{})},this.#visibilityAction(command)]}))})),
      empty:{title:this.#loading?'Loading commands…':'No commands available',description:this.#loading?'Getting commands from Linuxcast.':'Reload commands to try again.'},
      ...(status?{status}:{}),actions:[{id:MANAGE,title:'Manage commands',kind:'invoke',effect:'read',...(this.#busy?{disabledReason:'Wait for the current command to finish.'}:this.#loading?{disabledReason:'Refreshing commands…'}:{})},...((this.#status?.kind==='error' || this.#metadataUnconfirmed || this.#urlUnconfirmed || this.#snapshot && (!this.#snapshot.rankingAvailable || this.#snapshot.applicationState==='unavailable' || this.#snapshot.visibilityAvailable!==true)) && !this.#busy?[{id:RETRY,title:'Reload commands',kind:'invoke' as const,effect:'read' as const}]:[])]};
  }
  #visibilityAction(command:LauncherCommandMetadata){
    const disabledReason=isLauncherVisibilityProtected(command.id)?'Always shown for recovery. Hide Linuxcast and Quit Linuxcast cannot be hidden.':this.#busy?'Wait for the current command to finish.':this.#loading?'Refreshing commands…':this.#metadataUnconfirmed?'Reload commands to check the last metadata change before trying again.':!this.#api.setLauncherHidden || this.#snapshot?.visibilityAvailable!==true?'Visibility editing is unavailable. Reload commands to reconnect to storage.':undefined;
    return {id:command.hidden?SHOW_COMMAND:HIDE_COMMAND,title:command.hidden?'Show command':'Hide command',kind:'invoke' as const,effect:'write' as const,...(disabledReason?{disabledReason}:{})};
  }
  #managedView():ViewModel{
    const manager=this.#manager!,tooLong=manager.query.length>MAX_QUERY_LENGTH,selected=this.session.getSnapshot().frames.find(frame=>frame.view.viewId===manager.viewId)?.selection??manager.selectedId;
    const commands=this.#snapshot&&!tooLong?rankManagedCommands(this.#snapshot.commands,manager.query,selected):[];
    const status=tooLong?{kind:'warning' as const,message:`Keep searches to ${MAX_QUERY_LENGTH} characters or fewer.`}:this.#busy?{kind:'info' as const,message:'Changing command visibility…'}:this.#status??this.#visibilityWarning??(!this.#api.setLauncherHidden || this.#snapshot?.visibilityAvailable!==true?{kind:'warning' as const,message:'Visibility editing is unavailable. Reload commands to reconnect to storage.'}:{kind:'info' as const,message:'Manage visibility without running commands. Refine your search to find up to 100 matching commands.'});
    return {protocolVersion:1,viewId:manager.viewId,revision:++this.#viewRevision,kind:'list',title:'Manage commands',loading:this.#busy||this.#loading,search:{query:manager.query,placeholder:'Find shown or hidden registered commands…',mode:'extension'},...(selected&&commands.some(command=>command.id===selected)?{selectedId:selected}:{}),
      sections:[{id:'managed',title:'Registered commands · Up to 100 matches',items:commands.map(command=>({id:command.id,title:command.title,...(command.subtitle?{subtitle:command.subtitle}:{}),icon:{kind:'builtin' as const,name:'search'},accessories:[{text:command.hidden?'Hidden':'Shown'},...(isLauncherVisibilityProtected(command.id)?[{text:'Always shown for recovery'}]:[]),...(!command.enabled?[{text:'Unavailable',tooltip:command.unavailableReason??'This command is unavailable.'}]:[])],actions:[this.#visibilityAction(command)]}))}],
      empty:{title:this.#loading?'Loading commands…':'No matching commands',description:'Search both shown and hidden registered commands. At most 100 matches are displayed; refine your search.'},status,
      actions:[{id:BACK_MANAGE,title:'Back',kind:'invoke',effect:'read'},{id:RETRY,title:'Reload commands',kind:'invoke',effect:'read',...(this.#busy?{disabledReason:'Wait for the current command to finish.'}:this.#loading?{disabledReason:'Refreshing commands…'}:{})}]};
  }
  #openManager(){
    if(this.#manager || this.#alias || this.#url || this.#calculator?.active)return;
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
    if(this.#manager || this.#alias || this.#url || this.#calculator?.active)return;
    this.#query=query;
    if(query.length>MAX_QUERY_LENGTH){this.#generations.cancel();this.#publish();return;}
    const token=this.#generations.begin(query);
    queueMicrotask(()=>{if(this.#active && this.#generations.current(token.generation))this.#publish();});
  }
  setVisible(visible:boolean){
    if(visible===this.#active)return;
    this.#active=visible;
    if(visible){void this.refresh(false);return;}
    this.#abortVisibility();if(this.#manager)this.session.pop();
    if(this.#alias || this.#url)this.session.pop();
    for(let depth=0;depth<2 && this.#calculator?.active;depth++)this.session.pop();
    this.#calculator?.dispose();this.#calculator=null;
    this.#generations.cancel();this.#load?.abort();this.#execution?.abort();this.#dismissal?.abort();this.#dismissal=null;this.#busy=false;
  }
  async refresh(explicit=true){
    if(!this.#active || this.#busy || this.#alias || this.#url || this.#calculator?.active)return;
    this.#load?.abort();const controller=new AbortController();this.#load=controller;
    this.#loading=true;this.#status=undefined;this.#publish();
    try{
      const next=await collectCatalogue(cursor=>{if(controller.signal.aborted)throw new Error();return bounded(this.#api.getLauncherCommands(cursor?{cursor}:undefined),controller.signal);});
      if(!this.#active || controller.signal.aborted)return;
      if(this.#snapshot && next.revision<this.#snapshot.revision)throw new Error();
      this.#snapshot=next;if(explicit){this.#metadataUnconfirmed=false;this.#visibilityWarning=undefined;}this.#status=this.#visibilityWarning??catalogueStatus(next);
    }catch{if(!controller.signal.aborted)this.#status={kind:'error',message:'Commands could not be loaded. Reload commands to try again.'};}
    finally{if(this.#load===controller && !controller.signal.aborted){this.#loading=false;this.#publish();}}
  }
  async execute(intent:ActionIntent){
    const frame=this.session.getSnapshot().frames.at(-1);
    if(!this.#active || this.#busy && !(this.#alias && intent.actionId===CANCEL_ALIAS || this.#url && intent.actionId===CANCEL_URL || this.#manager && intent.actionId===BACK_MANAGE) || this.#loading && !(this.#manager && intent.actionId===BACK_MANAGE) || !frame || intent.viewId!==frame.view.viewId || intent.revision!==frame.view.revision)return;
    if(this.#calculator?.active){if(this.#snapshot?.commands.find(command=>command.id==='linuxcast:calculator')?.hidden)return;await this.#calculator.handle(intent);return;}
    if(this.#manager){
      if(intent.values!==undefined||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId'].includes(key)))return;
      if(intent.actionId===BACK_MANAGE){this.session.pop();return;}
      if(intent.actionId===RETRY){await this.refresh();return;}
      if(intent.actionId===HIDE_COMMAND||intent.actionId===SHOW_COMMAND)await this.#setHidden(intent);return;
    }
    if(this.#alias){await this.#editAlias(intent);return;}
    if(this.#url){await this.#submitUrl(intent);return;}
    if(intent.viewId!==VIEW_ID)return;
    if(intent.actionId===MANAGE){if(intent.values===undefined)this.#openManager();return;}
    if(intent.actionId===HIDE_COMMAND){await this.#setHidden(intent);return;}
    if(intent.actionId===RETRY){this.#urlUnconfirmed=false;await this.refresh();return;}
    if(intent.actionId===ALIAS){this.#openAlias(intent);return;}
    if(intent.actionId===PIN || intent.actionId===UNPIN){await this.#setPinned(intent);return;}
    const command=this.#snapshot?.commands.find(command=>command.id===intent.actionId);
    if(!command || command.hidden || !command.enabled || intent.itemId!==frame.selection || command.id!==frame.selection || this.#query.length>MAX_QUERY_LENGTH)return;
    if(command.id===OPEN_URL){this.#openUrl();return;}
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
    if(!frame || !command?.enabled || command.hidden || command.id!==frame.selection || !this.#snapshot?.rankingAvailable || this.#metadataUnconfirmed || Boolean(command.usage?.pinned)===pinned || this.#query.length>MAX_QUERY_LENGTH)return;
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
    if(!command?.enabled || command.hidden || command.id!==frame?.selection || !this.#snapshot?.rankingAvailable || this.#metadataUnconfirmed || this.#query.length>MAX_QUERY_LENGTH)return;
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
    this.#abortVisibility();const selection=this.#priorSelection;
    this.session.navigate({protocolVersion:1,kind:'push',fromViewId:null,view:this.#view()});
    if(selection)this.session.select(VIEW_ID,selection);
    await this.#hideWindow();
  }
  async #hideWindow(){
    if(!this.#active || this.#dismissal)return;
    const controller=new AbortController();this.#dismissal=controller;
    try{const reply=shellCommandReplySchema.parse(await bounded(this.#dismiss(),controller.signal));if(!reply.ok)throw new Error();}
    catch{if(!controller.signal.aborted){this.#status={kind:'error',message:'Linuxcast could not hide this window. Try again.'};this.#publish();}}
    finally{if(this.#dismissal===controller)this.#dismissal=null;}
  }
  dispose(){this.#visibilityPending?.controller.abort();this.#visibilityPending=null;this.#calculator?.dispose();this.#calculator=null;this.#active=false;this.#generations.cancel();this.#load?.abort();this.#execution?.abort();this.#dismissal?.abort();this.#dismissal=null;}
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
