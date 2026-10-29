import {expect,it,vi} from 'vitest';
import {emojiMatchesTone} from '@linuxcast/contracts';
import {emojiData,EmojiInputError} from '../src/data.ts';
import {searchEmoji} from '../src/search.ts';
import type {EmojiSearchInput} from '../src/search.ts';
const now=Date.parse('2026-10-29T00:00:00.000Z'),week=7*24*60*60*1000;
const first=emojiData[0]!,second=emojiData[1]!,third=emojiData[2]!,last=emojiData.at(-1)!;
const byValue=(value:string)=>{const entry=emojiData.find(entry=>entry.value===value);if(!entry)throw new Error('Missing pinned fixture entry.');return entry;};
const row=(id:string,useCount=1,age=0)=>({id,useCount,lastUsedAt:new Date(now-age).toISOString()});
const usage=(entries:ReturnType<typeof row>[],clock=now)=>({now:clock,entries:[...entries].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)});
const ids=(values:readonly {id:string}[])=>values.map(value=>value.id).sort();
it('ranks real entries beyond the default cap by usage and favourites before applying the cap',()=>{
 expect(searchEmoji({query:''})).toEqual(emojiData.slice(0,20));
 expect(searchEmoji({query:'',frecency:usage([row(last.id,10)]),limit:1})).toEqual([last]);
 expect(searchEmoji({query:'',favouriteIds:[last.id],limit:1})).toEqual([last]);
 expect(searchEmoji({query:'',favouriteIds:[second.id],frecency:usage([row(last.id,1_000_000_000)]),limit:2})).toEqual([second,last]);
});
it('keeps exact public relevance ahead of favourite/frecency boosts for weaker custom matches',()=>{
 const customKeywords=[{id:last.id,keywords:['grinning face','😀']}],frecency=usage([row(last.id,1_000_000_000)]);
 expect(searchEmoji({query:'grinning face',customKeywords,favouriteIds:[last.id],frecency,limit:1})).toEqual([first]);
 expect(searchEmoji({query:'😀',customKeywords,favouriteIds:[last.id],frecency,limit:1})).toEqual([first]);
});
it('uses seven-day decay so recent modest use can outrank older more frequent use',()=>{
 const frecency=usage([row(first.id,8,3*week),row(second.id,5,week),row(third.id,3)]);
 expect(searchEmoji({query:'',ids:ids([first,second,third]),frecency})).toEqual([third,second,first]);
});
it('clamps future timestamps to present age instead of giving them a negative-age bonus',()=>{
 const frecency=usage([row(first.id,2),row(second.id,2,-week),row(third.id,1)]);
 expect(searchEmoji({query:'',ids:ids([first,second,third]),frecency})).toEqual([first,second,third]);
});
it('preserves pinned order for equal scores and within favourite tiers',()=>{
 const frecency=usage([row(first.id,2,week),row(second.id,1)]);
 expect(searchEmoji({query:'',ids:ids([first,second]),frecency})).toEqual([first,second]);
 expect(searchEmoji({query:'',ids:ids([first,second,third]),favouriteIds:ids([second,third])})).toEqual([second,third,first]);
});
it('recomputes from the explicit main clock and caller snapshots without retaining or mutating state',()=>{
 const frecency=usage([row(first.id,8,3*week),row(second.id,3)]),before=JSON.stringify(frecency),input={query:'',ids:ids([first,second]),frecency};
 expect(searchEmoji(input)).toEqual([second,first]);expect(JSON.stringify(frecency)).toBe(before);
 expect(searchEmoji({...input,frecency:{...frecency,now:now+10*week}})).toEqual([first,second]);
 expect(searchEmoji({query:'',ids:ids([first,second])})).toEqual([first,second]);
 frecency.entries[0]!.useCount=1_000_000_000;expect(searchEmoji(input)[0]!.id).toBe(frecency.entries[0]!.id);
});
it('accepts ranking snapshots for the complete3944 corpus with canonical identities and100-result ordering',()=>{
 const frecency=usage(emojiData.map((entry,index)=>row(entry.id,index+1))),ranked=searchEmoji({query:'',frecency,limit:100});
 expect(frecency.entries).toHaveLength(3944);expect(ranked).toEqual([...emojiData].reverse().slice(0,100));expect(ranked.every(entry=>emojiData.includes(entry))).toBe(true);expect(Object.isFrozen(ranked)).toBe(true);expect(ranked[0]).toBe(last);
 expect(searchEmoji({query:'',favouriteIds:ids(emojiData),frecency,limit:100})).toEqual(ranked);
});
it('keeps group/tone/subset filters before the ranking cap, including custom keyword aliases',()=>{
 const marker='PUBLIC ranking ritual',customKeywords=emojiData.map(entry=>({id:entry.id,keywords:[marker]})).sort((a,b)=>a.id<b.id?-1:1),frecency=usage(emojiData.map((entry,index)=>row(entry.id,index+1)));
 const flags=emojiData.filter(entry=>entry.group==='Flags');expect(searchEmoji({query:marker,group:'Flags',customKeywords,frecency,limit:100})).toEqual([...flags].reverse().slice(0,100));
 const medium=emojiData.filter(entry=>emojiMatchesTone(entry.value,'medium'));expect(searchEmoji({query:marker,tone:'medium',customKeywords,frecency,limit:100})).toEqual([...medium].reverse().slice(0,100));
 const selected=emojiData.slice(-3);expect(searchEmoji({query:marker,ids:ids(selected),customKeywords,frecency,favouriteIds:[selected[0]!.id],limit:2})).toEqual([selected[0],selected[2]]);
 expect(searchEmoji({query:marker,ids:[],customKeywords,frecency})).toEqual([]);
});
it('keeps mixed Unicode/glyph custom matches and source copy values intact when boosted',()=>{
 const milk=byValue('🥛'),coffee=byValue('☕'),coder=byValue('👩🏽‍💻'),original=JSON.stringify(emojiData),customKeywords=[{id:milk.id,keywords:['☕ PUBLIC café']},{id:coder.id,keywords:['☕ PUBLIC café']}].sort((a,b)=>a.id<b.id?-1:1),frecency=usage([row(milk.id,100),row(coder.id,1)]);
 expect(searchEmoji({query:'☕ PUBLIC cafe\u0301',customKeywords,frecency})).toEqual([milk,coder]);
 expect(searchEmoji({query:'☕ PUBLIC café',customKeywords,frecency,tone:'medium'})).toEqual([coder]);
 expect(searchEmoji({query:'☕',customKeywords,favouriteIds:[milk.id],frecency,limit:1})).toEqual([coffee]);
 expect(searchEmoji({query:'☕ PUBLIC café',customKeywords,frecency})[0]!.value).toBe('🥛');expect(JSON.stringify(emojiData)).toBe(original);
});
it('leaves existing public and custom searches compatible when rankings are omitted or empty',()=>{
 const customKeywords=[{id:last.id,keywords:['PUBLIC empty ranking']}];
 for(const query of ['','face','coder','👩🏽‍💻','🇦🇺','1️⃣','❤️','PUBLIC empty ranking']){const input={query,customKeywords,limit:100},ordinary=searchEmoji(input);expect(searchEmoji({...input,favouriteIds:[],frecency:{entries:[],now}})).toEqual(ordinary);}
});
it('accepts count/time bounds and plain null-prototype snapshots without exposing ranking fields in results',()=>{
 for(const clock of [0,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER])expect(()=>searchEmoji({query:'',frecency:usage([row(first.id,1_000_000_000)],clock)})).not.toThrow();
 const entry=Object.assign(Object.create(null) as ReturnType<typeof row>,row(last.id)),frecency=Object.assign(Object.create(null) as {entries:ReturnType<typeof row>[];now:number},{entries:[entry],now});
 expect(searchEmoji({query:'',frecency,limit:1})).toEqual([last]);expect(Object.keys(searchEmoji({query:'',frecency,limit:1})[0]!)).not.toContain('useCount');
});
const malformed:readonly [string,unknown][]=[
 ['ownundefined',undefined],['null',null],['array',[]],['prototype',new Date()],['missing entries',{now}],['missing clock',{entries:[]}],['extra key',{entries:[],now,enabled:true}],['symbol key',{entries:[],now,[Symbol('PUBLIC')]:1}],
 ['undefined clock',{entries:[],now:undefined}],['NaN clock',{entries:[],now:NaN}],['infinite clock',{entries:[],now:Infinity}],['unsafe clock',{entries:[],now:Number.MAX_SAFE_INTEGER+1}],['fractional clock',{entries:[],now:0.5}],['string clock',{entries:[],now:'PUBLIC'}],['bigint clock',{entries:[],now:1n}],
 ['undefined entries',{entries:undefined,now}],['object entries',{entries:{},now}],['sparse entries',{entries:Array(1),now}],['too many entries',{entries:Array(4097).fill(row(first.id)),now}],['null entry',{entries:[null],now}],['array entry',{entries:[[]],now}],['entry prototype',{entries:[new Date()],now}],
 ['missing field',{entries:[{id:first.id,useCount:1}],now}],['extra field',{entries:[{...row(first.id),event:'PUBLIC'}],now}],['unknown ID',{entries:[row('emoji:10ffff')],now}],['oversized ID',{entries:[row('PUBLIC'.repeat(40))],now}],['duplicate ID',{entries:[row(first.id),row(first.id)],now}],['unsorted IDs',{entries:usage([row(first.id),row(second.id)]).entries.reverse(),now}],
 ['count0',{entries:[row(first.id,0)],now}],['negative count',{entries:[row(first.id,-1)],now}],['fractional count',{entries:[row(first.id,1.5)],now}],['NaN count',{entries:[row(first.id,NaN)],now}],['infinite count',{entries:[row(first.id,Infinity)],now}],['oversaturated count',{entries:[row(first.id,1_000_000_001)],now}],['undefined count',{entries:[{...row(first.id),useCount:undefined}],now}],['string count',{entries:[{...row(first.id),useCount:'1'}],now}],
 ['undefined date',{entries:[{...row(first.id),lastUsedAt:undefined}],now}],['date object',{entries:[{...row(first.id),lastUsedAt:new Date(now)}],now}],['invalid date',{entries:[{...row(first.id),lastUsedAt:'PUBLIC'}],now}],['oversized date',{entries:[{...row(first.id),lastUsedAt:'PUBLIC'.repeat(6)}],now}],['missing milliseconds',{entries:[{...row(first.id),lastUsedAt:'2026-10-29T00:00:00Z'}],now}],['offset date',{entries:[{...row(first.id),lastUsedAt:'2026-10-29T00:00:00.000+00:00'}],now}],['invalid leap day',{entries:[{...row(first.id),lastUsedAt:'2025-02-29T00:00:00.000Z'}],now}],
];
it.each(malformed)('rejects %s frecency before matching or score computation with a redacted error',(_,frecency)=>{
 const normalize=vi.spyOn(String.prototype,'normalize'),segment=vi.spyOn(Intl.Segmenter.prototype,'segment'),parse=vi.spyOn(Date,'parse');try{expect(()=>searchEmoji({query:'PUBLIC',frecency} as EmojiSearchInput)).toThrow(EmojiInputError);expect(normalize).not.toHaveBeenCalled();expect(segment).not.toHaveBeenCalled();expect(parse).not.toHaveBeenCalled();try{searchEmoji({query:'PUBLIC',frecency} as EmojiSearchInput);}catch(error){expect(String(error)).not.toContain('PUBLIC');expect(error).toMatchObject({code:'invalid-request'});}}finally{normalize.mockRestore();segment.mockRestore();parse.mockRestore();}
});
it.each([undefined,null,{},Array(1),Array(4097).fill(first.id),[undefined],['emoji:10ffff'],[first.id,first.id],ids([first,second]).reverse()])('rejects malformed favourite ranking snapshot %#',favouriteIds=>{
 expect(()=>searchEmoji({query:'PUBLIC',favouriteIds} as EmojiSearchInput)).toThrow(EmojiInputError);
});
it('refuses nested getters, extra array authority and proxies without executing user code',()=>{
 const getter=vi.fn(()=>[]),trap=vi.fn(()=>{throw new Error('Do not execute proxy traps.');}),handler={get:trap,getPrototypeOf:trap,ownKeys:trap,getOwnPropertyDescriptor:trap},proxy=(value:object)=>new Proxy(value,handler),revoked=Proxy.revocable({},handler);revoked.revoke();
 const getterRecord=Object.defineProperty({id:first.id,useCount:1},'lastUsedAt',{get:getter}),getterArray=Object.defineProperty([row(first.id)],'0',{get:getter}),getterClock=Object.defineProperty({entries:[]},'now',{get:getter}),getterEntries=Object.defineProperty({now},'entries',{get:getter}),top=Object.defineProperty({query:'PUBLIC'},'frecency',{get:getter});
 const bad=[top,{query:'PUBLIC',favouriteIds:proxy([first.id])},{query:'PUBLIC',favouriteIds:Object.defineProperty([first.id],'0',{get:getter})},...([getterClock,getterEntries,{entries:[getterRecord],now},{entries:getterArray,now},{entries:Object.assign([],{extra:true}),now},{entries:[{...row(first.id),toJSON:getter}],now},proxy({entries:[],now}),revoked.proxy,{entries:proxy([]),now},{entries:[proxy(row(first.id))],now}] as unknown[]).map(frecency=>({query:'PUBLIC',frecency}))];
 for(const input of bad)expect(()=>searchEmoji(input as EmojiSearchInput)).toThrow(EmojiInputError);expect(getter).not.toHaveBeenCalled();expect(trap).not.toHaveBeenCalled();
});
