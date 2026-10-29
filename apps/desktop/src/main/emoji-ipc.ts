import type {IpcMain,IpcMainInvokeEvent} from 'electron';
import {EMOJI_CHANNELS,emojiSearchRequestSchema,emojiSearchReplySchema,emojiCopyRequestSchema,emojiCopyReplySchema,emojiReleaseRequestSchema,emojiReleaseReplySchema,emojiRowSchema,emojiFavouriteRequestSchema,emojiFavouriteReplySchema,emojiFavouriteSnapshotSchema} from '../../../../packages/contracts/src/emoji.ts';
import type {EmojiRow,EmojiCopyReply,EmojiSearchValue,EmojiTone,EmojiFavouriteSnapshot} from '../../../../packages/contracts/src/emoji.ts';
export interface EmojiBackend{
 groups:readonly EmojiSearchValue['groups'][number][];
 search(input:{query:string;group?:string;tone?:EmojiTone;ids?:readonly string[]}):readonly EmojiRow[]|Promise<readonly EmojiRow[]>;
 get(id:string):EmojiRow|undefined;
 favourites?:{read():Promise<EmojiFavouriteSnapshot>;write(input:{expectedRevision:number;ids:readonly string[]}):Promise<EmojiFavouriteSnapshot>};
}
interface Context{
 trusted(event:IpcMainInvokeEvent):boolean;active():boolean;busy():boolean;revision():number;generation():number;
 authorize(event:IpcMainInvokeEvent,revision:number):Promise<Extract<EmojiCopyReply,{ok:false}>|undefined>;
 acquire():()=>void;recordUse():Promise<void>;
 copy?:(text:string)=>Promise<'written'|'unsupported'|'busy'>;
}
const failure=(code:'invalid-request'|'permission-denied'|'capability-unavailable'|'cancelled'|'conflict'|'deadline-exceeded')=>({ok:false as const,error:{code,retryable:false,message:code==='deadline-exceeded'?'Copy could not be confirmed. Check your clipboard, then reload Emoji results before another explicit Copy.':code==='conflict'?'Emoji results changed. Reload results and select an emoji again.':code==='cancelled'?'Finish the current launcher action before copying.':'Emoji search or Copy is unavailable. Reload results; copying is separate from pasting into another application.'}});
type Issued={owner:IpcMainInvokeEvent['sender'];frame:IpcMainInvokeEvent['senderFrame'];revision:number;generation:number;searchId:number;query:string;group:string|null;tone?:EmojiTone;favouritesOnly?:true;favourites?:EmojiFavouriteSnapshot;records:Map<string,string>;copying:boolean};
const project=(row:EmojiRow)=>emojiRowSchema.parse({id:row.id,value:row.value,name:row.name,group:row.group,subgroup:row.subgroup,version:row.version});
/** Public fixed dataset only. Main resolves canonical copy data, never renderer text. */
export function registerEmojiIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,backend:EmojiBackend,context:Context,timeoutMs=4000){
 let disposed=false,reads=0,sequence=0,issued:Issued|undefined;
 const invalidate=(choice:Issued)=>{if(issued===choice){issued=undefined;sequence++;}};
 ipc.handle(EMOJI_CHANNELS.release,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=emojiReleaseRequestSchema.safeParse(payload);if(!parsed.success)return failure('invalid-request');
  if(issued&&issued.owner===event.sender&&issued.frame===event.senderFrame&&issued.revision===parsed.data.revision&&issued.searchId===parsed.data.searchId)invalidate(issued);
  return emojiReleaseReplySchema.parse({ok:true,value:{outcome:'released',searchId:parsed.data.searchId}});
 });
 ipc.handle(EMOJI_CHANNELS.search,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=emojiSearchRequestSchema.safeParse(payload);
  if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');
  if(disposed||!context.active()||context.busy()||reads>=4)return failure('cancelled');
  const request=parsed.data,generation=context.generation(),searchId=++sequence,expires=performance.now()+timeoutMs;issued=undefined;reads++;let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&context.active()&&!context.busy()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation&&sequence===searchId;
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return failure('cancelled');
   let favourites:EmojiFavouriteSnapshot|undefined;
   if(backend.favourites)try{favourites=emojiFavouriteSnapshotSchema.parse(await backend.favourites.read());}catch{/* Ordinary public catalogue remains readable; no empty favourite success. */}
   if(!current())return failure('cancelled');if(request.favouritesOnly&&!favourites)return failure('capability-unavailable');
   const ids=new Set(favourites?.ids??[]);
   const records=(await backend.search({query:request.query,...(request.group?{group:request.group}:{}),...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{ids:favourites!.ids}:{})})).map(project).map(row=>({...row,...(favourites?{favourite:ids.has(row.id)}:{})}));if(!current())return failure('cancelled');
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   const reply=emojiSearchReplySchema.parse({ok:true,value:{revision:request.revision,searchId,datasetVersion:'17.0',query:request.query,group:request.group??null,...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{favouritesOnly:true as const}:{}),favourites:favourites?{available:true,revision:favourites.revision}:{available:false},groups:backend.groups.map(group=>({...group})),records}});
   if(!reply.ok)return failure('capability-unavailable');
   issued={owner:event.sender,frame:event.senderFrame,revision:request.revision,generation,searchId,query:request.query,group:request.group??null,...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{favouritesOnly:true as const}:{}),...(favourites?{favourites}:{}),records:new Map(reply.value.records.map(row=>[row.id,row.value])),copying:false};return reply;
  }catch{return failure('capability-unavailable');}finally{reads--;}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;resolve(failure('capability-unavailable'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 ipc.handle(EMOJI_CHANNELS.copy,async(event,payload)=>{
  if(!context.trusted(event))return failure('permission-denied');const parsed=emojiCopyRequestSchema.safeParse(payload);
  if(!parsed.success||parsed.data.revision!==context.revision())return failure('invalid-request');
  if(disposed||!context.active()||context.busy())return failure('cancelled');
  const request=parsed.data,choice=issued;
  if(!choice||choice.copying||choice.owner!==event.sender||choice.frame!==event.senderFrame||choice.revision!==request.revision||choice.generation!==context.generation()||choice.searchId!==request.searchId||choice.query!==request.query||choice.group!==(request.group??null)||choice.tone!==request.tone||choice.favouritesOnly!==request.favouritesOnly||!choice.records.has(request.id))return failure('conflict');
  if(!context.copy)return failure('capability-unavailable');
  choice.copying=true;const release=context.acquire(),generation=context.generation(),expires=performance.now()+timeoutMs;let expired=false,dispatched=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&issued===choice&&sequence===choice.searchId&&context.active()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation;
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return failure('cancelled');
   const source=backend.get(request.id);if(!source)return failure('conflict');const row=project(source);
   if(row.id!==request.id||row.value!==choice.records.get(request.id)||choice.group!==null&&row.group!==choice.group)return failure('conflict');
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   dispatched=true;const outcome=await context.copy!(row.value);
   if(!current()){invalidate(choice);return failure('deadline-exceeded');}
   if(outcome==='unsupported')return failure('capability-unavailable');if(outcome==='busy')return failure('cancelled');if(outcome!=='written')throw new Error('Copy not confirmed.');
   await context.recordUse();if(!current()){invalidate(choice);return failure('deadline-exceeded');}
   choice.generation=generation;
   return emojiCopyReplySchema.parse({ok:true,value:{outcome:'copied',revision:request.revision,searchId:request.searchId,query:request.query,group:request.group??null,...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{favouritesOnly:true as const}:{}),id:row.id,value:row.value}});
  }catch{invalidate(choice);return failure(dispatched?'deadline-exceeded':'capability-unavailable');}finally{choice.copying=false;release();}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;invalidate(choice);resolve(failure(dispatched?'deadline-exceeded':'cancelled'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 const favouriteFailure=(code:Parameters<typeof failure>[0])=>{const reply=failure(code);return {...reply,error:{...reply.error,message:code==='deadline-exceeded'?'Favourite change could not be confirmed. Reload emoji to read stored favourites before another explicit change. Nothing is replayed.':'Favourite change is unavailable or stale. Reload emoji to read stored favourites before another explicit change.'}};};
 ipc.handle(EMOJI_CHANNELS.favourite,async(event,payload)=>{
  if(!context.trusted(event))return favouriteFailure('permission-denied');const parsed=emojiFavouriteRequestSchema.safeParse(payload);
  if(!parsed.success||parsed.data.revision!==context.revision())return favouriteFailure('invalid-request');
  if(disposed||!context.active()||context.busy())return favouriteFailure('cancelled');
  const request=parsed.data,choice=issued;
  if(!choice||choice.copying||choice.owner!==event.sender||choice.frame!==event.senderFrame||choice.revision!==request.revision||choice.generation!==context.generation()||choice.searchId!==request.searchId||choice.query!==request.query||choice.group!==(request.group??null)||choice.tone!==request.tone||choice.favouritesOnly!==request.favouritesOnly||!choice.records.has(request.id))return favouriteFailure('conflict');
  if(!backend.favourites||!choice.favourites)return favouriteFailure('capability-unavailable');
  if(choice.favourites.revision!==request.favouritesRevision||choice.favourites.ids.includes(request.id)===request.favourite)return favouriteFailure('conflict');
  choice.copying=true;const release=context.acquire(),generation=context.generation(),expires=performance.now()+timeoutMs;let expired=false,dispatched=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&issued===choice&&sequence===choice.searchId&&context.active()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation;
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return favouriteFailure('cancelled');
   const snapshot=emojiFavouriteSnapshotSchema.parse(await backend.favourites!.read());if(!current())return favouriteFailure('cancelled');
   if(snapshot.revision!==request.favouritesRevision||JSON.stringify(snapshot.ids)!==JSON.stringify(choice.favourites!.ids))return favouriteFailure('conflict');
   const source=backend.get(request.id);if(!source)return favouriteFailure('conflict');const row=project(source);if(row.id!==request.id||row.value!==choice.records.get(request.id)||choice.group!==null&&row.group!==choice.group)return favouriteFailure('conflict');
   const next=new Set(snapshot.ids);if(request.favourite)next.add(request.id);else next.delete(request.id);const ids=Array.from(next).sort();
   emojiFavouriteSnapshotSchema.parse({revision:snapshot.revision,ids});
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return favouriteFailure('cancelled');
   dispatched=true;const result=emojiFavouriteSnapshotSchema.parse(await backend.favourites!.write({expectedRevision:snapshot.revision,ids}));
   if(!current()){invalidate(choice);return favouriteFailure('deadline-exceeded');}
   if(result.revision!==snapshot.revision+1||JSON.stringify(result.ids)!==JSON.stringify(ids))throw new Error('Unconfirmed favourite change.');
   const reply=emojiFavouriteReplySchema.parse({ok:true,value:{outcome:'updated',revision:request.revision,searchId:request.searchId,query:request.query,group:request.group??null,...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{favouritesOnly:true as const}:{}),id:request.id,favourite:request.favourite,favouritesRevision:result.revision}});
   invalidate(choice);return reply;
  }catch{invalidate(choice);return favouriteFailure(dispatched?'deadline-exceeded':'capability-unavailable');}finally{choice.copying=false;release();}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;invalidate(choice);resolve(favouriteFailure(dispatched?'deadline-exceeded':'cancelled'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 return()=>{disposed=true;issued=undefined;sequence++;for(const channel of Object.values(EMOJI_CHANNELS))ipc.removeHandler(channel);};
}
