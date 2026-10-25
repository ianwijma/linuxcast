import * as z from 'zod';
/** Explicit browser handoff only. Parsing never fetches, resolves DNS or grants a
 * generic URI/file/shell capability. The canonical ASCII address is dispatched. */
export const httpUrlSchema=z.string().min(1).max(8192).refine(value=>{
  if(/[\\\s\p{Cc}\p{Cs}]/u.test(value) || /%(?![0-9a-f]{2})/iu.test(value) || !/^https?:\/\//iu.test(value))return false;
  try {
    const parsed=new URL(value);
    const authority=value.slice(value.indexOf('://')+3).split(/[/?#]/u)[0]!;
    return ['http:','https:'].includes(parsed.protocol) && !!parsed.hostname && !!authority && !parsed.username && !parsed.password && !authority.includes('@');
  }catch{return false;}
}).transform(value=>new URL(value).href).refine(value=>new TextEncoder().encode(value).length<=8192);
