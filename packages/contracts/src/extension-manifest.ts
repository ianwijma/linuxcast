import * as z from 'zod';
import { modelCapabilitiesSchema } from './ai.ts';
import { versionedJsonSchemaSchema } from './ai-request.ts';
import { effectClassSchema } from './effects.ts';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, MAX_ENVELOPE_BYTES, parseContract } from './protocol.ts';
import { permissionRequestSchema, parsePermissionRequest, settingDefinitionSchema } from './settings.ts';
import { uiTextSchema as text } from './scalars.ts';
import { packageIdentitySchema, semanticVersionSchema } from './workflow-graph.ts';

export const extensionLocalIdSchema = text.min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
/** Package-relative names only. Archive extraction must separately reject links,
 * special files, duplicate names and executable/native payloads before use.
 */
export const packagePathSchema = text.min(1).refine(path => !path.startsWith('/') &&
  !/[\\:]/u.test(path) && ![...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
  path.split('/').every(part => part !== '' && part !== '.' && part !== '..'));
const entry = packagePathSchema.refine(path => path.startsWith('dist/') && /\.m?js$/u.test(path));
const localId = extensionLocalIdSchema;
const https = text.refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
});
const endpoint = text.refine(value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash; }
  catch { return false; }
});
const preference = settingDefinitionSchema.refine(value => localId.safeParse(value.id).success);
const argument = preference.refine(value => ['text', 'secret', 'enum', 'number', 'file', 'directory'].includes(value.kind));
const unique = <T extends { id: string }>(values: T[]) => new Set(values.map(value => value.id)).size === values.length;
const preferences = z.array(preference).refine(unique);
const schema = versionedJsonSchemaSchema;
export const extensionCommandSchema = z.strictObject({
  id: localId, title: text.min(1), mode: z.enum(['view', 'action', 'tray']), entry,
  keywords: z.array(text).optional(), arguments: z.array(argument).refine(unique), preferences,
  background: z.strictObject({ intervalSeconds: z.number().int().min(60), timeoutMs: z.number().int().positive().max(30000) }).optional(),
  disabledByDefault: z.boolean().optional(),
}).refine(value => !value.background || value.disabledByDefault !== false)
  .transform(value => ({ ...value, disabledByDefault: value.disabledByDefault ?? Boolean(value.background) }));

export const extensionToolSchema = z.strictObject({ id: localId, entry, description: text,
  inputSchema: schema, outputSchema: schema, effect: effectClassSchema });
export const extensionWorkflowNodeSchema = z.strictObject({ id: localId, title: text, description: text,
  configSchema: schema, inputSchema: schema, outputSchema: schema,
  effects: z.array(effectClassSchema).refine(values => new Set(values).size === values.length), handlerId: localId });
export const extensionSkillSchema = z.strictObject({ id: localId, description: text,
  path: packagePathSchema.refine(path => path.endsWith('.md')), resources: z.array(packagePathSchema).optional() });
export const extensionDependencySchema = z.strictObject({ id: localId, kind: z.enum(['application', 'runtime', 'capability']),
  target: text.min(1), reason: text.min(1) });
/** Stdio names a host-recognized runtime dependency, never an executable path.
 * The host resolves that dependency and confines the job before launch.
 */
export const extensionMcpSchema = z.discriminatedUnion('transport', [
  z.strictObject({ id: localId, transport: z.literal('remote'), url: https, permissionIds: z.array(text.min(1)) }),
  z.strictObject({ id: localId, transport: z.literal('stdio'), runtimeDependencyId: localId,
    entry: packagePathSchema, arguments: z.array(text), permissionIds: z.array(text.min(1)) }),
]);
export const extensionModelContributionSchema = z.strictObject({ id: localId, title: text, baseUrl: endpoint,
  modelId: text.min(1), protocol: z.literal('openai-chat-completions'), capabilities: modelCapabilitiesSchema,
  credentialMode: z.enum(['none', 'user-api-key']) });
const shape = z.strictObject({
  manifestVersion: z.literal(1), id: packageIdentitySchema, version: semanticVersionSchema,
  name: text.min(1), description: text, author: z.strictObject({ name: text.min(1), url: https.optional() }),
  license: text.min(1), minHostVersion: semanticVersionSchema, sdkVersion: text.min(1),
  runtime: z.literal('bundled-node'), platforms: z.tuple([z.literal('linux')]),
  icon: z.strictObject({ light: packagePathSchema, dark: packagePathSchema }),
  commands: z.array(extensionCommandSchema).refine(unique), preferences,
  permissions: z.array(permissionRequestSchema).refine(unique),
  tools: z.array(extensionToolSchema).refine(unique).optional(),
  workflowNodes: z.array(extensionWorkflowNodeSchema).refine(unique).optional(),
  skills: z.array(extensionSkillSchema).refine(unique).optional(),
  mcp: z.array(extensionMcpSchema).refine(unique).optional(),
  modelContributions: z.array(extensionModelContributionSchema).refine(unique).optional(),
  dependencies: z.array(extensionDependencySchema).refine(unique).optional(),
  homepage: https.optional(), repository: https.optional(), issues: https.optional(),
});
export const extensionManifestSchema = z.preprocess((value, context) => {
  // Bound the whole untrusted object, including schemas and optional contributions.
  const parsed = jsonValueSchema.safeParse(value);
  if (!parsed.success || new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength > MAX_ENVELOPE_BYTES) {
    context.addIssue({ code: 'custom', message: 'Invalid extension manifest.' }); return z.NEVER;
  }
  return parsed.data;
}, shape);
export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;
export type ExtensionManifestRegistry = {
  /** Supplied by the package manager, never by manifest data. */
  compatible: (minHostVersion: string, sdkRange: string) => boolean;
  validLicense: (license: string) => boolean;
  validJsonSchema: (schema: z.infer<typeof versionedJsonSchemaSchema>) => boolean;
  permissionScopes: ReadonlyMap<string, z.ZodType>;
  dependencyTargets: ReadonlyMap<z.infer<typeof extensionDependencySchema>['kind'], ReadonlySet<string>>;
  /** Regular files from the already bounded, link-free staged archive inventory. */
  files: ReadonlySet<string>;
};

/** Parsing checks declarations/compatibility, never grants, downloads, registers,
 * starts a command/server, selects a model, or proves archive integrity.
 */
export function parseExtensionManifest(value: unknown, registry: ExtensionManifestRegistry): ExtensionManifest {
  const manifest = parseContract(extensionManifestSchema, value);
  const reject = () => { throw new ContractError('Invalid extension package contract.'); };
  const declared = new Set(manifest.permissions.map(item => item.id));
  const settings = new Map(manifest.preferences.map(item => [item.id, item]));
  const paths = [manifest.icon.light, manifest.icon.dark];
  const schemas: z.infer<typeof versionedJsonSchemaSchema>[] = [];
  for (const command of manifest.commands) {
    paths.push(command.entry);
    if ((command.background && !declared.has('background.run')) || (command.mode === 'tray' && !declared.has('tray.publish'))) reject();
    for (const setting of command.preferences) {
      const parent = settings.get(setting.id);
      if (parent && (parent.kind !== setting.kind || (parent.kind === 'enum' && setting.kind === 'enum' &&
        (parent.options.length !== setting.options.length || parent.options.some(option => !setting.options.some(item => item.value === option.value)))))) reject();
    }
  }
  for (const tool of manifest.tools ?? []) { paths.push(tool.entry); schemas.push(tool.inputSchema, tool.outputSchema); }
  for (const node of manifest.workflowNodes ?? []) schemas.push(node.configSchema, node.inputSchema, node.outputSchema);
  for (const skill of manifest.skills ?? []) paths.push(skill.path, ...(skill.resources ?? []));
  const dependencies = new Map((manifest.dependencies ?? []).map(item => [item.id, item]));
  for (const connection of manifest.mcp ?? []) {
    if (new Set(connection.permissionIds).size !== connection.permissionIds.length || connection.permissionIds.some(id => !declared.has(id))) reject();
    if (connection.transport === 'remote' && !connection.permissionIds.includes('network.fetch')) reject();
    if (connection.transport === 'stdio') {
      if (dependencies.get(connection.runtimeDependencyId)?.kind !== 'runtime') reject();
      paths.push(connection.entry);
    }
  }
  if (paths.some(path => !registry.files.has(path))) reject();
  try {
    if (!registry.compatible(manifest.minHostVersion, manifest.sdkVersion) || !registry.validLicense(manifest.license) ||
      schemas.some(item => !registry.validJsonSchema(item)) ||
      [...dependencies.values()].some(item => !registry.dependencyTargets.get(item.kind)?.has(item.target))) reject();
  } catch { reject(); }
  const permissions = manifest.permissions.map(item => parsePermissionRequest(item, registry.permissionScopes));
  return parseContract(extensionManifestSchema, { ...manifest, permissions });
}
