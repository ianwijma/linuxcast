import * as z from 'zod';
import type {NotesLauncherSelection} from './notes-launcher.ts';
import type {NoteExportSelection,NoteExportReply} from './notes-export.ts';
import { rpcFailureSchema } from './protocol.ts';
import type { RepositoryContracts } from './repositories.ts';
const encoder=new TextEncoder();
const sized=(n:number)=>z.string().refine(value=>value.length<=n&&encoder.encode(value).length<=n&&!value.includes('\0')&&!/[\p{Cs}]/u.test(value));
const revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1);
export const NOTE_DOCUMENT_VERSION=1;
export const NOTE_TEXT_MAX_BYTES=65536,NOTE_JSON_MAX_BYTES=262144;
export type NoteNode={type:string;attrs?:Record<string,string|number|boolean|null>;text?:string;marks?:{type:string}[];content?:NoteNode[]};
export type NoteDocument={type:'doc';content:NoteNode[]};
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const keys=(v:Record<string,unknown>,required:string[],optional:string[]=[])=>required.every(key=>Object.hasOwn(v,key))&&Object.keys(v).every(key=>required.includes(key)||optional.includes(key));
const inline=new Set(['text','hardBreak']),blocks=new Set(['paragraph','heading','bulletList','orderedList','taskList','codeBlock','blockquote','horizontalRule']);
/** Iterative bounded validation runs before recursive editor/JSON consumers. No HTML,
 * URLs, assets, arbitrary attributes, third-party nodes or executable content. */
export function isNoteDocument(value:unknown):value is NoteDocument{
 if(!plain(value)||value.type!=='doc'||!keys(value,['type','content'])||!Array.isArray(value.content)||!value.content.length||value.content.length>2048)return false;
 const stack:{value:unknown;parent:string;depth:number;position:number}[]=value.content.map((node,position)=>({value:node,parent:'doc',depth:1,position}));let count=0,bytes=0;
 while(stack.length){const entry=stack.pop()!,node=entry.value;if(++count>4096||entry.depth>16||!plain(node)||typeof node.type!=='string')return false;const type=node.type;
  if(entry.parent==='doc'||entry.parent==='blockquote'){if(!blocks.has(type))return false;}
  else if(['paragraph','heading'].includes(entry.parent)){if(!inline.has(type))return false;}
  else if(entry.parent==='codeBlock'){if(type!=='text'||node.marks!==undefined)return false;}
  else if(['bulletList','orderedList'].includes(entry.parent)){if(type!=='listItem')return false;}
  else if(entry.parent==='taskList'){if(type!=='taskItem')return false;}
  else if(['listItem','taskItem'].includes(entry.parent)){if(entry.position===0?type!=='paragraph':!blocks.has(type))return false;}
  else return false;
  if(!keys(node,['type'],['attrs','text','marks','content']))return false;
  if(type==='text'){if(typeof node.text!=='string'||!node.text||node.text.length>NOTE_TEXT_MAX_BYTES||(node.text.includes('\0')||/[\p{Cs}]/u.test(node.text)))return false;bytes+=encoder.encode(node.text).length;if(bytes>NOTE_TEXT_MAX_BYTES||node.attrs!==undefined||node.content!==undefined)return false;}
  else if(node.text!==undefined)return false;
  if(node.marks!==undefined){if(!inline.has(type)||!Array.isArray(node.marks)||node.marks.length>4)return false;const seen=new Set<string>();for(const mark of node.marks){if(!plain(mark)||!keys(mark,['type'])||typeof mark.type!=='string'||!['bold','italic','strike','code'].includes(mark.type)||seen.has(mark.type))return false;seen.add(mark.type);}if(seen.has('code')&&seen.size>1)return false;}
  if(type==='heading'){if(!plain(node.attrs)||!keys(node.attrs,['level'])||![1,2,3].includes(node.attrs.level as number))return false;}
  else if(type==='taskItem'){if(!plain(node.attrs)||!keys(node.attrs,['checked'])||typeof node.attrs.checked!=='boolean')return false;}
  else if(type==='orderedList'){if(node.attrs!==undefined&&(!plain(node.attrs)||!keys(node.attrs,['start'],['type'])||!Number.isSafeInteger(node.attrs.start)||Number(node.attrs.start)<1||Number(node.attrs.start)>1000000||node.attrs.type!==undefined&&node.attrs.type!==null))return false;}
  else if(type==='codeBlock'){if(node.attrs!==undefined&&(!plain(node.attrs)||!keys(node.attrs,['language'])||node.attrs.language!==null&&(typeof node.attrs.language!=='string'||!/^[a-zA-Z0-9_+.-]{0,40}$/u.test(node.attrs.language))))return false;}
  else if(node.attrs!==undefined)return false;
  if(inline.has(type)||type==='horizontalRule'){if(node.content!==undefined)return false;}
  else {if(node.content!==undefined&&!Array.isArray(node.content))return false;const children=(node.content??[]) as unknown[];if(children.length>2048||!['paragraph','heading','codeBlock'].includes(type)&&!children.length)return false;for(let index=0;index<children.length;index++)stack.push({value:children[index],parent:type,depth:entry.depth+1,position:index});}
 }
 try{return encoder.encode(notePlainText(value as NoteDocument)).length<=NOTE_TEXT_MAX_BYTES&&encoder.encode(JSON.stringify(value)).length<=NOTE_JSON_MAX_BYTES;}catch{return false;}
}
export const noteDocumentSchema=z.custom<NoteDocument>(isNoteDocument);
export function emptyNoteDocument():NoteDocument{return {type:'doc',content:[{type:'paragraph'}]};}
/** Owner-derived search projection; never a caller-provided index or HTML. */
export function notePlainText(document:NoteDocument):string{
 const visit=(node:NoteNode):string=>node.type==='text'?node.text!:node.type==='hardBreak'?'\n':(node.content??[]).map(visit).join(['doc','blockquote','bulletList','orderedList','taskList','listItem','taskItem'].includes(node.type)?'\n':'');
 return visit(document);
}
export const noteTitleSchema=sized(256).min(1).refine(value=>value.trim().length>0&&!/[\p{Cc}]/u.test(value));
export const noteContentSchema=z.strictObject({title:noteTitleSchema,document:noteDocumentSchema});
export type NoteContent=z.infer<typeof noteContentSchema>;
/** Stable comparison only for already validated structured content, preserving
 * all text and array order. Never use HTML or a caller's search projection. */
export function noteContentKey(content:NoteContent):string{
 const sort=(value:unknown):unknown=>Array.isArray(value)?value.map(sort):plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;
 return JSON.stringify(sort(noteContentSchema.parse(content)));
}
export const noteRecordSchema=z.strictObject({id:z.uuid(),documentVersion:z.literal(1),revision:revision.positive(),pinned:z.boolean(),archived:z.boolean(),trashed:z.boolean(),draft:noteContentSchema,saved:noteContentSchema.nullable(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime()});
export type NoteRecord=z.infer<typeof noteRecordSchema>;
export const noteWriteSchema=z.strictObject({id:z.uuid(),expectedRevision:revision,action:z.enum(['draft','save']),content:noteContentSchema});
export type NoteWrite=z.infer<typeof noteWriteSchema>;
export const notePinSchema=z.strictObject({id:z.uuid(),expectedRevision:revision.positive(),pinned:z.boolean()});
export type NotePin=z.infer<typeof notePinSchema>;
export const noteArchiveSchema=z.strictObject({id:z.uuid(),expectedRevision:revision.positive(),archived:z.boolean()});
export type NoteArchive=z.infer<typeof noteArchiveSchema>;
export const noteTrashSchema=z.strictObject({id:z.uuid(),expectedRevision:revision.positive(),trashed:z.boolean()});
export type NoteTrash=z.infer<typeof noteTrashSchema>;
/** Permanent logical deletion is limited to one existing trashed CAS revision. */
export const noteDeleteSchema=z.strictObject({id:z.uuid(),expectedRevision:revision.positive()});
export type NoteDelete=z.infer<typeof noteDeleteSchema>;
export const noteDeletedSchema=z.strictObject({id:z.uuid(),deletedRevision:revision.positive()});
export type NoteDeleted=z.infer<typeof noteDeletedSchema>;
/** Transient whole-Trash basis, independent of library filters and pagination.
 * Public digest of ordered ID/revision pairs; not a permission or stored content. */
export const notesTrashSnapshotSchema=z.strictObject({count:z.number().int().nonnegative().safe(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/u)});
export type NotesTrashSnapshot=z.infer<typeof notesTrashSnapshotSchema>;
export const notesEmptyTrashSchema=z.strictObject({expectedCount:z.number().int().positive().safe(),expectedFingerprint:z.string().regex(/^[a-f0-9]{64}$/u)});
export type NotesEmptyTrash=z.infer<typeof notesEmptyTrashSchema>;
export const notesTrashEmptiedSchema=z.strictObject({deletedCount:z.number().int().positive().safe(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/u)});
export type NotesTrashEmptied=z.infer<typeof notesTrashEmptiedSchema>;
export const noteSummarySchema=z.strictObject({id:z.uuid(),revision:revision.positive(),title:noteTitleSchema,pinned:z.boolean(),archived:z.boolean(),trashed:z.boolean(),excerpt:sized(1024),hasDraft:z.boolean(),updatedAt:z.iso.datetime()});
export type NoteSummary=z.infer<typeof noteSummarySchema>;
export const notesCursorSchema=z.strictObject({updatedAt:z.iso.datetime(),id:z.uuid()});
export const notesListRequestSchema=z.strictObject({query:sized(256),pinnedOnly:z.boolean().optional(),archived:z.boolean().optional(),trashed:z.boolean().optional(),cursor:notesCursorSchema.optional()}).refine(value=>!value.trashed||!value.archived);
export type NotesListRequest=z.infer<typeof notesListRequestSchema>;
export const notesListSchema=z.strictObject({query:sized(256),pinnedOnly:z.boolean().optional(),archived:z.boolean().optional(),trashed:z.boolean().optional(),records:z.array(noteSummarySchema).max(100),nextCursor:notesCursorSchema.nullable()}).refine(value=>new Set(value.records.map(row=>row.id)).size===value.records.length&&(!value.trashed||!value.archived));
export type NotesList=z.infer<typeof notesListSchema>;
const failure=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const notesTrashSnapshotReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:notesTrashSnapshotSchema}),failure]);
export type NotesTrashSnapshotReply=z.infer<typeof notesTrashSnapshotReplySchema>;
export const notesEmptyTrashReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:notesTrashEmptiedSchema}),failure]);
export type NotesEmptyTrashReply=z.infer<typeof notesEmptyTrashReplySchema>;
export const notesReadReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:noteRecordSchema.nullable()}),failure]);
export const notesDeleteReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:noteDeletedSchema}),failure]);
export type NotesDeleteReply=z.infer<typeof notesDeleteReplySchema>;
export const notesWriteReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:noteRecordSchema}),failure]);
export const notesListReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:notesListSchema}),failure]);
export type NotesReadReply=z.infer<typeof notesReadReplySchema>;
export type NotesWriteReply=z.infer<typeof notesWriteReplySchema>;
export type NotesListReply=z.infer<typeof notesListReplySchema>;
/** Saved history is bounded metadata; fetch one closed content document for review. */
export const noteHistoryRequestSchema=z.strictObject({id:z.uuid(),expectedRevision:revision.positive()});
export type NoteHistoryRequest=z.infer<typeof noteHistoryRequestSchema>;
export const noteRevisionSelectionSchema=noteHistoryRequestSchema.extend({revision:revision.positive()});
export type NoteRevisionSelection=z.infer<typeof noteRevisionSelectionSchema>;
export const noteSavedRevisionSummarySchema=z.strictObject({revision:revision.positive(),createdAt:z.iso.datetime(),title:noteTitleSchema});
export const noteSavedRevisionSchema=z.strictObject({revision:revision.positive(),createdAt:z.iso.datetime(),content:noteContentSchema});
export const noteHistorySchema=z.strictObject({id:z.uuid(),currentRevision:revision.positive(),revisions:z.array(noteSavedRevisionSummarySchema).max(50)}).refine(value=>value.revisions.every((row,index)=>row.revision<=value.currentRevision&&(index===0||row.revision<value.revisions[index-1]!.revision)));
export type NoteHistory=z.infer<typeof noteHistorySchema>;
export const noteRevisionReadSchema=z.strictObject({id:z.uuid(),currentRevision:revision.positive(),savedRevision:noteSavedRevisionSchema}).refine(value=>value.savedRevision.revision<=value.currentRevision);
export type NoteRevisionRead=z.infer<typeof noteRevisionReadSchema>;
export const noteHistoryReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:noteHistorySchema}),failure]);
export const noteRevisionReadReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:noteRevisionReadSchema}),failure]);
export type NoteHistoryReply=z.infer<typeof noteHistoryReplySchema>;
export type NoteRevisionReadReply=z.infer<typeof noteRevisionReadReplySchema>;
export const NOTES_CHANNELS={trashSnapshot:'notes:trash-snapshot',emptyTrash:'notes:empty-trash',list:'notes:list',get:'notes:get',write:'notes:write',setPinned:'notes:set-pinned',setArchived:'notes:set-archived',setTrashed:'notes:set-trashed',deletePermanently:'notes:delete-permanently',history:'notes:history',getRevision:'notes:get-revision',restoreRevision:'notes:restore-revision',close:'notes:close',appearance:'notes:appearance'} as const;
export const NOTES_QUICK_NOTE_READY='notes:quick-note-ready',NOTES_QUICK_NOTE_REQUESTED='notes:quick-note-requested',NOTES_QUICK_NOTE_FINISHED='notes:quick-note-finished';
export const NOTES_APPEARANCE='notes:appearance-changed',NOTES_CLOSE_REQUESTED='notes:close-requested',NOTES_CLOSE_FINISHED='notes:close-finished';
export const notesRequestSchema=z.strictObject({protocolVersion:z.literal(1)});
export const notesGetRequestSchema=notesRequestSchema.extend({id:z.uuid()});
export const notesQueryRequestSchema=notesListRequestSchema.safeExtend({protocolVersion:z.literal(1)});
export const notesWriteRequestSchema=notesRequestSchema.extend({input:noteWriteSchema});
export const notesPinRequestSchema=notesRequestSchema.extend({input:notePinSchema});
export const notesArchiveRequestSchema=notesRequestSchema.extend({input:noteArchiveSchema});
export const notesTrashRequestSchema=notesRequestSchema.extend({input:noteTrashSchema});
export const notesEmptyTrashRequestSchema=notesRequestSchema.extend({input:notesEmptyTrashSchema});
export const notesDeleteRequestSchema=notesRequestSchema.extend({input:noteDeleteSchema});
export const notesHistoryRequestSchema=notesRequestSchema.extend({input:noteHistoryRequestSchema});
export const notesRevisionRequestSchema=notesRequestSchema.extend({input:noteRevisionSelectionSchema});
export const notesCloseAttemptSchema=notesRequestSchema.extend({attemptId:z.number().int().positive().safe()});
export const notesCloseFinishedSchema=notesCloseAttemptSchema.extend({allowClose:z.boolean()});
export const notesQuickNoteFinishedSchema=notesCloseAttemptSchema.extend({created:z.boolean()});
export interface NotesApi{
 trashSnapshot?():Promise<NotesTrashSnapshotReply>;
 emptyTrash?(input:NotesEmptyTrash):Promise<NotesEmptyTrashReply>;
 deletePermanently?(input:NoteDelete):Promise<NotesDeleteReply>;
 onOpenNoteRequested?(listener:(selection:NotesLauncherSelection)=>boolean|Promise<boolean>):()=>void;
 history?(input:NoteHistoryRequest):Promise<NoteHistoryReply>;
 getRevision?(input:NoteRevisionSelection):Promise<NoteRevisionReadReply>;
 restoreRevision?(input:NoteRevisionSelection):Promise<NotesWriteReply>;
 onQuickNoteRequested?(listener:()=>boolean|Promise<boolean>):()=>void;
 setTrashed?(input:NoteTrash):Promise<NotesWriteReply>;
 setArchived?(input:NoteArchive):Promise<NotesWriteReply>;
 setPinned?(input:NotePin):Promise<NotesWriteReply>;
 exportMarkdown?(input:NoteExportSelection):Promise<NoteExportReply>;
 list(input:NotesListRequest):Promise<NotesListReply>;
 get(id:string):Promise<NotesReadReply>;
 write(input:NoteWrite):Promise<NotesWriteReply>;
 close():Promise<void>;
 onCloseRequested(listener:()=>boolean|Promise<boolean>):()=>void;
 getAppearance():Promise<'dark'|'light'>;
 onAppearance(listener:(value:'dark'|'light')=>void):()=>void;
}
export interface NotesStorageMethods{
 'notes.trashSnapshot':{params:Record<string,never>;result:NotesTrashSnapshot};
 'notes.emptyTrash':{params:NotesEmptyTrash;result:NotesTrashEmptied};
 'notes.deletePermanently':{params:NoteDelete;result:NoteDeleted};
 'notes.list':{params:NotesListRequest;result:NotesList};
 'notes.get':{params:{id:string};result:NoteRecord|null};
 'notes.write':{params:NoteWrite;result:NoteRecord};
 'notes.setPinned':{params:NotePin;result:NoteRecord};
 'notes.setArchived':{params:NoteArchive;result:NoteRecord};
 'notes.setTrashed':{params:NoteTrash;result:NoteRecord};
 'notes.history':{params:NoteHistoryRequest;result:NoteHistory};
 'notes.getRevision':{params:NoteRevisionSelection;result:NoteRevisionRead};
 'notes.restoreRevision':{params:NoteRevisionSelection;result:NoteRecord};
}
export const NOTES_STORAGE_METHODS=['notes.trashSnapshot','notes.emptyTrash','notes.deletePermanently','notes.list','notes.get','notes.write','notes.setPinned','notes.setArchived','notes.setTrashed','notes.history','notes.getRevision','notes.restoreRevision'] as const;
export const notesRepositoryContracts:RepositoryContracts=new Map([
 ['notes.trashSnapshot',{params:z.strictObject({}),result:notesTrashSnapshotSchema}],
 ['notes.emptyTrash',{params:notesEmptyTrashSchema,result:notesTrashEmptiedSchema}],
 ['notes.deletePermanently',{params:noteDeleteSchema,result:noteDeletedSchema}],
 ['notes.list',{params:notesListRequestSchema,result:notesListSchema}],
 ['notes.get',{params:z.strictObject({id:z.uuid()}),result:noteRecordSchema.nullable()}],
 ['notes.write',{params:noteWriteSchema,result:noteRecordSchema}],
 ['notes.setPinned',{params:notePinSchema,result:noteRecordSchema}],
 ['notes.setArchived',{params:noteArchiveSchema,result:noteRecordSchema}],
 ['notes.setTrashed',{params:noteTrashSchema,result:noteRecordSchema}],
 ['notes.history',{params:noteHistoryRequestSchema,result:noteHistorySchema}],
 ['notes.getRevision',{params:noteRevisionSelectionSchema,result:noteRevisionReadSchema}],
 ['notes.restoreRevision',{params:noteRevisionSelectionSchema,result:noteRecordSchema}],
]);
