import {MAX_ENVELOPE_BYTES,RATE_CHANNELS,rateConfigurationRequestSchema,rateConfigureRequestSchema,rateConvertRequestSchema,rateCopyRequestSchema,rateClearRequestSchema,rateConfigurationReplySchema,rateConvertReplySchema,rateCopyReplySchema,rateClearReplySchema} from '@linuxcast/contracts';
import type {RateConversionApi} from '@linuxcast/contracts';
import type {ShellTransport} from './api.ts';
/** Private named calls only; this transport and schema dispatcher never cross contextBridge. */
export function createRateApi(transport:Pick<ShellTransport,'invoke'>):RateConversionApi{
 const unavailable={ok:false as const,error:{code:'internal' as const,message:'The rate operation could not be confirmed. Reload configuration before trying again.',retryable:false}};
 const read=async(channel:string,payload:unknown)=>{const value=await transport.invoke(channel,payload);if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_ENVELOPE_BYTES)throw new Error('Invalid rate reply.');return value;};
 return Object.freeze({
  async getRateConfiguration(request){try{const payload=rateConfigurationRequestSchema.parse({...request,protocolVersion:1});return rateConfigurationReplySchema.parse(await read(RATE_CHANNELS.configuration,payload));}catch{return unavailable;}},
  async configureRateSource(request){try{const payload=rateConfigureRequestSchema.parse({...request,protocolVersion:1}),reply=rateConfigurationReplySchema.parse(await read(RATE_CHANNELS.configure,payload));return reply.ok&&(reply.value.revision!==payload.expectedRevision+1||reply.value.source!==payload.source)?unavailable:reply;}catch{return unavailable;}},
  async convertRate(request){try{const payload=rateConvertRequestSchema.parse({...request,protocolVersion:1}),reply=rateConvertReplySchema.parse(await read(RATE_CHANNELS.convert,payload));return reply.ok&&(reply.value.configurationRevision!==payload.configurationRevision||reply.value.amount!==payload.amount||reply.value.base!==payload.base||reply.value.quote!==payload.quote)?unavailable:reply;}catch{return unavailable;}},
  async copyRateResult(request){try{const payload=rateCopyRequestSchema.parse({...request,protocolVersion:1}),reply=rateCopyReplySchema.parse(await read(RATE_CHANNELS.copy,payload));return reply.ok&&reply.value.quoteId!==payload.quoteId?unavailable:reply;}catch{return unavailable;}},
  async clearRateCache(request){try{const payload=rateClearRequestSchema.parse({...request,protocolVersion:1});return rateClearReplySchema.parse(await read(RATE_CHANNELS.clearCache,payload));}catch{return unavailable;}},
 } satisfies RateConversionApi);
}
