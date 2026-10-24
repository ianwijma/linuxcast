import * as z from 'zod';
import { extensionLocalIdSchema } from './extension-manifest.ts';
import { packageVersionSchema, samePackageVersion } from './package-lifecycle.ts';
import { jsonValueSchema } from './json-value.ts';
import { capabilityStatusSchema, ContractError, MAX_ENVELOPE_BYTES, parseContract, rpcFailureSchema } from './protocol.ts';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
const counter = z.number().int().nonnegative();
const object = jsonValueSchema.refine(value => value !== null && typeof value === 'object' && !Array.isArray(value));
const extensionVersion = packageVersionSchema.refine(value => value.kind === 'extension');
function bounded<T extends z.ZodType>(schema: T) {
  return z.preprocess((value, context) => {
    const json = jsonValueSchema.safeParse(value);
    if (!json.success || new TextEncoder().encode(JSON.stringify(json.data)).byteLength > MAX_ENVELOPE_BYTES) {
      context.addIssue({ code: 'custom', message: 'Invalid extension session message.' }); return z.NEVER;
    }
    return json.data;
  }, schema);
}
/** Secret settings/arguments become opaque broker handles before session launch.
 * The broker still checks their ownership, permitted operation and expiry.
 */
export const extensionSecretHandleSchema = z.strictObject({ kind: z.literal('secret-handle'), handleId: id });
export const extensionInvocationSchema = bounded(z.strictObject({ commandId: extensionLocalIdSchema, arguments: object, preferences: object }));
const identity = { protocolVersion: z.literal(1), sessionId: id, connectionId: id, generation: counter, package: extensionVersion, commandId: extensionLocalIdSchema };
export const extensionSessionIdentitySchema = z.strictObject(identity);
export const extensionLaunchContextSchema = z.strictObject({ protocolVersion: z.literal(1), sessionId: id, connectionId: id, generation: counter,
  package: extensionVersion, capabilityGeneration: counter, capabilities: z.array(capabilityStatusSchema) })
  .refine(value => new Set(value.capabilities.map(item => item.id)).size === value.capabilities.length &&
    value.capabilities.every(item => item.generation === value.capabilityGeneration));
export const extensionSessionStartSchema = bounded(z.strictObject({ ...identity, mode: z.enum(['view', 'action', 'tray']),
  arguments: object, preferences: object, capabilityGeneration: counter, capabilities: z.array(capabilityStatusSchema) })
  .refine(value => new Set(value.capabilities.map(item => item.id)).size === value.capabilities.length &&
    value.capabilities.every(item => item.generation === value.capabilityGeneration)));
export type ExtensionSessionStart = z.infer<typeof extensionSessionStartSchema>;
export type ExtensionCommandContract = { mode: ExtensionSessionStart['mode']; arguments: z.ZodType; preferences: z.ZodType };
/** Registry is bound to the exact installed immutable version by the caller.
 * This creates data only; auth, grants, sandbox supervision and automatic-job
 * enablement are required before spawning. Packages cannot supply this context.
 */
export function createExtensionSessionStart(submission: unknown, context: unknown, commands: ReadonlyMap<string, ExtensionCommandContract>): ExtensionSessionStart {
  const input = parseContract(extensionInvocationSchema, submission);
  const broker = parseContract(extensionLaunchContextSchema, context);
  const command = commands.get(input.commandId);
  if (!command) throw new ContractError('Unknown extension command.');
  const args = parseContract(object, parseContract(command.arguments, input.arguments));
  const preferences = parseContract(object, parseContract(command.preferences, input.preferences));
  try {
    return parseContract(extensionSessionStartSchema, structuredClone({ ...broker, commandId: input.commandId, mode: command.mode, arguments: args, preferences }));
  } catch { throw new ContractError('Invalid extension session start.'); }
}
export const extensionSessionTerminalSchema = bounded(z.discriminatedUnion('outcome', [
  z.strictObject({ ...identity, terminal: z.literal(true), outcome: z.literal('completed') }),
  z.strictObject({ ...identity, terminal: z.literal(true), outcome: z.literal('cancelled'), error: rpcFailureSchema
    .refine(value => value.code === 'cancelled' && !value.retryable) }),
  z.strictObject({ ...identity, terminal: z.literal(true), outcome: z.literal('failed'), error: rpcFailureSchema.refine(value => value.code !== 'cancelled') }),
  z.strictObject({ ...identity, terminal: z.literal(true), outcome: z.literal('interrupted'), effectOutcome: z.literal('unknown'), automaticReplay: z.literal(false),
    reason: z.enum(['child-crash', 'transport-lost', 'supervisor-stopped']), remediationAction: id }),
]));
export type ExtensionSessionTerminal = z.infer<typeof extensionSessionTerminalSchema>;
/** Bind to the authenticated connection and its pinned session. An old version
 * may finish after an update; a new active version cannot impersonate it. The
 * supervisor owns interruption reports, exactly-one terminal and cleanup.
 */
export function parseExtensionSessionTerminal(value: unknown, session: z.infer<typeof extensionSessionIdentitySchema>): ExtensionSessionTerminal {
  const terminal = parseContract(extensionSessionTerminalSchema, value);
  if (terminal.sessionId !== session.sessionId || terminal.connectionId !== session.connectionId || terminal.generation !== session.generation ||
    terminal.commandId !== session.commandId || !samePackageVersion(terminal.package, session.package)) {
    throw new ContractError('Mismatched extension session terminal.');
  }
  return terminal;
}
