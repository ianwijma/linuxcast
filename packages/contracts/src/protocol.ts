import * as z from 'zod';
import { failureDetailsSchema, jsonValueSchema } from './json-value.ts';

export const PROTOCOL_VERSION = 1;
export const MAX_ENVELOPE_BYTES = 1024 * 1024;
export { MAX_JSON_DEPTH } from './json-value.ts';
const generation = z.number().int().nonnegative();

export const capabilityStateSchema = z.enum([
  'available', 'permission-required', 'component-required',
  'unsupported', 'temporarily-unavailable',
]);
export const capabilityStatusSchema = z.strictObject({
  id: z.string(), state: capabilityStateSchema, backend: z.string().nullable(),
  reasonCode: z.string().optional(), remediationAction: z.string().optional(), generation,
});
export const INITIAL_CAPABILITY_IDS = [
  'launcher.activate', 'launcher.position', 'clipboard.read', 'clipboard.monitor',
  'input.paste', 'input.remap', 'input.capture', 'input.autoExpand',
  'windows.list', 'windows.resize', 'screen.capture', 'secrets.persist', 'sandbox.execute',
] as const;

export const rpcFailureSchema = z.strictObject({
  code: z.enum(['invalid-request', 'permission-denied', 'capability-unavailable',
    'cancelled', 'deadline-exceeded', 'conflict', 'internal']),
  message: z.string(), retryable: z.boolean(),
  details: failureDetailsSchema.optional(),
});
export type RpcFailure = z.infer<typeof rpcFailureSchema>;
export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;

export const handshakeSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION), componentBuild: z.string(),
  supportedMethods: z.array(z.string()), capabilityGeneration: generation,
});
export const rpcRequestSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION), id: z.string(), method: z.string(),
  params: jsonValueSchema, deadlineMs: z.number().int().nonnegative().optional(),
});
export type Handshake = z.infer<typeof handshakeSchema>;
export type RpcRequest = Omit<z.infer<typeof rpcRequestSchema>, 'params'> & { params: unknown };

/** Safe boundary error: never forward Zod issues, raw payloads or stderr to the UI. */
export class ContractError extends Error {
  readonly failure: RpcFailure;
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
    this.failure = { code: 'invalid-request', message, retryable: false };
  }
}

export function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
  } catch { /* Includes bounded failure for excessively nested in-memory inputs. */ }
  throw new ContractError('Invalid protocol message.');
}

/** A transport envelope alone cannot authorize dispatch or validate method parameters. */
export function parseRequest(
  value: unknown, methods: ReadonlyMap<string, z.ZodType>,
): RpcRequest {
  const request = parseContract(rpcRequestSchema, value);
  const paramsSchema = methods.get(request.method);
  if (!paramsSchema) throw new ContractError('Unknown protocol method.');
  return { ...request, params: parseContract(paramsSchema, request.params) };
}
