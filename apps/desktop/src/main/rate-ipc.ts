import type {IpcMain,IpcMainInvokeEvent} from 'electron';
import {RATE_CHANNELS,rateConfigurationRequestSchema,rateConfigureRequestSchema,rateConvertRequestSchema,rateCopyRequestSchema,rateClearRequestSchema} from '@linuxcast/contracts';
import type {ShellCommandReply} from '@linuxcast/contracts';
import {RateServiceError} from './rate-service.ts';
import type {RateConversionService} from './rate-service.ts';
interface Gate{
 trusted(event:IpcMainInvokeEvent):boolean;
 active():boolean;
 revision():number;
 checkVisibility(event:IpcMainInvokeEvent,revision:number):Promise<Extract<ShellCommandReply,{ok:false}>|undefined>;
 copy?:(text:string)=>Promise<'written'|'busy'|'unsupported'>;
 recordUse():Promise<void>;
}
const failed=(code:'permission-denied'|'invalid-request'|'cancelled'|'conflict'|'capability-unavailable'|'deadline-exceeded',message:string)=>({ok:false as const,error:{code,message,retryable:false}});
const unknown=()=>failed('deadline-exceeded','The rate operation could not be confirmed. Reload configuration, or check your clipboard before choosing Copy again.');
export function registerRateIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,service:RateConversionService,gate:Gate){
 let stopped=false,copyPending=false;
 let issuedQuote:{id:string;revision:number}|undefined;
 const schemas={[RATE_CHANNELS.configuration]:rateConfigurationRequestSchema,[RATE_CHANNELS.configure]:rateConfigureRequestSchema,[RATE_CHANNELS.convert]:rateConvertRequestSchema,[RATE_CHANNELS.copy]:rateCopyRequestSchema,[RATE_CHANNELS.clearCache]:rateClearRequestSchema};
 const trusted=(event:IpcMainInvokeEvent,revision:number)=>!stopped&&gate.active()&&gate.trusted(event)&&gate.revision()===revision;
 const authorize=async(event:IpcMainInvokeEvent,revision:number)=>{
  if(!trusted(event,revision))return failed('permission-denied','Currency conversion context changed. Reopen it from the launcher.');
  const denied=await gate.checkVisibility(event,revision);if(denied)return denied;
  if(!trusted(event,revision))return failed('permission-denied','Currency conversion context changed. Reopen it from the launcher.');
 };
 for(const channel of Object.values(RATE_CHANNELS))ipc.handle(channel,async(event:IpcMainInvokeEvent,payload:unknown)=>{
  if(!gate.trusted(event))return failed('permission-denied','Currency conversion request denied.');
  const parsed=schemas[channel].safeParse(payload);if(!parsed.success)return failed('invalid-request','Invalid currency conversion request.');
  const revision=parsed.data.revision,denied=await authorize(event,revision);if(denied)return denied;
  let dispatched=false;
  try{
   if(channel===RATE_CHANNELS.configuration){const value=await service.configuration(),lost=await authorize(event,revision);return lost??{ok:true as const,value};}
   if(channel===RATE_CHANNELS.configure){issuedQuote=undefined;const p=rateConfigureRequestSchema.parse(payload);dispatched=true;const value=await service.configure(p.expectedRevision,p.source),lost=await authorize(event,revision);return lost?unknown():{ok:true as const,value};}
   if(channel===RATE_CHANNELS.clearCache){issuedQuote=undefined;const p=rateClearRequestSchema.parse(payload);dispatched=true;await service.clear(p.configurationRevision);const lost=await authorize(event,revision);return lost?unknown():{ok:true as const,value:{outcome:'cleared' as const}};}
   if(channel===RATE_CHANNELS.convert){const p=rateConvertRequestSchema.parse(payload),controller=new AbortController(),value=await service.convert({configurationRevision:p.configurationRevision,amount:p.amount,base:p.base,quote:p.quote},controller.signal),lost=await authorize(event,revision);if(lost){issuedQuote=undefined;service.invalidate();return lost;}issuedQuote={id:value.id,revision};return {ok:true as const,value};}
   const p=rateCopyRequestSchema.parse(payload);if(!issuedQuote||issuedQuote.id!==p.quoteId||issuedQuote.revision!==revision){service.invalidate();issuedQuote=undefined;return failed('conflict','This quote belongs to an older launcher context. Reopen currency conversion and choose Convert again.');}if(copyPending)return failed('cancelled','A clipboard operation is still pending. Check the clipboard before copying again.');
   if(!gate.copy)return failed('capability-unavailable','Clipboard copying is unavailable. Read the result or reopen Linuxcast.');
   const admittedQuote=issuedQuote;copyPending=true;
   const work=Promise.resolve().then(async()=>{
    const value=await service.copyValue(p.quoteId),lost=await authorize(event,revision);if(lost)return lost;
    if(!trusted(event,revision))return failed('cancelled','Currency conversion context changed.');
    if(issuedQuote!==admittedQuote||!service.isCurrentQuote(p.quoteId))return failed('conflict','This quote changed or expired. Choose Convert again before copying.');
    const outcome=await gate.copy!(value.clipboardText);
    if(outcome==='busy')return failed('cancelled','Another clipboard operation is still pending.');
    if(outcome==='unsupported')return failed('capability-unavailable','The result was not copied. Check clipboard access and try again explicitly.');
    if(outcome!=='written')return unknown();await gate.recordUse();return {ok:true as const,value:value.receipt};
   });
   void work.finally(()=>{copyPending=false;}).catch(()=>{});
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Copy unconfirmed.')),4000);})]);}finally{clearTimeout(timer);}
  }catch(error){
   if(dispatched)return unknown();
   if(error instanceof RateServiceError){
    if(error.reason==='disabled')return failed('permission-denied','Rates are disabled. Configure a source before choosing Convert.');
    if(error.reason==='configuration-changed'||error.reason==='expired')return failed('conflict','Configuration or quote changed or expired. Reload configuration and choose Convert again.');
    if(error.reason==='busy'||error.reason==='cancelled')return failed('cancelled','This conversion stopped or another conversion is pending. Try again explicitly.');
   }
   return channel===RATE_CHANNELS.copy?unknown():failed('capability-unavailable','The configured rate source or matching cache is unavailable. Check your connection, reload configuration and try Convert again.');
  }
 });
 return ()=>{stopped=true;service.invalidate();for(const channel of Object.values(RATE_CHANNELS))ipc.removeHandler(channel);};
}
