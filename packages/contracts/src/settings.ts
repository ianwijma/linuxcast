import * as z from 'zod';
import { uiTextSchema as text } from './scalars.ts';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, parseContract } from './protocol.ts';
const id = text.min(1);
const ordered = (value: { min?: number | undefined; max?: number | undefined }) => value.min === undefined || value.max === undefined || value.min <= value.max;
const numericValidation = z.strictObject({ min: z.number().optional(), max: z.number().optional() }).refine(ordered);
const textValidation = z.strictObject({ min: z.number().int().nonnegative().optional(), max: z.number().int().nonnegative().optional(),
  pattern: text.optional() }).refine(ordered);
const base = { id, title: text, description: text.optional(), required: z.boolean() };
/** Defaults contain content, never real secrets or unprompted file/app grants.
 * Pattern strings are data; compilation and bounded matching belong to the host.
 */
export const settingDefinitionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('text'), default: text.optional(), validation: textValidation.optional() }),
  z.strictObject({ ...base, kind: z.literal('secret'), validation: textValidation.optional() }),
  z.strictObject({ ...base, kind: z.literal('number'), default: z.number().optional(), validation: numericValidation.optional() }),
  z.strictObject({ ...base, kind: z.literal('boolean'), default: z.boolean().optional() }),
  z.strictObject({ ...base, kind: z.literal('enum'), default: text.optional(),
    options: z.array(z.strictObject({ label: text, value: text })).min(1) }),
  z.strictObject({ ...base, kind: z.literal('file') }),
  z.strictObject({ ...base, kind: z.literal('directory') }),
  z.strictObject({ ...base, kind: z.literal('application') }),
]).superRefine((value, context) => {
  const issue = () => context.addIssue({ code: 'custom', message: 'Invalid setting default.' });
  if (value.kind === 'enum' && (new Set(value.options.map(option => option.value)).size !== value.options.length ||
    (value.default !== undefined && !value.options.some(option => option.value === value.default)))) issue();
  if ((value.kind === 'number' || value.kind === 'text') && value.default !== undefined) {
    const count = typeof value.default === 'number' ? value.default : [...value.default].length;
    if ((value.validation?.min !== undefined && count < value.validation.min) ||
      (value.validation?.max !== undefined && count > value.validation.max)) issue();
  }
});
export type SettingDefinition = z.infer<typeof settingDefinitionSchema>;
export const permissionRequestSchema = z.strictObject({ id, reason: text, scope: jsonValueSchema.optional() });
export type PermissionRequest = z.infer<typeof permissionRequestSchema>;
/** Declarations are requests, not grants. Permission-specific scope schemas are
 * supplied by the trusted host; packages cannot register their own validators.
 */
export function parsePermissionRequest(value: unknown, scopes: ReadonlyMap<string, z.ZodType>): PermissionRequest {
  const request = parseContract(permissionRequestSchema, value);
  const schema = scopes.get(request.id);
  if (!schema) throw new ContractError('Unknown permission request.');
  const scope = parseContract(schema, request.scope);
  return scope === undefined ? { id: request.id, reason: request.reason } : { ...request, scope: parseContract(jsonValueSchema, scope) };
}
