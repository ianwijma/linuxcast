import {expect,it} from 'vitest';
import {emojiFrecencyInputSchema,emojiFrecencyReplySchema,emojiSearchInputSchema,emojiSearchReplySchema,emojiFrecencySnapshotSchema,parseEmojiFrecencySetting} from '../src/emoji.ts';
const context={revision:1,searchId:2,query:'milk'},state={enabled:true,entries:[{id:'emoji:1f95b',useCount:1,lastUsedAt:'2026-10-29T00:00:00.000Z'}]};
it('keeps main-owned counts, clock and favourite ranking arrays outside renderer search authority',()=>{
 for(const field of ['frecency','entries','now','favouriteIds'])expect(emojiSearchInputSchema.safeParse({revision:1,query:'', [field]:field==='now'?123:[]}).success).toBe(false);
 for(const action of ['pause','resume','reset'])expect(emojiFrecencyInputSchema.safeParse({...context,frecencyRevision:0,action}).success).toBe(true);
 for(const extra of [{action:'copy'},{id:'emoji:1f95b'},{frecencyRevision:-1},{enabled:true},{tone:undefined}])expect(emojiFrecencyInputSchema.safeParse({...context,frecencyRevision:0,action:'pause',...extra}).success).toBe(false);
});
it('allows canonical aggregate state only and preserves explicit paused empty state',()=>{
 expect(parseEmojiFrecencySetting(JSON.stringify(state))).toEqual(state);expect(parseEmojiFrecencySetting('{"enabled":false,"entries":[]}')).toEqual({enabled:false,entries:[]});
 for(const value of ['null',JSON.stringify(state,null,2),JSON.stringify({...state,query:'PRIVATE_QUERY'}),JSON.stringify({...state,entries:[...state.entries,...state.entries]}),JSON.stringify({...state,entries:[{...state.entries[0],lastUsedAt:'not-a-date'}]})])expect(parseEmojiFrecencySetting(value)).toBeUndefined();
 expect(emojiFrecencySnapshotSchema.safeParse({revision:0,...state}).success).toBe(true);
});
it('bounds and closes public metadata and action receipts without exposing usage entries',()=>{
 const reply={ok:true,value:{outcome:'updated',...context,group:null,frecencyRevision:1,enabled:true,entryCount:1}};expect(emojiFrecencyReplySchema.safeParse(reply).success).toBe(true);
 for(const extra of [{entries:state.entries},{entryCount:4097},{frecencyRevision:0},{enabled:'true'}])expect(emojiFrecencyReplySchema.safeParse({...reply,value:{...reply.value,...extra}}).success).toBe(false);
 const result={ok:true,value:{revision:1,searchId:2,datasetVersion:'17.0',query:'',group:null,groups:[],records:[],frecency:{available:true,revision:0,enabled:true,entryCount:0}}};expect(emojiSearchReplySchema.safeParse(result).success).toBe(true);
 for(const metadata of [undefined,{available:true,revision:0,enabled:true,entryCount:0,entries:[]},{available:false,enabled:true}])expect(emojiSearchReplySchema.safeParse({...result,value:{...result.value,frecency:metadata}}).success).toBe(false);
});
