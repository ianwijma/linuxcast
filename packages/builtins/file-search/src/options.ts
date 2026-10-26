import { fileSearchOptionsKey,fileSearchOptionsSchema } from '@linuxcast/contracts';
import type { FileSearchOptions } from '@linuxcast/contracts';
export type OptionsDraft={sort:string;kind:string;modifiedFrom:string|null;modifiedThrough:string|null};
export type OptionsErrors=Partial<Record<keyof OptionsDraft,string>>;
const DAY=86400000;
export const defaultOptionsKey=fileSearchOptionsKey();
/** Fixed UTC calendar date, without locale parsing or Date.UTC's years0..99 adjustment. */
export function parseUtcDate(value:string):number|null{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  if(year<1||year>9999||month<1||month>12||day<1||day>days[month-1]!)return null;
  const date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);return date.getTime();
}
function formatUtcDate(ms:number){const date=new Date(ms);return `${String(date.getUTCFullYear()).padStart(4,'0')}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;}
export function optionsDraft(options?:FileSearchOptions):OptionsDraft{return {sort:options?.sort??'relevance',kind:options?.kind??'any',modifiedFrom:options?.modifiedFromMs===undefined?null:formatUtcDate(options.modifiedFromMs),modifiedThrough:options?.modifiedBeforeMs===undefined?null:formatUtcDate(options.modifiedBeforeMs-DAY)};}
export function parseOptionsDraft(raw:unknown):{ok:true;options:FileSearchOptions;draft:OptionsDraft}|{ok:false;errors:OptionsErrors;draft?:OptionsDraft}{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==4||!['sort','kind','modifiedFrom','modifiedThrough'].every(key=>Object.hasOwn(raw,key)))return {ok:false,errors:{sort:'Choose the filter and sort options again.'}};
  const value=raw as Record<string,unknown>;
  if(typeof value.sort!=='string'||typeof value.kind!=='string'||![value.modifiedFrom,value.modifiedThrough].every(date=>date===null||typeof date==='string'))return {ok:false,errors:{sort:'Choose the filter and sort options again.'}};
  const draft=value as OptionsDraft,errors:OptionsErrors={};
  if(!['relevance','name','modified-desc','size-desc'].includes(draft.sort))errors.sort='Choose an available sort order.';
  if(!['any','file','directory'].includes(draft.kind))errors.kind='Choose Any, Files or Folders.';
  const from=draft.modifiedFrom?parseUtcDate(draft.modifiedFrom):undefined,through=draft.modifiedThrough?parseUtcDate(draft.modifiedThrough):undefined;
  const invalid='Choose a real UTC date from 0001-01-01 through 9999-12-31.';
  if(from===null)errors.modifiedFrom=invalid;if(through===null)errors.modifiedThrough=invalid;
  if(from!==undefined&&from!==null&&through!==undefined&&through!==null&&from>through)errors.modifiedThrough='Choose a through date on or after the from date. Both dates are inclusive UTC dates.';
  if(Object.keys(errors).length)return {ok:false,errors,draft};
  const options=fileSearchOptionsSchema.parse({sort:draft.sort,...(draft.kind==='any'?{}:{kind:draft.kind}),...(from===undefined?{}:{modifiedFromMs:from}),...(through===undefined?{}:{modifiedBeforeMs:through!+DAY})});
  return {ok:true,options,draft};
}
export function optionsSummary(options?:FileSearchOptions):string{
  if(fileSearchOptionsKey(options)===defaultOptionsKey)return '';
  const sort={relevance:'Relevance',name:'Name A–Z','modified-desc':'Newest first','size-desc':'Largest first'}[options!.sort];
  const draft=optionsDraft(options);return [sort,options?.kind==='file'?'Files':options?.kind==='directory'?'Folders':'Any kind',draft.modifiedFrom?`from ${draft.modifiedFrom} UTC`:undefined,draft.modifiedThrough?`through ${draft.modifiedThrough} UTC`:undefined].filter(Boolean).join(' · ');
}
