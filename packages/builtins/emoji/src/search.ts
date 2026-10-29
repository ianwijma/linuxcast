import {emojiData,emojiGroups,EmojiInputError} from './data.ts';
import type {Emoji} from './data.ts';

export interface EmojiSearchInput {query:string;group?:string;limit?:number;}
const encoder=new TextEncoder();
const groups=new Set(emojiGroups.map(group=>group.id));
// Text normalization affects matching only; canonical Unicode values stay intact.
const textKey=(text:string)=>text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'');
const words=(text:string)=>textKey(text).match(/[+-][0-9]+|[\p{L}\p{N}]+/gu)??[];
const phrase=(text:string)=>words(text).join(' ');
const glyphKey=(text:string)=>text.replace(/\uFE0F/gu,'');
const emojiGlyph=/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
const segments=new Intl.Segmenter('en',{granularity:'grapheme'});
const index=emojiData.map(entry=>({
 entry,glyph:glyphKey(entry.value),name:phrase(entry.name),aliases:entry.aliases.map(phrase),
 keywords:entry.keywords.map(phrase),words:[...new Set([entry.name,...entry.aliases,...entry.keywords].flatMap(words))],
}));

function validated(value:unknown):Required<EmojiSearchInput> {
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new EmojiInputError();
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)throw new EmojiInputError();
 const fields=new Map<string,unknown>();
 for(const key of Reflect.ownKeys(value)){
  if(typeof key!=='string'||!['query','group','limit'].includes(key))throw new EmojiInputError();
  const field=Object.getOwnPropertyDescriptor(value,key);
  if(!field||!('value'in field))throw new EmojiInputError();
  fields.set(key,field.value);
 }
 const query=fields.get('query'),group=fields.has('group')?fields.get('group'):'',limit=fields.has('limit')?fields.get('limit'):20;
 // Reject oversized UTF-16 before normalization, segmentation or UTF-8 allocation.
 if(typeof query!=='string'||query.length>512||/[\p{Cc}\p{Cs}]/u.test(query)||encoder.encode(query).byteLength>2048)throw new EmojiInputError();
 if(typeof group!=='string'||group.length>64||fields.has('group')&&!groups.has(group))throw new EmojiInputError();
 if(typeof limit!=='number'||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new EmojiInputError();
 return {query,group,limit};
}

/** Pure bounded offline search. All query terms match literally, without regex,
 * shell, SQL or network interpretation. Ties keep pinned Unicode source order. */
export function searchEmoji(input:EmojiSearchInput):readonly Emoji[] {
 const {query,group,limit}=validated(input),trimmed=query.trim(),parts=[...segments.segment(trimmed)].map(part=>part.segment);
 const glyphs=parts.filter(part=>emojiGlyph.test(part)).map(glyphKey);
 // Emoji such as ㊗️ have compatibility decompositions into letters. Do not make
 // their literal glyph searches depend on an English keyword for that letter.
 const text=parts.filter(part=>!emojiGlyph.test(part)).join(''),terms=[...new Set(words(text))];
 const queryPhrase=phrase(text),queryGlyph=glyphKey(trimmed);
 const matches:{entry:Emoji;rank:number}[]=[];
 for(const item of index){
  if(group&&item.entry.group!==group)continue;
  if(!trimmed){matches.push({entry:item.entry,rank:0});continue;}
  if(!terms.length&&!glyphs.length)continue;
  if(!glyphs.every(glyph=>item.glyph.includes(glyph))||!terms.every(term=>item.words.some(word=>word.startsWith(term))))continue;
  const rank=item.glyph===queryGlyph?0:item.name===queryPhrase?1:item.aliases.includes(queryPhrase)?2:item.keywords.includes(queryPhrase)?3:item.name.startsWith(queryPhrase)?4:5;
  matches.push({entry:item.entry,rank});
 }
 matches.sort((left,right)=>left.rank-right.rank);
 return Object.freeze(matches.slice(0,limit).map(match=>match.entry));
}
