import * as z from 'zod';
import { assetReferenceSchema, itemModelSchema, viewModelSchema, type ViewModel } from './views.ts';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, MAX_ENVELOPE_BYTES, parseContract } from './protocol.ts';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
const revision = z.number().int().nonnegative();
function bounded<T extends z.ZodType>(schema: T) {
  return z.preprocess((value, context) => {
    const json = jsonValueSchema.safeParse(value);
    if (!json.success || new TextEncoder().encode(JSON.stringify(json.data)).byteLength > MAX_ENVELOPE_BYTES) {
      context.addIssue({ code: 'custom', message: 'Invalid view lifecycle message.' }); return z.NEVER;
    }
    return json.data;
  }, schema);
}
const operation = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('upsert'), sectionId: id, index: z.number().int().nonnegative().max(499), item: itemModelSchema,
    image: assetReferenceSchema.nullable().optional() }),
  z.strictObject({ kind: z.literal('remove'), itemId: id }),
]);
export const viewUpdateSchema = bounded(z.discriminatedUnion('kind', [
  z.strictObject({ protocolVersion: z.literal(1), kind: z.literal('snapshot'), view: viewModelSchema }),
  z.strictObject({ protocolVersion: z.literal(1), kind: z.literal('items'), viewId: id, baseRevision: revision, revision,
    operations: z.array(operation).max(1000) }).refine(value => {
    const ids = value.operations.map(op => op.kind === 'upsert' ? op.item.id : op.itemId);
    return value.revision > value.baseRevision && new Set(ids).size === ids.length;
  }),
]));
export const viewSnapshotRequestSchema = z.strictObject({ protocolVersion: z.literal(1), kind: z.literal('request-snapshot'), viewId: id,
  currentRevision: revision.nullable(), reason: z.literal('revision-gap') });
export type ViewUpdateDecision = { kind: 'applied'; view: ViewModel } | { kind: 'discard-stale' } |
  { kind: 'request-snapshot'; request: z.infer<typeof viewSnapshotRequestSchema> };
/** Pure data reducer. The caller binds this view to its authenticated live
 * session and owns rate/coalescing/session limits and actual rendering. A delta
 * is atomic: invalid operations never partially mutate the last valid view.
 */
export function applyViewUpdate(value: unknown, expectedViewId: string, previous: ViewModel | null): ViewUpdateDecision {
  const update = parseContract(viewUpdateSchema, value);
  const current = previous === null ? null : parseContract(viewModelSchema, previous);
  const updateId = update.kind === 'snapshot' ? update.view.viewId : update.viewId;
  const nextRevision = update.kind === 'snapshot' ? update.view.revision : update.revision;
  const reject = () => { throw new ContractError('Invalid view update.'); };
  if (updateId !== expectedViewId || (current && current.viewId !== expectedViewId)) reject();
  if (current && nextRevision <= current.revision) return { kind: 'discard-stale' };
  if (update.kind === 'snapshot') return { kind: 'applied', view: update.view };
  if (!current || update.baseRevision !== current.revision) return { kind: 'request-snapshot', request: {
    protocolVersion: 1, kind: 'request-snapshot', viewId: expectedViewId, currentRevision: current?.revision ?? null, reason: 'revision-gap',
  } };
  if (current.kind !== 'list' && current.kind !== 'grid') return reject();
  // The strict ViewModel parser cloned its typed records; only that local copy
  // is changed. Upsert indexes refer to the evolving page after removing that
  // item's old position. Input operation order is significant and deterministic.
  for (const op of update.operations) {
    const itemId = op.kind === 'upsert' ? op.item.id : op.itemId;
    const oldSection = current.sections.find(section => section.items.some(item => item.id === itemId));
    if (op.kind === 'remove' && !oldSection) reject();
    if (oldSection) oldSection.items = oldSection.items.filter(item => item.id !== itemId);
    if (op.kind === 'upsert') {
      const section = current.sections.find(item => item.id === op.sectionId);
      if (!section || op.index > section.items.length || (current.kind === 'list' && op.image !== undefined)) return reject();
      section.items.splice(op.index, 0, op.item);
    } else if (current.selectedId === itemId) delete current.selectedId;
    if (current.kind === 'grid') {
      if (op.kind === 'remove' || op.image !== undefined) current.images = current.images.filter(image => image.itemId !== itemId);
      if (op.kind === 'upsert' && op.image) current.images.push({ itemId, source: op.image });
    }
  }
  current.revision = update.revision;
  // Keep every accepted page representable by the full-snapshot recovery path.
  const snapshot = parseContract(viewUpdateSchema, { protocolVersion: 1, kind: 'snapshot', view: current });
  if (snapshot.kind !== 'snapshot') return reject();
  return { kind: 'applied', view: snapshot.view };
}
export const viewNavigationSchema = bounded(z.discriminatedUnion('kind', [
  z.strictObject({ protocolVersion: z.literal(1), kind: z.literal('push'), fromViewId: id.nullable(), view: viewModelSchema }),
  z.strictObject({ protocolVersion: z.literal(1), kind: z.literal('replace'), fromViewId: id, view: viewModelSchema }),
  z.strictObject({ protocolVersion: z.literal(1), kind: z.literal('pop'), fromViewId: id }),
]));
/** The host owns the stack, query/selection/scroll/focus restoration, secret
 * draft clearing and cancellation of closed views. A pop of the last view
 * closes that session's view; it never submits a form or dispatches an action.
 */
export function parseViewNavigation(value: unknown, stackViewIds: readonly string[]) {
  const request = parseContract(viewNavigationSchema, value);
  const top = stackViewIds.at(-1) ?? null;
  if (stackViewIds.length > 16 || new Set(stackViewIds).size !== stackViewIds.length || request.fromViewId !== top ||
    (request.kind === 'push' && (stackViewIds.length === 16 || stackViewIds.includes(request.view.viewId))) ||
    (request.kind === 'replace' && stackViewIds.includes(request.view.viewId))) {
    throw new ContractError('Invalid view navigation.');
  }
  return request;
}
