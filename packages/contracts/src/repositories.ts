import * as z from 'zod';
import { conversationRecordSchema, messageRevisionRecordSchema } from './ai-storage.ts';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, parseContract, rpcFailureSchema } from './protocol.ts';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
const base = { schemaVersion: z.literal(1), requestId: id, method: id };
export const repositoryRequestSchema = z.strictObject({ ...base, params: jsonValueSchema });
export const repositoryResponseSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ ...base, outcome: z.literal('completed'), result: jsonValueSchema }),
  z.strictObject({ ...base, outcome: z.literal('failed'), failure: rpcFailureSchema.refine(value => value.code !== 'cancelled') }),
  z.strictObject({ ...base, outcome: z.literal('cancelled'), effectOutcome: z.enum(['not-dispatched', 'unknown']),
    automaticReplay: z.literal(false), requiresReview: z.boolean() }).refine(value => value.effectOutcome !== 'unknown' || value.requiresReview),
]);
export type RepositoryContracts = ReadonlyMap<string, { params: z.ZodType; result: z.ZodType }>;
/** Only the storage owner supplies method schemas and handlers. These two native
 * repository methods anchor concrete record compatibility; domain repositories
 * register additional typed methods rather than arbitrary SQL/table/path APIs.
 */
export function createAiRepositoryContracts(): RepositoryContracts {
  return new Map([
    ['ai.conversations.get', { params: z.strictObject({ id: z.uuid() }), result: conversationRecordSchema.nullable() }],
    ['ai.messages.appendRevision', { params: z.strictObject({ record: messageRevisionRecordSchema }), result: messageRevisionRecordSchema }],
  ]);
}
export function parseRepositoryRequest(value: unknown, contracts: RepositoryContracts) {
  const request = parseContract(repositoryRequestSchema, value);
  const contract = contracts.get(request.method);
  if (!contract) throw new ContractError('Unknown repository method.');
  return { ...request, params: parseContract(jsonValueSchema, parseContract(contract.params, request.params)) };
}
/** The connection owner supplies the pending request. Parsing cannot authenticate
 * a caller/producer, authorize records or prove a write committed. Transactions,
 * revisions, ownership, cancellation outcomes and durability remain storage work.
 */
export function parseRepositoryResponse(value: unknown, pending: { requestId: string; method: string }, contracts: RepositoryContracts) {
  const response = parseContract(repositoryResponseSchema, value);
  const contract = contracts.get(pending.method);
  if (!contract || response.requestId !== pending.requestId || response.method !== pending.method) throw new ContractError('Mismatched repository response.');
  if (response.outcome !== 'completed') return response;
  return { ...response, result: parseContract(jsonValueSchema, parseContract(contract.result, response.result)) };
}
