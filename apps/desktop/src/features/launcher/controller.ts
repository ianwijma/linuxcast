import { collectCatalogue,mergePinReply,mergeAliasReply,parsePage } from './catalogue.ts';
import type { Catalogue } from './catalogue.ts';
import { commandAliasSchema,launcherCommandsReplySchema,launcherExecuteReplySchema,shellCommandReplySchema } from '@linuxcast/contracts';
import type { LauncherApi,ViewModel,ShellCommandReply } from '@linuxcast/contracts';
import { ViewSession } from '@linuxcast/ui/views';
import type { ActionIntent,ViewHost } from '@linuxcast/ui/views';
import { QueryGenerations,rankCommands,MAX_QUERY_LENGTH } from '@linuxcast/search';
const VIEW_ID='linuxcast-launcher';
const RETRY='launcher:retry';
const PIN='launcher:pin',UNPIN='launcher:unpin';
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
  #priorSelection:string|null=null;#alias:AliasEditor|null=null;#aliasSequence=0;
  constructor(api:LauncherApi,dismiss:()=>Promise<ShellCommandReply>) {
    this.#api=api;this.#dismiss=dismiss;
    this.session=new ViewSession(this.#view(),id=>{void this.#closeView(id);});
    this.session.subscribe(()=>{const frame=this.session.getSnapshot().frames[0];if(frame)this.#priorSelection=frame.selection;});
    this.host={queryChanged:(_id,query)=>this.query(query),action:intent=>{void this.execute(intent);}};
  }
  #view():ViewModel {
    const tooLong=this.#query.length>MAX_QUERY_LENGTH;
    const commands=this.#snapshot && !tooLong?rankCommands(this.#snapshot.commands,this.#query,Date.now(),this.#priorSelection):[];
    const status=tooLong?{kind:'warning' as const,message:`Keep searches to ${MAX_QUERY_LENGTH} characters or fewer.`}:this.#status;
    return {protocolVersion:1,viewId:VIEW_ID,revision:++this.#viewRevision,kind:'list',title:'Search commands',loading:this.#loading,
      search:{query:this.#query,placeholder:'Search commands…',mode:'extension'},
      sections:[...new Set(commands.map(command=>command.provider??(command.id.startsWith('application:')?'applications':'commands')))].map(provider=>({id:provider,title:provider==='applications'?'Applications':'Linuxcast',items:commands.filter(command=>(command.provider??(command.id.startsWith('application:')?'applications':'commands'))===provider).map(command=>({id:command.id,title:command.title,...(command.subtitle?{subtitle:command.subtitle}:{}),icon:{kind:'builtin' as const,name:command.id==='linuxcast:open-local-data'?'settings':'search'},
        ...(!command.enabled?{disabledReason:command.unavailableReason??'This command is unavailable.'}:this.#busy?{disabledReason:'Wait for the current command to finish.'}:this.#loading?{disabledReason:'Refreshing commands…'}:{}),
        ...(command.usage?.pinned?{accessories:[{text:'Pinned',icon:{kind:'builtin' as const,name:'star'},tooltip:'Pinned command'}]}:{}),
        actions:[{id:command.id,title:command.id==='linuxcast:hide'?'Hide':command.id==='linuxcast:quit'?'Quit Linuxcast':'Open',kind:'invoke' as const,effect:'read' as const},
          {id:command.usage?.pinned?UNPIN:PIN,title:command.usage?.pinned?'Unpin command':'Pin command',kind:'invoke' as const,effect:'write' as const,icon:{kind:'builtin' as const,name:'star'},
            ...(!this.#snapshot?.rankingAvailable?{disabledReason:'Pinning is unavailable. Reload commands to reconnect to storage.'}:this.#metadataUnconfirmed?{disabledReason:'Reload commands to check the last metadata change before trying again.'}:{})},
          {id:ALIAS,title:'Edit search alias',kind:'invoke' as const,effect:'read' as const,icon:{kind:'builtin' as const,name:'search'},
            ...(!this.#snapshot?.rankingAvailable?{disabledReason:'Aliases are unavailable. Reload commands to reconnect to storage.'}:this.#metadataUnconfirmed?{disabledReason:'Reload commands to check the last metadata change before trying again.'}:{})}]}))})),
      empty:{title:this.#loading?'Loading commands…':'No commands available',description:this.#loading?'Getting commands from Linuxcast.':'Reload commands to try again.'},
      ...(status?{status}:{}),actions:(this.#status?.kind==='error' || this.#metadataUnconfirmed || this.#snapshot && (!this.#snapshot.rankingAvailable || this.#snapshot.applicationState==='unavailable')) && !this.#busy?[{id:RETRY,title:'Reload commands',kind:'invoke',effect:'read'}]:[]};
  }
  #aliasView():ViewModel {
    const editor=this.#alias!;
    return {protocolVersion:1,viewId:editor.viewId,revision:++this.#viewRevision,kind:'form',title:'Edit search alias',loading:this.#busy,
      fields:[{id:'alias',kind:'text',title:'Search alias',required:false,value:editor.value,description:`Find ${this.#snapshot?.commands.find(command=>command.id===editor.commandId)?.title??'this command'} by an exact alias. Leave empty to remove it. Up to 64 characters.`,...(editor.error?{error:editor.error}:{})}],
      submitActionId:SAVE_ALIAS,cancelActionId:CANCEL_ALIAS,...(editor.status?{status:editor.status}:{}),
      actions:[{id:SAVE_ALIAS,title:'Save alias',kind:'invoke',effect:'write',...(this.#busy?{disabledReason:'Saving alias…'}:this.#metadataUnconfirmed?{disabledReason:'Reload commands to check the last change.'}:{})},
        {id:CANCEL_ALIAS,title:'Cancel',kind:'invoke',effect:'read'},...(this.#metadataUnconfirmed || editor.needsReload?[{id:RETRY,title:'Reload commands',kind:'invoke' as const,effect:'read' as const}]:[])]};
  }
  #publish(){if(!this.#active)return;this.session.update(VIEW_ID,{protocolVersion:1,kind:'snapshot',view:this.#view()});if(this.#alias)this.session.update(this.#alias.viewId,{protocolVersion:1,kind:'snapshot',view:this.#aliasView()});}
  query(query:string){
    if(this.#alias)return;
    this.#query=query;
    if(query.length>MAX_QUERY_LENGTH){this.#generations.cancel();this.#publish();return;}
    const token=this.#generations.begin(query);
    queueMicrotask(()=>{if(this.#active && this.#generations.current(token.generation))this.#publish();});
  }
  setVisible(visible:boolean){
    if(visible===this.#active)return;
    this.#active=visible;
    if(visible){void this.refresh();return;}
    if(this.#alias)this.session.pop();
    this.#generations.cancel();this.#load?.abort();this.#execution?.abort();this.#dismissal?.abort();this.#dismissal=null;this.#busy=false;
  }
  async refresh(){
    if(!this.#active || this.#busy || this.#alias)return;
    this.#load?.abort();const controller=new AbortController();this.#load=controller;
    this.#loading=true;this.#status=undefined;this.#publish();
    try{
      const next=await collectCatalogue(cursor=>{if(controller.signal.aborted)throw new Error();return bounded(this.#api.getLauncherCommands(cursor?{cursor}:undefined),controller.signal);});
      if(!this.#active || controller.signal.aborted)return;
      if(this.#snapshot && next.revision<this.#snapshot.revision)throw new Error();
      this.#snapshot=next;this.#metadataUnconfirmed=false;this.#status=catalogueStatus(next);
    }catch{if(!controller.signal.aborted)this.#status={kind:'error',message:'Commands could not be loaded. Reload commands to try again.'};}
    finally{if(this.#load===controller && !controller.signal.aborted){this.#loading=false;this.#publish();}}
  }
  async execute(intent:ActionIntent){
    const frame=this.session.getSnapshot().frames.at(-1);
    if(!this.#active || this.#busy && !(this.#alias && intent.actionId===CANCEL_ALIAS) || this.#loading || !frame || intent.viewId!==frame.view.viewId || intent.revision!==frame.view.revision)return;
    if(this.#alias){await this.#editAlias(intent);return;}
    if(intent.viewId!==VIEW_ID)return;
    if(intent.actionId===RETRY){await this.refresh();return;}
    if(intent.actionId===ALIAS){this.#openAlias(intent);return;}
    if(intent.actionId===PIN || intent.actionId===UNPIN){await this.#setPinned(intent);return;}
    const command=this.#snapshot?.commands.find(command=>command.id===intent.actionId);
    if(!command || !command.enabled || intent.itemId!==frame.selection || command.id!==frame.selection || this.#query.length>MAX_QUERY_LENGTH)return;
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
    if(!frame || !command?.enabled || command.id!==frame.selection || !this.#snapshot?.rankingAvailable || this.#metadataUnconfirmed || Boolean(command.usage?.pinned)===pinned || this.#query.length>MAX_QUERY_LENGTH)return;
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
    if(!command?.enabled || command.id!==frame?.selection || !this.#snapshot?.rankingAvailable || this.#metadataUnconfirmed || this.#query.length>MAX_QUERY_LENGTH)return;
    this.#alias={viewId:`launcher-alias-${++this.#aliasSequence}`,commandId:command.id,revision:this.#snapshot.revision,value:command.usage?.alias??''};
    this.session.navigate({protocolVersion:1,kind:'push',fromViewId:VIEW_ID,view:this.#aliasView()});
  }
  async #editAlias(intent:ActionIntent){
    const editor=this.#alias!;
    if(intent.actionId===CANCEL_ALIAS){this.session.pop();return;}
    if(intent.actionId===RETRY && (this.#metadataUnconfirmed || editor.needsReload)){this.session.pop();await this.refresh();return;}
    if(intent.actionId!==SAVE_ALIAS || this.#metadataUnconfirmed || !this.#snapshot || intent.itemId!==undefined)return;
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
  async #closeView(viewId:string){
    if(viewId!==VIEW_ID){
      if(this.#alias?.viewId===viewId){
        if(this.#busy){this.#metadataUnconfirmed=true;this.#status={kind:'error',message:'The alias change could not be confirmed. Reload commands before trying again.'};this.#execution?.abort();this.#busy=false;}
        this.#alias=null;this.#publish();
      }
      return;
    }
    // The shared view pops its root on Escape. Restore the local presentation
    // before requesting Hide so a denied/failed hide never leaves a blank window.
    const selection=this.#priorSelection;
    this.session.navigate({protocolVersion:1,kind:'push',fromViewId:null,view:this.#view()});
    if(selection)this.session.select(VIEW_ID,selection);
    if(!this.#active || this.#dismissal)return;
    const controller=new AbortController();this.#dismissal=controller;
    try{const reply=shellCommandReplySchema.parse(await bounded(this.#dismiss(),controller.signal));if(!reply.ok)throw new Error();}
    catch{if(!controller.signal.aborted){this.#status={kind:'error',message:'Linuxcast could not hide this window. Try again.'};this.#publish();}}
    finally{if(this.#dismissal===controller)this.#dismissal=null;}
  }
  dispose(){this.#active=false;this.#generations.cancel();this.#load?.abort();this.#execution?.abort();this.#dismissal?.abort();this.#dismissal=null;}
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
