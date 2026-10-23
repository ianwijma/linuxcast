import * as z from 'zod';
import { uiTextSchema as text } from './scalars.ts';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, parseContract, rpcFailureSchema } from './protocol.ts';

const id = text.min(1);
const count = z.number().int().nonnegative();
const jsonObject = jsonValueSchema.refine(value => value !== null && typeof value === 'object' && !Array.isArray(value));
const identity = { protocolVersion: z.literal(1), requestId: id, sessionId: id, method: id };
export const extensionRequestSchema = z.strictObject({ ...identity, kind: z.literal('request'),
  params: jsonValueSchema, deadlineMs: count.optional() });
export const extensionResponseSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ ...identity, kind: z.literal('response'), outcome: z.literal('completed'), terminal: z.literal(true), result: jsonValueSchema }),
  z.strictObject({ ...identity, kind: z.literal('response'), outcome: z.literal('failed'), terminal: z.literal(true), error: rpcFailureSchema
    .refine(error => error.code !== 'cancelled') }),
  z.strictObject({ ...identity, kind: z.literal('response'), outcome: z.literal('cancelled'), terminal: z.literal(true), error: rpcFailureSchema
    .refine(error => error.code === 'cancelled' && !error.retryable) }),
]);
export const extensionEventSchema = z.strictObject({ ...identity, kind: z.literal('event'), subscriptionId: id,
  sequence: z.number().int().positive(), terminal: z.literal(false), payload: jsonValueSchema });

/** These are event data, not handlers. The host validates the current view,
 * revision, selected item, form fields and invocation authority before dispatch.
 */
export const extensionViewEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('queryChanged'), viewId: id, query: text, queryRevision: count }),
  z.strictObject({ type: z.literal('selectionChanged'), viewId: id, itemId: id }),
  z.strictObject({ type: z.literal('action'), viewId: id, revision: count, itemId: id.optional(), actionId: id }),
  z.strictObject({ type: z.literal('formSubmitted'), viewId: id, values: jsonObject }),
  z.strictObject({ type: z.literal('cancel'), reason: text }),
]);
export type ExtensionRequest = Omit<z.infer<typeof extensionRequestSchema>, 'params'> & { params: unknown };
type WireExtensionResponse = z.infer<typeof extensionResponseSchema>;
export type ExtensionResponse = Exclude<WireExtensionResponse, { outcome: 'completed' }> |
  (Omit<Extract<WireExtensionResponse, { outcome: 'completed' }>, 'result'> & { result: unknown });
export type ExtensionViewEvent = z.infer<typeof extensionViewEventSchema>;
export type ExtensionEvent = Omit<z.infer<typeof extensionEventSchema>, 'payload'> & { payload: unknown };
export type SubscriptionContract = { sessionId: string; requestId: string; method: string; payload: z.ZodType };

/** Both registries come from the authenticated connection, never the body.
 * Session IDs are routing data; a matching string is not a principal or grant.
 */
export function parseExtensionRequest(value: unknown, sessions: ReadonlySet<string>, methods: ReadonlyMap<string, z.ZodType>): ExtensionRequest {
  const request = parseContract(extensionRequestSchema, value);
  if (!sessions.has(request.sessionId)) throw new ContractError('Unknown extension session.');
  const params = methods.get(request.method);
  if (!params) throw new ContractError('Unknown extension method.');
  return { ...request, params: parseContract(params, request.params) };
}
export function parseExtensionEvent(value: unknown, subscriptions: ReadonlyMap<string, SubscriptionContract>): ExtensionEvent {
  const event = parseContract(extensionEventSchema, value);
  const subscription = subscriptions.get(event.subscriptionId);
  if (!subscription || subscription.sessionId !== event.sessionId || subscription.requestId !== event.requestId || subscription.method !== event.method) {
    throw new ContractError('Unknown extension subscription.');
  }
  return { ...event, payload: parseContract(subscription.payload, event.payload) };
}
/** Bind every terminal to the outstanding invocation before consuming it.
 * The connection owner removes that invocation once, enforces deadlines and
 * cancels subscriptions/leases on disconnect. Parsing performs no OS effect.
 */
export function parseExtensionResponse(value: unknown, request: Pick<ExtensionRequest, 'requestId' | 'sessionId' | 'method'>, resultSchema: z.ZodType): ExtensionResponse {
  const response = parseContract(extensionResponseSchema, value);
  if (response.requestId !== request.requestId || response.sessionId !== request.sessionId || response.method !== request.method) {
    throw new ContractError('Mismatched extension response.');
  }
  return response.outcome === 'completed' ? { ...response, result: parseContract(resultSchema, response.result) } : response;
}
