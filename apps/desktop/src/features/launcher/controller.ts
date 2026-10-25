import { launcherCommandsReplySchema,launcherExecuteReplySchema,shellCommandReplySchema } from '@linuxcast/contracts';
import type { LauncherApi,LauncherCommandsSnapshot,ViewModel,ShellCommandReply } from '@linuxcast/contracts';
import { ViewSession } from '@linuxcast/ui/views';
import type { ActionIntent,ViewHost } from '@linuxcast/ui/views';
import { QueryGenerations,rankCommands,MAX_QUERY_LENGTH } from '@linuxcast/search';
const VIEW_ID='linuxcast-launcher';
const RETRY='launcher:retry';
type Status={kind:'info'|'warning'|'error';message:string};
/** Renderer presentation controller; the main registry is the only source of
 * commands and execution authority. Queries never leave this process. */
export class LauncherController {
  readonly session:ViewSession;
  readonly host:ViewHost;
  #api:LauncherApi;#dismiss:()=>Promise<ShellCommandReply>;
  #snapshot:LauncherCommandsSnapshot|null=null;#query='';#viewRevision=0;
  #generations=new QueryGenerations();#load:AbortController|null=null;#execution:AbortController|null=null;#dismissal:AbortController|null=null;
  #active=false;#busy=false;#loading=true;#status:Status|undefined;
  #priorSelection:string|null=null;
  constructor(api:LauncherApi,dismiss:()=>Promise<ShellCommandReply>) {
    this.#api=api;this.#dismiss=dismiss;
    this.session=new ViewSession(this.#view(),()=>{void this.#closeView();});
    this.session.subscribe(()=>{const frame=this.session.getSnapshot().frames[0];if(frame)this.#priorSelection=frame.selection;});
    this.host={queryChanged:(_id,query)=>this.query(query),action:intent=>{void this.execute(intent);}};
  }
  #view():ViewModel {
    const tooLong=this.#query.length>MAX_QUERY_LENGTH;
    const commands=this.#snapshot && !tooLong?rankCommands(this.#snapshot.commands,this.#query):[];
    const status=tooLong?{kind:'warning' as const,message:`Keep searches to ${MAX_QUERY_LENGTH} characters or fewer.`}:this.#status;
    return {protocolVersion:1,viewId:VIEW_ID,revision:++this.#viewRevision,kind:'list',title:'Search commands',loading:this.#loading,
      search:{query:this.#query,placeholder:'Search commands…',mode:'extension'},
      sections:[{id:'builtin',title:'Linuxcast',items:commands.map(command=>({id:command.id,title:command.title,...(command.subtitle?{subtitle:command.subtitle}:{}),icon:{kind:'builtin' as const,name:command.id==='linuxcast:open-local-data'?'settings':'search'},
        ...(!command.enabled?{disabledReason:command.unavailableReason??'This command is unavailable.'}:this.#busy?{disabledReason:'Wait for the current command to finish.'}:this.#loading?{disabledReason:'Refreshing commands…'}:{}),
        actions:[{id:command.id,title:command.id==='linuxcast:open-local-data'?'Open':command.id==='linuxcast:hide'?'Hide':'Quit Linuxcast',kind:'invoke' as const,effect:'read' as const}]}))}],
      empty:{title:this.#loading?'Loading commands…':'No commands available',description:this.#loading?'Getting commands from Linuxcast.':'Reload commands to try again.'},
      ...(status?{status}:{}),actions:this.#status?.kind==='error' && !this.#busy?[{id:RETRY,title:'Reload commands',kind:'invoke',effect:'read'}]:[]};
  }
  #publish(){if(!this.#active)return;this.session.update(VIEW_ID,{protocolVersion:1,kind:'snapshot',view:this.#view()});}
  query(query:string){
    this.#query=query;
    if(query.length>MAX_QUERY_LENGTH){this.#generations.cancel();this.#publish();return;}
    const token=this.#generations.begin(query);
    queueMicrotask(()=>{if(this.#active && this.#generations.current(token.generation))this.#publish();});
  }
  setVisible(visible:boolean){
    if(visible===this.#active)return;
    this.#active=visible;
    if(visible){void this.refresh();return;}
    this.#generations.cancel();this.#load?.abort();this.#execution?.abort();this.#dismissal?.abort();this.#dismissal=null;this.#busy=false;
  }
  async refresh(){
    if(!this.#active)return;
    this.#load?.abort();const controller=new AbortController();this.#load=controller;
    this.#loading=true;this.#status=undefined;this.#publish();
    try{
      const reply=launcherCommandsReplySchema.parse(await bounded(this.#api.getLauncherCommands(),controller.signal));
      if(!this.#active || controller.signal.aborted)return;
      if(!reply.ok || this.#snapshot && reply.value.revision<this.#snapshot.revision)throw new Error();
      this.#snapshot=reply.value;
      this.#status=reply.value.rankingAvailable?undefined:{kind:'info',message:'Recent usage is unavailable. Commands still work.'};
    }catch{if(!controller.signal.aborted)this.#status={kind:'error',message:'Commands could not be loaded. Reload commands to try again.'};}
    finally{if(this.#load===controller && !controller.signal.aborted){this.#loading=false;this.#publish();}}
  }
  async execute(intent:ActionIntent){
    const frame=this.session.getSnapshot().frames[0];
    if(!this.#active || this.#busy || this.#loading || !frame || intent.viewId!==VIEW_ID || intent.revision!==frame.view.revision)return;
    if(intent.actionId===RETRY){await this.refresh();return;}
    const command=this.#snapshot?.commands.find(command=>command.id===intent.actionId);
    if(!command || !command.enabled || intent.itemId!==frame.selection || command.id!==frame.selection || this.#query.length>MAX_QUERY_LENGTH)return;
    const revision=this.#snapshot!.revision,controller=new AbortController();this.#execution=controller;this.#busy=true;this.#status=undefined;this.#publish();
    try{
      const reply=launcherExecuteReplySchema.parse(await bounded(this.#api.executeLauncherCommand({commandId:command.id,revision}),controller.signal));
      if(!this.#active || controller.signal.aborted)return;
      if(!reply.ok){this.#status={kind:'error',message:'This command could not run. Reload commands and try again.'};return;}
      // A dispatched Quit is receipt only. No effect-completion toast is shown.
      this.#status=undefined;
    }catch{if(!controller.signal.aborted)this.#status={kind:'error',message:'The command outcome is unknown. Check its result before trying again.'};}
    finally{if(this.#execution===controller && !controller.signal.aborted){this.#busy=false;this.#publish();}}
  }
  async #closeView(){
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
