import { MAX_ENVELOPE_BYTES,QUICKLINK_CHANNELS,quicklinkListRequestSchema,quicklinkGetRequestSchema,quicklinkSaveRequestSchema,quicklinkOpenRequestSchema,quicklinkListReplySchema,quicklinkRecordReplySchema,quicklinkRemoveReplySchema,quicklinkOpenReplySchema } from '@linuxcast/contracts';
import type { QuicklinkApi } from '@linuxcast/contracts';
import type { ShellTransport } from './api.ts';
const unavailable={ok:false as const,error:{code:'internal' as const,message:'Quicklinks operation could not be confirmed. Reload Quicklinks before trying again.',retryable:false}};
const withinLimit=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length<=MAX_ENVELOPE_BYTES;
/** Named methods only; no generic forwarding capability crosses the bridge. */
export function createQuicklinkApi(transport:Pick<ShellTransport,'invoke'>):Required<QuicklinkApi>{return {
  listQuicklinks:async()=>{
    try{const value=await transport.invoke(QUICKLINK_CHANNELS.list,quicklinkListRequestSchema.parse({protocolVersion:1}));
      return withinLimit(value)?quicklinkListReplySchema.parse(value):unavailable;}catch{return unavailable;}
  },
  getQuicklink:async request=>{
    try{const parsed=quicklinkGetRequestSchema.parse({...request,protocolVersion:1}),value=await transport.invoke(QUICKLINK_CHANNELS.get,parsed);
      if(!withinLimit(value))return unavailable;const result=quicklinkRecordReplySchema.parse(value);
      return !result.ok||result.value.record.id===parsed.id&&result.value.record.revision===parsed.revision?result:unavailable;
    }catch{return unavailable;}
  },
  saveQuicklink:async request=>{
    try{const parsed=quicklinkSaveRequestSchema.parse({...request,protocolVersion:1}),value=await transport.invoke(QUICKLINK_CHANNELS.save,parsed);
      if(!withinLimit(value))return unavailable;const result=quicklinkRecordReplySchema.parse(value);
      return !result.ok||(parsed.id===undefined||result.value.record.id===parsed.id)&&result.value.record.revision===parsed.expectedRevision+1&&result.value.record.name===parsed.name&&result.value.record.url===parsed.url&&JSON.stringify(result.value.record.webSearch)===JSON.stringify(parsed.webSearch)&&JSON.stringify(result.value.record.tags??[])===JSON.stringify(parsed.tags??[])&&(result.value.record.pinned??false)===(parsed.pinned??false)&&(result.value.record.hidden??false)===(parsed.hidden??false)?result:unavailable;
    }catch{return unavailable;}
  },
  removeQuicklink:async request=>{
    try{const parsed=quicklinkGetRequestSchema.parse({...request,protocolVersion:1}),value=await transport.invoke(QUICKLINK_CHANNELS.remove,parsed);
      if(!withinLimit(value))return unavailable;const result=quicklinkRemoveReplySchema.parse(value);
      return !result.ok||result.value.id===parsed.id&&result.value.revision===parsed.revision?result:unavailable;
    }catch{return unavailable;}
  },
  openQuicklink:async request=>{
    try{const parsed=quicklinkOpenRequestSchema.parse({...request,protocolVersion:1}),value=await transport.invoke(QUICKLINK_CHANNELS.open,parsed);
      if(!withinLimit(value))return unavailable;const result=quicklinkOpenReplySchema.parse(value);
      return !result.ok||result.value.id===parsed.id&&result.value.revision===parsed.revision&&(parsed.query===undefined?result.value.webSearch===undefined:result.value.webSearch?.query===parsed.query)?result:unavailable;
    }catch{return unavailable;}
  },
};}
