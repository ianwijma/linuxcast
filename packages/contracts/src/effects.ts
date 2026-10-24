import * as z from 'zod';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, parseContract } from './protocol.ts';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
export const effectClassSchema = z.enum(['read', 'write', 'destructive']);
export const effectPrincipalSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('builtin'), id }),
  z.strictObject({ kind: z.literal('extension'), id, version: id, integrity: z.string().regex(/^[a-f0-9]{64}$/u) }),
  z.strictObject({ kind: z.literal('workflow'), id, version: id, integrity: z.string().regex(/^[a-f0-9]{64}$/u) }),
]).readonly();
export const trustedInvocationSchema = z.strictObject({
  schemaVersion: z.literal(1), invocationId: id, principal: effectPrincipalSchema,
  source: z.enum(['query', 'explicit-user-action', 'model-tool', 'background']),
  sessionId: id.optional(), runId: id.optional(), intentRef: id.optional(),
});
export const hostOperationContractSchema = z.strictObject({
  id, effect: effectClassSchema, externallyCommunicating: z.boolean(),
  queryAllowed: z.boolean(), retrySafe: z.boolean(), permissionIds: z.array(id),
}).readonly();
export const effectSubmissionSchema = z.strictObject({ schemaVersion: z.literal(1), operationId: id, arguments: jsonValueSchema });
export const effectRequestSchema = z.strictObject({
  schemaVersion: z.literal(1), operation: hostOperationContractSchema, context: trustedInvocationSchema, arguments: jsonValueSchema,
});
export type EffectRequest = z.infer<typeof effectRequestSchema>;
export type EffectContractRegistry = ReadonlyMap<string, { contract: z.infer<typeof hostOperationContractSchema>; arguments: z.ZodType }>;
/** Context and operation classification are supplied by the trusted broker, never
 * by extension/workflow/model data. This assembles a validated dispatch record;
 * it does not authorize or execute an effect. Fresh grants, target/intent checks,
 * query restrictions, approval and pre-dispatch persistence remain mandatory.
 */
export function createBrokerEffectRequest(submission: unknown, brokerContext: unknown, registry: EffectContractRegistry): EffectRequest {
  const request = parseContract(effectSubmissionSchema, submission);
  const context = parseContract(trustedInvocationSchema, brokerContext);
  const registered = registry.get(request.operationId);
  if (!registered) throw new ContractError('Unknown broker operation.');
  const contract = parseContract(hostOperationContractSchema, registered.contract);
  if (contract.id !== request.operationId) throw new ContractError('Mismatched broker operation.');
  const args = parseContract(registered.arguments, request.arguments);
  const safeArgs = parseContract(jsonValueSchema, args);
  try { return parseContract(effectRequestSchema, structuredClone({ schemaVersion: 1, operation: contract, context, arguments: safeArgs })); }
  catch { throw new ContractError('Invalid effect request.'); }
}
