import * as z from 'zod';
import { versionedJsonSchemaSchema } from './ai-request.ts';
import { effectClassSchema } from './effects.ts';
import { ContractError, parseContract } from './protocol.ts';
import { permissionRequestSchema, parsePermissionRequest } from './settings.ts';
import { uiTextSchema as text } from './scalars.ts';
import { semanticVersionSchema } from './workflow-graph.ts';
import { workflowValueSchema } from './workflows.ts';
const id = text.min(1);
const ids = z.array(id).refine(values => new Set(values).size === values.length);
const schema = versionedJsonSchemaSchema;
const jsonObject = workflowValueSchema.refine(value => value !== null && typeof value === 'object' && !Array.isArray(value));
export const registryOwnerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('builtin'), id, version: semanticVersionSchema }),
  z.strictObject({ kind: z.literal('extension'), id, version: semanticVersionSchema }),
  z.strictObject({ kind: z.literal('mcp'), id, version: id }),
]);
const common = {
  schemaVersion: z.literal(1), owner: registryOwnerSchema, title: text.min(1), description: text,
  inputSchema: schema, outputSchema: schema, requiredCapabilities: ids,
  permissions: z.array(permissionRequestSchema).refine(values => new Set(values.map(value => value.id)).size === values.length),
  effect: effectClassSchema, timeoutMs: z.number().int().positive().max(86400000),
};
function bounded<T extends z.ZodType>(shape: T) {
  return z.preprocess((value, context) => {
    if (!workflowValueSchema.safeParse(value).success) {
      context.addIssue({ code: 'custom', message: 'Invalid registry descriptor.' }); return z.NEVER;
    }
    return value;
  }, shape);
}
/** A pointer identifies a config value, never JavaScript or a renderer component. */
const pointer = text.min(1).refine(value => value.startsWith('/') && !/~(?:[^01]|$)/u.test(value));
export const workflowNodeDescriptorSchema = bounded(z.strictObject({
  ...common, type: id, typeVersion: z.literal(1),
  category: z.enum(['trigger', 'input', 'action', 'automation', 'ui', 'utility', 'output']),
  configSchema: schema, executorId: id, retry: z.enum(['never', 'safe']),
  editorFields: z.array(z.strictObject({ path: pointer, title: text.min(1), description: text.optional(), sensitive: z.boolean() }))
    .refine(fields => new Set(fields.map(field => field.path)).size === fields.length),
  examples: z.array(z.strictObject({ title: text.min(1), config: jsonObject, input: workflowValueSchema, output: workflowValueSchema })).min(1),
}).refine(value => value.owner.kind !== 'mcp'));
export type WorkflowNodeDescriptor = z.infer<typeof workflowNodeDescriptorSchema>;
export const toolDescriptorSchema = bounded(z.strictObject({
  ...common, id: id.regex(/^[^\s:]+:[^\s:]+$/u), operationId: id,
  workingDirectory: z.enum(['none', 'optional', 'required']),
  scopeRequirements: z.array(z.strictObject({ id, kind: z.enum(['file', 'directory', 'network', 'application', 'target']), required: z.boolean() }))
    .refine(scopes => new Set(scopes.map(scope => scope.id)).size === scopes.length),
  idempotency: z.enum(['none', 'safe', 'host-key']),
}));
export type ToolDescriptor = z.infer<typeof toolDescriptorSchema>;
type Owner = z.infer<typeof registryOwnerSchema>;
type Schema = z.infer<typeof schema>;
export type DescriptorRegistry = {
  /** These entries are trusted host registrations, never package/server annotations. */
  implementations: ReadonlyMap<string, { owner: Owner; effect: z.infer<typeof effectClassSchema>; retrySafe: boolean; hostIdempotencyKey: boolean;
    permissionIds: ReadonlySet<string>; capabilityIds: ReadonlySet<string>;
    workingDirectory?: ToolDescriptor['workingDirectory']; scopeRequirements?: ToolDescriptor['scopeRequirements'] }>;
  capabilities: ReadonlySet<string>;
  permissionScopes: ReadonlyMap<string, z.ZodType>;
  /** Compile/check the supported JSON Schema dialect without fetching remote refs. */
  validJsonSchema: (schema: Schema) => boolean;
};
export type WorkflowDescriptorRegistry = DescriptorRegistry & {
  /** Use the same compiled schemas as runtime validation and schema-derived inspectors. */
  validEditorField: (configSchema: Schema, path: string) => boolean;
  validExample: (descriptor: WorkflowNodeDescriptor, example: WorkflowNodeDescriptor['examples'][number]) => boolean;
};
function reject(): never { throw new ContractError('Invalid registry contract reference.'); }
function checkCommon(value: ToolDescriptor | WorkflowNodeDescriptor, implementationId: string, registry: DescriptorRegistry) {
  const implementation = registry.implementations.get(implementationId);
  if (!implementation || implementation.owner.kind !== value.owner.kind || implementation.owner.id !== value.owner.id ||
    implementation.owner.version !== value.owner.version || implementation.effect !== value.effect ||
    value.requiredCapabilities.some(capability => !registry.capabilities.has(capability)) ||
    [...implementation.permissionIds].some(permission => !value.permissions.some(item => item.id === permission)) ||
    [...implementation.capabilityIds].some(capability => !value.requiredCapabilities.includes(capability))) reject();
  const schemas = [value.inputSchema, value.outputSchema, ...('configSchema' in value ? [value.configSchema] : [])];
  try { if (schemas.some(item => !registry.validJsonSchema(item))) reject(); } catch { reject(); }
  return { implementation, permissions: value.permissions.map(permission => parsePermissionRequest(permission, registry.permissionScopes)) };
}
/** Descriptor data is not authority to install an executor, reclassify an effect,
 * grant scopes or execute anything. The registrar binds the authenticated source
 * and chooses fixed/sandboxed implementations before constructing this registry.
 */
export function parseWorkflowNodeDescriptor(value: unknown, registry: WorkflowDescriptorRegistry): WorkflowNodeDescriptor {
  const descriptor = parseContract(workflowNodeDescriptorSchema, value);
  const { implementation, permissions } = checkCommon(descriptor, descriptor.executorId, registry);
  if (descriptor.retry === 'safe' && !implementation.retrySafe) reject();
  try {
    if (descriptor.editorFields.some(field => !registry.validEditorField(descriptor.configSchema, field.path)) ||
      descriptor.examples.some(example => !registry.validExample(descriptor, example))) reject();
    return parseContract(workflowNodeDescriptorSchema, structuredClone({ ...descriptor, permissions }));
  } catch { return reject(); }
}
export function parseToolDescriptor(value: unknown, registry: DescriptorRegistry): ToolDescriptor {
  const descriptor = parseContract(toolDescriptorSchema, value);
  const { implementation, permissions } = checkCommon(descriptor, descriptor.operationId, registry);
  if ((descriptor.idempotency === 'safe' && !implementation.retrySafe) ||
    (descriptor.idempotency === 'host-key' && !implementation.hostIdempotencyKey) ||
    descriptor.workingDirectory !== implementation.workingDirectory || !implementation.scopeRequirements ||
    descriptor.scopeRequirements.length !== implementation.scopeRequirements.length ||
    descriptor.scopeRequirements.some(scope => !implementation.scopeRequirements?.some(expected =>
      scope.id === expected.id && scope.kind === expected.kind && scope.required === expected.required))) reject();
  try { return parseContract(toolDescriptorSchema, structuredClone({ ...descriptor, permissions })); }
  catch { return reject(); }
}
