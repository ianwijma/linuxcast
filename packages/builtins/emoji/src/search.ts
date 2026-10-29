import {emojiData,emojiGroups,EmojiInputError} from './data.ts';
import {emojiFavouriteIdsSchema,emojiFrecencyEntriesSchema,emojiKeywordEntriesSchema,emojiMatchesTone,emojiToneSchema} from '@linuxcast/contracts';
import {types} from 'node:util';
import type {EmojiFrecencyEntry,EmojiTone} from '@linuxcast/contracts';
import type {Emoji} from './data.ts';

/** Subsets, custom keywords and ranking are main-owned snapshots, never renderer arguments. */
export interface EmojiSearchInput {query:string;group?:string;tone?:EmojiTone;ids?:readonly string[];customKeywords?:readonly {id:string;keywords:readonly string[]}[];favouriteIds?:readonly string[];frecency?:{entries:readonly EmojiFrecencyEntry[];now:number};limit?:number;}
const encoder=new TextEncoder();
const groups=new Set(emojiGroups.map(group=>group.id));
const canonicalIds=new Set(emojiData.map(entry=>entry.id));
// Text normalization affects matching only; canonical Unicode values stay intact.
const textKey=(text:string)=>text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'');
const words=(text:string)=>textKey(text).match(/[+-][0-9]+|[\p{L}\p{N}]+/gu)??[];
const phrase=(text:string)=>words(text).join(' ');
const glyphKey=(text:string)=>text.replace(/\uFE0F/gu,'');
const emojiGlyph=/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
const segments=new Intl.Segmenter('en',{granularity:'grapheme'});
// Preserve glyph placement in exact custom phrases while normalizing text words.
function customPhraseKey(value:string):string {
 const tokens:string[]=[];let text='';
 for(const {segment} of segments.segment(value)){
  if(emojiGlyph.test(segment)){tokens.push(...words(text).map(word=>`text:${word}`),`glyph:${glyphKey(segment)}`);text='';}else text+=segment;
 }
 tokens.push(...words(text).map(word=>`text:${word}`));return JSON.stringify(tokens);
}
const index=emojiData.map(entry=>({
 entry,glyph:glyphKey(entry.value),name:phrase(entry.name),aliases:entry.aliases.map(phrase),
 keywords:entry.keywords.map(phrase),words:[...new Set([entry.name,...entry.aliases,...entry.keywords].flatMap(words))],
}));

function validatedIds(value:unknown):readonly string[] {
 if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>4096||Reflect.ownKeys(value).length!==value.length+1)throw new EmojiInputError();
 const ids:string[]=[];
 for(let index=0;index<value.length;index++){
  const field=Object.getOwnPropertyDescriptor(value,String(index));
  if(!field||!('value'in field)||typeof field.value!=='string')throw new EmojiInputError();
  ids.push(field.value);
 }
 const parsed=emojiFavouriteIdsSchema.safeParse(ids);if(!parsed.success)throw new EmojiInputError();
 return Object.freeze(parsed.data);
}
function arrayValues(value:unknown,maximum:number):unknown[]{
 if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1)throw new EmojiInputError();
 const entries:unknown[]=[];for(let index=0;index<value.length;index++){const field=Object.getOwnPropertyDescriptor(value,String(index));if(!field||!('value'in field))throw new EmojiInputError();entries.push(field.value);}return entries;
}
function validatedKeywords(value:unknown):readonly {id:string;keywords:readonly string[]}[]{
 const entries:{id:string;keywords:string[]}[]=[];let bytes=2;
 for(const raw of arrayValues(value,4096)){
  if(types.isProxy(raw)||raw===null||typeof raw!=='object'||Array.isArray(raw)||![Object.prototype,null].includes(Object.getPrototypeOf(raw))||Reflect.ownKeys(raw).length!==2)throw new EmojiInputError();
  const id=Object.getOwnPropertyDescriptor(raw,'id'),keywords=Object.getOwnPropertyDescriptor(raw,'keywords');
  if(!id||!('value'in id)||typeof id.value!=='string'||id.value.length>230||!canonicalIds.has(id.value)||!keywords||!('value'in keywords))throw new EmojiInputError();
  const phrases=arrayValues(keywords.value,16);if(!phrases.every((entry):entry is string=>typeof entry==='string'&&entry.length<=128))throw new EmojiInputError();
  const entry={id:id.value,keywords:phrases};bytes+=encoder.encode(JSON.stringify(entry)).byteLength+(entries.length?1:0);if(bytes>524288)throw new EmojiInputError();entries.push(entry);
 }
 const parsed=emojiKeywordEntriesSchema.safeParse(entries);if(!parsed.success)throw new EmojiInputError();
 return Object.freeze(parsed.data.map(entry=>Object.freeze({id:entry.id,keywords:Object.freeze(entry.keywords)})));
}
function validatedFrecency(value:unknown):{entries:readonly EmojiFrecencyEntry[];now:number}{
 if(types.isProxy(value)||value===null||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==2)throw new EmojiInputError();
 const now=Object.getOwnPropertyDescriptor(value,'now'),raw=Object.getOwnPropertyDescriptor(value,'entries');
 if(!now||!('value'in now)||typeof now.value!=='number'||!Number.isSafeInteger(now.value)||!raw||!('value'in raw))throw new EmojiInputError();
 const entries:EmojiFrecencyEntry[]=[];let bytes=2;
 for(const value of arrayValues(raw.value,4096)){
  if(types.isProxy(value)||value===null||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==3)throw new EmojiInputError();
  const id=Object.getOwnPropertyDescriptor(value,'id'),count=Object.getOwnPropertyDescriptor(value,'useCount'),used=Object.getOwnPropertyDescriptor(value,'lastUsedAt');
  if(!id||!('value'in id)||typeof id.value!=='string'||id.value.length>230||!canonicalIds.has(id.value)||!count||!('value'in count)||typeof count.value!=='number'||!Number.isInteger(count.value)||count.value<1||count.value>1_000_000_000||!used||!('value'in used)||typeof used.value!=='string'||used.value.length>32)throw new EmojiInputError();
  const entry={id:id.value,useCount:count.value,lastUsedAt:used.value};bytes+=encoder.encode(JSON.stringify(entry)).byteLength+(entries.length?1:0);if(bytes>524288)throw new EmojiInputError();entries.push(entry);
 }
 const parsed=emojiFrecencyEntriesSchema.safeParse(entries);if(!parsed.success)throw new EmojiInputError();
 return{now:now.value,entries:Object.freeze(parsed.data.map(entry=>Object.freeze(entry)))};
}
function validated(value:unknown):{query:string;group:string;tone?:EmojiTone;ids?:readonly string[];customKeywords?:readonly {id:string;keywords:readonly string[]}[];favouriteIds?:readonly string[];frecency?:{entries:readonly EmojiFrecencyEntry[];now:number};limit:number} {
 if(types.isProxy(value)||value===null||typeof value!=='object'||Array.isArray(value))throw new EmojiInputError();
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)throw new EmojiInputError();
 const fields=new Map<string,unknown>();
 for(const key of Reflect.ownKeys(value)){
  if(typeof key!=='string'||!['query','group','tone','ids','customKeywords','favouriteIds','frecency','limit'].includes(key))throw new EmojiInputError();
  const field=Object.getOwnPropertyDescriptor(value,key);
  if(!field||!('value'in field))throw new EmojiInputError();
  fields.set(key,field.value);
 }
 const query=fields.get('query'),group=fields.has('group')?fields.get('group'):'',limit=fields.has('limit')?fields.get('limit'):20;
 const tone=fields.has('tone')?emojiToneSchema.safeParse(fields.get('tone')):undefined;
 if(tone&&!tone.success)throw new EmojiInputError();
 const ids=fields.has('ids')?validatedIds(fields.get('ids')):undefined;
 // Reject oversized UTF-16 before normalization, segmentation or UTF-8 allocation.
 if(typeof query!=='string'||query.length>512||/[\p{Cc}\p{Cs}\p{Bidi_Control}]/u.test(query)||encoder.encode(query).byteLength>2048)throw new EmojiInputError();
 if(typeof group!=='string'||group.length>64||fields.has('group')&&!groups.has(group))throw new EmojiInputError();
 if(typeof limit!=='number'||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new EmojiInputError();
 const customKeywords=fields.has('customKeywords')?validatedKeywords(fields.get('customKeywords')):undefined;
 const favouriteIds=fields.has('favouriteIds')?validatedIds(fields.get('favouriteIds')):undefined;
 if(favouriteIds?.some(id=>!canonicalIds.has(id)))throw new EmojiInputError();
 const frecency=fields.has('frecency')?validatedFrecency(fields.get('frecency')):undefined;
 return {query,group,limit,...(tone?.success?{tone:tone.data}:{}),...(ids?{ids}:{}),...(customKeywords?{customKeywords}:{}),...(favouriteIds?{favouriteIds}:{}),...(frecency?{frecency}:{})};
}

/** Pure bounded offline search. All query terms match literally, without regex,
 * shell, SQL or network interpretation. Ties keep pinned Unicode source order. */
export function searchEmoji(input:EmojiSearchInput):readonly Emoji[] {
 const {query,group,tone,ids,customKeywords,favouriteIds,frecency,limit}=validated(input),included=ids?new Set(ids):undefined,favourites=new Set(favouriteIds),trimmed=query.trim(),parts=[...segments.segment(trimmed)].map(part=>part.segment);
 const scores=new Map(frecency?.entries.map(entry=>[entry.id,entry.useCount/(1+Math.max(0,frecency.now-Date.parse(entry.lastUsedAt))/604800000)]));
 const custom=new Map(customKeywords?.map(entry=>[entry.id,{phrases:entry.keywords.map(customPhraseKey),words:entry.keywords.flatMap(words),glyphs:entry.keywords.flatMap(value=>[...segments.segment(value)].filter(part=>emojiGlyph.test(part.segment)).map(part=>glyphKey(part.segment)))}]));
 const glyphs=parts.filter(part=>emojiGlyph.test(part)).map(glyphKey);
 // Emoji such as ㊗️ have compatibility decompositions into letters. Do not make
 // their literal glyph searches depend on an English keyword for that letter.
 const text=parts.filter(part=>!emojiGlyph.test(part)).join(''),terms=[...new Set(words(text))];
 const queryPhrase=phrase(text),queryGlyph=glyphKey(trimmed),queryCustomPhrase=customPhraseKey(trimmed);
 const matches:{entry:Emoji;rank:number}[]=[];
 for(const item of index){
  if(included&&!included.has(item.entry.id))continue;
  if(group&&item.entry.group!==group)continue;
  if(tone!==undefined&&!emojiMatchesTone(item.entry.value,tone))continue;
  if(!trimmed){matches.push({entry:item.entry,rank:0});continue;}
  if(!terms.length&&!glyphs.length)continue;
  const extra=custom.get(item.entry.id);
  if(!glyphs.every(glyph=>item.glyph.includes(glyph)||extra?.glyphs.some(candidate=>candidate.includes(glyph)))||!terms.every(term=>item.words.some(word=>word.startsWith(term))||extra?.words.some(word=>word.startsWith(term))))continue;
  const rank=item.glyph===queryGlyph?0:item.name===queryPhrase?1:item.aliases.includes(queryPhrase)?2:item.keywords.includes(queryPhrase)||extra?.phrases.includes(queryCustomPhrase)?3:item.name.startsWith(queryPhrase)?4:5;
  matches.push({entry:item.entry,rank});
 }
 matches.sort((left,right)=>left.rank-right.rank||Number(favourites.has(right.entry.id))-Number(favourites.has(left.entry.id))||(scores.get(right.entry.id)??0)-(scores.get(left.entry.id)??0));
 return Object.freeze(matches.slice(0,limit).map(match=>match.entry));
}
