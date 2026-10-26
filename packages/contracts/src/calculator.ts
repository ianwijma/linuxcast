import * as z from 'zod';
import { rpcFailureSchema } from './protocol.ts';
/** Numeric-result-only clipboard action. No arbitrary clipboard write method. */
export const calculatorExpressionSchema=z.string().min(1).max(512).refine(value=>value.trim().length>0 && new TextEncoder().encode(value).length<=512 && !/[\p{Cc}\p{Cs}]/u.test(value));
export const calculatorCopyRequestSchema=z.strictObject({protocolVersion:z.literal(1),revision:z.number().int().positive().safe(),expression:calculatorExpressionSchema});
export const calculatorResultTextSchema=z.string().min(1).max(64).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/u).refine(value=>Number.isFinite(Number(value)));
export const calculatorCopyReplySchema=z.discriminatedUnion('ok',[
  z.strictObject({ok:z.literal(true),value:z.strictObject({outcome:z.literal('copied'),text:calculatorResultTextSchema})}),
  z.strictObject({ok:z.literal(false),error:rpcFailureSchema}),
]);
export type CalculatorCopyReply=z.infer<typeof calculatorCopyReplySchema>;
