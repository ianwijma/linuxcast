import * as z from 'zod';
import {rpcFailureSchema} from './protocol.ts';
import {noteContentSchema} from './notes.ts';
export const NOTES_IMPORT_CHANNEL='notes:choose-markdown-import';
export const noteImportRequestSchema=z.strictObject({protocolVersion:z.literal(1)});
export const noteImportPreviewSchema=z.strictObject({outcome:z.literal('ready'),content:noteContentSchema});
export const noteImportReplySchema=z.discriminatedUnion('ok',[
 z.strictObject({ok:z.literal(true),value:z.discriminatedUnion('outcome',[z.strictObject({outcome:z.literal('cancelled')}),noteImportPreviewSchema])}),
 z.strictObject({ok:z.literal(false),error:rpcFailureSchema}),
]);
export type NoteImportPreview=z.infer<typeof noteImportPreviewSchema>;
export type NoteImportReply=z.infer<typeof noteImportReplySchema>;
