import { formatIndexedPath } from '@linuxcast/universal-actions/path';
import type { ClipboardWriteOutcome } from './clipboard-write.ts';
import type { IpcMain,IpcMainInvokeEvent,WebContents } from 'electron';
import { FILE_SEARCH_CHANNELS,fileSearchRequestSchema,fileSearchRootRequestSchema,fileSearchQueryRequestSchema,fileSearchStateReplySchema,fileSearchQueryReplySchema,fileSearchActionReplySchema,fileSearchStateSchema,indexedPathCopyRequestSchema,fileSearchOptionsKey,fileSearchMatchesDirectory,fileSearchMatchesOptions,MAX_ENVELOPE_BYTES } from '@linuxcast/contracts';
import type { FileSearchState,FileSearchActionReply,FileSearchQueryReply,FileSearchResult,FileSearchRoot,IndexedPathCopyReply,FileSearchApi } from '@linuxcast/contracts';
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
  search(request:Parameters<FileSearchApi['search']>[0]):Promise<Extract<FileSearchQueryReply,{ok:true}>['value']>;
  copyPath?(path:string):Promise<ClipboardWriteOutcome>;
  close():void;
}
const failed=(code:'invalid-request'|'permission-denied'|'capability-unavailable'|'cancelled'|'internal'|'conflict'|'deadline-exceeded',message:string)=>({ok:false as const,error:{code,message,retryable:false}});
/** Dedicated metadata window: path copying accepts only an admitted result identity.
 * Indexed display paths never grant file read/open authority. */
export function registerFileSearchIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,actions:FileSearchActions):(()=>void)&{invalidate():void} {
  let stopped=false,mutating=false,reads=0,mutationGeneration=0,querySequence=0,copyPending=false;
  let admitted=new Map<string,{row:FileSearchResult;root:FileSearchRoot}>(),admittedOwner:WebContents|undefined;
  const invalidate=()=>{querySequence++;admitted.clear();admittedOwner=undefined;};
  const validate=<T>(value:unknown,schema:{parse(value:unknown):T}):T=>{
    if(Buffer.byteLength(JSON.stringify(value))>MAX_ENVELOPE_BYTES)throw new Error('Reply bound.');return schema.parse(value);
  };
  for(const channel of Object.values(FILE_SEARCH_CHANNELS))ipc.handle(channel,async(event:IpcMainInvokeEvent,payload:unknown)=>{
    if(stopped||!trustedAppSender(event,actions.contents(),FILE_SEARCH_URL))return failed('permission-denied','File search request denied.');
    const schema=channel===FILE_SEARCH_CHANNELS.copyPath?indexedPathCopyRequestSchema:channel===FILE_SEARCH_CHANNELS.search?fileSearchQueryRequestSchema:channel===FILE_SEARCH_CHANNELS.start||channel===FILE_SEARCH_CHANNELS.pause||channel===FILE_SEARCH_CHANNELS.remove?fileSearchRootRequestSchema:fileSearchRequestSchema;
    const parsed=schema.safeParse(payload);if(!parsed.success)return failed('invalid-request','Invalid file search request.');
    if(channel===FILE_SEARCH_CHANNELS.close){invalidate();setImmediate(()=>{if(!stopped&&trustedAppSender(event,actions.contents(),FILE_SEARCH_URL))actions.close();});return {ok:true,value:{outcome:'completed'}};}
    if(!actions.isReady())return failed('capability-unavailable','File search storage is unavailable. Refresh folders to try again.');
    if(channel===FILE_SEARCH_CHANNELS.copyPath){
      const request=indexedPathCopyRequestSchema.parse(payload),selected=admitted.get(request.resultId),sequence=querySequence;
      if(mutating||copyPending)return failed('cancelled','A file action is still running. Try Copy path again after checking your clipboard.');
      if(!selected||admittedOwner!==event.sender||selected.row.rootId!==request.rootId||selected.row.generation!==request.generation)return failed('conflict','Search again and select a current indexed result before copying.');
      if(!actions.copyPath)return failed('capability-unavailable','Clipboard copying is unavailable. Reopen file search to reconnect.');
      copyPending=true;
      const current=()=>!stopped&&!mutating&&sequence===querySequence&&admitted.get(request.resultId)===selected&&actions.isReady()&&trustedAppSender(event,actions.contents(),FILE_SEARCH_URL);
      const unknown=()=>failed('deadline-exceeded','The copy outcome is unknown. Check your clipboard before choosing Copy path again.');
      const work=(async():Promise<IndexedPathCopyReply>=>{
        let state:FileSearchState;
        try{state=validate(await actions.getState(),fileSearchStateSchema);}catch{return failed('capability-unavailable','Folder state is unavailable. Refresh folders and search again before copying.');}
        const root=state.roots.find(value=>value.id===request.rootId);
        if(!current()||!root||root.generation!==selected.row.generation||root.displayPath!==selected.root.displayPath||root.state==='idle'||root.state==='unavailable'||root.activity==='unavailable')return failed('conflict','Folder state changed. Search again before copying.');
        let path:string;try{path=formatIndexedPath(root,selected.row);}catch{return failed('invalid-request','This indexed path cannot be copied. Search again for a supported path.');}
        try{
          const outcome=await actions.copyPath!(path);
          if(outcome==='busy')return failed('cancelled','Another clipboard action is still running. Check your clipboard before copying again.');
          if(outcome==='unsupported')return failed('capability-unavailable','Clipboard copying is unavailable in this session. The indexed path remains visible.');
          if(outcome!=='written'||!current())return unknown();
          return {ok:true,value:{outcome:'copied',resultId:request.resultId,rootId:request.rootId,generation:request.generation,path}};
        }catch{return unknown();}
      })();
      // Keep the slot until the backend settles, even after the receipt deadline.
      // Close and folder navigation remain available; no copy is replayed.
      void work.finally(()=>{copyPending=false;}).catch(()=>{});
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{return await Promise.race([work,new Promise<IndexedPathCopyReply>(resolve=>{timer=setTimeout(()=>resolve(unknown()),4000);})]);}
      finally{clearTimeout(timer);}
    }
    if(channel===FILE_SEARCH_CHANNELS.state||channel===FILE_SEARCH_CHANNELS.search){
      if(mutating||reads>=4)return failed('cancelled','File search is still running. Try again shortly.');
      reads++;const admittedGeneration=mutationGeneration;
      const sequence=channel===FILE_SEARCH_CHANNELS.search?(invalidate(),querySequence):querySequence;
      const current=()=>!stopped&&!mutating&&admittedGeneration===mutationGeneration&&trustedAppSender(event,actions.contents(),FILE_SEARCH_URL);
      try {
        if(channel===FILE_SEARCH_CHANNELS.state){const value=await actions.getState();return current()?validate({ok:true,value},fileSearchStateReplySchema):failed('cancelled','Folder state changed. Refresh folders again.');}
        const request=fileSearchQueryRequestSchema.parse(payload);
        const value=await actions.search({query:request.query,...(request.rootId?{rootId:request.rootId}:{}),...(request.options?{options:request.options}:{}),...(request.directory===undefined?{}:{directory:request.directory})});
        if(!current())return failed('cancelled','Folder state changed. Search again.');
        if(value.query!==request.query||value.directory!==request.directory||value.rootId!==(request.rootId??null)||fileSearchOptionsKey(value.options)!==fileSearchOptionsKey(request.options))throw new Error('Search identity.');
        const reply=validate({ok:true,value},fileSearchQueryReplySchema);
        if(!reply.ok)return reply;
        const state=validate(await actions.getState(),fileSearchStateSchema);
        if(!current()||sequence!==querySequence)return failed('cancelled','Folder state changed. Search again.');
        const next=new Map<string,{row:FileSearchResult;root:FileSearchRoot}>();
        for(const row of reply.value.results){
          const root=state.roots.find(value=>value.id===row.rootId);
          if(!fileSearchMatchesOptions(row,request.options)||!fileSearchMatchesDirectory(row,request.directory)||!root||root.generation!==row.generation||root.state==='idle'||root.state==='unavailable'||root.activity==='unavailable')throw new Error('Search scope changed.');
          // Snapshot only the bounded validated main-owned metadata, never caller paths.
          next.set(row.id,{row:structuredClone(row),root:structuredClone(root)});
        }
        admitted=next;admittedOwner=event.sender;
        return reply;
      }catch{return failed('capability-unavailable','File search is unavailable. Refresh folders and try again.');}
      finally{reads--;}
    }
    if(mutating)return failed('cancelled','A folder action is already running. Refresh folders before trying again.');
    invalidate();mutating=true;mutationGeneration++;
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
  return Object.assign(()=>{stopped=true;invalidate();for(const channel of Object.values(FILE_SEARCH_CHANNELS))ipc.removeHandler(channel);},{invalidate});
}
