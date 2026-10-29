import {expect,it,vi} from 'vitest';
import {createLauncherNotesApi} from './notes.ts';
import {NOTES_LAUNCHER_CHANNELS as C} from '../../../../packages/contracts/src/notes-launcher.ts';
const id='11111111-1111-4111-8111-111111111111',selection={id,revision:3},query={revision:7,query:'Public 雪'};
const summary={...selection,title:'Public note',excerpt:'Public body',pinned:false,hasDraft:true,updatedAt:'2026-10-29T00:00:00.000Z'};
function fixture(){const invoke=vi.fn(async(_channel:string,_payload:unknown):Promise<unknown>=>{void _channel;void _payload;return {ok:false,error:{code:'capability-unavailable',message:'Public unavailable',retryable:false}};});return {invoke,api:createLauncherNotesApi({invoke})};}
it('uses only named bounded query and exact selected identity operations',async()=>{
 const f=fixture();expect(Object.keys(f.api).sort()).toEqual(['openLauncherNote','searchLauncherNotes']);f.invoke.mockResolvedValueOnce({ok:true,value:{...query,records:[summary],hasMore:false}});expect(await f.api.searchLauncherNotes!(query)).toMatchObject({ok:true});expect(f.invoke).toHaveBeenLastCalledWith(C.search,{...query,protocolVersion:1});f.invoke.mockResolvedValueOnce({ok:true,value:{outcome:'opened',selection}});expect(await f.api.openLauncherNote!({revision:7,selection})).toEqual({ok:true,value:{outcome:'opened',selection}});expect(f.invoke).toHaveBeenLastCalledWith(C.open,{protocolVersion:1,revision:7,selection});
});
it('rejects extra source authority, malformed Unicode and query bounds before IPC',async()=>{
 const f=fixture();for(const input of [{...query,path:'/tmp/public'},{...query,query:'x'.repeat(513)},{...query,query:'x\0'},{...query,query:'\ud800'},{...query,revision:0}])expect(await f.api.searchLauncherNotes!(input as never)).toMatchObject({ok:false});for(const input of [{revision:7,selection:{...selection,path:'/tmp/public'}},{revision:7,selection,content:'caller'},{revision:7,selection:{...selection,revision:0}}])expect(await f.api.openLauncherNote!(input as never)).toMatchObject({ok:false});expect(f.invoke).not.toHaveBeenCalled();
});
it.each(['query','catalogue','duplicate','more','order'] as const)('rejects forged search %s receipts and issues no replay',async mode=>{
 const f=fixture(),value={...query,records:[summary],hasMore:false,...(mode==='query'?{query:'other'}:mode==='catalogue'?{revision:8}:mode==='duplicate'?{records:[summary,summary]}:mode==='more'?{hasMore:true}:{records:[summary,{...summary,id:'22222222-2222-4222-8222-222222222222',pinned:true}]})};f.invoke.mockResolvedValueOnce({ok:true,value});expect(await f.api.searchLauncherNotes!(query)).toMatchObject({ok:false,error:{code:'capability-unavailable'}});expect(f.invoke).toHaveBeenCalledTimes(1);
});
it.each(['id','revision','outcome','throw'] as const)('refuses forged Open %s or transport loss with unknown outcome and no replay',async mode=>{
 const f=fixture();if(mode==='throw')f.invoke.mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE'));else f.invoke.mockResolvedValueOnce({ok:true,value:{outcome:mode==='outcome'?'created':'opened',selection:{...selection,...(mode==='id'?{id:'22222222-2222-4222-8222-222222222222'}:mode==='revision'?{revision:4}:{})}}});const reply=await f.api.openLauncherNote!({revision:7,selection});expect(reply).toMatchObject({ok:false,error:{code:'deadline-exceeded',retryable:false}});expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');expect(f.invoke).toHaveBeenCalledTimes(1);
});
it('snapshots exact request selections before waiting and rejects oversized source replies',async()=>{
 const f=fixture();let resolve!:(value:unknown)=>void;f.invoke.mockReturnValueOnce(new Promise(done=>{resolve=done;}));const input={revision:7,selection:{...selection}},pending=f.api.openLauncherNote!(input);input.selection.revision=99;resolve({ok:true,value:{outcome:'opened',selection}});expect(await pending).toMatchObject({ok:true});expect(f.invoke).toHaveBeenCalledWith(C.open,{protocolVersion:1,revision:7,selection});f.invoke.mockResolvedValueOnce({ok:true,value:{...query,records:[{...summary,excerpt:'x'.repeat(1048577)}],hasMore:false}});expect(await f.api.searchLauncherNotes!(query)).toMatchObject({ok:false});
});
