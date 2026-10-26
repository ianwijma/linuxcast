import { indexedPathCopyReplySchema } from '@linuxcast/contracts';
import type { ActionModel,FileSearchApi,FileSearchResult,FileSearchRoot } from '@linuxcast/contracts';
import { formatIndexedPath } from './path.ts';
export const COPY_INDEXED_PATH='files:copy-path';
export type IndexedPathContext={viewId:string;root:FileSearchRoot;row:FileSearchResult};
type Status={kind:'info'|'warning'|'error';message:string};
const UNKNOWN='The copy outcome is unknown. Check your clipboard before choosing Copy path again.';
/** Presentation for one admitted indexed result. Display paths are not file authority. */
export class IndexedPathCopy {
  #api:Pick<FileSearchApi,'copyPath'>;#onChange:()=>void;#isCurrent:(context:IndexedPathContext)=>boolean;
  #pending:AbortController|null=null;#key:string|null=null;#status:Status|undefined;#disposed=false;
  constructor({api,onChange,isCurrent}:{api:Pick<FileSearchApi,'copyPath'>;onChange:()=>void;isCurrent:(context:IndexedPathContext)=>boolean}){this.#api=api;this.#onChange=onChange;this.#isCurrent=isCurrent;}
  #disabled(context:IndexedPathContext):string|undefined{
    if(this.#disposed)return 'Reopen File search to reconnect.';
    if(this.#pending)return 'Wait for the current copy request.';
    if(!this.#api.copyPath)return 'Clipboard copying is unavailable. Reopen Linuxcast to reconnect.';
    if(!this.#isCurrent(context))return 'Select a current indexed result before copying.';
    if(context.root.state==='unavailable'||context.root.activity==='unavailable')return 'This folder is unavailable. Refresh folders and check folder access.';
    try{formatIndexedPath(context.root,context.row);}catch{return 'This indexed path is unavailable or outdated. Refresh the search results.';}
    return undefined;
  }
  model(context:IndexedPathContext):{action:ActionModel;loading:boolean;status?:Status}{
    const disabledReason=this.#disabled(context),status=this.#isCurrent(context)&&this.#key===key(context)?this.#status:undefined;
    return {action:{id:COPY_INDEXED_PATH,title:'Copy path',kind:'invoke',effect:'write',...(disabledReason?{disabledReason}:{})},loading:this.#pending!==null,...(status?{status}:{})};
  }
  async copy(context:IndexedPathContext):Promise<void>{
    if(this.#disabled(context))return;
    const captured:IndexedPathContext={viewId:context.viewId,root:{...context.root},row:{...context.row}};
    const path=formatIndexedPath(captured.root,captured.row),selection={resultId:captured.row.id,rootId:captured.row.rootId,generation:captured.row.generation};
    const controller=new AbortController();this.#pending=controller;this.#key=key(captured);this.#status={kind:'info',message:'Copying path…'};this.#onChange();
    try{
      if(!this.#current(controller,captured))return;
      const reply=indexedPathCopyReplySchema.parse(await bounded(this.#api.copyPath!(selection),controller.signal));
      if(!this.#current(controller,captured))return;
      if(!reply.ok){this.#status=['invalid-request','conflict'].includes(reply.error.code)?{kind:'error',message:'The path was not copied. Refresh the search results and select the file again.'}:['capability-unavailable','permission-denied','cancelled'].includes(reply.error.code)?{kind:'error',message:'The path was not copied. Check clipboard access, then choose Copy path again.'}:{kind:'error',message:UNKNOWN};return;}
      if(reply.value.resultId!==selection.resultId||reply.value.rootId!==selection.rootId||reply.value.generation!==selection.generation||reply.value.path!==path)throw new Error('Unconfirmed copy.');
      this.#status={kind:'info',message:'Path copied.'};
    }catch{if(this.#current(controller,captured))this.#status={kind:'error',message:UNKNOWN};}
    finally{if(this.#pending===controller){this.#pending=null;if(!this.#isCurrent(captured)){this.#key=null;this.#status=undefined;}this.#onChange();}}
  }
  #current(controller:AbortController,context:IndexedPathContext){return !this.#disposed&&!controller.signal.aborted&&this.#pending===controller&&this.#key===key(context)&&this.#isCurrent(context);}
  invalidate():boolean{const pending=this.#pending!==null,changed=pending||this.#key!==null;this.#pending?.abort();this.#pending=null;this.#key=null;this.#status=undefined;if(changed&&!this.#disposed)this.#onChange();return pending;}
  dispose(){this.#disposed=true;this.invalidate();}
}
function key(context:IndexedPathContext){return JSON.stringify([context.viewId,context.root.id,context.root.generation,context.root.displayPath,context.row.id,context.row.rootId,context.row.generation,context.row.path]);}
function bounded<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{
  const finish=(fn:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);fn();};const abort=()=>finish(()=>reject(new Error('Cancelled.')));const timer=setTimeout(()=>finish(()=>reject(new Error('Deadline exceeded.'))),5000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('Request failed.'))));
});}
