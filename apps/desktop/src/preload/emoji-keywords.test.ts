import {expect,it,vi} from 'vitest';
import {createEmojiApi} from './emoji.ts';
import {EMOJI_CHANNELS,canonicalEmojiId} from '../../../../packages/contracts/src/emoji.ts';
// Synthetic IPC transport; no clipboard/settings/desktop operation is represented.
const row={id:canonicalEmojiId('👩🏽‍💻'),value:'👩🏽‍💻',name:'woman technologist: medium skin tone',group:'People & Body',subgroup:'person-role',version:'4.0'};
const input={revision:2,searchId:3,query:'public café',group:row.group,tone:'medium' as const,favouritesOnly:true as const,id:row.id,keywords:['public café','team 👩🏽‍💻'],keywordsRevision:4};
const receipt={outcome:'updated',...input,keywordsRevision:5};
function fixture(){const invoke=vi.fn<(channel:string,payload:unknown)=>Promise<unknown>>(async()=>({ok:true,value:receipt}));return{invoke,api:createEmojiApi({invoke})};}
it('exposes the frozen fifth named Emoji method and dispatches only the selected-context replacement including clear',async()=>{
 const f=fixture();expect(Object.keys(f.api).sort()).toEqual(['copyEmoji','releaseEmojiSearch','searchEmoji','setEmojiFavourite','setEmojiKeywords']);expect(Object.isFrozen(f.api)).toBe(true);expect(await f.api.setEmojiKeywords!(input)).toEqual({ok:true,value:receipt});expect(f.invoke).toHaveBeenCalledExactlyOnceWith(EMOJI_CHANNELS.keywords,{protocolVersion:1,...input});
 f.invoke.mockResolvedValueOnce({ok:true,value:{...receipt,keywords:[]}});expect(await f.api.setEmojiKeywords!({...input,keywords:[]})).toMatchObject({ok:true,value:{keywords:[]}});expect(f.invoke).toHaveBeenLastCalledWith(EMOJI_CHANNELS.keywords,{protocolVersion:1,...input,keywords:[]});
});
it('rejects invalid phrases, revisions, excess authority and own undefined before invoke',async()=>{
 const f=fixture();for(const patch of [{keywords:null},{keywords:undefined},{keywords:['public','public']},{keywords:['public\u202e']},{keywords:['a'.repeat(65)]},{keywordsRevision:-1},{keywordsRevision:Number.MAX_SAFE_INTEGER},{keywordsRevision:undefined},{tone:undefined},{favouritesOnly:undefined},{entries:[{id:row.id,keywords:['public']}]},{path:'/tmp/public'},{value:row.value},{setting:'emoji.keywords'}])expect(await f.api.setEmojiKeywords!({...input,...patch} as never)).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(f.invoke).not.toHaveBeenCalled();
});
it.each(['revision','searchId','query','group','tone','filter','id','keywords','order','nextRevision','extra','ownUndefined'] as const)('treats forged keyword %s acknowledgement as unknown without replay',async mode=>{
 const f=fixture(),patch=mode==='revision'?{revision:3}:mode==='searchId'?{searchId:4}:mode==='query'?{query:'other'}:mode==='group'?{group:null}:mode==='tone'?{tone:'dark'}:mode==='filter'?{favouritesOnly:undefined}:mode==='id'?{id:canonicalEmojiId('😀')}:mode==='keywords'?{keywords:['different public phrase']}:mode==='order'?{keywords:[...input.keywords].reverse()}:mode==='nextRevision'?{keywordsRevision:6}:mode==='extra'?{entries:[]}:{tone:undefined};f.invoke.mockResolvedValue({ok:true,value:{...receipt,...patch}});const result=await f.api.setEmojiKeywords!(input);expect(result).toMatchObject({ok:false,error:{code:'deadline-exceeded',retryable:false}});expect(f.invoke).toHaveBeenCalledTimes(1);
});
it('rejects missing or extra optional context echoes while accepting an omitted All filter',async()=>{
 const {tone:_,favouritesOnly:__,group:___,...all}=input;void _;void __;void ___;const {tone:____,favouritesOnly:_____,...echo}=receipt;void ____;void _____;
 const f=fixture();f.invoke.mockResolvedValueOnce({ok:true,value:{...echo,group:null}});expect(await f.api.setEmojiKeywords!(all)).toMatchObject({ok:true});f.invoke.mockResolvedValueOnce({ok:true,value:receipt});expect(await f.api.setEmojiKeywords!(all)).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});f.invoke.mockResolvedValueOnce({ok:true,value:{...echo,group:row.group}});expect(await f.api.setEmojiKeywords!(input)).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.invoke).toHaveBeenCalledTimes(3);
});
it('preserves known refusal, redacts unknown exceptions, and never retries malformed or oversized receipts',async()=>{
 const f=fixture(),known={ok:false,error:{code:'conflict',retryable:false,message:'Reload saved keywords.'}};f.invoke.mockResolvedValueOnce(known);expect(await f.api.setEmojiKeywords!(input)).toEqual(known);
 for(const value of [undefined,null,{ok:true,value:{...receipt,keywords:['x'.repeat(1048577)]}}]){f.invoke.mockResolvedValueOnce(value);expect(await f.api.setEmojiKeywords!(input)).toMatchObject({ok:false,error:{code:'deadline-exceeded',retryable:false}});}
 f.invoke.mockRejectedValueOnce(new Error('PUBLIC_PRIVATE_KEYWORD_MARKER'));const reply=await f.api.setEmojiKeywords!(input);expect(reply).toMatchObject({ok:false,error:{code:'deadline-exceeded',retryable:false}});expect(JSON.stringify(reply)).not.toContain('PUBLIC_PRIVATE_KEYWORD_MARKER');expect(f.invoke).toHaveBeenCalledTimes(5);
});
it('requires availability and row keywords together on search, without exposing complete saved entries',async()=>{
 const f=fixture(),search={revision:2,searchId:3,datasetVersion:'17.0',query:input.query,group:null,groups:[{id:row.group,name:row.group,count:1}],keywords:{available:true,revision:4},records:[{...row,customKeywords:input.keywords}]};f.invoke.mockResolvedValueOnce({ok:true,value:search});expect(await f.api.searchEmoji!({revision:2,query:input.query})).toEqual({ok:true,value:search});
 for(const patch of [{keywords:undefined},{keywords:{available:false}},{records:[row]},{records:[{...row,customKeywords:undefined}]},{keywords:{available:true,revision:4,entries:[]}}]){f.invoke.mockResolvedValueOnce({ok:true,value:{...search,...patch}});expect(await f.api.searchEmoji!({revision:2,query:input.query})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});}
 f.invoke.mockResolvedValueOnce({ok:true,value:{...search,keywords:{available:false},records:[row]}});expect(await f.api.searchEmoji!({revision:2,query:input.query})).toMatchObject({ok:true,value:{keywords:{available:false},records:[row]}});expect(f.invoke).toHaveBeenCalledTimes(7);
});
