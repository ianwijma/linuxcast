import * as z from 'zod';
import {rpcFailureSchema} from './protocol.ts';
export const NOTES_EXPORT_CHANNEL='notes:export-markdown';
export const noteExportSelectionSchema=z.strictObject({id:z.uuid(),revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER-1)});
export type NoteExportSelection=z.infer<typeof noteExportSelectionSchema>;
export const noteExportRequestSchema=noteExportSelectionSchema.extend({protocolVersion:z.literal(1)});
export const noteExportReplySchema=z.discriminatedUnion('ok',[
 z.strictObject({ok:z.literal(true),value:noteExportSelectionSchema.extend({outcome:z.enum(['exported','cancelled'])})}),
 z.strictObject({ok:z.literal(false),error:rpcFailureSchema}),
]);
export type NoteExportReply=z.infer<typeof noteExportReplySchema>;
