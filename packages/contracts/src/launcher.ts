import * as z from 'zod';
import { quicklinkSelectionSchema } from './quicklinks.ts';
import type {RateConversionApi} from './rate-conversion.ts';
import type { CalculatorCopyReply } from './calculator.ts';
import { httpUrlSchema } from './open-url.ts';
import { rpcFailureSchema } from './protocol.ts';
import { uiTextSchema } from './scalars.ts';
import { applicationActionsSchema,desktopActionIdSchema } from './applications.ts';
export const MAX_LAUNCHER_COMMANDS=5607;
/** Stable opaque app IDs map to main-owned GIO identities, never renderer paths or Exec. */
export const launcherCommandIdSchema=z.union([z.enum(['linuxcast:open-local-data','linuxcast:hide','linuxcast:quit','linuxcast:open-url','linuxcast:open-file-search','linuxcast:open-notes','linuxcast:quick-note','linuxcast:calculator','linuxcast:currency-conversion','linuxcast:open-quicklinks','linuxcast:open-workflow-editor']),z.string().regex(/^application:[a-f0-9]{64}$/u),z.string().regex(/^workflow:[a-f0-9]{64}$/u),z.string().length(46).refine(value=>value.startsWith('quicklink:')&&z.uuid().safeParse(value.slice(10)).success)]);
export const LAUNCHER_CHANNELS={getCommands:'launcher:get-commands',execute:'launcher:execute',setPinned:'launcher:set-pinned',setAlias:'launcher:set-alias',openUrl:'launcher:open-url',copyCalculatorResult:'launcher:copy-calculator-result',setHidden:'launcher:set-hidden',applicationAction:'launcher:application-action'} as const;
/** Alias changes are bounded metadata, never a new command or execution authority. */
export const commandAliasSchema=z.string().min(1).max(128).refine(value=>value===value.trim() && [...value].length<=64 && !/[\p{Cc}\p{Cs}]/u.test(value) && new TextEncoder().encode(value).length<=256);
export const normalizeCommandAlias=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('en-US').trim().replace(/\s+/gu,' ');
export const launcherCommandsRequestSchema=z.strictObject({protocolVersion:z.literal(1),cursor:z.string().regex(/^[1-9][0-9]{0,15}:[0-9]{1,4}$/u).optional()});
const launcherActionRequestSchema=z.strictObject({protocolVersion:z.literal(1)});
const revision=z.number().int().positive().safe();
export const launcherExecuteRequestSchema=launcherActionRequestSchema.extend({commandId:launcherCommandIdSchema,revision});
export const launcherOpenUrlRequestSchema=launcherActionRequestSchema.extend({revision,url:httpUrlSchema});
export const launcherApplicationActionRequestSchema=launcherActionRequestSchema.extend({revision,commandId:z.string().regex(/^application:[a-f0-9]{64}$/u),actionId:desktopActionIdSchema});
export const launcherPinRequestSchema=launcherExecuteRequestSchema.extend({pinned:z.boolean()});
/** Recovery actions remain visible even when visibility storage is unavailable. */
export const isLauncherVisibilityProtected=(commandId:string):boolean=>commandId==='linuxcast:hide'||commandId==='linuxcast:quit';
export const launcherVisibilityRequestSchema=launcherExecuteRequestSchema.extend({hidden:z.boolean()}).refine(value=>!isLauncherVisibilityProtected(value.commandId));
export const launcherAliasRequestSchema=launcherExecuteRequestSchema.extend({alias:commandAliasSchema.nullable()});
export const launcherCommandMetadataSchema=z.strictObject({
  id:launcherCommandIdSchema,provider:z.enum(['commands','applications']).optional(),title:z.string().min(1).max(256),subtitle:z.string().max(512).optional(),
  aliases:z.array(z.string().max(256)).max(16),keywords:z.array(z.string().max(128)).max(16),
  hidden:z.boolean().optional(),enabled:z.boolean(),unavailableReason:z.string().max(256).optional(),
  applicationActions:applicationActionsSchema.optional(),
  quicklink:quicklinkSelectionSchema.extend({webSearch:z.literal(true).optional()}).optional(),
  usage:z.strictObject({useCount:z.number().int().nonnegative().safe(),lastUsedAt:z.iso.datetime().nullable(),pinned:z.boolean(),alias:uiTextSchema.nullable()}).nullable(),
}).refine(command=>(command.enabled||!!command.unavailableReason)&&(!isLauncherVisibilityProtected(command.id)||command.hidden!==true)&&(!command.applicationActions||command.id.startsWith('application:'))&&(command.id.startsWith('quicklink:')?!!command.quicklink&&command.id===`quicklink:${command.quicklink.id}`:command.quicklink===undefined));
export const launcherCommandsSnapshotSchema=z.strictObject({revision,commands:z.array(launcherCommandMetadataSchema).max(100),rankingAvailable:z.boolean(),visibilityAvailable:z.boolean().optional(),nextCursor:z.string().max(32).nullable().optional(),applicationState:z.enum(['available','unavailable']).optional(),updateOnly:z.boolean().optional()})
  .refine(snapshot=>new Set(snapshot.commands.map(command=>command.id)).size===snapshot.commands.length);
const failed=z.strictObject({ok:z.literal(false),error:rpcFailureSchema});
export const launcherCommandsReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:launcherCommandsSnapshotSchema}),failed]);
export const launcherExecuteReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.enum(['completed','dispatched'])})}),failed]);
export const launcherOpenUrlReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('dispatched')})}),failed]);
export const launcherApplicationActionReplySchema=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('requested'),actionId:desktopActionIdSchema})}),failed]);
export type LauncherApplicationActionReply=z.infer<typeof launcherApplicationActionReplySchema>;
export type LauncherOpenUrlReply=z.infer<typeof launcherOpenUrlReplySchema>;
export type LauncherCommandMetadata=z.infer<typeof launcherCommandMetadataSchema>;
export type LauncherCommandsSnapshot=z.infer<typeof launcherCommandsSnapshotSchema>;
export type LauncherCommandsReply=z.infer<typeof launcherCommandsReplySchema>;
export type LauncherExecuteReply=z.infer<typeof launcherExecuteReplySchema>;
export interface LauncherApi extends Partial<RateConversionApi> {
  executeApplicationAction?:(request:Pick<z.infer<typeof launcherApplicationActionRequestSchema>,'commandId'|'revision'|'actionId'>)=>Promise<LauncherApplicationActionReply>;
  setLauncherHidden?:(request:Pick<z.infer<typeof launcherVisibilityRequestSchema>,'commandId'|'revision'|'hidden'>)=>Promise<LauncherCommandsReply>;
  copyCalculatorResult?:(request:{revision:number;expression:string})=>Promise<CalculatorCopyReply>;
  openLauncherUrl(request:{revision:number;url:string}):Promise<LauncherOpenUrlReply>;
  setLauncherAlias(request:Pick<z.infer<typeof launcherAliasRequestSchema>,'commandId'|'revision'|'alias'>):Promise<LauncherCommandsReply>;
  setLauncherPinned(request:Pick<z.infer<typeof launcherPinRequestSchema>,'commandId'|'revision'|'pinned'>):Promise<LauncherCommandsReply>;
  getLauncherCommands(request?:{cursor?:string}):Promise<LauncherCommandsReply>;
  executeLauncherCommand(request:Pick<z.infer<typeof launcherExecuteRequestSchema>,'commandId'|'revision'>):Promise<LauncherExecuteReply>;
}
