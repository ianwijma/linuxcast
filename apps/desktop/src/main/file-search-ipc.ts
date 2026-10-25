import type { IpcMain,IpcMainInvokeEvent,WebContents } from 'electron';
import { FILE_SEARCH_CHANNELS,fileSearchRequestSchema,fileSearchRootRequestSchema,fileSearchQueryRequestSchema,fileSearchStateReplySchema,fileSearchQueryReplySchema,fileSearchActionReplySchema,MAX_ENVELOPE_BYTES } from '@linuxcast/contracts';
import type { FileSearchState,FileSearchActionReply,FileSearchQueryReply } from '@linuxcast/contracts';
import { trustedAppSender } from './ipc.ts';
import { FILE_SEARCH_URL } from './assets.ts';
export interface FileSearchActions {
  contents():WebContents|undefined;
  isReady():boolean;
  getState():Promise<FileSearchState>;
  chooseFolder():Promise<FileSearchActionReply>;
  startIndex(rootId:string):Promise<void>;
  pauseIndex(rootId:string):Promise<void>;
  removeFolder(rootId:string):Promise<'completed'|'cancelled'>;
  search(request:{query:string;rootId?:string}):Promise<Extract<FileSearchQueryReply,{ok:true}>['value']>;
  close():void;
}
const failed=(code:'invalid-request'|'permission-denied'|'capability-unavailable'|'cancelled'|'internal',message:string)=>({ok:false as const,error:{code,message,retryable:false}});
/** Dedicated metadata window only: no paths, repository dispatch or OS file actions enter requests. */
export function registerFileSearchIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,actions:FileSearchActions):()=>void {
  let stopped=false,mutating=false,reads=0,mutationGeneration=0;
  const validate=(value:unknown,schema:typeof fileSearchActionReplySchema|typeof fileSearchStateReplySchema|typeof fileSearchQueryReplySchema)=>{
    if(Buffer.byteLength(JSON.stringify(value))>MAX_ENVELOPE_BYTES)throw new Error('Reply bound.');return schema.parse(value);
  };
  for(const channel of Object.values(FILE_SEARCH_CHANNELS))ipc.handle(channel,async(event:IpcMainInvokeEvent,payload:unknown)=>{
    if(stopped||!trustedAppSender(event,actions.contents(),FILE_SEARCH_URL))return failed('permission-denied','File search request denied.');
    const schema=channel===FILE_SEARCH_CHANNELS.search?fileSearchQueryRequestSchema:channel===FILE_SEARCH_CHANNELS.start||channel===FILE_SEARCH_CHANNELS.pause||channel===FILE_SEARCH_CHANNELS.remove?fileSearchRootRequestSchema:fileSearchRequestSchema;
    const parsed=schema.safeParse(payload);if(!parsed.success)return failed('invalid-request','Invalid file search request.');
    if(channel===FILE_SEARCH_CHANNELS.close){setImmediate(()=>{if(!stopped&&trustedAppSender(event,actions.contents(),FILE_SEARCH_URL))actions.close();});return {ok:true,value:{outcome:'completed'}};}
    if(!actions.isReady())return failed('capability-unavailable','File search storage is unavailable. Refresh folders to try again.');
    if(channel===FILE_SEARCH_CHANNELS.state||channel===FILE_SEARCH_CHANNELS.search){
      if(mutating||reads>=4)return failed('cancelled','File search is still running. Try again shortly.');
      reads++;const admittedGeneration=mutationGeneration;
      const current=()=>!stopped&&!mutating&&admittedGeneration===mutationGeneration&&trustedAppSender(event,actions.contents(),FILE_SEARCH_URL);
      try {
        if(channel===FILE_SEARCH_CHANNELS.state){const value=await actions.getState();return current()?validate({ok:true,value},fileSearchStateReplySchema):failed('cancelled','Folder state changed. Refresh folders again.');}
        const request=fileSearchQueryRequestSchema.parse(payload);
        const value=await actions.search({query:request.query,...(request.rootId?{rootId:request.rootId}:{})});
        if(!current())return failed('cancelled','Folder state changed. Search again.');
        if(value.query!==request.query||value.rootId!==(request.rootId??null))throw new Error('Search identity.');
        return validate({ok:true,value},fileSearchQueryReplySchema);
      }catch{return failed('capability-unavailable','File search is unavailable. Refresh folders and try again.');}
      finally{reads--;}
    }
    if(mutating)return failed('cancelled','A folder action is already running. Refresh folders before trying again.');
    mutating=true;mutationGeneration++;
    try {
      if(channel===FILE_SEARCH_CHANNELS.choose)return validate(await actions.chooseFolder(),fileSearchActionReplySchema);
      const {rootId}=fileSearchRootRequestSchema.parse(payload);
      if(channel===FILE_SEARCH_CHANNELS.start)await actions.startIndex(rootId);
      else if(channel===FILE_SEARCH_CHANNELS.pause)await actions.pauseIndex(rootId);
      else return validate({ok:true,value:{outcome:await actions.removeFolder(rootId)}},fileSearchActionReplySchema);
      return {ok:true,value:{outcome:'completed'}};
    }catch{return failed('internal','The folder action could not be confirmed. Refresh folders before trying again.');}
    finally{mutating=false;}
  });
  return()=>{stopped=true;for(const channel of Object.values(FILE_SEARCH_CHANNELS))ipc.removeHandler(channel);};
}
