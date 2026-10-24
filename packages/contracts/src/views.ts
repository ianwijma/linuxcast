import * as z from 'zod';
import { uiTextSchema as text } from './scalars.ts';
import { fileReferenceSchema, applicationReferenceSchema } from './resources.ts';
export { fileReferenceSchema } from './resources.ts';

const id = text.min(1);
const revision = z.number().int().nonnegative();
/** IDs are resolved by the broker against the authenticated session's grants. */
export const assetReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('asset'), assetId: id }),
  z.strictObject({ kind: z.literal('file'), fileRef: fileReferenceSchema }),
]);
export const iconReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('builtin'), name: id }),
  ...assetReferenceSchema.options,
]);
export const previewReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text }),
  z.strictObject({ kind: z.literal('image'), source: assetReferenceSchema }),
  z.strictObject({ kind: z.literal('pdf'), source: assetReferenceSchema }),
]);
export const actionModelSchema = z.strictObject({
  id, title: text, kind: z.enum(['invoke', 'copy', 'open', 'navigate']),
  icon: iconReferenceSchema.optional(),
  shortcut: z.strictObject({ key: id, modifiers: z.array(z.enum(['Ctrl', 'Alt', 'Shift', 'Super']))
    .refine(values => new Set(values).size === values.length) }).optional(),
  effect: z.enum(['read', 'write', 'destructive']), disabledReason: text.optional(),
});
const actions = z.array(actionModelSchema).refine(values => new Set(values.map(value => value.id)).size === values.length);
export const itemModelSchema = z.strictObject({
  id, title: text, subtitle: text.optional(), icon: iconReferenceSchema.optional(),
  accessories: z.array(z.strictObject({ text: text.optional(), icon: iconReferenceSchema.optional(), tooltip: text.optional() })).optional(),
  tags: z.array(z.strictObject({ text, tone: z.enum(['neutral', 'accent', 'success', 'warning']) })).optional(),
  keywords: z.array(text).optional(), disabledReason: text.optional(),
  preview: previewReferenceSchema.optional(), actions: actions.optional(),
});
const field = { id, title: text, description: text.optional(), required: z.boolean(), error: text.optional() };
export const formFieldSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...field, kind: z.literal('text'), value: text }),
  // Secret values never arrive in a published ViewModel or its fixtures.
  z.strictObject({ ...field, kind: z.literal('secret') }),
  z.strictObject({ ...field, kind: z.literal('number'), value: z.number().nullable(), min: z.number().optional(), max: z.number().optional() }),
  z.strictObject({ ...field, kind: z.literal('date'), value: z.iso.date().nullable(), min: z.iso.date().optional(), max: z.iso.date().optional() }),
  z.strictObject({ ...field, kind: z.literal('boolean'), value: z.boolean() }),
  z.strictObject({ ...field, kind: z.literal('enum'), value: text.nullable(),
    options: z.array(z.strictObject({ label: text, value: text })).min(1) }),
  z.strictObject({ ...field, kind: z.literal('file'), value: fileReferenceSchema.nullable() }),
  z.strictObject({ ...field, kind: z.literal('directory'), value: fileReferenceSchema.nullable() }),
  z.strictObject({ ...field, kind: z.literal('application'), value: applicationReferenceSchema.nullable() }),
]).superRefine((value, context) => {
  if (value.kind === 'enum' && (new Set(value.options.map(option => option.value)).size !== value.options.length ||
    (value.value !== null && !value.options.some(option => option.value === value.value)))) {
    context.addIssue({ code: 'custom', message: 'Invalid enum selection.' });
  }
  if ((value.kind === 'number' || value.kind === 'date') && ((value.min !== undefined && value.max !== undefined && value.min > value.max) ||
    (value.value !== null && ((value.min !== undefined && value.value < value.min) || (value.max !== undefined && value.value > value.max))))) {
    context.addIssue({ code: 'custom', message: 'Invalid numeric field.' });
  }
});
const base = {
  protocolVersion: z.literal(1), viewId: id, revision, title: text, loading: z.boolean().optional(),
  status: z.strictObject({ kind: z.enum(['info', 'warning', 'error']), message: text }).optional(),
  actions: actions.optional(),
};
const search = z.strictObject({ placeholder: text, query: text, mode: z.enum(['host', 'extension']) });
const collection = {
  ...base, search, sections: z.array(z.strictObject({ id, title: text.optional(), items: z.array(itemModelSchema).max(500) })),
  selectedId: id.optional(), nextCursor: text.optional(), empty: z.strictObject({ title: text, description: text.optional() }).optional(),
};
/** Semantic content only. The host owns rendering, sanitization, accessibility,
 * link handling, file resolution, effect classification and permission checks.
 */
export const viewModelSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...collection, kind: z.literal('list') }),
  z.strictObject({ ...collection, kind: z.literal('grid'), density: z.enum(['compact', 'comfortable']),
    images: z.array(z.strictObject({ itemId: id, source: assetReferenceSchema })) }),
  z.strictObject({ ...base, kind: z.literal('detail'), markdown: text,
    metadata: z.array(z.strictObject({ label: text, value: text })), attachments: z.array(assetReferenceSchema) }),
  z.strictObject({ ...base, kind: z.literal('form'), fields: z.array(formFieldSchema), submitActionId: id, cancelActionId: id }),
  z.strictObject({ ...base, kind: z.literal('text'), text, editable: z.boolean(), submitActionId: id.optional() }),
  z.strictObject({ ...base, kind: z.literal('image'), source: assetReferenceSchema, description: text }),
  z.strictObject({ ...base, kind: z.literal('pdf'), source: assetReferenceSchema }),
]).superRefine((view, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  const actionIds = new Set(view.actions?.map(action => action.id) ?? []);
  if (view.kind === 'list' || view.kind === 'grid') {
    const items = view.sections.flatMap(section => section.items);
    const itemIds = new Set(items.map(item => item.id));
    if (items.length > 500 || itemIds.size !== items.length || new Set(view.sections.map(section => section.id)).size !== view.sections.length) issue('Invalid page identity or size.');
    if (view.selectedId !== undefined && !itemIds.has(view.selectedId)) issue('Selection is outside the page.');
    if (view.kind === 'grid' && (view.images.some(image => !itemIds.has(image.itemId)) ||
      new Set(view.images.map(image => image.itemId)).size !== view.images.length)) issue('Invalid grid image identity.');
  }
  if (view.kind === 'form') {
    if (new Set(view.fields.map(value => value.id)).size !== view.fields.length) issue('Duplicate field.');
    if (view.submitActionId === view.cancelActionId || !actionIds.has(view.submitActionId) || !actionIds.has(view.cancelActionId)) issue('Invalid form action binding.');
  }
  if (view.kind === 'text' && view.submitActionId !== undefined && (!view.editable || !actionIds.has(view.submitActionId))) issue('Invalid text submit action.');
});
export type ViewModel = z.infer<typeof viewModelSchema>;
export type ActionModel = z.infer<typeof actionModelSchema>;
