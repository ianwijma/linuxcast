import * as z from 'zod';
import { iconReferenceSchema, previewReferenceSchema } from './views.ts';
import { workflowValueSchema } from './workflows.ts';
import { ContractError, parseContract } from './protocol.ts';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
const args = z.array(workflowValueSchema).max(10000);
const variables = z.record(z.string().refine(key => !['__proto__', 'prototype', 'constructor'].includes(key)), workflowValueSchema);
const modifierOrder = ['Ctrl', 'Alt', 'Shift', 'Super'] as const;
const modifiers = z.array(z.enum(modifierOrder)).refine(value => new Set(value).size === value.length)
  .transform(value => modifierOrder.filter(modifier => value.includes(modifier)));
export const workflowResultActionSchema = z.strictObject({ id, title: text, port: id,
  modifiers: modifiers.optional(), args: args.optional(), variables: variables.optional() });
export const workflowResultItemSchema = z.strictObject({ id, title: text, subtitle: text.optional(),
  icon: iconReferenceSchema.optional(), args, variables: variables.optional(), enabled: z.boolean().default(true),
  disabledReason: text.optional(), matchText: text.optional(), autocomplete: text.optional(), preview: previewReferenceSchema.optional(),
  copyText: text.optional(), largeText: text.optional(), actions: z.array(workflowResultActionSchema).optional(),
}).refine(item => {
  const actions = item.actions ?? [];
  // Empty/absent modifier sets add no alternate shortcut. Plain Return remains
  // the row's default out action. Nonempty normalized sets must be unambiguous.
  const shortcuts = actions.filter(action => action.modifiers?.length).map(action => action.modifiers!.join('+'));
  return new Set(actions.map(action => action.id)).size === actions.length && new Set(shortcuts).size === shortcuts.length;
});
const resultsShape = z.strictObject({ protocolVersion: z.literal(1), queryRevision: z.number().int().nonnegative(),
  items: z.array(workflowResultItemSchema).max(500), nextCursor: text.optional(),
  refreshAfterMs: z.number().int().min(250).max(300000).optional(),
  cache: z.strictObject({ ttlMs: z.number().int().min(1000).max(86400000), staleWhileRevalidate: z.boolean() }).optional(),
}).refine(value => new Set(value.items.map(item => item.id)).size === value.items.length);
export const nativeResultsSchema = z.preprocess((value, context) => {
  if (!workflowValueSchema.safeParse(value).success) {
    context.addIssue({ code: 'custom', message: 'Invalid workflow results.' }); return z.NEVER;
  }
  return value;
}, resultsShape);
export type NativeResults = z.infer<typeof nativeResultsSchema>;
export type WorkflowResultItem = z.infer<typeof workflowResultItemSchema>;
/** The output port registry comes from the compiled node, not result content.
 * Parsing neither executes a row nor accepts a query revision as current. The
 * host binds run/node/query identity, discards late results, keeps malformed
 * prior rows visibly stale, and revalidates selection/grants before effects.
 */
export function parseNativeResults(value: unknown, outputPorts: ReadonlySet<string>): NativeResults {
  const results = parseContract(nativeResultsSchema, value);
  if (!outputPorts.has('out') || results.items.some(item => item.actions?.some(action => !outputPorts.has(action.port)))) {
    throw new ContractError('Unknown workflow result action port.');
  }
  // Workflow JSON permits identity-preserving validators. The accepted result
  // must not retain a script producer's mutable args/variable references.
  try { return parseContract(nativeResultsSchema, structuredClone(results)); }
  catch { throw new ContractError('Invalid workflow results.'); }
}
