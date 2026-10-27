import { calculatorCopyReplySchema,calculatorExpressionSchema } from '@linuxcast/contracts';
import type { LauncherApi,ViewModel } from '@linuxcast/contracts';
import type { ActionIntent,ViewSession } from '@linuxcast/ui/views';
import { evaluateExpression } from './evaluate.ts';
import type { Calculation } from './types.ts';
import { formatCalculationText } from './result.ts';
import { getUnitCatalogue } from './units.ts';
const EVALUATE='calculator:evaluate',CANCEL='calculator:cancel',COPY='calculator:copy',EDIT='calculator:edit',UNITS='calculator:units',COLOURS='calculator:colours',DATE_TIME='calculator:date-time';
const UNKNOWN='The copy outcome is unknown. Check your clipboard before choosing Copy result again.';
const LEFT_PENDING='Copy may have occurred. Check your clipboard before copying again.';
type Status={kind:'info'|'warning'|'error';message:string};
type Success=Extract<Calculation,{ok:true}>;
/** Local presentation only. Explicit canonical-result copy is the sole IPC action;
 * main re-evaluates the expression and owns the actual clipboard operation. */
export class CalculatorFlow {
  #session:ViewSession;#api:Pick<LauncherApi,'copyCalculatorResult'>;#registryRevision:number;
  #formId:string;#resultId:string;#helpId:string;#colourHelpId:string;#dateTimeHelpId:string;#helpOpen=false;#viewRevision=0;#opened=false;#resultOpen=false;#disposed=false;
  #expression='';#error:string|undefined;#formStatus:Status|undefined;#resultStatus:Status|undefined;#calculation:Success|null=null;
  #pending:AbortController|null=null;#origin:{viewId:string;query:string;selection:string|null}|null=null;
  constructor({session,api,viewId,revision}:{session:ViewSession;api:Pick<LauncherApi,'copyCalculatorResult'>;viewId:string;revision:number}){
    this.#session=session;this.#api=api;this.#formId=`${viewId}-form`;this.#resultId=`${viewId}-result`;this.#helpId=`${viewId}-units`;this.#colourHelpId=`${viewId}-colours`;this.#dateTimeHelpId=`${viewId}-date-time`;this.#registryRevision=revision;
  }
  get active(){return this.#opened && !this.#disposed;}
  owns(viewId:string){return viewId===this.#formId || viewId===this.#resultId || viewId===this.#helpId || viewId===this.#colourHelpId || viewId===this.#dateTimeHelpId;}
  open(fromViewId:string){
    if(this.#disposed || this.#opened || this.#session.getSnapshot().frames.at(-1)?.view.viewId!==fromViewId)return;
    const root=this.#session.getSnapshot().frames[0]!;this.#origin={viewId:root.view.viewId,query:root.query,selection:root.selection};
    this.#expression='';this.#error=undefined;this.#formStatus=undefined;this.#resultStatus=undefined;this.#calculation=null;
    this.#opened=this.#session.navigate({protocolVersion:1,kind:'push',fromViewId,view:this.#form()});
  }
  openExpression(fromViewId:string,expression:string){
    if(this.#disposed||this.#opened)return;this.open(fromViewId);if(this.#formCurrent())this.#evaluate(expression);
  }
  #originCurrent(){const root=this.#session.getSnapshot().frames[0];return !!this.#origin&&root?.view.viewId===this.#origin.viewId&&root.query===this.#origin.query&&root.selection===this.#origin.selection;}
  #formCurrent(){return this.active&&this.#originCurrent()&&this.#session.getSnapshot().frames.at(-1)?.view.viewId===this.#formId;}
  #form():ViewModel{return {protocolVersion:1,viewId:this.#formId,revision:++this.#viewRevision,kind:'form',title:'Calculator',
    fields:[{id:'expression',kind:'text',title:'Expression',required:true,value:this.#expression,description:'Arithmetic or units: (2+3) km to m, 32 degF to degC, 1 MiB to B. Colours: #f80 to rgb, rgb(255 0 0 / 50%) to hex. Date/time: 2026-10-27T09:00[Australia/Sydney] to UTC. Find Supported units, Supported colours and Supported date/time in Actions. Nothing is copied automatically.',...(this.#error?{error:this.#error}:{})}],
    submitActionId:EVALUATE,cancelActionId:CANCEL,actions:[{id:EVALUATE,title:'Evaluate',kind:'invoke',effect:'read'},{id:CANCEL,title:'Cancel',kind:'invoke',effect:'read'},{id:UNITS,title:'Supported units',kind:'invoke',effect:'read'},{id:COLOURS,title:'Supported colours',kind:'invoke',effect:'read'},{id:DATE_TIME,title:'Supported date/time',kind:'invoke',effect:'read'}],...(this.#formStatus?{status:this.#formStatus}:{})};}
  #result():ViewModel{const colour=this.#calculation?.kind==='colour'?this.#calculation.colour:undefined,dateTime=this.#calculation?.kind==='date-time';return {protocolVersion:1,viewId:this.#resultId,revision:++this.#viewRevision,kind:'detail',title:'Calculation',loading:this.#pending!==null,
    markdown:dateTime?'Conversion preserves the exact instant using explicit source and target zones. The result includes the target offset and named zone. Missing local times are refused; repeated local times require a matching source offset. No ambient clock or locale-dependent date is used.':colour?'Colours use encoded sRGB and approximate floating-point conversion. Hex output rounds colour and alpha channels to 8 bits. RGB/HSL output uses up to 6 fractional digits. Alpha is preserved without compositing.':'Numbers use floating-point arithmetic. Results are approximations shown with up to 15 significant digits. `%` divides the preceding value by 100; for example, 10% is 0.1.',
    metadata:[{label:'Expression',value:this.#expression},...(dateTime?[{label:'Date/time format',value:'Zoned ISO date/time'}]:colour?[{label:'Colour format',value:colour.toUpperCase()}]:[]),{label:'Result',value:formatCalculationText(this.#calculation!)}],attachments:[],
    actions:[{id:COPY,title:'Copy result',kind:'invoke',effect:'write',...(this.#pending?{disabledReason:'Wait for the current copy request.'}:!this.#api.copyCalculatorResult?{disabledReason:'Clipboard copying is unavailable. Reopen Linuxcast to reconnect.'}:{})},{id:EDIT,title:'Edit expression',kind:'invoke',effect:'read'}],
    ...(this.#resultStatus?{status:this.#resultStatus}:!this.#api.copyCalculatorResult?{status:{kind:'warning',message:'Clipboard copying is unavailable. You can still evaluate and read results. Reopen Linuxcast to reconnect.'}}:{})};}
  #help():ViewModel{
    const groups=new Map<string,string[]>();
    for(const unit of getUnitCatalogue()){
      const label=unit.dimension.replace(/\b[a-z]/gu,letter=>letter.toUpperCase());
      const entries=groups.get(label)??[];entries.push(`${unit.id} — ${unit.label}`);groups.set(label,entries);
    }
    return {protocolVersion:1,viewId:this.#helpId,revision:++this.#viewRevision,kind:'detail',title:'Supported units',
      markdown:'Use a scalar arithmetic expression, a source unit, `to`, and a target in the same category. Examples: `(2+3) km to m`, `32 degF to degC`, `1 MiB to B`. Symbols are case-sensitive; use exactly the listed symbols.\n\nDuration `d` is 24 hours and `wk` is 7 days; these are fixed durations, not calendar dates or daylight-saving calculations. `degC` and `degF` represent absolute temperatures, not temperature differences. Absolute bounds are K ≥ 0, degC ≥ -273.15 and degF ≥ -459.67.\n\nData uses decimal prefixes (`kB`, `MB`) in powers of 1000 and binary prefixes (`KiB`, `MiB`) in powers of 1024. `B` means bytes and `bit` means bits.\n\nVolume symbols beginning with `US_` are US liquid measures. Symbols beginning with `imp_` are imperial measures. Use explicit symbols such as `US_gal` or `imp_gal`; bare `gal` is not supported. `oz` is mass; fluid ounces use `US_fl_oz` or `imp_fl_oz`.',
      metadata:[...groups].map(([label,entries])=>({label,value:entries.join('; ')})),attachments:[],actions:[{id:EDIT,title:'Back to expression',kind:'invoke',effect:'read'}]};
  }
  #colourHelp():ViewModel{return {protocolVersion:1,viewId:this.#colourHelpId,revision:++this.#viewRevision,kind:'detail',title:'Supported colours',
    markdown:'Use an explicit colour followed by `to hex`, `to rgb` or `to hsl`. Examples: `#f80 to rgb`, `rgb(255 0 0 / 50%) to hex`, `hsl(120 100% 50%) to hex`. Hex letters may use either case; functional names and target formats are lowercase.\n\nUse comma-separated components with optional fourth alpha, or space-separated components with optional `/ alpha`. Never mix commas and slash syntax. `rgba` and `hsla` are accepted aliases. Numeric components may use signed decimal/scientific notation; arithmetic and nested functions are unsupported.\n\nRanges are checked, never clamped. Hue wraps modulo 360 and its absolute input is limited to 1e9 degrees. Named colours, currentColor, variables, URLs, relative/wide-gamut colours and CSS expressions are unsupported.\n\nConversions use encoded sRGB and approximate floating-point values. Alpha is preserved without compositing. Hex output quantizes channels to 8 bits; functional output uses up to 6 fractional digits. Nothing is evaluated or copied by opening this help.',
    metadata:[{label:'Targets',value:'hex · rgb · hsl'},{label:'Hex input',value:'#RGB · #RGBA · #RRGGBB · #RRGGBBAA'},{label:'RGB',value:'All channels 0–255, or all channels 0–100%. Do not mix channel units.'},{label:'HSL',value:'Hue with optional deg; saturation and lightness require 0–100%.'},{label:'Alpha',value:'0–1 or 0–100%; opaque alpha is omitted in canonical output.'}],attachments:[],actions:[{id:EDIT,title:'Back to expression',kind:'invoke',effect:'read'}]};}
  #dateTimeHelp():ViewModel{return {protocolVersion:1,viewId:this.#dateTimeHelpId,revision:++this.#viewRevision,kind:'detail',title:'Supported date/time',
    markdown:'Use `<ISO local date/time>[<source zone>] to <target zone>`. Use UTC or a supported IANA area/location such as Australia/Sydney or America/New_York. Abbreviations and offset-only zones are unsupported; local ICU may canonicalize zone aliases. Fixed-offset IANA Etc/GMT names use their standard reversed sign convention.\n\nUse a real Gregorian date in years 0001–9999, uppercase T and hours/minutes. Seconds are optional; fractions have 1–9 digits. Leap seconds (60), 24:00, natural-language dates, implicit zones and alternate calendars are unsupported. Output always includes seconds, an optional normalized fraction, offset and zone. Fractions preserve the exact instant without rounding; output beyond the year bounds is refused.\n\nMissing local times, including skipped dates, are refused. Choose an existing local time; supplying an offset cannot force a gap. Repeated local times require a matching offset before the bracketed source zone. The two documented New York offsets below select distinct instants. Any supplied offset must match the source zone at that local time. Z means a checked +00:00 offset, not an override; unknown -00:00 is refused.\n\nThis help is read-only. Conversion uses local timezone data; it does not read the current clock, contact a service, copy or save expressions. Civil-duration arithmetic and currency/crypto rates are outside this conversion flow.',
    metadata:[{label:'Ordinary conversion',value:'2026-10-27T09:00[Australia/Sydney] to UTC'},{label:'First repeated time',value:'2024-11-03T01:30-04:00[America/New_York] to UTC'},{label:'Second repeated time',value:'2024-11-03T01:30-05:00[America/New_York] to UTC'},{label:'Missing local time',value:'2024-03-10T02:30[America/New_York] to UTC — choose another local time'},{label:'Fraction example',value:'2024-02-29T23:59:59.123456789[UTC] to Asia/Tokyo'}],attachments:[],actions:[{id:EDIT,title:'Back to expression',kind:'invoke',effect:'read'}]};}
  #publishForm(){if(this.active)this.#session.update(this.#formId,{protocolVersion:1,kind:'snapshot',view:this.#form()});}
  #publishResult(){if(this.active && this.#resultOpen && this.#calculation)this.#session.update(this.#resultId,{protocolVersion:1,kind:'snapshot',view:this.#result()});}
  async handle(intent:ActionIntent){
    const top=this.#session.getSnapshot().frames.at(-1);
    if(!this.active || !top || !this.owns(intent.viewId) || top.view.viewId!==intent.viewId || top.view.revision!==intent.revision || top.selection!==null || intent.itemId!==undefined || Object.keys(intent).some(key=>!['viewId','revision','actionId','values'].includes(key)))return;
    if(intent.viewId===this.#helpId || intent.viewId===this.#colourHelpId || intent.viewId===this.#dateTimeHelpId){if(this.#helpOpen && intent.actionId===EDIT && intent.values===undefined)this.#session.pop();return;}
    if(intent.viewId===this.#formId){
      if([UNITS,COLOURS,DATE_TIME].includes(intent.actionId) && intent.values===undefined && !this.#pending && !this.#resultOpen && !this.#helpOpen){this.#helpOpen=this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#formId,view:intent.actionId===UNITS?this.#help():intent.actionId===DATE_TIME?this.#dateTimeHelp():this.#colourHelp()});return;}
      if(intent.actionId===CANCEL && intent.values===undefined){this.#session.pop();return;}
      if(intent.actionId!==EVALUATE || this.#pending)return;
      const values=intent.values,expression=values?.expression;
      if(!values || Object.keys(values).length!==1 || typeof expression!=='string')return;
      this.#evaluate(expression);return;
    }
    if(intent.values!==undefined || !this.#resultOpen || !this.#calculation)return;
    if(intent.actionId===EDIT){this.#session.pop();return;}
    if(intent.actionId!==COPY || this.#pending || !this.#api.copyCalculatorResult)return;
    const controller=new AbortController(),calculation=this.#calculation,expression=this.#expression;
    this.#pending=controller;this.#resultStatus={kind:'info',message:'Copying result…'};this.#publishResult();
    try{
      if(!this.#current(controller,calculation))return;
      const reply=calculatorCopyReplySchema.parse(await bounded(this.#api.copyCalculatorResult({revision:this.#registryRevision,expression}),controller.signal));
      if(!this.#current(controller,calculation))return;
      if(!reply.ok){
        this.#resultStatus=['invalid-request','capability-unavailable','permission-denied','conflict','cancelled'].includes(reply.error.code)?{kind:'error',message:'The result was not copied. Check clipboard access or reopen Calculator, then choose Copy result again.'}:{kind:'error',message:UNKNOWN};return;
      }
      if(reply.value.text!==calculation.text || reply.value.unit!==calculation.unit || reply.value.colour!==calculation.colour || reply.value.dateTime!==calculation.dateTime)throw new Error('Unconfirmed copy.');
      this.#resultStatus={kind:'info',message:'Result copied.'};
    }catch{if(this.#current(controller,calculation))this.#resultStatus={kind:'error',message:UNKNOWN};}
    finally{if(this.#pending===controller){if(!this.#originCurrent())this.#resultStatus={kind:'error',message:UNKNOWN};this.#pending=null;if(this.active && this.#resultOpen && this.#session.getSnapshot().frames.at(-1)?.view.viewId===this.#resultId)this.#publishResult();}}
  }
  #evaluate(expression:string){
    if(!this.#formCurrent())return;
    this.#expression=expression;this.#formStatus=undefined;
    if(!calculatorExpressionSchema.safeParse(expression).success){this.#error='Use a non-empty expression up to 512 UTF-8 bytes without control characters.';this.#publishForm();return;}
    let result:Calculation;
    try{result=evaluateExpression(expression);}catch{this.#error='This expression could not be evaluated. Check it and try again.';this.#publishForm();return;}
    if(!result.ok){this.#error=result.code==='invalid-date-time'?'Use a real ISO date/time in years 0001–9999, an explicit [source zone] and to target zone. See Supported date/time in Actions.':result.code==='unsupported-time-zone'?'Use UTC or a supported IANA area/location, not an abbreviation or offset-only zone. See Supported date/time in Actions.':result.code==='ambiguous-date-time'?'This local time occurs twice. Add a matching offset before [zone]; see the two New York examples in Supported date/time.':result.code==='nonexistent-date-time'?'This local time does not exist in its source zone. Choose an existing local time; an offset cannot force a missing time. See Supported date/time.':result.code==='domain-error'?(/\bto\b/u.test(expression)?'This expression has no finite real result. Check divisions, function inputs and absolute temperatures: K ≥ 0, degC ≥ -273.15, degF ≥ -459.67.':'This expression has no finite real result. Check divisions and function inputs.'):result.code==='limit-exceeded'?'Reduce the expression length, number of operations or nesting depth.':result.code==='invalid-colour'?'Use supported hex, rgb or hsl input with valid ranges, followed by to hex, rgb or hsl. Open Supported colours in Actions for examples.':result.code==='unsupported-unit'?'Use a supported, case-sensitive unit symbol. Open Supported units in Actions for the list.':result.code==='incompatible-units'?'Choose source and target units from the same category. See Supported units in Actions.':'Enter a supported arithmetic expression.';this.#publishForm();return;}
    try{formatCalculationText(result);}catch{this.#error='This expression could not be evaluated. Check it and try again.';this.#publishForm();return;}
    this.#error=undefined;this.#calculation=result;this.#resultStatus=undefined;this.#publishForm();
    if(!this.#formCurrent())return;this.#resultOpen=this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#formId,view:this.#result()});return;
  }
  #current(controller:AbortController,calculation:Success){return this.active && this.#originCurrent() && !controller.signal.aborted && this.#pending===controller && this.#calculation===calculation && this.#resultOpen && this.#session.getSnapshot().frames.at(-1)?.view.viewId===this.#resultId;}
  closed(viewId:string){
    if(!this.owns(viewId))return false;
    if(viewId===this.#helpId || viewId===this.#colourHelpId || viewId===this.#dateTimeHelpId){this.#helpOpen=false;return true;}
    if(viewId===this.#resultId){
      if(this.#pending){this.#pending.abort();this.#pending=null;this.#formStatus={kind:'warning',message:LEFT_PENDING};}
      this.#resultOpen=false;this.#calculation=null;this.#resultStatus=undefined;this.#publishForm();
    }else{this.#opened=false;this.#resultOpen=false;this.#helpOpen=false;this.#pending?.abort();this.#pending=null;this.#calculation=null;this.#expression='';this.#origin=null;}
    return true;
  }
  dispose(){this.#disposed=true;this.#opened=false;this.#resultOpen=false;this.#helpOpen=false;this.#pending?.abort();this.#pending=null;this.#calculation=null;this.#expression='';this.#origin=null;}
}
function bounded<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{
  const finish=(fn:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);fn();};const abort=()=>finish(()=>reject(new Error('Cancelled.')));const timer=setTimeout(()=>finish(()=>reject(new Error('Deadline exceeded.'))),5000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('Request failed.'))));
});}
