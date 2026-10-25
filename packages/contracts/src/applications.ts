import * as z from 'zod';
import { httpUrlSchema } from './open-url.ts';
/** Native application operations are distinct from URI/file/argv/shell operations. */
export const desktopApplicationIdSchema=z.string().min(9).max(512).refine(value=>value.endsWith('.desktop') && !/[\\/\p{Cc}]/u.test(value) && new TextEncoder().encode(value).length<=512);
export const applicationFingerprintSchema=z.string().regex(/^[a-f0-9]{64}$/u);
export const nativeApplicationSchema=z.strictObject({desktopId:desktopApplicationIdSchema,title:z.string().min(1).max(256),description:z.string().max(512),fingerprint:applicationFingerprintSchema});
export const nativeApplicationRequestSchema=z.discriminatedUnion('operation',[
  z.strictObject({protocolVersion:z.literal(1),operation:z.literal('open-url'),url:httpUrlSchema}),
  z.strictObject({protocolVersion:z.literal(1),operation:z.literal('list'),afterId:desktopApplicationIdSchema.optional(),limit:z.number().int().min(1).max(100)}),
  z.strictObject({protocolVersion:z.literal(1),operation:z.literal('launch'),desktopId:desktopApplicationIdSchema,fingerprint:applicationFingerprintSchema}),
]);
export const applicationFailureSchema=z.strictObject({protocolVersion:z.literal(1),ok:z.literal(false),error:z.enum(['invalid-request','unavailable','stale-application','launch-failed','catalogue-too-large'])});
export const nativeApplicationListReplySchema=z.discriminatedUnion('ok',[
  z.strictObject({protocolVersion:z.literal(1),ok:z.literal(true),value:z.strictObject({applications:z.array(nativeApplicationSchema).max(100),nextCursor:desktopApplicationIdSchema.nullable()})}),applicationFailureSchema,
]);
export const nativeApplicationLaunchReplySchema=z.discriminatedUnion('ok',[
  z.strictObject({protocolVersion:z.literal(1),ok:z.literal(true),value:z.strictObject({outcome:z.literal('dispatched')})}),applicationFailureSchema,
]);
export type NativeApplication=z.infer<typeof nativeApplicationSchema>;
export type NativeApplicationRequest=z.infer<typeof nativeApplicationRequestSchema>;
