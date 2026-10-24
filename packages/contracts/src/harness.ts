import * as z from 'zod';
import { contextReferenceSchema, normalizedMessageSchema } from './ai-request.ts';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, parseContract, rpcFailureSchema } from './protocol.ts';
import { fileReferenceSchema } from './resources.ts';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
const version = { schemaVersion: z.literal(1) };
export const harnessIdentitySchema = z.strictObject({
  runtimeId: id, runtimeVersion: id, modelId: id, accountRef: id,
  billingSource: z.enum(['api-account', 'subscription', 'cloud-account', 'byok', 'local']),
  credentialOwner: z.enum(['harness', 'broker']),
}).readonly();
export const harnessCapabilitiesSchema = z.strictObject({
  resume: z.boolean(), steering: z.boolean(), cancellation: z.enum(['upstream', 'local-only']),
});
const statusBase = { ...version, runtimeId: id };
export const harnessStatusSchema = z.discriminatedUnion('state', [
  z.strictObject({ ...statusBase, state: z.literal('ready'), identity: harnessIdentitySchema, capabilities: harnessCapabilitiesSchema })
    .refine(value => value.runtimeId === value.identity.runtimeId),
  ...(['missing-executable', 'unsupported-version', 'authentication-required', 'account-mismatch', 'quota', 'child-crash', 'lost-session'] as const)
    .map(state => z.strictObject({ ...statusBase, state: z.literal(state), reasonCode: id, remediationAction: id })),
]);
const content = {
  ...version, instructions: text, messages: z.array(normalizedMessageSchema).min(1),
  context: z.array(contextReferenceSchema), workingDirectory: fileReferenceSchema,
  offeredToolIds: z.array(id), scopeRefs: z.array(id),
  limits: z.strictObject({ timeoutMs: z.number().int().positive().max(86400000), toolSteps: z.number().int().nonnegative(),
    outputBytes: z.number().int().positive().max(1024 * 1024) }),
};
export const harnessSubmissionSchema = z.strictObject(content);
export const trustedHarnessContextSchema = z.strictObject({ runId: id, identity: harnessIdentitySchema });
export const harnessRequestSchema = z.strictObject({ ...content, ...trustedHarnessContextSchema.shape }).readonly();
export type HarnessRequest = z.infer<typeof harnessRequestSchema>;
/** Explicit harness requests use broker-selected runtime/account/billing identity.
 * This never falls back from an ordinary AI run or inherits ambient credentials.
 */
export function createBrokerHarnessRequest(submission: unknown, brokerContext: unknown): HarnessRequest {
  const input = parseContract(harnessSubmissionSchema, submission);
  const context = parseContract(trustedHarnessContextSchema, brokerContext);
  try { return parseContract(harnessRequestSchema, structuredClone({ ...input, ...context })); }
  catch { throw new ContractError('Invalid harness request.'); }
}
export const harnessSessionRefSchema = z.strictObject({ ...version, sessionId: id, identity: harnessIdentitySchema });
export const harnessSessionSchema = z.strictObject({
  ...harnessSessionRefSchema.shape, runId: id, turnId: id,
  state: z.enum(['starting', 'running', 'awaiting-approval', 'completed', 'cancelled', 'failed', 'interrupted', 'lost']),
  reconnectable: z.boolean(), resumable: z.boolean(),
}).refine(value => value.state !== 'lost' || (!value.reconnectable && !value.resumable));
const eventBase = { ...version, runId: id, sessionId: id, turnId: id, sequence: z.number().int().positive() };
export const harnessEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...eventBase, terminal: z.literal(false), kind: z.literal('progress'), message: text }),
  z.strictObject({ ...eventBase, terminal: z.literal(false), kind: z.literal('tool-approval-required'),
    callId: id, toolId: id, arguments: jsonValueSchema, scopeRefs: z.array(id) }),
  z.strictObject({ ...eventBase, terminal: z.literal(true), kind: z.literal('completed') }),
  z.strictObject({ ...eventBase, terminal: z.literal(true), kind: z.literal('cancelled') }),
  z.strictObject({ ...eventBase, terminal: z.literal(true), kind: z.literal('failed'), failure: rpcFailureSchema }),
]);
/** Connection identity, reference ownership, actual version/auth/billing checks,
 * fresh tool approval and persisted ordered terminals belong to the harness broker.
 * No parsed identity, scope reference or provider tool request grants execution.
 */
export type HarnessSession = z.infer<typeof harnessSessionSchema>;
export type HarnessSessionRef = z.infer<typeof harnessSessionRefSchema>;

export const harnessOperationSchema = z.discriminatedUnion('method', [
  z.strictObject({ ...version, method: z.literal('inspect'), runtimeId: id }),
  z.strictObject({ ...version, method: z.literal('start'), submission: harnessSubmissionSchema }),
  z.strictObject({ ...version, method: z.literal('resume'), reference: harnessSessionRefSchema }),
  z.strictObject({ ...version, method: z.literal('turn'), reference: harnessSessionRefSchema, submission: harnessSubmissionSchema }),
  z.strictObject({ ...version, method: z.literal('cancel'), reference: harnessSessionRefSchema }),
]);
export function parseHarnessEvent(value: unknown, offeredTools: ReadonlyMap<string, z.ZodType>) {
  const event = parseContract(harnessEventSchema, value);
  if (event.kind !== 'tool-approval-required') return event;
  const schema = offeredTools.get(event.toolId);
  if (!schema) throw new ContractError('Unknown harness tool.');
  const args = parseContract(schema, event.arguments);
  return { ...event, arguments: parseContract(jsonValueSchema, args) };
}
