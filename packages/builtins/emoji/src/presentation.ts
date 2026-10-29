import {emojiSearchInputSchema,emojiSearchReplySchema,emojiCopyReplySchema,emojiFavouriteReplySchema,emojiToneSchema} from '@linuxcast/contracts';
import type {EmojiTone,EmojiApi,EmojiSearchValue,EmojiRow,ViewModel} from '@linuxcast/contracts';
import type {ActionIntent,ViewSession} from '@linuxcast/ui/views';
const COPY='emoji:copy',RELOAD='emoji:reload',CATEGORY='emoji:category',APPLY='emoji:apply-category',CANCEL='emoji:cancel-category',COMPACT='emoji:compact',COMFORTABLE='emoji:comfortable',BACK='emoji:back';
const FAVOURITE='emoji:favourite',SHOW_FAVOURITES='emoji:show-favourites',SHOW_ALL='emoji:show-all';
const FAVOURITES_UNAVAILABLE='Favourites are unavailable. Reload emoji to reconnect to local storage; ordinary search and Copy emoji remain available.';
const FAVOURITE_UNKNOWN='The favourite update outcome is unknown. Wait for any pending update to settle, then Reload emoji or enter a new search to check the saved state before explicitly adding or removing a favourite again. Nothing will be replayed.';
const TONE='emoji:tone',APPLY_TONE='emoji:apply-tone',CANCEL_TONE='emoji:cancel-tone';
const TONES=[{value:'*',label:'All tones'},{value:'unmodified',label:'Unmodified'},{value:'light',label:'Light'},{value:'medium-light',label:'Medium-light'},{value:'medium',label:'Medium'},{value:'medium-dark',label:'Medium-dark'},{value:'dark',label:'Dark'}];
const DISCLOSURE='Offline Unicode 17.0 · Up to 100 matches; refine your search. Copy only; nothing is pasted automatically.';
const UNKNOWN='The copy outcome is unknown. Check your clipboard. Wait for any pending copy to settle, then Reload emoji or enter a new search before choosing Copy emoji again. Nothing will be replayed.';
type FavouriteRefresh={status:Status;revision:number;id:string;favourite:boolean};
type Status={kind:'info'|'warning'|'error';message:string};
type Search={generation:number;query:string;group:string|null;tone:EmojiTone|undefined;favouritesOnly:boolean;controller:AbortController;viewRevision:number;received?:EmojiSearchValue};
type Favourite=Copy&{favourite:boolean;favouritesRevision:number};
type Copy={generation:number;data:EmojiSearchValue;row:EmojiRow;controller:AbortController;viewRevision:number;queryRevision:number};
/** Renderer presentation accepts bounded metadata only. Main owns the catalogue,
 * canonical clipboard value, issued search authority and actual write lifetime. */
export class EmojiFlow {
 #session:ViewSession;#api:EmojiApi;#revision:number;#gridId:string;#categoryId:string;#toneId:string;#viewRevision=0;#opened=false;#disposed=false;#categoryOpen=false;#toneOpen=false;
 #origin:{viewId:string;query:string;selection:string|null}|undefined;#query='';#favouritesOnly=false;#group:string|null=null;#tone:EmojiTone|undefined;#density:'compact'|'comfortable'='comfortable';#data:EmojiSearchValue|undefined;#groups:EmojiSearchValue['groups']=[];#preferred:string|null=null;#status:Status|undefined;#unknown=false;#unknownKind:'copy'|'favourite'='copy';#generation=0;
 #search:Search|undefined;#copy:Copy|undefined;#actualCopy:object|undefined;#favourite:Favourite|undefined;#actualFavourite:object|undefined;#released=new Set<number>();#unsubscribe:()=>void;
 constructor({session,api,viewId,revision}:{session:ViewSession;api:EmojiApi;viewId:string;revision:number}){
  this.#session=session;this.#api=api;this.#revision=revision;this.#gridId=`${viewId}-grid`;this.#categoryId=`${viewId}-category`;this.#toneId=`${viewId}-tone`;
  this.#unsubscribe=session.subscribe(()=>{
   if(!this.#opened||this.#disposed)return;
   const grid=this.#frame();
   if(!grid||!this.#originCurrent()){this.#abandon();return;}
   if(grid.query!==this.#query){this.#query=grid.query;this.#replace();return;}
   if(this.#copy&&!this.#copyContext(this.#copy,false)){this.#copy.controller.abort();this.#copy=undefined;this.#unknown=true;this.#unknownKind='copy';this.#status={kind:'error',message:UNKNOWN};this.#publish();}
   if(this.#favourite&&!this.#favouriteContext(this.#favourite,false)){this.#favourite.controller.abort();this.#favourite=undefined;this.#unknown=true;this.#unknownKind='favourite';this.#status={kind:'error',message:FAVOURITE_UNKNOWN};this.#publish();}
  });
 }
 get active(){return this.#opened&&!this.#disposed&&!!this.#frame();}
 owns(viewId:string){return viewId===this.#gridId||viewId===this.#categoryId||viewId===this.#toneId;}
 #frame(){return this.#session.getSnapshot().frames.find(frame=>frame.view.viewId===this.#gridId);}
 #top(){return this.#session.getSnapshot().frames.at(-1);}
 #originCurrent(){const root=this.#session.getSnapshot().frames[0];return !!this.#origin&&root?.view.viewId===this.#origin.viewId&&root.query===this.#origin.query&&root.selection===this.#origin.selection;}
 #gridCurrent(){return this.active&&this.#originCurrent()&&this.#top()?.view.viewId===this.#gridId&&!this.#categoryOpen&&!this.#toneOpen;}
 open(fromViewId:string){
  if(this.#disposed||this.#opened||this.#top()?.view.viewId!==fromViewId)return;
  const root=this.#session.getSnapshot().frames[0]!;this.#origin={viewId:root.view.viewId,query:root.query,selection:root.selection};this.#query='';this.#favouritesOnly=false;this.#group=null;this.#tone=undefined;this.#groups=[];this.#status=undefined;this.#preferred=null;this.#unknown=false;this.#unknownKind='copy';this.#opened=true;
  if(!this.#session.navigate({protocolVersion:1,kind:'push',fromViewId,view:this.#grid()})){this.#opened=false;return;}void this.#load();
 }
 query(viewId:string,query:string){if(!this.#gridCurrent()||viewId!==this.#gridId||!this.#originCurrent())return;const frame=this.#frame();if(frame?.query!==query)this.#session.setQuery(viewId,query);else if(this.#query!==query){this.#query=query;this.#replace();}}
 #release(searchId:number){
  if(this.#released.has(searchId)||this.#data?.searchId===searchId||!this.#api.releaseEmojiSearch)return;this.#released.add(searchId);
  try{void this.#api.releaseEmojiSearch({revision:this.#revision,searchId}).catch(()=>{});}catch{/* Main also expires owned search handles; release has no clipboard effect. */}
 }
 #dropData(){const old=this.#data;this.#data=undefined;if(old)this.#release(old.searchId);}
 #abandon(){++this.#generation;this.#search?.controller.abort();this.#search=undefined;if(this.#copy){this.#copy.controller.abort();this.#copy=undefined;this.#unknown=true;this.#unknownKind='copy';}if(this.#favourite){this.#favourite.controller.abort();this.#favourite=undefined;this.#unknown=true;this.#unknownKind='favourite';}this.#dropData();}
 #replace(success?:FavouriteRefresh){this.#preferred=this.#frame()?.selection??null;this.#abandon();this.#status=undefined;if(this.#gridCurrent())void this.#load(success);}
 #pendingEffect(){return !!this.#copy||!!this.#actualCopy||!!this.#favourite||!!this.#actualFavourite;}
 #unknownMessage(){return this.#unknownKind==='favourite'?FAVOURITE_UNKNOWN:UNKNOWN;}
 #favouriteUnavailable(){return this.#data?.favourites?.available!==true?FAVOURITES_UNAVAILABLE:!this.#api.setEmojiFavourite?'Saving favourites is unavailable. Reopen Linuxcast to reconnect.':undefined;}
 #disabledFavourite(){return this.#pendingEffect()?'Wait for the current request to settle.':this.#search?'Wait for emoji search to finish.':this.#unknown?this.#unknownMessage():this.#favouriteUnavailable();}
 #disabledCopy(){return this.#pendingEffect()?'Wait for the current clipboard or favourite request to settle.':this.#search?'Wait for emoji search to finish.':this.#unknown?this.#unknownMessage():!this.#api.copyEmoji?'Clipboard copying is unavailable. Reopen Linuxcast to reconnect.':!this.#data?'Reload emoji to choose a current item.':undefined;}
 #grid():ViewModel{
  const busy=!!this.#search||!!this.#copy||!!this.#favourite,disabled=this.#disabledCopy(),records=this.#data?.records??[],categoryReason=busy||this.#pendingEffect()?'Wait for the current request to settle.':!this.#groups.length?'Load emoji before choosing a category.':undefined,status=this.#status??{kind:this.#favouriteUnavailable()?'warning' as const:'info' as const,message:!this.#api.copyEmoji?`Clipboard copying is unavailable. Reopen Linuxcast to reconnect. ${DISCLOSURE}`:this.#unknown?this.#unknownMessage():`${DISCLOSURE}${this.#favouriteUnavailable()?` ${this.#favouriteUnavailable()}`:''}`};
  return{protocolVersion:1,viewId:this.#gridId,revision:++this.#viewRevision,kind:'grid',title:'Emoji',density:this.#density,images:[],loading:busy,search:{query:this.#query,placeholder:'Search emoji names, categories or Unicode…',mode:'extension'},
   ...(this.#preferred&&records.some(row=>row.id===this.#preferred)?{selectedId:this.#preferred}:{}),
   // Preserve the existing read-only Ctrl+Enter secondary action; favourite writes stay in Actions.
   sections:[{id:'emoji-results',title:`${this.#favouritesOnly?'Favourites · ':''}${this.#group??'All categories'} · Skin tone: ${this.#toneLabel()} · Up to 100 matches; refine your search`,items:records.map(row=>({id:row.id,title:row.name,subtitle:row.subgroup,icon:{kind:'glyph' as const,value:row.value},...(row.favourite===true?{tags:[{text:'Favourite',tone:'neutral' as const}]}:{}),actions:[{id:COPY,title:'Copy emoji',kind:'invoke' as const,effect:'write' as const,...reason(disabled)},{id:CATEGORY,title:'Choose category',kind:'invoke' as const,effect:'read' as const,...reason(categoryReason)},{id:FAVOURITE,title:row.favourite===true?'Remove from favourites':'Add to favourites',kind:'invoke' as const,effect:'write' as const,...reason(this.#disabledFavourite())}]}))}],
   empty:{title:this.#search?'Loading emoji…':!this.#api.searchEmoji||!this.#api.releaseEmojiSearch?'Emoji unavailable':this.#favouritesOnly?'No favourite emoji match':'No matching emoji',description:`${this.#favouritesOnly?'Choose Show all emoji to browse the full catalogue. ':''}Search the offline catalogue or choose another category. At most 100 results are shown. Nothing is copied or pasted automatically.`},
   status:{...status,message:`${this.#favouritesOnly?'Favourites only. ':''}Skin tone: ${this.#toneLabel()}. ${status.message}`},
   actions:[{id:this.#favouritesOnly?SHOW_ALL:SHOW_FAVOURITES,title:this.#favouritesOnly?'Show all emoji':'Show favourites',kind:'invoke',effect:'read',...reason(busy||this.#pendingEffect()?'Wait for the current request to settle.':!this.#favouritesOnly&&this.#data?.favourites?.available!==true?FAVOURITES_UNAVAILABLE:undefined)},
    {id:CATEGORY,title:'Choose category',kind:'invoke',effect:'read',...reason(categoryReason)},
    {id:TONE,title:'Choose skin tone',kind:'invoke',effect:'read',...reason(busy||this.#pendingEffect()?'Wait for the current request to settle.':!this.#groups.length?'Load emoji before choosing a skin tone.':undefined)},
    {id:this.#density==='comfortable'?COMPACT:COMFORTABLE,title:this.#density==='comfortable'?'Use compact grid':'Use comfortable grid',kind:'invoke',effect:'read',...reason(busy||this.#pendingEffect()?'Wait for the current request to settle.':undefined)},
    {id:RELOAD,title:'Reload emoji',kind:'invoke',effect:'read',...reason(busy||this.#pendingEffect()?'Wait for the current request to settle.':!this.#api.searchEmoji||!this.#api.releaseEmojiSearch?'Emoji search is unavailable. Reopen Linuxcast to reconnect.':undefined)},
    {id:BACK,title:'Back',kind:'invoke',effect:'read'}]};
 }
 #publish(){if(this.active)this.#session.update(this.#gridId,{protocolVersion:1,kind:'snapshot',view:this.#grid()});}
 #searchCurrent(context:Search){const frame=this.#top();return this.#gridCurrent()&&this.#search===context&&context.generation===this.#generation&&!context.controller.signal.aborted&&this.#query===context.query&&this.#group===context.group&&this.#tone===context.tone&&this.#favouritesOnly===context.favouritesOnly&&frame?.query===context.query&&frame.view.revision===context.viewRevision;}
 async #load(success?:FavouriteRefresh){
  if(!this.#gridCurrent())return;const input={revision:this.#revision,query:this.#query,...(this.#group?{group:this.#group}:{}),...(this.#tone?{tone:this.#tone}:{}),...(this.#favouritesOnly?{favouritesOnly:true as const}:{})};
  if(!emojiSearchInputSchema.safeParse(input).success){this.#status={kind:'error',message:'Keep searches to 512 characters and 2048 UTF-8 bytes, without control or directional formatting characters.'};this.#publish();return;}
  if(!this.#api.searchEmoji||!this.#api.releaseEmojiSearch){this.#status={kind:'error',message:'Emoji search is unavailable. Reopen Linuxcast to reconnect.'};this.#publish();return;}
  const context:Search={generation:++this.#generation,query:this.#query,group:this.#group,tone:this.#tone,favouritesOnly:this.#favouritesOnly,controller:new AbortController(),viewRevision:this.#viewRevision+1};this.#search=context;this.#status={kind:'info',message:'Searching the offline emoji catalogue…'};this.#publish();
  try{
   if(!this.#searchCurrent(context))return;
   const actual=this.#api.searchEmoji(input).then(reply=>{const parsed=emojiSearchReplySchema.safeParse(reply);if(parsed.success&&parsed.data.ok&&this.#matches(parsed.data.value,context)){context.received=parsed.data.value;if(!this.#searchCurrent(context))this.#release(parsed.data.value.searchId);}return reply;});
   const parsed=emojiSearchReplySchema.safeParse(await bounded(actual,context.controller.signal));if(!this.#searchCurrent(context)){if(parsed.success&&parsed.data.ok&&this.#matches(parsed.data.value,context))this.#release(parsed.data.value.searchId);return;}
   if(!parsed.success||!parsed.data.ok||!this.#matches(parsed.data.value,context))throw new Error('unconfirmed');
   let completedStatus=success?.status;if(success){const metadata=parsed.data.value.favourites,row=parsed.data.value.records.find(row=>row.id===success.id),contradiction=row?row.favourite!==success.favourite:success.favourite;if(metadata?.available!==true||metadata.revision<success.revision||metadata.revision===success.revision&&contradiction)throw new Error('stale favourites');if(metadata.revision>success.revision&&contradiction)completedStatus={kind:'info',message:'Favourites changed again. Showing the latest saved state. Nothing was copied or pasted.'};}
   this.#data=parsed.data.value;this.#groups=parsed.data.value.groups;this.#unknown=!!this.#actualCopy||!!this.#actualFavourite||this.#unknown&&this.#unknownKind==='favourite'&&parsed.data.value.favourites?.available!==true;this.#status=this.#unknown?{kind:'warning',message:this.#unknownMessage()}:completedStatus;
  }catch{if(this.#searchCurrent(context))this.#status={kind:'error',message:this.#unknown?this.#unknownMessage():'Emoji could not be loaded. Reload emoji or enter a new search; nothing was copied.'};}
  finally{if(context.received&&this.#data?.searchId!==context.received.searchId)this.#release(context.received.searchId);if(this.#search===context){const current=this.#searchCurrent(context);this.#search=undefined;if(current)this.#publish();}}
 }
 #matches(value:EmojiSearchValue,context:Search){return value.revision===this.#revision&&value.query===context.query&&value.group===context.group&&matchesToneEcho(value,context.tone)&&matchesFavouritesEcho(value,context.favouritesOnly);}
 #category():ViewModel{return{protocolVersion:1,viewId:this.#categoryId,revision:++this.#viewRevision,kind:'form',title:'Emoji category',fields:[{id:'group',kind:'enum',title:'Category',required:true,value:this.#group??'*',description:'Choose an offline Unicode category. Cancel preserves the current search and selection.',options:[{value:'*',label:'All categories'},...this.#groups.map(group=>({value:group.id,label:`${group.name} (${group.count})`}))]}],submitActionId:APPLY,cancelActionId:CANCEL,actions:[{id:APPLY,title:'Apply category',kind:'invoke',effect:'read'},{id:CANCEL,title:'Cancel',kind:'invoke',effect:'read'}]};}
 #toneLabel(){return TONES.find(option=>option.value===(this.#tone??'*'))!.label;}
 #toneForm():ViewModel{return{protocolVersion:1,viewId:this.#toneId,revision:++this.#viewRevision,kind:'form',title:'Skin tone',fields:[{id:'tone',kind:'enum',title:'Skin tone',required:true,value:this.#tone??'*',description:'All tones includes every sequence. Unmodified has no skin-tone modifier. Other choices filter sequences containing the chosen modifier; mixed-tone sequences may match more than one choice. Cancel preserves the current search, category and selection. Nothing is copied automatically.',options:TONES}],submitActionId:APPLY_TONE,cancelActionId:CANCEL_TONE,actions:[{id:APPLY_TONE,title:'Apply skin tone',kind:'invoke',effect:'read'},{id:CANCEL_TONE,title:'Cancel',kind:'invoke',effect:'read'}]};}
 async handle(intent:ActionIntent){
  const top=this.#top();if(!this.active||!this.#originCurrent()||!top||!this.owns(intent.viewId)||top.view.viewId!==intent.viewId||top.view.revision!==intent.revision||Object.keys(intent).some(key=>!['viewId','revision','actionId','itemId','values'].includes(key)))return;
  if(intent.viewId===this.#toneId){
   if(!this.#toneOpen||intent.itemId!==undefined||top.selection!==null)return;
   if(intent.actionId===CANCEL_TONE&&intent.values===undefined){this.#session.pop();return;}
   if(intent.actionId!==APPLY_TONE||!intent.values||Object.keys(intent.values).length!==1||typeof intent.values.tone!=='string')return;
   const parsed=intent.values.tone==='*'?undefined:emojiToneSchema.safeParse(intent.values.tone);if(parsed&&!parsed.success)return;
   const tone=parsed?.data;if(tone===this.#tone){this.#session.pop();return;}this.#tone=tone;this.#session.pop();if(this.#gridCurrent())this.#replace();return;
  }
  if(intent.viewId===this.#categoryId){
   if(!this.#categoryOpen||intent.itemId!==undefined||top.selection!==null)return;
   if(intent.actionId===CANCEL&&intent.values===undefined){this.#session.pop();return;}
   if(intent.actionId!==APPLY||!intent.values||Object.keys(intent.values).length!==1||typeof intent.values.group!=='string'||!['*',...this.#groups.map(group=>group.id)].includes(intent.values.group))return;
   const group=intent.values.group==='*'?null:intent.values.group;if(group===this.#group){this.#session.pop();return;}this.#group=group;this.#session.pop();if(this.#gridCurrent())this.#replace();return;
  }
  if(!this.#gridCurrent()||intent.values!==undefined||intent.itemId!==(top.selection??undefined))return;
  const action=top.view.actions?.find(action=>action.id===intent.actionId);if(action?.disabledReason)return;
  if(intent.actionId===BACK){this.#session.pop();return;}
  if(intent.actionId===SHOW_FAVOURITES||intent.actionId===SHOW_ALL){if(this.#pendingEffect()||this.#search||intent.actionId===SHOW_FAVOURITES&&this.#data?.favourites?.available!==true)return;this.#favouritesOnly=intent.actionId===SHOW_FAVOURITES;this.#replace();return;}
  if(intent.actionId===FAVOURITE){await this.#saveFavourite(top);return;}
  if(intent.actionId===RELOAD){if(!this.#pendingEffect()&&!this.#search)this.#replace();return;}
  if(intent.actionId===TONE){if(this.#pendingEffect()||this.#search||!this.#groups.length)return;this.#toneOpen=true;if(!this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#gridId,view:this.#toneForm()}))this.#toneOpen=false;return;}
  if(intent.actionId===CATEGORY){if(this.#pendingEffect()||this.#search||!this.#groups.length)return;this.#categoryOpen=true;if(!this.#session.navigate({protocolVersion:1,kind:'push',fromViewId:this.#gridId,view:this.#category()}))this.#categoryOpen=false;return;}
  if(intent.actionId===COMPACT||intent.actionId===COMFORTABLE){if(this.#pendingEffect()||this.#search)return;this.#density=intent.actionId===COMPACT?'compact':'comfortable';this.#preferred=top.selection;this.#publish();return;}
  if(intent.actionId!==COPY||this.#disabledCopy()||!this.#data||!this.#api.copyEmoji)return;const row=this.#data.records.find(row=>row.id===top.selection);if(!row)return;
  const context:Copy={generation:this.#generation,data:this.#data,row,controller:new AbortController(),viewRevision:this.#viewRevision+1,queryRevision:top.queryRevision};this.#copy=context;this.#status={kind:'info',message:`Copying ${row.name}…`};this.#publish();
  try{
   if(!this.#copyContext(context))return;const actualToken={};this.#actualCopy=actualToken;
   let actual:Promise<unknown>;try{actual=this.#api.copyEmoji({revision:this.#revision,searchId:context.data.searchId,query:context.data.query,...(context.data.group?{group:context.data.group}:{}),...(context.data.tone?{tone:context.data.tone}:{}),...(context.data.favouritesOnly?{favouritesOnly:true as const}:{}),id:row.id});}catch{this.#actualCopy=undefined;throw new Error('unconfirmed');}
   const settled=()=>{if(this.#actualCopy===actualToken){this.#actualCopy=undefined;if(this.active&&!this.#copy&&!this.#search&&this.#gridCurrent())this.#publish();}};void actual.then(settled,settled);
   const parsed=emojiCopyReplySchema.safeParse(await bounded(actual,context.controller.signal));if(!this.#copyContext(context))return;
   if(!parsed.success)throw new Error('receipt');if(!parsed.data.ok){if(['invalid-request','capability-unavailable','permission-denied','conflict','cancelled'].includes(parsed.data.error.code)){this.#status={kind:'error',message:'The emoji was not copied. Check clipboard access or Reload emoji, then choose Copy emoji explicitly. Nothing is pasted automatically.'};return;}throw new Error('unknown');}
   const value=parsed.data.value;if(value.revision!==this.#revision||value.searchId!==context.data.searchId||value.query!==context.data.query||value.group!==context.data.group||!matchesToneEcho(value,context.data.tone)||!matchesFavouritesEcho(value,context.data.favouritesOnly===true)||value.id!==row.id||value.value!==row.value)throw new Error('receipt');
   this.#status={kind:'info',message:`Copied ${row.name}. Paste it explicitly where you need it; nothing was inserted automatically.`};
  }catch{if(this.#copyContext(context)){this.#unknown=true;this.#unknownKind='copy';this.#status={kind:'error',message:UNKNOWN};}}
  finally{if(this.#copy===context){const current=this.#copyContext(context);this.#copy=undefined;if(current)this.#publish();else this.#unknown=true;}}
 }
 async #saveFavourite(top:{selection:string|null;queryRevision:number}){
  if(this.#disabledFavourite()||!this.#data||this.#data.favourites?.available!==true||!this.#api.setEmojiFavourite)return;
  const row=this.#data.records.find(row=>row.id===top.selection);if(!row||typeof row.favourite!=='boolean')return;
  const context:Favourite={generation:this.#generation,data:this.#data,row,favourite:!row.favourite,favouritesRevision:this.#data.favourites.revision,controller:new AbortController(),viewRevision:this.#viewRevision+1,queryRevision:top.queryRevision};this.#favourite=context;this.#status={kind:'info',message:`${context.favourite?'Adding':'Removing'} ${row.name} ${context.favourite?'to':'from'} favourites…`};this.#publish();
  try{
   if(!this.#favouriteContext(context))return;const token={};this.#actualFavourite=token;
   let actual:Promise<unknown>;try{actual=this.#api.setEmojiFavourite({revision:this.#revision,searchId:context.data.searchId,query:context.data.query,...(context.data.group?{group:context.data.group}:{}),...(context.data.tone?{tone:context.data.tone}:{}),...(context.data.favouritesOnly?{favouritesOnly:true as const}:{}),id:row.id,favourite:context.favourite,favouritesRevision:context.favouritesRevision});}catch{this.#actualFavourite=undefined;throw new Error('unconfirmed');}
   const settled=()=>{if(this.#actualFavourite===token){this.#actualFavourite=undefined;if(this.active&&!this.#favourite&&!this.#search&&this.#gridCurrent())this.#publish();}};void actual.then(settled,settled);
   const parsed=emojiFavouriteReplySchema.safeParse(await bounded(actual,context.controller.signal));if(!this.#favouriteContext(context))return;
   if(!parsed.success)throw new Error('receipt');if(!parsed.data.ok){if(['invalid-request','capability-unavailable','permission-denied','conflict','cancelled'].includes(parsed.data.error.code)){this.#status={kind:'error',message:'The favourite was not updated. Reload emoji to check local storage, then choose Add to favourites or Remove from favourites explicitly.'};return;}throw new Error('unknown');}
   const value=parsed.data.value;if(value.revision!==this.#revision||value.searchId!==context.data.searchId||value.query!==context.data.query||value.group!==context.data.group||!matchesToneEcho(value,context.data.tone)||!matchesFavouritesEcho(value,context.data.favouritesOnly===true)||value.id!==row.id||value.favourite!==context.favourite||value.favouritesRevision!==context.favouritesRevision+1)throw new Error('receipt');
   this.#favourite=undefined;this.#replace({status:{kind:'info',message:`${context.favourite?'Added':'Removed'} ${row.name} ${context.favourite?'to':'from'} favourites. Nothing was copied or pasted.`},revision:value.favouritesRevision,id:row.id,favourite:context.favourite});
  }catch{if(this.#favouriteContext(context)){this.#unknown=true;this.#unknownKind='favourite';this.#status={kind:'error',message:FAVOURITE_UNKNOWN};}}
  finally{if(this.#favourite===context){const current=this.#favouriteContext(context);this.#favourite=undefined;if(current)this.#publish();else{this.#unknown=true;this.#unknownKind='favourite';}}}
 }
 #favouriteContext(context:Favourite,revision=true){const top=this.#top();return this.#gridCurrent()&&this.#favourite===context&&!context.controller.signal.aborted&&this.#generation===context.generation&&this.#data===context.data&&top?.query===context.data.query&&this.#group===context.data.group&&this.#tone===context.data.tone&&this.#favouritesOnly===(context.data.favouritesOnly===true)&&top.selection===context.row.id&&top.queryRevision===context.queryRevision&&(!revision||top.view.revision===context.viewRevision);}
 #copyContext(context:Copy,revision=true){const top=this.#top();return this.#gridCurrent()&&this.#copy===context&&!context.controller.signal.aborted&&this.#generation===context.generation&&this.#data===context.data&&top?.query===context.data.query&&this.#group===context.data.group&&this.#tone===context.data.tone&&this.#favouritesOnly===(context.data.favouritesOnly===true)&&top.selection===context.row.id&&top.queryRevision===context.queryRevision&&(!revision||top.view.revision===context.viewRevision);}
 closed(viewId:string){if(!this.owns(viewId))return false;if(viewId===this.#categoryId){this.#categoryOpen=false;return true;}if(viewId===this.#toneId){this.#toneOpen=false;return true;}this.#opened=false;this.#categoryOpen=false;this.#toneOpen=false;this.#tone=undefined;this.#favouritesOnly=false;this.#abandon();this.#origin=undefined;return true;}
 dispose(){if(this.#disposed)return;this.#disposed=true;this.#opened=false;this.#categoryOpen=false;this.#toneOpen=false;this.#tone=undefined;this.#favouritesOnly=false;this.#unsubscribe();this.#abandon();this.#origin=undefined;}
}
function matchesToneEcho(value:{tone?:EmojiTone|undefined},tone:EmojiTone|undefined){return tone===undefined?!Object.hasOwn(value,'tone'):Object.hasOwn(value,'tone')&&value.tone===tone;}
function matchesFavouritesEcho(value:{favouritesOnly?:true|undefined},only:boolean){return only?Object.hasOwn(value,'favouritesOnly')&&value.favouritesOnly===true:!Object.hasOwn(value,'favouritesOnly');}
function reason(message:string|undefined){return message?{disabledReason:message}:{};}
function bounded<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{const finish=(run:()=>void)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);run();},abort=()=>finish(()=>reject(new Error('cancelled'))),timer=setTimeout(()=>finish(()=>reject(new Error('deadline'))),5000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}void promise.then(value=>finish(()=>resolve(value)),()=>finish(()=>reject(new Error('unavailable'))));});}
