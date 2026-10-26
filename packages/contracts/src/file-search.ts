import * as z from 'zod';
import { rpcFailureSchema } from './protocol.ts';
const integer=z.number().int().nonnegative().safe();
const text=(length:number)=>z.string().max(length).refine(value=>new TextEncoder().encode(value).length<=length);
export const fileSearchProgressSchema=z.strictObject({visited:integer,indexed:integer,excluded:integer,denied:integer,vanished:integer,unsupported:integer,watchFailures:integer});
/** Display metadata only. Folder selection is native/main-owned; these strings
 * and index identities are never file-open or file-read authority. */
export const fileSearchRootSchema=z.strictObject({id:z.uuid(),name:text(256).min(1),displayPath:text(4096).min(1),
  state:z.enum(['idle','scanning','ready','degraded','unavailable']),activity:z.enum(['indexing','watching','paused','unavailable']),
  generation:z.uuid().nullable(),progress:fileSearchProgressSchema.nullable()});
export const fileSearchStateSchema=z.strictObject({revision:integer.min(1),appearance:z.enum(['dark','light']),roots:z.array(fileSearchRootSchema).max(100)})
  .refine(value=>new Set(value.roots.map(root=>root.id)).size===value.roots.length);
export const fileSearchResultSchema=z.strictObject({id:text(4200).min(1),rootId:z.uuid(),generation:z.uuid(),path:text(4096).min(1),kind:z.enum(['file','directory']),size:integer,modifiedMs:z.number().int().safe()})
  .refine(value=>value.id===`${value.rootId}:${value.path}` && !value.path.startsWith('/') && value.path.split('/').every(part=>part!=='' && part!=='.' && part!=='..') && !value.path.includes('\0'));
export const FILE_SEARCH_CHANNELS={state:'file-search:state',choose:'file-search:choose',start:'file-search:start',pause:'file-search:pause',remove:'file-search:remove',search:'file-search:search',close:'file-search:close',copyPath:'file-search:copy-path'} as const;
export const FILE_SEARCH_CHANGED='file-search:changed';
export const fileSearchRequestSchema=z.strictObject({protocolVersion:z.literal(1)});
export const fileSearchRootRequestSchema=fileSearchRequestSchema.extend({rootId:z.uuid()});
/** Modified bounds are UTC epoch milliseconds: inclusive from, exclusive before.
 * Every sort name maps to a fixed owner-side SQL ordering, never caller SQL. */
export const fileSearchOptionsSchema=z.strictObject({sort:z.enum(['relevance','name','modified-desc','size-desc']),kind:z.enum(['file','directory']).optional(),modifiedFromMs:z.number().int().safe().optional(),modifiedBeforeMs:z.number().int().safe().optional()})
  .refine(value=>value.modifiedFromMs===undefined||value.modifiedBeforeMs===undefined||value.modifiedFromMs<value.modifiedBeforeMs);
export type FileSearchOptions=z.infer<typeof fileSearchOptionsSchema>;
export function fileSearchOptionsKey(options?:FileSearchOptions):string{return JSON.stringify(fileSearchOptionsSchema.parse(options??{sort:'relevance'}));}
export function fileSearchMatchesOptions(row:{kind:'file'|'directory';modifiedMs:number},options?:FileSearchOptions):boolean{return (options?.kind===undefined||row.kind===options.kind)&&(options?.modifiedFromMs===undefined||row.modifiedMs>=options.modifiedFromMs)&&(options?.modifiedBeforeMs===undefined||row.modifiedMs<options.modifiedBeforeMs);}
export const fileSearchQueryRequestSchema=fileSearchRequestSchema.extend({query:text(512),rootId:z.uuid().optional(),options:fileSearchOptionsSchema.optional()});
const failure=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const fileSearchStateReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:fileSearchStateSchema}),failure]);
export const fileSearchActionReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.discriminatedUnion('outcome',[
  z.strictObject({outcome:z.literal('selected'),rootId:z.uuid()}),z.strictObject({outcome:z.literal('cancelled')}),z.strictObject({outcome:z.literal('completed')}),
])}),failure]);
export const fileSearchQueryReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({query:text(512),rootId:z.uuid().nullable(),options:fileSearchOptionsSchema.optional(),results:z.array(fileSearchResultSchema).max(100)})
  .refine(value=>new Set(value.results.map(result=>result.id)).size===value.results.length && value.results.every(result=>value.rootId===null || result.rootId===value.rootId))}),failure]);
/** One admitted indexed result only. No path, clipboard text or file-open authority. */
export const indexedPathSelectionSchema=z.strictObject({resultId:text(4200).min(1),rootId:z.uuid(),generation:z.uuid()});
export const indexedPathCopyRequestSchema=indexedPathSelectionSchema.extend({protocolVersion:z.literal(1)});
export const indexedPathTextSchema=text(8193).min(1).refine(value=>value.startsWith('/')&&!value.includes('\0')&&!/[\p{Cs}]/u.test(value)&&(value==='/'||value.slice(1).split('/').every(part=>part!==''&&part!=='.'&&part!=='..')));
export const indexedPathCopyReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:indexedPathSelectionSchema.extend({outcome:z.literal('copied'),path:indexedPathTextSchema})}),failure]);
export type IndexedPathSelection=z.infer<typeof indexedPathSelectionSchema>;
export type IndexedPathCopyReply=z.infer<typeof indexedPathCopyReplySchema>;
export type FileSearchRoot=z.infer<typeof fileSearchRootSchema>;
export type FileSearchResult=z.infer<typeof fileSearchResultSchema>;
export type FileSearchState=z.infer<typeof fileSearchStateSchema>;
export type FileSearchStateReply=z.infer<typeof fileSearchStateReplySchema>;
export type FileSearchActionReply=z.infer<typeof fileSearchActionReplySchema>;
export type FileSearchQueryReply=z.infer<typeof fileSearchQueryReplySchema>;
export interface FileSearchApi {
  getState():Promise<FileSearchStateReply>;
  chooseFolder():Promise<FileSearchActionReply>;
  startIndex(rootId:string):Promise<FileSearchActionReply>;
  pauseIndex(rootId:string):Promise<FileSearchActionReply>;
  removeFolder(rootId:string):Promise<FileSearchActionReply>;
  search(request:{query:string;rootId?:string;options?:FileSearchOptions}):Promise<FileSearchQueryReply>;
  copyPath?(selection:IndexedPathSelection):Promise<IndexedPathCopyReply>;
  close():Promise<FileSearchActionReply>;
  onState(listener:(state:FileSearchState)=>void):()=>void;
}
