import * as z from 'zod';
import { rpcFailureSchema } from './protocol.ts';
import { uiTextSchema } from './scalars.ts';
/** First application-flow increment: only actual, trusted, already implemented built-ins. */
export const launcherCommandIdSchema=z.enum(['linuxcast:open-local-data','linuxcast:hide','linuxcast:quit']);
export const LAUNCHER_CHANNELS={getCommands:'launcher:get-commands',execute:'launcher:execute'} as const;
export const launcherCommandsRequestSchema=z.strictObject({protocolVersion:z.literal(1)});
const revision=z.number().int().positive().safe();
export const launcherExecuteRequestSchema=launcherCommandsRequestSchema.extend({commandId:launcherCommandIdSchema,revision});
export const launcherCommandMetadataSchema=z.strictObject({
  id:launcherCommandIdSchema,title:z.string().min(1).max(256),subtitle:z.string().max(512).optional(),
  aliases:z.array(z.string().max(256)).max(16),keywords:z.array(z.string().max(128)).max(16),
  enabled:z.boolean(),unavailableReason:z.string().max(256).optional(),
  usage:z.strictObject({useCount:z.number().int().nonnegative().safe(),lastUsedAt:z.iso.datetime().nullable(),pinned:z.boolean(),alias:uiTextSchema.nullable()}).nullable(),
}).refine(command=>command.enabled||!!command.unavailableReason);
export const launcherCommandsSnapshotSchema=z.strictObject({revision,commands:z.array(launcherCommandMetadataSchema).max(3),rankingAvailable:z.boolean()})
  .refine(snapshot=>new Set(snapshot.commands.map(command=>command.id)).size===snapshot.commands.length);
const failed=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const launcherCommandsReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:launcherCommandsSnapshotSchema}),failed]);
export const launcherExecuteReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.enum(['completed','dispatched'])})}),failed]);
export type LauncherCommandMetadata=z.infer<typeof launcherCommandMetadataSchema>;
export type LauncherCommandsSnapshot=z.infer<typeof launcherCommandsSnapshotSchema>;
export type LauncherCommandsReply=z.infer<typeof launcherCommandsReplySchema>;
export type LauncherExecuteReply=z.infer<typeof launcherExecuteReplySchema>;
export interface LauncherApi {
  getLauncherCommands():Promise<LauncherCommandsReply>;
  executeLauncherCommand(request:Pick<z.infer<typeof launcherExecuteRequestSchema>,'commandId'|'revision'>):Promise<LauncherExecuteReply>;
}
