import * as z from 'zod';
import {noteTitleSchema} from './notes.ts';
import {rpcFailureSchema} from './protocol.ts';
import type {RepositoryContracts} from './repositories.ts';
const positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER-1);
export const notesRootQuerySchema=z.string().max(512).refine(value=>value.length<=512&&new TextEncoder().encode(value).length<=2048&&!/[\p{Cc}\p{Cs}]/u.test(value));
export const notesLauncherSelectionSchema=z.strictObject({id:z.uuid(),revision:positive});
export type NotesLauncherSelection=z.infer<typeof notesLauncherSelectionSchema>;
export const notesRootSummarySchema=notesLauncherSelectionSchema.extend({title:noteTitleSchema,excerpt:z.string().max(1024).refine(value=>value.length<=1024&&new TextEncoder().encode(value).length<=1024&&!value.includes('\0')&&!/[\p{Cs}]/u.test(value)),pinned:z.boolean(),hasDraft:z.boolean(),updatedAt:z.iso.datetime()});
export const notesRootSearchInputSchema=z.strictObject({query:notesRootQuerySchema});
export const notesRootSearchSchema=z.strictObject({query:notesRootQuerySchema,records:z.array(notesRootSummarySchema).max(20),hasMore:z.boolean()}).refine(value=>new Set(value.records.map(row=>row.id)).size===value.records.length&&(!value.hasMore||value.records.length===20)&&value.records.every((row,i)=>{const before=value.records[i-1];return !before||Number(before.pinned)>Number(row.pinned)||before.pinned===row.pinned&&(before.updatedAt>row.updatedAt||before.updatedAt===row.updatedAt&&before.id>row.id);}));
export type NotesRootSearch=z.infer<typeof notesRootSearchSchema>;
export interface NotesRootStorageMethods{'notes.searchRoot':{params:z.infer<typeof notesRootSearchInputSchema>;result:NotesRootSearch}}
export const notesRootRepositoryContracts:RepositoryContracts=new Map([['notes.searchRoot',{params:notesRootSearchInputSchema,result:notesRootSearchSchema}]]);
export const launcherNotesSearchRequestSchema=z.strictObject({protocolVersion:z.literal(1),revision:positive,query:notesRootQuerySchema});
export const launcherNotesSearchValueSchema=notesRootSearchSchema.safeExtend({revision:positive});
export const launcherNoteOpenRequestSchema=z.strictObject({protocolVersion:z.literal(1),revision:positive,selection:notesLauncherSelectionSchema});
const failure=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const launcherNotesSearchReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:launcherNotesSearchValueSchema}),failure]);
export const launcherNoteOpenReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('opened'),selection:notesLauncherSelectionSchema})}),failure]);
export type LauncherNotesSearchReply=z.infer<typeof launcherNotesSearchReplySchema>;
export type LauncherNoteOpenReply=z.infer<typeof launcherNoteOpenReplySchema>;
export interface LauncherNotesApi{
 searchLauncherNotes?(input:{revision:number;query:string}):Promise<LauncherNotesSearchReply>;
 openLauncherNote?(input:{revision:number;selection:NotesLauncherSelection}):Promise<LauncherNoteOpenReply>;
}
export const NOTES_LAUNCHER_CHANNELS={search:'launcher:search-notes',open:'launcher:open-note',ready:'notes:open-ready',requested:'notes:open-requested',finished:'notes:open-finished'} as const;
export const notesOpenAttemptSchema=z.strictObject({protocolVersion:z.literal(1),attemptId:positive,selection:notesLauncherSelectionSchema});
export const notesOpenFinishedSchema=z.strictObject({protocolVersion:z.literal(1),attemptId:positive,opened:z.boolean()});
