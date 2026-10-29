import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {emojiData,emojiGroups,getEmoji,getEmojiGroups,EmojiInputError,EMOJI_UNICODE_VERSION,EMOJI_CLDR_VERSION} from '../src/data.ts';
import {searchEmoji} from '../src/search.ts';
import type {EmojiSearchInput} from '../src/search.ts';
import type {EmojiTone} from '@linuxcast/contracts';
import provenance from '../data/provenance.json' with {type:'json'};

const id=(value:string)=>'emoji:'+Array.from(value,scalar=>scalar.codePointAt(0)!.toString(16).padStart(4,'0')).join('-');
const source=(file:string)=>readFileSync(new URL('../data/'+file,import.meta.url),'utf8');
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const values=(query:string,group?:string)=>searchEmoji({query,limit:100,...(group?{group}:{})}).map(entry=>entry.value);

it('pins exact official Unicode17/CLDR48 source bytes and redistributes their complete notices',()=>{
 expect(EMOJI_UNICODE_VERSION).toBe('17.0');expect(EMOJI_CLDR_VERSION).toBe('48');
 expect(provenance.cldrTag).toBe('release-48');expect(provenance.cldrCommit).toBe('acd6d88ae493633240e19a87a721076a8a75c310');
 for(const file of provenance.sources){const bytes=source(file.file);expect(sha(bytes)).toBe(file.sha256);expect(Buffer.byteLength(bytes)).toBe(file.bytes);}
 expect(source('emoji-test-17.0.txt')).toContain('# Version: 17.0');
 for(const file of ['LICENSE-UNICODE.txt','LICENSE-CLDR-48.txt']){expect(source(file)).toContain('UNICODE LICENSE V3');expect(source(file)).toContain('COPYRIGHT AND PERMISSION NOTICE');}
 expect(sha(source(provenance.generated.file))).toBe(provenance.generated.sha256);
});
it('includes every fully-qualified source sequence once in upstream order with exact Unicode, name, version and categories',()=>{
 let group='',subgroup='';const expected=[];
 for(const line of source('emoji-test-17.0.txt').split('\n')){
  if(line.startsWith('# group: '))group=line.slice(9);
  if(line.startsWith('# subgroup: '))subgroup=line.slice(12);
  const match=/^([0-9A-F ]+); fully-qualified\s+# (\S+) E([0-9.]+) (.+)$/u.exec(line);
  if(!match)continue;
  const value=String.fromCodePoint(...match[1]!.trim().split(/ +/u).map(point=>Number.parseInt(point,16)));expect(value).toBe(match[2]);
  expected.push({id:id(value),value,name:match[4],group,subgroup,version:match[3]});
 }
 expect(expected).toHaveLength(3944);expect(emojiData).toHaveLength(3944);expect(new Set(emojiData.map(entry=>entry.id)).size).toBe(3944);expect(new Set(emojiData.map(entry=>entry.value)).size).toBe(3944);
 expect(emojiData.map(({keywords:_,aliases:__,...entry})=>{void _;void __;return entry;})).toEqual(expected);
 expect(emojiData.every(entry=>getEmoji(entry.id)===entry)).toBe(true);
 expect(emojiData.filter(entry=>searchEmoji({query:entry.value,limit:1})[0]!==entry).map(entry=>entry.id)).toEqual([]);
 expect(new Set(emojiData.map(entry=>entry.subgroup)).size).toBe(98);
 // Standalone skin/hair components are not fully-qualified keyboard entries.
 expect(getEmoji('emoji:1f3fb')).toBeUndefined();expect(getEmoji('emoji:1f9b0')).toBeUndefined();
 expect(getEmoji('emoji:1facd')).toMatchObject({name:'orca',version:'17.0'});
});
it('uses pinned English CLDR annotations for every row, joining through VS16-free keys without altering copy values',()=>{
 const entities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
 const decode=(value:string)=>value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/giu,(_,key:string)=>key.startsWith('#')?String.fromCodePoint(Number.parseInt(key.startsWith('#x')?key.slice(2):key.slice(1),key.startsWith('#x')?16:10)):entities[key]!);
 const annotations=new Map<string,{keywords?:string;tts?:string}>();
 for(const file of ['cldr-en-48.xml','cldr-en-derived-48.xml'])for(const match of source(file).matchAll(/<annotation cp="([^"]+)"( type="tts")?>([^<]+)<\/annotation>/gu)){
  const key=decode(match[1]!),current=annotations.get(key)??{};current[match[2]?'tts':'keywords']=decode(match[3]!);annotations.set(key,current);
 }
 for(const entry of emojiData){const annotation=annotations.get(entry.value.replace(/\uFE0F/gu,''));expect(annotation?.keywords).toBeDefined();expect(annotation?.tts).toBeDefined();expect(entry.keywords).toEqual(annotation!.keywords!.split(' | '));expect(entry.aliases).toEqual(annotation!.tts===entry.name?[]:[annotation!.tts]);}
 expect(emojiData.filter(entry=>entry.aliases.length)).toHaveLength(108);
});
it('enumerates the nine nonempty fully-qualified groups with exact counts in Unicode order',()=>{
 expect(getEmojiGroups()).toBe(emojiGroups);expect(emojiGroups).toEqual([
  {id:'Smileys & Emotion',name:'Smileys & Emotion',count:171},{id:'People & Body',name:'People & Body',count:2418},
  {id:'Animals & Nature',name:'Animals & Nature',count:160},{id:'Food & Drink',name:'Food & Drink',count:131},
  {id:'Travel & Places',name:'Travel & Places',count:219},{id:'Activities',name:'Activities',count:85},
  {id:'Objects',name:'Objects',count:266},{id:'Symbols',name:'Symbols',count:224},{id:'Flags',name:'Flags',count:270},
 ]);expect(emojiGroups.reduce((count,group)=>count+group.count,0)).toBe(3944);
});
it('returns a stable bounded initial list and preserves source order when relevance is tied',()=>{
 expect(searchEmoji({query:''})).toEqual(emojiData.slice(0,20));expect(searchEmoji({query:'   ',limit:3})).toEqual(emojiData.slice(0,3));
 expect(searchEmoji({query:'',group:'Flags',limit:100})).toEqual(emojiData.filter(entry=>entry.group==='Flags').slice(0,100));
 const first=searchEmoji({query:'face',limit:100});expect(searchEmoji({query:'face',limit:100})).toEqual(first);expect(new Set(first.map(entry=>entry.id)).size).toBe(first.length);
 expect(searchEmoji({query:'grinning face',limit:1})[0]?.value).toBe('😀');
});
it.each(['👩🏽‍💻','👨‍👩‍👧‍👦','👍🏿','🇦🇺','1️⃣','❤️','🏳️‍🌈','㊗️','㊙️','🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}'])('keeps the complete %s canonical value and stable codepoint ID through literal search/get',value=>{
 const exact=getEmoji(id(value));expect(exact).toBeDefined();expect(searchEmoji({query:value})[0]).toBe(exact);expect(exact?.value).toBe(value);expect(Array.from(exact!.value,scalar=>scalar.codePointAt(0))).toEqual(Array.from(value,scalar=>scalar.codePointAt(0)));
});
it('matches unqualified glyph queries while returning VS16, and distinguishes tones, flags and ZWJ targets',()=>{
 expect(searchEmoji({query:'❤'})[0]?.value).toBe('❤️');expect(searchEmoji({query:'1\u20e3'})[0]?.value).toBe('1️⃣');expect(values('👩🏽‍💻')).toEqual(['👩🏽‍💻']);expect(values('🇦🇺')).toEqual(['🇦🇺']);
 expect(getEmoji('emoji:0023-fe0f-20e3')?.value).toBe('#️⃣');expect(getEmoji('emoji:00a9-fe0f')?.value).toBe('©️');expect(getEmoji('emoji:2764')).toBeUndefined();
});
it('matches English names, keywords and alternate CLDR names with normalized multi-token prefixes',()=>{
 expect(values('coder medium woman')).toContain('👩🏽‍💻');expect(values('👩🏽‍💻 developer')).toEqual(['👩🏽‍💻']);
 expect(values('POOP')).toContain('💩');expect(values('+1')[0]).toBe('👍');expect(values('-1')[0]).toBe('👎');
 const walking=getEmoji(id('🚶‍➡️'))!;expect(walking.aliases).toEqual(['person walking: facing right']);expect(values(walking.aliases[0]!)).toContain(walking.value);
 expect(values('grinn smil')).toContain('😀');expect(values('ＦＡＣＥ')).toEqual(values('face'));
 expect(values('côte d’ivoire')).toEqual(values('co\u0302te d’ivoire'));expect(values('COTE D IVOIRE')).toContain('🇨🇮');
});
it('combines exact group filtering with search and treats unmatched, regex, SQL, URL and shell text literally',()=>{
 const found=searchEmoji({query:'face',group:'Smileys & Emotion',limit:100});expect(found.length).toBeGreaterThan(0);expect(found.every(entry=>entry.group==='Smileys & Emotion')).toBe(true);
 expect(searchEmoji({query:'coder',group:'Food & Drink'})).toEqual([]);
 for(const query of ['SYNTHETIC_PUBLIC_NO_EMOJI_MATCH','.*','SELECT * FROM notes','javascript:alert(1)','$(touch /tmp/emoji-side-effect)'])expect(searchEmoji({query})).toEqual([]);
 expect(searchEmoji({query:'[a-z]+'})).toEqual(searchEmoji({query:'a z'}));
 expect(searchEmoji({query:'',limit:100})).toHaveLength(100);expect(searchEmoji({query:'',limit:1})).toHaveLength(1);
});
it('rejects oversized UTF16 before UTF8 allocation and accepts bounded valid Unicode without splitting surrogates',()=>{
 const encode=vi.spyOn(TextEncoder.prototype,'encode');
 try{expect(()=>searchEmoji({query:'x'.repeat(513)})).toThrow(EmojiInputError);expect(()=>searchEmoji({query:'😀'.repeat(257)})).toThrow(EmojiInputError);expect(encode).not.toHaveBeenCalled();}finally{encode.mockRestore();}
 for(const query of ['a'.repeat(512),'雪'.repeat(512),'😀'.repeat(256)])expect(()=>searchEmoji({query})).not.toThrow();
 for(const query of ['\0','\n','\t','\u0085','\ud800','\udfff','a\ud800b'])expect(()=>searchEmoji({query})).toThrow(EmojiInputError);
});
it('rejects malformed options, unsupported authority, control input and accessors with fixed redacted errors',()=>{
 const getter=vi.fn(()=>''),accessor=Object.defineProperty({},'query',{get:getter,enumerable:true});
 const invalid:unknown[]=[null,[],new Date(),{},'face',{query:1},{query:'face',limit:0},{query:'face',limit:101},{query:'face',limit:1.5},{query:'face',limit:NaN},{query:'face',limit:Infinity},{query:'face',limit:'20'},{query:'face',group:'Unknown'},{query:'face',group:''},{query:'face',group:'x'.repeat(10000)},{query:'face',path:'/tmp/public'},{query:'face',sql:'SELECT'},{query:'face',provider:'hidden'},{query:'face',[Symbol('private')]:true},accessor,{query:'SYNTHETIC_PRIVATE\0'}];
 for(const input of invalid){try{searchEmoji(input as EmojiSearchInput);throw new Error('Expected refusal');}catch(error){expect(error).toBeInstanceOf(EmojiInputError);expect(error).toMatchObject({code:'invalid-request'});expect(String(error)).not.toContain('SYNTHETIC_PRIVATE');}}
 expect(getter).not.toHaveBeenCalled();
});
it('returns undefined for unknown canonical IDs and refuses malformed IDs without coercion',()=>{
 expect(getEmoji('emoji:10ffff')).toBeUndefined();
 for(const value of ['', 'unknown','emoji:1F600','emoji:23-fe0f-20e3','emoji:1f600/path','emoji:'+'0'.repeat(10000),null,1])expect(()=>getEmoji(value as string)).toThrow(EmojiInputError);
});
it('prevents callers mutating catalogue values, metadata, categories and result arrays',()=>{
 const first=searchEmoji({query:'grinning face',limit:1}),record=first[0]!;
 expect(()=>Reflect.set(record,'value','wrong')).not.toThrow();expect(Reflect.set(record,'value','wrong')).toBe(false);expect(record.value).toBe('😀');
 expect(()=>Reflect.set(record.keywords,'0','wrong')).not.toThrow();expect(Reflect.set(record.keywords,'0','wrong')).toBe(false);expect(Reflect.set(record.aliases,'0','wrong')).toBe(false);
 expect(Reflect.set(emojiGroups[0]!,'count',0)).toBe(false);expect(Reflect.set(first,'0',emojiData[1])).toBe(false);expect(Reflect.set(emojiData,'0',emojiData[1])).toBe(false);
 expect(searchEmoji({query:'grinning face',limit:1})).toEqual(first);expect(getEmoji(record.id)).toBe(record);expect(getEmojiGroups()[0]?.count).toBe(171);
 const request={query:'grinning face',limit:1};const result=searchEmoji(request);request.query='poop';expect(result[0]?.value).toBe('😀');
});

const toneSamples=[['light','🏻','👍🏻'],['medium-light','🏼','👍🏼'],['medium','🏽','👍🏽'],['medium-dark','🏾','👍🏾'],['dark','🏿','👍🏿']] as const;
it.each(toneSamples)('filters %s to the exact pinned modifier sequence without synthesizing values',(tone,modifier,glyph)=>{
 const result=searchEmoji({query:'thumbs up',tone,limit:100});
 expect(result.map(entry=>entry.value)).toEqual([glyph]);expect(result[0]).toBe(getEmoji(id(glyph)));
 expect(result.every(entry=>entry.value.includes(modifier))).toBe(true);
 expect(searchEmoji({query:glyph,tone,limit:1})[0]).toBe(result[0]);
 expect(Object.isFrozen(result)).toBe(true);expect(Reflect.set(result[0]!,'value','wrong')).toBe(false);
});
it('filters the entire source catalogue before the initial cap while retaining its canonical order',()=>{
 for(const [tone,modifier] of toneSamples){
  const expected=emojiData.filter(entry=>entry.value.includes(modifier));
  expect(expected.length).toBeGreaterThan(100);expect(emojiData.indexOf(expected[0]!)).toBeGreaterThan(100);
  expect(searchEmoji({query:'',tone,limit:1})).toEqual(expected.slice(0,1));
  expect(searchEmoji({query:'',tone,limit:100})).toEqual(expected.slice(0,100));
 }
 const expected=emojiData.filter(entry=>!/[\u{1f3fb}-\u{1f3ff}]/u.test(entry.value));
 expect(searchEmoji({query:'',tone:'unmodified',limit:100})).toEqual(expected.slice(0,100));
 expect(searchEmoji({query:'',limit:100})).toEqual(emojiData.slice(0,100));
});
it('unmodified excludes all five modifiers while group, text and exact-glyph search keep their existing meaning',()=>{
 expect(searchEmoji({query:'woman technologist',tone:'unmodified'}).map(entry=>entry.value)).toEqual(['👩‍💻']);
 expect(searchEmoji({query:'woman technologist',tone:'medium',group:'People & Body'}).map(entry=>entry.value)).toEqual(['👩🏽‍💻']);
 expect(searchEmoji({query:'👩🏽‍💻',tone:'unmodified'})).toEqual([]);
 expect(searchEmoji({query:'coder',tone:'medium',group:'Food & Drink'})).toEqual([]);
 expect(searchEmoji({query:'',tone:'light',group:'Flags'})).toEqual([]);
 expect(searchEmoji({query:'🇦🇺',tone:'unmodified',group:'Flags'})[0]).toBe(getEmoji(id('🇦🇺')));
 expect(searchEmoji({query:'❤️',tone:'unmodified'})[0]?.value).toBe('❤️');
 expect(searchEmoji({query:'   ',tone:'medium',limit:3})).toEqual(searchEmoji({query:'',tone:'medium',limit:3}));
});
it('a mixed-tone source sequence matches every modifier it contains and no other tone',()=>{
 const glyph='🫱🏻‍🫲🏿',record=getEmoji(id(glyph));expect(record).toBeDefined();
 for(const tone of ['light','dark'] as const)expect(searchEmoji({query:glyph,tone,limit:1})[0]).toBe(record);
 for(const tone of ['unmodified','medium-light','medium','medium-dark'] as const)expect(searchEmoji({query:glyph,tone})).toEqual([]);
 expect(searchEmoji({query:glyph})[0]?.value).toBe(glyph);expect(record?.value).toBe(glyph);
});
it('validates the closed tone enum and own data properties before encoding, without invoking getters or coercion',()=>{
 const getter=vi.fn(()=> 'light'),coerce=vi.fn(()=> 'light');
 const accessor=Object.defineProperty({query:''},'tone',{get:getter,enumerable:true});
 const invalid:unknown[]=[accessor,{query:'',tone:undefined},{query:'',tone:null},{query:'',tone:'all'},{query:'',tone:'Light'},{query:'',tone:'light\0'},
  {query:'',tone:'\u202e'},{query:'',tone:'x'.repeat(10000)},{query:'',tone:1},{query:'',tone:['light']},{query:'',tone:{toString:coerce}},
  {query:'',tone:'light',extra:true},{query:'',tone:'light',[Symbol('private')]:true},Object.create({query:'',tone:'light'})];
 const encode=vi.spyOn(TextEncoder.prototype,'encode');
 try{for(const input of invalid)expect(()=>searchEmoji(input as EmojiSearchInput)).toThrow(EmojiInputError);expect(encode).not.toHaveBeenCalled();}finally{encode.mockRestore();}
 expect(getter).not.toHaveBeenCalled();expect(coerce).not.toHaveBeenCalled();
 for(const query of ['\0','\ud800','\u202e','\u2066'])expect(()=>searchEmoji({query,tone:'light'})).toThrow(EmojiInputError);
 const own=Object.assign(Object.create(null) as EmojiSearchInput,{query:'thumbs up',tone:'dark' as EmojiTone});
 expect(searchEmoji(own).map(entry=>entry.value)).toEqual(['👍🏿']);
});
