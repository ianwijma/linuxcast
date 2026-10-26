import { FILE_SEARCH_CHANNELS,FILE_SEARCH_CHANGED,fileSearchStateSchema,fileSearchStateReplySchema,fileSearchActionReplySchema,fileSearchQueryReplySchema,fileSearchQueryRequestSchema,fileSearchRootRequestSchema,indexedPathCopyRequestSchema,indexedPathCopyReplySchema,fileSearchOptionsKey,fileSearchMatchesOptions,MAX_ENVELOPE_BYTES } from '@linuxcast/contracts';
import type { FileSearchApi,IndexedPathSelection } from '@linuxcast/contracts';
import type { ShellTransport } from '../preload/api.ts';
export function createFileSearchApi(transport:ShellTransport):FileSearchApi {
  const failed={ok:false as const,error:{code:'internal' as const,message:'File search is unavailable. Refresh folders before trying again.',retryable:false}};
  const bounded=(value:unknown)=>{if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_ENVELOPE_BYTES)throw new Error('Reply bound.');return value;};
  const action=async(channel:string,payload:unknown)=>{try{return fileSearchActionReplySchema.parse(bounded(await transport.invoke(channel,payload)));}catch{return failed;}};
  const rootAction=(channel:string,rootId:string)=>{
    const parsed=fileSearchRootRequestSchema.safeParse({protocolVersion:1,rootId});return parsed.success?action(channel,parsed.data):Promise.resolve(failed);
  };
  return Object.freeze({
    async getState(){try{return fileSearchStateReplySchema.parse(bounded(await transport.invoke(FILE_SEARCH_CHANNELS.state,{protocolVersion:1})));}catch{return failed;}},
    chooseFolder:()=>action(FILE_SEARCH_CHANNELS.choose,{protocolVersion:1}),
    startIndex:(rootId:string)=>rootAction(FILE_SEARCH_CHANNELS.start,rootId),
    pauseIndex:(rootId:string)=>rootAction(FILE_SEARCH_CHANNELS.pause,rootId),
    removeFolder:(rootId:string)=>rootAction(FILE_SEARCH_CHANNELS.remove,rootId),
    async search(request:Parameters<FileSearchApi['search']>[0]){
      const parsed=fileSearchQueryRequestSchema.safeParse({...request,protocolVersion:1});if(!parsed.success)return failed;
      try {
        const reply=fileSearchQueryReplySchema.parse(bounded(await transport.invoke(FILE_SEARCH_CHANNELS.search,parsed.data)));
        if(reply.ok&&(reply.value.query!==parsed.data.query||reply.value.rootId!==(parsed.data.rootId??null)||fileSearchOptionsKey(reply.value.options)!==fileSearchOptionsKey(parsed.data.options)||reply.value.results.some(row=>!fileSearchMatchesOptions(row,parsed.data.options))))return failed;
        return reply;
      }catch{return failed;}
    },
    async copyPath(selection:IndexedPathSelection){
      const parsed=indexedPathCopyRequestSchema.safeParse({...selection,protocolVersion:1});if(!parsed.success)return failed;
      try{
        const reply=indexedPathCopyReplySchema.parse(bounded(await transport.invoke(FILE_SEARCH_CHANNELS.copyPath,parsed.data)));
        if(reply.ok&&(reply.value.resultId!==parsed.data.resultId||reply.value.rootId!==parsed.data.rootId||reply.value.generation!==parsed.data.generation))return failed;
        return reply;
      }catch{return failed;}
    },
    close:()=>action(FILE_SEARCH_CHANNELS.close,{protocolVersion:1}),
    onState(listener:Parameters<FileSearchApi['onState']>[0]){
      if(typeof listener!=='function')throw new TypeError('A state listener is required.');
      let active=true;const receive=(_event:unknown,value:unknown)=>{try{const state=fileSearchStateSchema.parse(bounded(value));if(active)listener(state);}catch{/* Invalid events carry no presentation authority. */}};
      transport.on(FILE_SEARCH_CHANGED,receive);return()=>{if(active){active=false;transport.removeListener(FILE_SEARCH_CHANGED,receive);}};
    },
  });
}
