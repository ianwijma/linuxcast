import * as z from 'zod';
import { jsonValueSchema } from './json-value.ts';
import { capabilityStatusSchema, ContractError, parseContract, rpcFailureSchema } from './protocol.ts';

const nativeProgressSchema = z.discriminatedUnion('stage', [
  z.strictObject({ stage: z.literal('requested'), terminal: z.literal(false) }),
  z.strictObject({ stage: z.literal('acknowledged'), terminal: z.literal(false) }),
  z.strictObject({ stage: z.literal('observed'), terminal: z.literal(true), observation: jsonValueSchema }),
  z.strictObject({ stage: z.literal('failed'), terminal: z.literal(true), failure: rpcFailureSchema,
    effectOutcome: z.enum(['not-applied', 'unknown']), autoReplay: z.literal(false) }),
  z.strictObject({ stage: z.literal('compositor-unavailable'), terminal: z.literal(true),
    capability: capabilityStatusSchema.extend({ state: z.literal('temporarily-unavailable'),
      reasonCode: z.literal('compositor-failed'), remediationAction: z.string().min(1) }),
    failure: rpcFailureSchema.extend({ code: z.literal('capability-unavailable'), retryable: z.literal(false) }),
    effectOutcome: z.literal('unknown'), autoReplay: z.literal(false) }),
]);

export const nativeOperationIdentitySchema = z.strictObject({
  protocolVersion: z.literal(1), invocationId: z.string().min(1), operation: z.string().min(1),
  capabilityId: z.string().min(1), generation: z.number().int().nonnegative(),
});
export const nativeOperationEventSchema = nativeOperationIdentitySchema.extend({ progress: nativeProgressSchema })
  .superRefine((event, context) => {
    if (event.progress.stage === 'compositor-unavailable' &&
      (event.progress.capability.id !== event.capabilityId || event.progress.capability.generation !== event.generation)) {
      context.addIssue({ code: 'custom', message: 'Mismatched native capability snapshot.' });
    }
  });

type WireProgress = z.infer<typeof nativeProgressSchema>;
type NativeProgress = Exclude<WireProgress, { stage: 'observed' }> |
  { stage: 'observed'; terminal: true; observation: unknown };
export type NativeOperationIdentity = z.infer<typeof nativeOperationIdentitySchema>;
export type NativeOperationEvent = NativeOperationIdentity & { progress: NativeProgress };
export interface NativeOperationContract { capabilityId: string; observation: z.ZodType }

/** Registry and source authentication belong to the broker, never the message.
 * A method's observation schema describes its actual postcondition. Geometry
 * availability alone must never validate as completed native placement.
 */
export function parseNativeOperationEvent(
  value: unknown, operations: ReadonlyMap<string, NativeOperationContract>,
): NativeOperationEvent {
  const event = parseContract(nativeOperationEventSchema, value);
  const contract = operations.get(event.operation);
  if (!contract || contract.capabilityId !== event.capabilityId) throw new ContractError('Unknown native operation.');
  if (event.progress.stage !== 'observed') return event;
  return { ...event, progress: { ...event.progress,
    observation: parseContract(contract.observation, event.progress.observation) } };
}

/** Fixed safe failure copy; a crash acknowledges no successful external effect.
 * Recovery requires explicit user action and a fresh handshake/generation.
 */
export function compositorUnavailable(
  identity: NativeOperationIdentity, backend: string | null, remediationAction: string,
): NativeOperationEvent {
  return parseContract(nativeOperationEventSchema, { ...identity, progress: {
    stage: 'compositor-unavailable', terminal: true, effectOutcome: 'unknown', autoReplay: false,
    capability: { id: identity.capabilityId, generation: identity.generation, backend,
      state: 'temporarily-unavailable', reasonCode: 'compositor-failed', remediationAction },
    failure: { code: 'capability-unavailable', message: 'The desktop component stopped. Use its recovery action before trying again.',
      retryable: false },
  } });
}
