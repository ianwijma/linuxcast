import {emojiFrecencySnapshotSchema,emojiFrecencyRequestSchema,emojiFrecencyReplySchema,emojiKeywordSnapshotSchema,emojiKeywordsRequestSchema,emojiKeywordsReplySchema} from '../../../../packages/contracts/src/emoji.ts';
import type {EmojiFrecencySnapshot,EmojiFrecencyEntry,EmojiKeywordSnapshot,EmojiKeywordEntry} from '../../../../packages/contracts/src/emoji.ts';
import type {IpcMain,IpcMainInvokeEvent} from 'electron';
import {EMOJI_CHANNELS,emojiSearchRequestSchema,emojiSearchReplySchema,emojiCopyRequestSchema,emojiCopyReplySchema,emojiReleaseRequestSchema,emojiReleaseReplySchema,emojiRowSchema,emojiFavouriteRequestSchema,emojiFavouriteReplySchema,emojiFavouriteSnapshotSchema} from '../../../../packages/contracts/src/emoji.ts';
import type {EmojiRow,EmojiCopyReply,EmojiSearchValue,EmojiTone,EmojiFavouriteSnapshot} from '../../../../packages/contracts/src/emoji.ts';
export interface EmojiBackend{
 groups:readonly EmojiSearchValue['groups'][number][];
 search(input:{query:string;group?:string;tone?:EmojiTone;ids?:readonly string[];customKeywords?:readonly EmojiKeywordEntry[];favouriteIds?:readonly string[];frecency?:{entries:readonly EmojiFrecencyEntry[];now:number}}):readonly EmojiRow[]|Promise<readonly EmojiRow[]>;
 get(id:string):EmojiRow|undefined;
 frecency?:{read():Promise<EmojiFrecencySnapshot>;write(input:{expectedRevision:number;enabled:boolean;entries:readonly EmojiFrecencyEntry[]}):Promise<EmojiFrecencySnapshot>};
 keywords?:{read():Promise<EmojiKeywordSnapshot>;write(input:{expectedRevision:number;entries:readonly EmojiKeywordEntry[]}):Promise<EmojiKeywordSnapshot>};
 favourites?:{read():Promise<EmojiFavouriteSnapshot>;write(input:{expectedRevision:number;ids:readonly string[]}):Promise<EmojiFavouriteSnapshot>};
}
interface Context{
 trusted(event:IpcMainInvokeEvent):boolean;active():boolean;busy():boolean;revision():number;generation():number;
 authorize(event:IpcMainInvokeEvent,revision:number):Promise<Extract<EmojiCopyReply,{ok:false}>|undefined>;
 acquire():()=>void;recordUse():Promise<void>;
 copy?:(text:string)=>Promise<'written'|'unsupported'|'busy'>;
}
const failure=(code:'invalid-request'|'permission-denied'|'capability-unavailable'|'cancelled'|'conflict'|'deadline-exceeded')=>({ok:false as const,error:{code,retryable:false,message:code==='deadline-exceeded'?'Copy could not be confirmed. Check your clipboard, then reload Emoji results before another explicit Copy.':code==='conflict'?'Emoji results changed. Reload results and select an emoji again.':code==='cancelled'?'Finish the current launcher action before copying.':'Emoji search or Copy is unavailable. Reload results; copying is separate from pasting into another application.'}});
type Issued={owner:IpcMainInvokeEvent['sender'];frame:IpcMainInvokeEvent['senderFrame'];revision:number;generation:number;searchId:number;query:string;group:string|null;tone?:EmojiTone;favouritesOnly?:true;favourites?:EmojiFavouriteSnapshot;keywords?:EmojiKeywordSnapshot;frecency?:EmojiFrecencySnapshot;records:Map<string,string>;copying:boolean};
const project=(row:EmojiRow)=>emojiRowSchema.parse({id:row.id,value:row.value,name:row.name,group:row.group,subgroup:row.subgroup,version:row.version});
/** Public fixed dataset only. Main resolves canonical copy data, never renderer text. */
export function registerEmojiIpc(ipc:Pick<IpcMain,'handle'|'removeHandler'>,backend:EmojiBackend,context:Context,timeoutMs=4000){
 let disposed=false,reads=0,sequence=0,issued:Issued|undefined;
 const invalidate=(choice:Issued)=>{if(issued===choice){issued=undefined;sequence++;}};
 const readKeywords=async()=>{if(!backend.keywords)throw new Error('Keywords unavailable.');const snapshot=emojiKeywordSnapshotSchema.parse(await backend.keywords.read());if(snapshot.entries.some(entry=>{const row=backend.get(entry.id);return !row||project(row).id!==entry.id;}))throw new Error('Keywords unavailable.');return snapshot;};
 const readFavourites=async()=>{if(!backend.favourites)throw new Error('Favourites unavailable.');const snapshot=emojiFavouriteSnapshotSchema.parse(await backend.favourites.read());if(snapshot.ids.some(id=>{const row=backend.get(id);return !row||project(row).id!==id;}))throw new Error('Favourites unavailable.');return snapshot;};
 const readFrecency=async()=>{if(!backend.frecency)throw new Error('Ranking unavailable.');const snapshot=emojiFrecencySnapshotSchema.parse(await backend.frecency.read());if(snapshot.entries.some(entry=>{const row=backend.get(entry.id);return !row||project(row).id!==entry.id;}))throw new Error('Ranking unavailable.');return snapshot;};
 const sameFrecency=(left:EmojiFrecencySnapshot,right:EmojiFrecencySnapshot)=>JSON.stringify(left)===JSON.stringify(right);
 const freshFrecency=async(snapshot:EmojiFrecencySnapshot)=>sameFrecency(snapshot,await readFrecency());
 const freshKeywords=async(snapshot:EmojiKeywordSnapshot)=>{const fresh=await readKeywords();return fresh.revision===snapshot.revision&&JSON.stringify(fresh.entries)===JSON.stringify(snapshot.entries);};
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
   let favourites:EmojiFavouriteSnapshot|undefined,keywords:EmojiKeywordSnapshot|undefined,frecency:EmojiFrecencySnapshot|undefined;
   if(backend.frecency)try{frecency=await readFrecency();}catch{/* Public catalogue remains useful when private ranking is unavailable. */}
   if(backend.keywords)try{keywords=await readKeywords();}catch{/* Public matching remains useful, custom matching is explicitly unavailable. */}
   if(backend.favourites)try{favourites=await readFavourites();}catch{/* Ordinary public catalogue remains readable; no empty favourite success. */}
   if(!current())return failure('cancelled');if(request.favouritesOnly&&!favourites)return failure('capability-unavailable');
   const ids=new Set(favourites?.ids??[]),now=Date.now();if(!Number.isSafeInteger(now))return failure('capability-unavailable');
   const records=(await backend.search({query:request.query,...(request.group?{group:request.group}:{}),...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{ids:favourites!.ids}:{}),...(keywords?{customKeywords:keywords.entries}:{}),...(favourites?{favouriteIds:favourites.ids}:{}),...(frecency?.enabled?{frecency:{entries:frecency.entries,now}}:{})})).map(project).map(row=>({...row,...(favourites?{favourite:ids.has(row.id)}:{}),...(keywords?{customKeywords:keywords.entries.find(entry=>entry.id===row.id)?.keywords??[]}:{})}));if(!current())return failure('cancelled');
   if(keywords&&!await freshKeywords(keywords))return failure('conflict');
   if(frecency&&!await freshFrecency(frecency))return failure('conflict');
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   const reply=emojiSearchReplySchema.parse({ok:true,value:{revision:request.revision,searchId,datasetVersion:'17.0',query:request.query,group:request.group??null,...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{favouritesOnly:true as const}:{}),favourites:favourites?{available:true,revision:favourites.revision}:{available:false},keywords:keywords?{available:true,revision:keywords.revision}:{available:false},...(backend.frecency?{frecency:frecency?{available:true,revision:frecency.revision,enabled:frecency.enabled,entryCount:frecency.entries.length}:{available:false}}:{}),groups:backend.groups.map(group=>({...group})),records}});
   if(!reply.ok)return failure('capability-unavailable');
   issued={owner:event.sender,frame:event.senderFrame,revision:request.revision,generation,searchId,query:request.query,group:request.group??null,...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{favouritesOnly:true as const}:{}),...(favourites?{favourites}:{}),...(keywords?{keywords}:{}),...(frecency?{frecency}:{}),records:new Map(reply.value.records.map(row=>[row.id,row.value])),copying:false};return reply;
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
   if(choice.keywords&&!await freshKeywords(choice.keywords))return failure('conflict');
   let tracking:EmojiFrecencySnapshot|undefined;if(backend.frecency)try{tracking=await readFrecency();}catch{/* Copy still works without private tracking; do not assume tracking was enabled. */}
   if(tracking&&choice.frecency&&!sameFrecency(tracking,choice.frecency))return failure('conflict');
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return failure('cancelled');
   dispatched=true;const outcome=await context.copy!(row.value);
   if(!current()){invalidate(choice);return failure('deadline-exceeded');}
   if(outcome==='unsupported')return failure('capability-unavailable');if(outcome==='busy')return failure('cancelled');if(outcome!=='written')throw new Error('Copy not confirmed.');
   let trackingOutcome:'recorded'|'paused'|'unavailable'|undefined;
   if(backend.frecency){
    trackingOutcome=tracking?.enabled===false?'paused':'unavailable';
    if(tracking?.enabled){
     try{
      if(tracking.revision>=Number.MAX_SAFE_INTEGER-1)throw new Error('Ranking counter exhausted.');
      const lastUsedAt=new Date(Date.now()).toISOString(),previous=tracking.entries.find(entry=>entry.id===row.id),entries=tracking.entries.filter(entry=>entry.id!==row.id);
      entries.push({id:row.id,useCount:Math.min(1_000_000_000,(previous?.useCount??0)+1),lastUsedAt});entries.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
      emojiFrecencySnapshotSchema.parse({revision:tracking.revision,enabled:true,entries});
      const result=emojiFrecencySnapshotSchema.parse(await backend.frecency.write({expectedRevision:tracking.revision,enabled:true,entries}));
      if(!current()){invalidate(choice);return failure('deadline-exceeded');}
      if(result.revision!==tracking.revision+1||result.enabled!==true||JSON.stringify(result.entries)!==JSON.stringify(entries))throw new Error('Unconfirmed ranking.');
      choice.frecency=result;trackingOutcome='recorded';
     }catch{if(!current()){invalidate(choice);return failure('deadline-exceeded');}trackingOutcome='unavailable';}
     // The clipboard succeeded. Aggregate storage failure cannot turn that into a Copy failure.
     if(trackingOutcome==='recorded')try{await context.recordUse();}catch{trackingOutcome='unavailable';}
    }
   }else await context.recordUse();
   if(!current()){invalidate(choice);return failure('deadline-exceeded');}
   if(trackingOutcome==='unavailable')invalidate(choice);
   choice.generation=generation;
   return emojiCopyReplySchema.parse({ok:true,value:{outcome:'copied',revision:request.revision,searchId:request.searchId,query:request.query,group:request.group??null,...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{favouritesOnly:true as const}:{}),id:row.id,value:row.value,...(trackingOutcome?{frecency:trackingOutcome}:{})}});
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
   const snapshot=await readFavourites();if(!current())return favouriteFailure('cancelled');
   if(snapshot.revision!==request.favouritesRevision||JSON.stringify(snapshot.ids)!==JSON.stringify(choice.favourites!.ids))return favouriteFailure('conflict');
   const source=backend.get(request.id);if(!source)return favouriteFailure('conflict');const row=project(source);if(row.id!==request.id||row.value!==choice.records.get(request.id)||choice.group!==null&&row.group!==choice.group)return favouriteFailure('conflict');
   const next=new Set(snapshot.ids);if(request.favourite)next.add(request.id);else next.delete(request.id);const ids=Array.from(next).sort();
   emojiFavouriteSnapshotSchema.parse({revision:snapshot.revision,ids});
   if(choice.keywords&&!await freshKeywords(choice.keywords))return favouriteFailure('conflict');
   if(choice.frecency&&!await freshFrecency(choice.frecency))return favouriteFailure('conflict');
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return favouriteFailure('cancelled');
   dispatched=true;const result=emojiFavouriteSnapshotSchema.parse(await backend.favourites!.write({expectedRevision:snapshot.revision,ids}));
   if(!current()){invalidate(choice);return favouriteFailure('deadline-exceeded');}
   if(result.revision!==snapshot.revision+1||JSON.stringify(result.ids)!==JSON.stringify(ids))throw new Error('Unconfirmed favourite change.');
   const reply=emojiFavouriteReplySchema.parse({ok:true,value:{outcome:'updated',revision:request.revision,searchId:request.searchId,query:request.query,group:request.group??null,...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{favouritesOnly:true as const}:{}),id:request.id,favourite:request.favourite,favouritesRevision:result.revision}});
   invalidate(choice);return reply;
  }catch{invalidate(choice);return favouriteFailure(dispatched?'deadline-exceeded':'capability-unavailable');}finally{choice.copying=false;release();}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;invalidate(choice);resolve(favouriteFailure(dispatched?'deadline-exceeded':'cancelled'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 const keywordFailure=(code:Parameters<typeof failure>[0])=>{const reply=failure(code);return {...reply,error:{...reply.error,message:code==='deadline-exceeded'?'Keyword save could not be confirmed. Wait for the pending save, then Reload emoji to read saved keywords before another explicit change. Nothing is replayed.':'Keyword save is unavailable or stale. Reload emoji to read saved keywords before another explicit change.'}};};
 ipc.handle(EMOJI_CHANNELS.keywords,async(event,payload)=>{
  if(!context.trusted(event))return keywordFailure('permission-denied');const parsed=emojiKeywordsRequestSchema.safeParse(payload);
  if(!parsed.success||parsed.data.revision!==context.revision())return keywordFailure('invalid-request');
  if(disposed||!context.active()||context.busy())return keywordFailure('cancelled');
  const request=parsed.data,choice=issued;
  if(!choice||choice.copying||choice.owner!==event.sender||choice.frame!==event.senderFrame||choice.revision!==request.revision||choice.generation!==context.generation()||choice.searchId!==request.searchId||choice.query!==request.query||choice.group!==(request.group??null)||choice.tone!==request.tone||choice.favouritesOnly!==request.favouritesOnly||!choice.records.has(request.id))return keywordFailure('conflict');
  if(!backend.keywords||!choice.keywords)return keywordFailure('capability-unavailable');
  if(choice.keywords.revision!==request.keywordsRevision||request.keywordsRevision>=Number.MAX_SAFE_INTEGER-1)return keywordFailure('conflict');
  choice.copying=true;const release=context.acquire(),generation=context.generation(),expires=performance.now()+timeoutMs;let expired=false,dispatched=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&issued===choice&&sequence===choice.searchId&&context.active()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation;
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return keywordFailure('cancelled');
   const snapshot=await readKeywords();if(!current())return keywordFailure('cancelled');
   if(snapshot.revision!==request.keywordsRevision||JSON.stringify(snapshot.entries)!==JSON.stringify(choice.keywords!.entries))return keywordFailure('conflict');
   const source=backend.get(request.id);if(!source)return keywordFailure('conflict');const row=project(source);if(row.id!==request.id||row.value!==choice.records.get(request.id)||choice.group!==null&&row.group!==choice.group)return keywordFailure('conflict');
   const entries=snapshot.entries.filter(entry=>entry.id!==request.id);if(request.keywords.length)entries.push({id:request.id,keywords:request.keywords});entries.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);emojiKeywordSnapshotSchema.parse({revision:snapshot.revision,entries});
   if(choice.frecency&&!await freshFrecency(choice.frecency))return keywordFailure('conflict');
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return keywordFailure('cancelled');
   dispatched=true;const result=emojiKeywordSnapshotSchema.parse(await backend.keywords!.write({expectedRevision:snapshot.revision,entries}));
   if(!current()){invalidate(choice);return keywordFailure('deadline-exceeded');}
   if(result.revision!==snapshot.revision+1||JSON.stringify(result.entries)!==JSON.stringify(entries))throw new Error('Unconfirmed keyword save.');
   return emojiKeywordsReplySchema.parse({ok:true,value:{outcome:'updated',revision:request.revision,searchId:request.searchId,query:request.query,group:request.group??null,...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{favouritesOnly:true as const}:{}),id:request.id,keywords:request.keywords,keywordsRevision:result.revision}});
  }catch{return keywordFailure(dispatched?'deadline-exceeded':'capability-unavailable');}finally{invalidate(choice);choice.copying=false;release();}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;invalidate(choice);resolve(keywordFailure(dispatched?'deadline-exceeded':'cancelled'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 const frecencyFailure=(code:Parameters<typeof failure>[0])=>{const reply=failure(code);return {...reply,error:{...reply.error,message:code==='deadline-exceeded'?'Emoji ranking change could not be confirmed. Wait for the pending change, then Reload emoji before another explicit change. Nothing is replayed.':'Emoji ranking is unavailable or stale. Reload emoji before another explicit change.'}};};
 ipc.handle(EMOJI_CHANNELS.frecency,async(event,payload)=>{
  if(!context.trusted(event))return frecencyFailure('permission-denied');const parsed=emojiFrecencyRequestSchema.safeParse(payload);
  if(!parsed.success||parsed.data.revision!==context.revision())return frecencyFailure('invalid-request');
  if(disposed||!context.active()||context.busy())return frecencyFailure('cancelled');
  const request=parsed.data,choice=issued;
  if(!choice||choice.copying||choice.owner!==event.sender||choice.frame!==event.senderFrame||choice.revision!==request.revision||choice.generation!==context.generation()||choice.searchId!==request.searchId||choice.query!==request.query||choice.group!==(request.group??null)||choice.tone!==request.tone||choice.favouritesOnly!==request.favouritesOnly)return frecencyFailure('conflict');
  if(!backend.frecency||!choice.frecency)return frecencyFailure('capability-unavailable');
  if(choice.frecency.revision!==request.frecencyRevision||request.frecencyRevision>=Number.MAX_SAFE_INTEGER-1||request.action==='pause'&&!choice.frecency.enabled||request.action==='resume'&&choice.frecency.enabled)return frecencyFailure('conflict');
  choice.copying=true;const release=context.acquire(),generation=context.generation(),expires=performance.now()+timeoutMs;let expired=false,dispatched=false,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>!expired&&performance.now()<expires&&!disposed&&issued===choice&&sequence===choice.searchId&&context.active()&&context.trusted(event)&&context.revision()===request.revision&&context.generation()===generation;
  const work=(async()=>{try{
   const denied=await context.authorize(event,request.revision);if(denied)return denied;if(!current())return frecencyFailure('cancelled');
   const snapshot=await readFrecency();if(!current())return frecencyFailure('cancelled');if(!sameFrecency(snapshot,choice.frecency!))return frecencyFailure('conflict');
   if(choice.keywords&&!await freshKeywords(choice.keywords))return frecencyFailure('conflict');
   const enabled=request.action==='pause'?false:request.action==='resume'?true:snapshot.enabled,entries=request.action==='reset'?[]:snapshot.entries;
   const revoked=await context.authorize(event,request.revision);if(revoked)return revoked;if(!current())return frecencyFailure('cancelled');
   dispatched=true;const result=emojiFrecencySnapshotSchema.parse(await backend.frecency!.write({expectedRevision:snapshot.revision,enabled,entries}));
   if(!current())return frecencyFailure('deadline-exceeded');
   if(result.revision!==snapshot.revision+1||result.enabled!==enabled||JSON.stringify(result.entries)!==JSON.stringify(entries))throw new Error('Unconfirmed ranking change.');
   return emojiFrecencyReplySchema.parse({ok:true,value:{outcome:'updated',revision:request.revision,searchId:request.searchId,query:request.query,group:request.group??null,...(request.tone?{tone:request.tone}:{}),...(request.favouritesOnly?{favouritesOnly:true as const}:{}),frecencyRevision:result.revision,enabled:result.enabled,entryCount:result.entries.length}});
  }catch{return frecencyFailure(dispatched?'deadline-exceeded':'capability-unavailable');}finally{invalidate(choice);choice.copying=false;release();}})();
  try{return await Promise.race([work,new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{expired=true;invalidate(choice);resolve(frecencyFailure(dispatched?'deadline-exceeded':'cancelled'));},timeoutMs);})]);}finally{clearTimeout(timer);}
 });
 return()=>{disposed=true;issued=undefined;sequence++;for(const channel of Object.values(EMOJI_CHANNELS))ipc.removeHandler(channel);};
}
