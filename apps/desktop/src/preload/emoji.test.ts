import {expect,it,vi} from 'vitest';
import {createEmojiApi} from './emoji.ts';
import {EMOJI_CHANNELS,canonicalEmojiId} from '../../../../packages/contracts/src/emoji.ts';
const row={id:canonicalEmojiId('👩🏽‍💻'),value:'👩🏽‍💻',name:'woman technologist: medium skin tone',group:'People & Body',subgroup:'person-role',version:'4.0'};
const request={revision:2,query:'coder'},selection={...request,searchId:3,id:row.id};
const search={revision:2,searchId:3,datasetVersion:'17.0',query:request.query,group:null,groups:[{id:row.group,name:row.group,count:2418}],records:[row]};
const copied={outcome:'copied',...selection,group:null,value:row.value};
function fixture(){const invoke=vi.fn<(channel:string,payload:unknown)=>Promise<unknown>>(async()=>({ok:true,value:search}));return {invoke,api:createEmojiApi({invoke})};}
it('exposes only three frozen named methods and refuses excess authority before transport',async()=>{
 const f=fixture();expect(Object.keys(f.api).sort()).toEqual(['copyEmoji','releaseEmojiSearch','searchEmoji']);expect(Object.isFrozen(f.api)).toBe(true);
 for(const extra of [{query:'x'.repeat(513)},{query:'\u202e'},{query:'\ud800'},{revision:0},{path:'/tmp/public'},{provider:'hidden'}])expect(await f.api.searchEmoji!({...request,...extra} as never)).toMatchObject({ok:false,error:{code:'invalid-request'}});
 for(const extra of [{text:'caller clipboard text'},{value:row.value},{searchId:0},{id:'emoji:23'},{ids:[row.id]}])expect(await f.api.copyEmoji!({...selection,...extra} as never)).toMatchObject({ok:false,error:{code:'invalid-request'}});
 expect(await f.api.releaseEmojiSearch!({revision:2,searchId:3,query:'private'} as never)).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(f.invoke).not.toHaveBeenCalled();
});
it('dispatches exact local search, Copy and release envelopes and preserves canonical Unicode',async()=>{
 const f=fixture();expect(await f.api.searchEmoji!(request)).toEqual({ok:true,value:search});expect(f.invoke).toHaveBeenLastCalledWith(EMOJI_CHANNELS.search,{protocolVersion:1,...request});
 f.invoke.mockResolvedValueOnce({ok:true,value:copied});expect(await f.api.copyEmoji!(selection)).toEqual({ok:true,value:copied});expect(f.invoke).toHaveBeenLastCalledWith(EMOJI_CHANNELS.copy,{protocolVersion:1,...selection});
 f.invoke.mockResolvedValueOnce({ok:true,value:{outcome:'released',searchId:3}});expect(await f.api.releaseEmojiSearch!({revision:2,searchId:3})).toMatchObject({ok:true});expect(f.invoke).toHaveBeenLastCalledWith(EMOJI_CHANNELS.release,{protocolVersion:1,revision:2,searchId:3});expect(f.invoke).toHaveBeenCalledTimes(3);
});
it('rejects forged search identity, category, pages and private extra fields without effects',async()=>{
 for(const patch of [{revision:3},{query:'wrong'},{group:row.group},{records:[row,row]},{datasetVersion:'latest'},{records:[{...row,value:'👩‍💻'}]},{raw:'SYNTHETIC_PRIVATE'}]){const f=fixture();f.invoke.mockResolvedValue({ok:true,value:{...search,...patch}});const reply=await f.api.searchEmoji!(request);expect(reply).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(f.invoke).toHaveBeenCalledTimes(1);}
});
it.each(['revision','searchId','query','group','id','value','outcome','extra'] as const)('treats forged Copy %s as unknown with no automatic replay',async mode=>{
 const f=fixture(),patch=mode==='revision'?{revision:3}:mode==='searchId'?{searchId:4}:mode==='query'?{query:'wrong'}:mode==='group'?{group:row.group}:mode==='id'?{id:canonicalEmojiId('😀'),value:'😀'}:mode==='value'?{value:'👩‍💻'}:mode==='outcome'?{outcome:'pasted'}:{private:'SYNTHETIC_PRIVATE'};f.invoke.mockResolvedValue({ok:true,value:{...copied,...patch}});
 const reply=await f.api.copyEmoji!(selection);expect(reply).toMatchObject({ok:false,error:{code:'deadline-exceeded',retryable:false}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(f.invoke).toHaveBeenCalledTimes(1);
});
it('preserves known unsupported refusals, redacts exceptions and refuses malformed/oversized transport results',async()=>{
 const f=fixture(),refusal={ok:false,error:{code:'capability-unavailable',message:'Clipboard unavailable.',retryable:false}};f.invoke.mockResolvedValueOnce(refusal);expect(await f.api.copyEmoji!(selection)).toEqual(refusal);
 for(const value of [undefined,{ok:true,value:{...copied,value:'x'.repeat(1048577)}},{ok:true,value:null}]){f.invoke.mockResolvedValueOnce(value);expect(await f.api.copyEmoji!(selection)).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});}
 f.invoke.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_QUERY'));const result=await f.api.copyEmoji!(selection);expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE_QUERY');expect(await f.api.searchEmoji!(request)).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
});
it('does not accept a release acknowledgement for another issued search',async()=>{
 const f=fixture();f.invoke.mockResolvedValueOnce({ok:true,value:{outcome:'released',searchId:4}});expect(await f.api.releaseEmojiSearch!({revision:2,searchId:3})).toMatchObject({ok:false});expect(f.invoke).toHaveBeenCalledTimes(1);
});

it('rejects invalid tone enum, own undefined and unknown tone properties before dispatch',async()=>{
 const f=fixture();for(const tone of [null,undefined,'all','Light','medium_dark',0,{},['medium']]){expect(await f.api.searchEmoji!({...request,tone} as never)).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(await f.api.copyEmoji!({...selection,tone} as never)).toMatchObject({ok:false,error:{code:'invalid-request'}});}
 expect(await f.api.searchEmoji!({...request,skinTone:'medium'} as never)).toMatchObject({ok:false,error:{code:'invalid-request'}});expect(f.invoke).not.toHaveBeenCalled();
});
it('preserves tone presence and exact canonical values for All, unmodified and each modifier',async()=>{
 for(const [tone,value] of [[undefined,'👩🏽‍💻'],['unmodified','👩‍💻'],['light','👍🏻'],['medium-light','👍🏼'],['medium','👍🏽'],['medium-dark','👍🏾'],['dark','👍🏿']] as const){
  const f=fixture(),record={...row,id:canonicalEmojiId(value),value},filter=tone?{tone}:{},input={...request,...filter},copyInput={...selection,...filter,id:record.id};
  f.invoke.mockResolvedValueOnce({ok:true,value:{...search,...filter,records:[record]}});expect(await f.api.searchEmoji!(input)).toEqual({ok:true,value:{...search,...filter,records:[record]}});expect(f.invoke).toHaveBeenLastCalledWith(EMOJI_CHANNELS.search,{protocolVersion:1,...input});expect(Object.hasOwn(f.invoke.mock.calls[0]![1] as object,'tone')).toBe(tone!==undefined);
  const receipt={...copied,...filter,id:record.id,value:record.value};f.invoke.mockResolvedValueOnce({ok:true,value:receipt});expect(await f.api.copyEmoji!(copyInput)).toEqual({ok:true,value:receipt});expect(f.invoke).toHaveBeenLastCalledWith(EMOJI_CHANNELS.copy,{protocolVersion:1,...copyInput});
 }
});
it.each(['missing','wrong','extra','own-undefined'] as const)('rejects %s tone echoes in search and Copy even when the mixed sequence fits both filters',async mode=>{
 const value='🫱🏻‍🫲🏿',record={...row,id:canonicalEmojiId(value),value},requested=mode==='missing'||mode==='wrong'?{tone:'light' as const}:{},echo=mode==='wrong'?{tone:'dark'}:mode==='extra'?{tone:'light'}:mode==='own-undefined'?{tone:undefined}:{};
 const f=fixture();f.invoke.mockResolvedValueOnce({ok:true,value:{...search,...echo,records:[record]}});expect(await f.api.searchEmoji!({...request,...requested})).toMatchObject({ok:false,error:{code:'capability-unavailable'}});
 f.invoke.mockResolvedValueOnce({ok:true,value:{...copied,...echo,id:record.id,value}});expect(await f.api.copyEmoji!({...selection,...requested,id:record.id})).toMatchObject({ok:false,error:{code:'deadline-exceeded',retryable:false}});expect(f.invoke).toHaveBeenCalledTimes(2);
});
it('rejects a selected-tone reply whose canonical row has a different modifier without stripping or retargeting it',async()=>{
 const f=fixture();f.invoke.mockResolvedValueOnce({ok:true,value:{...search,tone:'light'}});expect(await f.api.searchEmoji!({...request,tone:'light'})).toMatchObject({ok:false});f.invoke.mockResolvedValueOnce({ok:true,value:{...copied,tone:'light'}});expect(await f.api.copyEmoji!({...selection,tone:'light'})).toMatchObject({ok:false,error:{code:'deadline-exceeded'}});expect(f.invoke).toHaveBeenCalledTimes(2);
});
