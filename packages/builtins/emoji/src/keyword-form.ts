import {emojiKeywordListSchema} from '@linuxcast/contracts';
export const KEYWORD_GUIDANCE='One phrase per line; up to 16 unique phrases, each at most 64 Unicode characters and 256 UTF-8 bytes. Leading/trailing whitespace is trimmed; blank lines are omitted. Order and other text stay exact. Save replaces the full list; empty clears it. No Copy or paste.';
export function parseKeywordDraft(value:unknown):{ok:true;keywords:string[]}|{ok:false;error:string}{
 if(typeof value!=='string'||value.length>65536||/[\u2028\u2029]/u.test(value))return{ok:false,error:'Enter at most 16 safe phrases, one per line, within the displayed limits.'};
 const keywords=value.split(/\r\n|\r|\n/u).map(line=>line.trim()).filter(Boolean),parsed=emojiKeywordListSchema.safeParse(keywords);
 return parsed.success?{ok:true,keywords:parsed.data}:{ok:false,error:'Use at most 16 unique phrases, each 1–64 Unicode characters and at most 256 UTF-8 bytes. Include a letter, number or emoji; remove control or directional-formatting characters.'};
}
