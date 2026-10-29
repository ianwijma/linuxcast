import {expect,it,vi} from 'vitest';
import {emojiMatchesTone} from '@linuxcast/contracts';
import {emojiData,EmojiInputError} from '../src/data.ts';
import {searchEmoji} from '../src/search.ts';
import type {EmojiSearchInput} from '../src/search.ts';
const byValue=(value:string)=>{const entry=emojiData.find(entry=>entry.value===value);if(!entry)throw new Error('Missing pinned fixture entry.');return entry;};
const apple=byValue('🍎'),coder=byValue('👩🏽‍💻'),rocket=byValue('🚀');
const snapshot=(pairs:readonly (readonly [string,readonly string[]])[])=>pairs.map(([id,keywords])=>({id,keywords})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
const entries=(query:string,customKeywords:EmojiSearchInput['customKeywords'])=>searchEmoji({query,customKeywords:customKeywords!,limit:100});
const invalid=(customKeywords:unknown)=>({query:'PUBLIC search',customKeywords}) as EmojiSearchInput;
it('matches an authored phrase only when assigned, with all terms across names, public annotations and separate custom phrases',()=>{
 const custom=snapshot([[coder.id,['PUBLIC launch ritual','PUBLIC moon garden']]]);
 expect(searchEmoji({query:'PUBLIC launch ritual'})).toEqual([]);
 expect(entries('PUBLIC launch ritual',custom)).toEqual([coder]);
 expect(entries('coder medium launch moon',custom)).toEqual([coder]);
 expect(entries('PUBLIC missing launch',custom)).toEqual([]);
 expect(entries('developer PUBLIC launch',custom)).toEqual([coder]);
});
it('normalizes Unicode text and combining forms for matching without rewriting the phrase or canonical result',()=>{
 const custom=snapshot([[apple.id,['PUBLIC café au lait','PUBLIC 雪の庭','PUBLIC Ωμέγα']]]),before=JSON.stringify(custom);
 for(const query of ['PUBLIC CAFÉ AU LAIT','PUBLIC cafe\u0301 au lait','ＰＵＢＬＩＣ cafe au lait','PUBLIC 雪の庭','PUBLIC ΩΜΕΓΑ'])expect(entries(query,custom)).toEqual([apple]);
 expect(JSON.stringify(custom)).toBe(before);expect(entries('PUBLIC café',custom)[0]).toBe(apple);expect(apple.value).toBe('🍎');
});
it('matches emoji-only custom aliases on a different entry while exact canonical glyphs retain first rank',()=>{
 const custom=snapshot([[apple.id,['🚀']]]),found=entries('🚀',custom);
 expect(found[0]).toBe(rocket);expect(found).toContain(apple);expect(entries('🚀',custom).map(row=>row.value)).toContain('🍎');
 expect(searchEmoji({query:'🚀',customKeywords:custom,ids:[apple.id]})).toEqual([apple]);
});
it('matches mixed Unicode/glyph aliases and variation selectors without synthesizing canonical values',()=>{
 const custom=snapshot([[apple.id,['🚀 café','PUBLIC 1️⃣ launch','PUBLIC ❤️ garden']]]);
 expect(entries('🚀 CAFE',custom)).toEqual([apple]);expect(entries('PUBLIC 1\u20e3 launch',custom)).toEqual([apple]);expect(entries('PUBLIC ❤ garden',custom)).toEqual([apple]);
 expect(entries('🚀 café',custom)[0]!.value).toBe('🍎');expect(entries('🚀 café',custom)[0]).toBe(apple);
 expect(entries('🚀 PUBLIC garden',custom)).toEqual([apple]);
 expect(entries('🇦🇺 café',custom)).toEqual([]);
});
it('ranks exact custom phrases with exact public keywords and preserves source order ties',()=>{
 const early=emojiData[0]!,late=emojiData.at(-1)!;
 const publicCelebration=searchEmoji({query:'celebration',limit:100});expect(publicCelebration.length).toBeGreaterThan(0);
 const custom=snapshot([[early.id,['celebration','PUBLIC ritual practice']],[late.id,['PUBLIC ritual','grinning face']]]);
 const celebration=entries('celebration',custom);expect(celebration[0]).toBe(early);expect(celebration.slice(1)).toEqual(publicCelebration);
 expect(entries('PUBLIC ritual',custom)).toEqual([late,early]);
 expect(entries('grinning face',custom)[0]).toBe(early);
});
it('distinguishes exact mixed phrase glyph placement when ranking custom aliases',()=>{
 const early=emojiData[0]!,late=emojiData.at(-1)!,custom=snapshot([[early.id,['PUBLIC 🚀 ritual']],[late.id,['🚀 PUBLIC ritual']]]);
 expect(entries('🚀 PUBLIC ritual',custom)).toEqual([late,early]);expect(entries('PUBLIC 🚀 ritual',custom)).toEqual([early,late]);
});
it('applies group, tone and favourite subset filters to the actual canonical entry before capping custom matches',()=>{
 const custom=snapshot([[apple.id,['🚀 PUBLIC ritual']],[coder.id,['🚀 PUBLIC ritual']]]);
 expect(searchEmoji({query:'🚀 PUBLIC ritual',customKeywords:custom,group:'Food & Drink'})).toEqual([apple]);
 expect(searchEmoji({query:'🚀 PUBLIC ritual',customKeywords:custom,group:'Travel & Places'})).toEqual([]);
 expect(searchEmoji({query:'🚀 PUBLIC ritual',customKeywords:custom,tone:'medium'})).toEqual([coder]);
 expect(searchEmoji({query:'🚀 PUBLIC ritual',customKeywords:custom,tone:'unmodified'})).toEqual([apple]);
 expect(searchEmoji({query:'🚀 PUBLIC ritual',customKeywords:custom,ids:[coder.id]})).toEqual([coder]);
 expect(searchEmoji({query:'🚀 PUBLIC ritual',customKeywords:custom,ids:[]})).toEqual([]);
});
it('accepts a snapshot covering all3944 IDs and filters before the100-result cap with pinned tie order',()=>{
 const custom=snapshot(emojiData.map(entry=>[entry.id,['PUBLIC catalogue ritual']] as const));
 expect(custom).toHaveLength(3944);expect(entries('PUBLIC catalogue ritual',custom)).toEqual(emojiData.slice(0,100));
 const flags=emojiData.filter(entry=>entry.group==='Flags');expect(searchEmoji({query:'PUBLIC catalogue ritual',customKeywords:custom,group:'Flags',limit:100})).toEqual(flags.slice(0,100));
 const medium=emojiData.filter(entry=>emojiMatchesTone(entry.value,'medium'));expect(searchEmoji({query:'PUBLIC catalogue ritual',customKeywords:custom,tone:'medium',limit:100})).toEqual(medium.slice(0,100));
 const tail=emojiData.slice(-10);expect(searchEmoji({query:'PUBLIC catalogue ritual',customKeywords:custom,ids:tail.map(entry=>entry.id).sort(),limit:100})).toEqual(tail);
 expect(searchEmoji({query:'PUBLIC catalogue ritual',customKeywords:custom,limit:1})).toEqual([emojiData[0]]);
});
it('clears custom matching with an empty snapshot and leaves ordinary results, defaults and dataset objects unchanged',()=>{
 const custom=snapshot([[coder.id,['PUBLIC launch ritual']]]),original=JSON.stringify(emojiData);
 expect(entries('PUBLIC launch ritual',custom)).toEqual([coder]);expect(entries('PUBLIC launch ritual',[])).toEqual([]);expect(searchEmoji({query:'PUBLIC launch ritual'})).toEqual([]);
 for(const query of ['','face','coder','👩🏽‍💻','🇦🇺','1️⃣','❤️','côte d’ivoire']){const baseline=searchEmoji({query,limit:100});expect(searchEmoji({query,customKeywords:[],limit:100})).toEqual(baseline);expect(searchEmoji({query,customKeywords:custom,limit:100})).toEqual(baseline);}
 expect(JSON.stringify(emojiData)).toBe(original);expect(Object.isFrozen(entries('PUBLIC launch ritual',custom))).toBe(true);expect(Object.isFrozen(coder)).toBe(true);expect(Object.isFrozen(coder.keywords)).toBe(true);
});
it('does not retain or mutate the caller snapshot across subsequent searches',()=>{
 const custom=[{id:apple.id,keywords:['PUBLIC first ritual']}],before=JSON.stringify(custom),found=entries('PUBLIC first ritual',custom);
 expect(JSON.stringify(custom)).toBe(before);custom[0]!.keywords[0]='PUBLIC second ritual';expect(found).toEqual([apple]);expect(entries('PUBLIC first ritual',custom)).toEqual([]);expect(entries('PUBLIC second ritual',custom)).toEqual([apple]);
});
it('accepts exact phrase scalar/byte and list bounds',()=>{
 for(const phrase of ['a'.repeat(64),'雪'.repeat(64),'😀'.repeat(64)])expect(()=>searchEmoji({query:'',customKeywords:[{id:apple.id,keywords:[phrase]}]})).not.toThrow();
 expect(()=>searchEmoji({query:'',customKeywords:[{id:apple.id,keywords:Array.from({length:16},(_,i)=>`PUBLIC phrase ${i}`)}]})).not.toThrow();
});
const badCases:readonly [string,unknown][]=[
 ['undefined',undefined],['null',null],['object',{}],['primitive','PUBLIC'],['sparse outer',Array(1)],['oversized outer',Array(4097).fill({id:apple.id,keywords:['PUBLIC']})],
 ['null entry',[null]],['array entry',[[]]],['entry prototype',[new Date()]],['extra entry key',[{id:apple.id,keywords:['PUBLIC'],extra:undefined}]],['symbol entry key',[{id:apple.id,keywords:['PUBLIC'],[Symbol('PUBLIC')]:1}]],
 ['missing ID',[{keywords:['PUBLIC']}]],['undefined ID',[{id:undefined,keywords:['PUBLIC']}]],['unknown ID',[{id:'emoji:10ffff',keywords:['PUBLIC']}]],['malformed ID',[{id:'PUBLIC',keywords:['PUBLIC']}]],['oversized ID',[{id:'x'.repeat(231),keywords:['PUBLIC']}]],
 ['missing phrases',[{id:apple.id}]],['undefined phrases',[{id:apple.id,keywords:undefined}]],['null phrases',[{id:apple.id,keywords:null}]],['empty stored list',[{id:apple.id,keywords:[]}]],['sparse phrases',[{id:apple.id,keywords:Array(1)}]],['nonstring phrase',[{id:apple.id,keywords:[1]}]],['own undefined phrase',[{id:apple.id,keywords:[undefined]}]],
 ['empty phrase',[{id:apple.id,keywords:['']}]],['leading space',[{id:apple.id,keywords:[' PUBLIC']}]],['trailing space',[{id:apple.id,keywords:['PUBLIC ']}]],['punctuation only',[{id:apple.id,keywords:['.*']}]],['too many scalars',[{id:apple.id,keywords:['a'.repeat(65)]}]],['too many UTF16 units',[{id:apple.id,keywords:['😀'.repeat(65)]}]],['too many phrases',[{id:apple.id,keywords:Array.from({length:17},(_,i)=>`PUBLIC ${i}`)}]],['duplicate phrase',[{id:apple.id,keywords:['PUBLIC','PUBLIC']}]],
 ['control',[{id:apple.id,keywords:['PUBLIC\0']}]],['newline',[{id:apple.id,keywords:['PUBLIC\nphrase']}]],['tab',[{id:apple.id,keywords:['PUBLIC\tphrase']}]],['bidi',[{id:apple.id,keywords:['PUBLIC\u202e']}]],['surrogate',[{id:apple.id,keywords:['PUBLIC\ud800']}]],['line separator',[{id:apple.id,keywords:['PUBLIC\u2028phrase']}]],['paragraph separator',[{id:apple.id,keywords:['PUBLIC\u2029phrase']}]],
 ['duplicate ID',[{id:apple.id,keywords:['PUBLIC']},{id:apple.id,keywords:['OTHER']}]],['unsorted IDs',snapshot([[apple.id,['PUBLIC']],[coder.id,['PUBLIC']]]).reverse()],
];
it.each(badCases)('rejects %s with a fixed safe error before matching normalization',(_,value)=>{
 const normalize=vi.spyOn(String.prototype,'normalize'),segment=vi.spyOn(Intl.Segmenter.prototype,'segment');
 try{expect(()=>searchEmoji(invalid(value))).toThrow(EmojiInputError);expect(normalize).not.toHaveBeenCalled();expect(segment).not.toHaveBeenCalled();try{searchEmoji(invalid(value));}catch(error){expect(String(error)).not.toContain('PUBLIC');expect(error).toMatchObject({code:'invalid-request'});}}finally{normalize.mockRestore();segment.mockRestore();}
});
it('rejects oversized encoded snapshots rather than silently truncating or normalizing them',()=>{
 const phrases=Array.from({length:16},(_,i)=>String(i).padStart(2,'0')+'雪'.repeat(62)),custom=snapshot(emojiData.slice(0,200).map(entry=>[entry.id,phrases] as const));expect(Buffer.byteLength(JSON.stringify(custom))).toBeGreaterThan(524288);
 const normalize=vi.spyOn(String.prototype,'normalize');try{expect(()=>searchEmoji({query:'PUBLIC',customKeywords:custom})).toThrow(EmojiInputError);expect(normalize).not.toHaveBeenCalled();}finally{normalize.mockRestore();}
});
it('rejects getters, sparse/extra array properties and unsupported entry authority without invoking code',()=>{
 const getter=vi.fn(()=>['PUBLIC']),listGetter=Object.defineProperty(['PUBLIC'],'0',{get:getter}),entryGetter=Object.defineProperty({id:apple.id},'keywords',{get:getter}),idGetter=Object.defineProperty({keywords:['PUBLIC']},'id',{get:getter}),arrayGetter=Object.defineProperty([{}],'0',{get:getter}),topGetter=Object.defineProperty({query:'PUBLIC'},'customKeywords',{get:getter}),extraArray=Object.assign([{id:apple.id,keywords:['PUBLIC']}],{extra:true}),extraPhrases=Object.assign(['PUBLIC'],{extra:true});
 for(const input of [invalid([{id:apple.id,keywords:listGetter}]),invalid([entryGetter]),invalid([idGetter]),invalid(arrayGetter),topGetter,invalid(extraArray),invalid([{id:apple.id,keywords:extraPhrases}]),invalid([{id:apple.id,keywords:['PUBLIC'],toJSON:getter}])])expect(()=>searchEmoji(input as EmojiSearchInput)).toThrow(EmojiInputError);
 expect(getter).not.toHaveBeenCalled();
});
it('rejects top-level and nested proxies, including revoked proxies, without executing traps',()=>{
 const trap=vi.fn(()=>{throw new Error('Must not execute a proxy trap.');}),handler={get:trap,getPrototypeOf:trap,ownKeys:trap,getOwnPropertyDescriptor:trap},proxy=(value:object)=>new Proxy(value,handler),revoked=Proxy.revocable([],{get:trap});revoked.revoke();
 const cases=[proxy({query:'PUBLIC'}),invalid(proxy([])),invalid([proxy({id:apple.id,keywords:['PUBLIC']})]),invalid([{id:apple.id,keywords:proxy(['PUBLIC'])}]),invalid(revoked.proxy),{query:'PUBLIC',ids:proxy([apple.id])}];
 for(const value of cases)expect(()=>searchEmoji(value as EmojiSearchInput)).toThrow(EmojiInputError);expect(trap).not.toHaveBeenCalled();
});
it('supports plain null-prototype records but rejects ownundefined/extra top-level fields without normalization',()=>{
 const entry=Object.assign(Object.create(null) as {id:string;keywords:string[]},{id:apple.id,keywords:['PUBLIC ritual']}),input=Object.assign(Object.create(null) as EmojiSearchInput,{query:'PUBLIC ritual',customKeywords:[entry]});expect(searchEmoji(input)).toEqual([apple]);
 for(const value of [{query:'PUBLIC',customKeywords:undefined},{query:'PUBLIC',customKeywords:[],path:'/tmp/PUBLIC'},{query:'PUBLIC',customKeywords:[],[Symbol('PUBLIC')]:true}])expect(()=>searchEmoji(value as unknown as EmojiSearchInput)).toThrow(EmojiInputError);
});
