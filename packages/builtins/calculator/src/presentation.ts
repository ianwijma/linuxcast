import { calculatorCopyReplySchema,calculatorExpressionSchema,calculatorResultTextSchema } from '@linuxcast/contracts';
import type { LauncherApi,ViewModel } from '@linuxcast/contracts';
import type { ActionIntent,ViewSession } from '@linuxcast/ui/views';
import { evaluateExpression } from './evaluate.ts';
import type { Calculation } from './types.ts';
const EVALUATE='calculator:evaluate',CANCEL='calculator:cancel',COPY='calculator:copy',EDIT='calculator:edit';
const UNKNOWN='The copy outcome is unknown. Check your clipboard before choosing Copy result again.';
const LEFT_PENDING='Copy may have occurred. Check your clipboard before copying again.';
type Status={kind:'info'|'warning'|'error';message:string};
type Success=Extract<Calculation,{ok:true}>;
/** Local presentation only. Explicit numeric-result copy is the sole IPC action;
 * main re-evaluates the expression and owns the actual clipboard operation. */
export class CalculatorFlow {
  #session:ViewSession;#api:Pick<LauncherApi,'copyCalculatorResult'>;#registryRevision:number;
  #formId:string;#resultId:string;#viewRevision=0;#opened=false;#resultOpen=false;#disposed=false;
  #expression='';#error:string|undefined;#formStatus:Status|undefined;#resultStatus:Status|undefined;#calculation:Success|null=null;
  #pending:AbortController|null=null;
  constructor({session,api,viewId,revision}:{session:ViewSession;api:Pick<LauncherApi,'copyCalculatorResult'>;viewId:string;revision:number}){
    this.#session=session;this.#api=api;this.#formId=`${viewId}-form`;this.#resultId=`${viewId}-result`;this.#registryRevision=revision;
  }
  get active(){return this.#opened && !this.#disposed;}
  owns(viewId:string){return viewId===this.#formId || viewId===this.#resultId;}
  open(fromViewId:string){
    if(this.#disposed || this.#opened || this.#session.getSnapshot().frames.at(-1)?.view.viewId!==fromViewId)return;
    this.#expression='';this.#error=undefined;this.#formStatus=undefined;this.#resultStatus=undefined;this.#calculation=null;
    this.#opened=this.#session.navigate({protocolVersion:1,kind:'push',fromViewId,view:this.#form()});
  }
  #form():ViewModel{return {protocolVersion:1,viewId:this.#formId,revision:++this.#viewRevision,kind:'form',title:'Calculator',
    fields:[{id:'expression',kind:'text',title:'Expression',required:true,value:this.#expression,description:'Try (2 + 3) * 4, sqrt(16) or 10%. Evaluate explicitly; nothing is copied automatically.',...(this.#error?{error:this.#error}:{})}],
    submitActionId:EVALUATE,cancelActionId:CANCEL,actions:[{id:EVALUATE,title:'Evaluate',kind:'invoke',effect:'read'},{id:CANCEL,title:'Cancel',kind:'invoke',effect:'read'}],...(this.#formStatus?{status:this.#formStatus}:{})};}
  #result():ViewModel{return {protocolVersion:1,viewId:this.#resultId,revision:++this.#viewRevision,kind:'detail',title:'Calculation',loading:this.#pending!==null,
    markdown:'Numbers use floating-point arithmetic. Results are approximations shown with up to 15 significant digits. `%` divides the preceding value by 100; for example, 10% is 0.1.',
    metadata:[{label:'Expression',value:this.#expression},{label:'Result',value:this.#calculation!.text}],attachments:[],
    actions:[{id:COPY,title:'Copy result',kind:'invoke',effect:'write',...(this.#pending?{disabledReason:'Wait for the current copy request.'}:!this.#api.copyCalculatorResult?{disabledReason:'Clipboard copying is unavailable. Reopen Linuxcast to reconnect.'}:{})},{id:EDIT,title:'Edit expression',kind:'invoke',effect:'read'}],
    ...(this.#resultStatus?{status:this.#resultStatus}:!this.#api.copyCalculatorResult?{status:{kind:'warning',message:'Clipboard copying is unavailable. You can still evaluate and read results. Reopen Linuxcast to reconnect.'}}:{})};}
  #publishForm(){if(this.active)this.#session.update(this.#formId,{protocolVersion:1,kind:'snapshot',view:this.#form()});}
  #publishResult(){if(this.active && this.#resultOpen && this.#calculation)this.#session.update(this.#resultId,{protocolVersion:1,kind:'snapshot',view:this.#result()});}
  async handle(intent:ActionIntent){
    const top=this.#session.getSnapshot().frames.at(-1);
    if(!this.active || !top || !this.owns(intent.viewId) || top.view.viewId!==intent.viewId || top.view.revision!==intent.revision || top.selection!==null || intent.itemId!==undefined || Object.keys(intent).some(key=>!['viewId','revision','actionId','values'].includes(key)))return;
    if(intent.viewId===this.#formId){
      if(intent.actionId===CANCEL && intent.values===undefined){this.#session.pop();return;}
      if(intent.actionId!==EVALUATE || this.#pending)return;
      const values=intent.values,expression=values?.expression;
      if(!values || Object.keys(values).length!==1 || typeof expression!=='string')return;
      this.#expression=expression;this.#formStatus=undefined;
      if(!calculatorExpressionSchema.safeParse(expression).success){this.#error='Use a non-empty expression up to 512 UTF-8 bytes without control characters.';this.#publishForm();return;}
      let result:Calculation;
      try{result=evaluateExpression(expression);}catch{this.#error='This expression could not be evaluated. Check it and try again.';this.#publishForm();return;}
      if(!result.ok){this.#error=result.code==='domain-error'?'This expression has no finite real result. Check divisions and function inputs.':result.code==='limit-exceeded'?'Reduce the expression length, number of operations or nesting depth.':'Enter a supported arithmetic expression.';this.#publishForm();return;}
      if(!Number.isFinite(result.value) || !calculatorResultTextSchema.safeParse(result.text).success){this.#error='This expression could not be evaluated. Check it and try again.';this.#publishForm();return;}
      this.#error=undefined;this.#calculation=result;this.#resultStatus=undefined;this.#publishForm();
      this.#resultOpen=this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#formId,view:this.#result()});return;
    }
    if(intent.values!==undefined || !this.#resultOpen || !this.#calculation)return;
    if(intent.actionId===EDIT){this.#session.pop();return;}
    if(intent.actionId!==COPY || this.#pending || !this.#api.copyCalculatorResult)return;
    const controller=new AbortController(),calculation=this.#calculation,expression=this.#expression;
    this.#pending=controller;this.#resultStatus={kind:'info',message:'Copying result…'};this.#publishResult();
    try{
      const reply=calculatorCopyReplySchema.parse(await bounded(this.#api.copyCalculatorResult({revision:this.#registryRevision,expression}),controller.signal));
      if(!this.#current(controller,calculation))return;
      if(!reply.ok){
        this.#resultStatus=['invalid-request','capability-unavailable','permission-denied','conflict','cancelled'].includes(reply.error.code)?{kind:'error',message:'The result was not copied. Check clipboard access or reopen Calculator, then choose Copy result again.'}:{kind:'error',message:UNKNOWN};return;
      }
      if(reply.value.text!==calculation.text)throw new Error('Unconfirmed copy.');
      this.#resultStatus={kind:'info',message:'Result copied.'};
    }catch{if(this.#current(controller,calculation))this.#resultStatus={kind:'error',message:UNKNOWN};}
    finally{if(this.#pending===controller){this.#pending=null;if(this.active && this.#resultOpen && this.#session.getSnapshot().frames.at(-1)?.view.viewId===this.#resultId)this.#publishResult();}}
  }
  #current(controller:AbortController,calculation:Success){return this.active && !controller.signal.aborted && this.#pending===controller && this.#calculation===calculation && this.#resultOpen && this.#session.getSnapshot().frames.at(-1)?.view.viewId===this.#resultId;}
  closed(viewId:string){
    if(!this.owns(viewId))return false;
    if(viewId===this.#resultId){
      if(this.#pending){this.#pending.abort();this.#pending=null;this.#formStatus={kind:'warning',message:LEFT_PENDING};}
      this.#resultOpen=false;this.#calculation=null;this.#resultStatus=undefined;this.#publishForm();
    }else{this.#opened=false;this.#resultOpen=false;this.#pending?.abort();this.#pending=null;this.#calculation=null;this.#expression='';}
    return true;
  }
  dispose(){this.#disposed=true;this.#opened=false;this.#resultOpen=false;this.#pending?.abort();this.#pending=null;this.#calculation=null;this.#expression='';}
}
function bounded<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{
  const finish=(fn:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);fn();};const abort=()=>finish(()=>reject(new Error('Cancelled.')));const timer=setTimeout(()=>finish(()=>reject(new Error('Deadline exceeded.'))),5000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('Request failed.'))));
});}
