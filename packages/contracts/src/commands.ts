import * as z from 'zod';
import { versionedJsonSchemaSchema } from './ai-request.ts';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, parseContract } from './protocol.ts';

const id = z.string().min(1);
const uniqueIds = z.array(id).refine(values => new Set(values).size === values.length);
/** A registry ID uses namespace:local-name. It does not authenticate its source. */
export const commandDescriptorSchema = z.strictObject({
  protocolVersion: z.literal(1), id: z.string().regex(/^[^\s:]+:[^\s:]+$/u), title: id,
  aliases: z.array(z.string()), source: z.strictObject({ kind: z.enum(['builtin', 'extension', 'workflow']), id }),
  argumentSchema: versionedJsonSchemaSchema, requiredCapabilities: uniqueIds,
  permissionRequirements: z.array(z.strictObject({ id, scope: jsonValueSchema.optional() })),
  visibilityPredicateId: id, actionHandlerId: id,
}).refine(value => new Set(value.permissionRequirements.map(permission => permission.id)).size === value.permissionRequirements.length);
export type CommandDescriptor = z.infer<typeof commandDescriptorSchema>;
export type CommandContractRegistry = {
  capabilities: ReadonlySet<string>;
  permissions: ReadonlyMap<string, z.ZodType>;
  visibilityPredicates: ReadonlySet<string>;
  actionHandlers: ReadonlySet<string>;
};
/** The broker supplies these registries. Claimed source, capabilities and
 * permission declarations cannot grant authority or install a handler.
 */
export function parseCommandDescriptor(value: unknown, registry: CommandContractRegistry): CommandDescriptor {
  const command = parseContract(commandDescriptorSchema, value);
  if (command.requiredCapabilities.some(capability => !registry.capabilities.has(capability)) ||
    !registry.visibilityPredicates.has(command.visibilityPredicateId) || !registry.actionHandlers.has(command.actionHandlerId)) {
    throw new ContractError('Unknown command contract reference.');
  }
  return { ...command, permissionRequirements: command.permissionRequirements.map(permission => {
    const schema = registry.permissions.get(permission.id);
    if (!schema) throw new ContractError('Unknown command permission.');
    const scope = parseContract(schema, permission.scope);
    return scope === undefined ? { id: permission.id } : { id: permission.id, scope: parseContract(jsonValueSchema, scope) };
  }) };
}
