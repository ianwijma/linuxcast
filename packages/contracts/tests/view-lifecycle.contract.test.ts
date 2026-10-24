import { expect, test } from 'vitest';
import { ContractError, parseContract } from '../src/protocol.ts';
import { viewModelSchema } from '../src/views.ts';
import { applyViewUpdate, parseViewNavigation } from '../src/view-lifecycle.ts';
const row = (id: string) => ({ id, title: `Synthetic ${id}` });
const page = () => parseContract(viewModelSchema, { protocolVersion: 1, viewId: 'view-synthetic', revision: 1, kind: 'list', title: 'Synthetic',
  search: { placeholder: '', query: 'synthetic', mode: 'host' }, selectedId: 'a', sections: [{ id: 'section', items: [row('a'), row('b')] }] });
const delta = (operations: unknown[]) => ({ protocolVersion: 1, kind: 'items', viewId: 'view-synthetic', baseRevision: 1, revision: 2, operations });
const upsert = (id: string, index: number) => ({ kind: 'upsert', sectionId: 'section', index, item: row(id) });
test('snapshot initializes a bound view and whole snapshots may recover across missing revisions', () => {
  expect(applyViewUpdate({ protocolVersion: 1, kind: 'snapshot', view: page() }, 'view-synthetic', null)).toMatchObject({ kind: 'applied' });
  expect(applyViewUpdate({ protocolVersion: 1, kind: 'snapshot', view: { ...page(), revision: 9 } }, 'view-synthetic', page())).toMatchObject({ kind: 'applied', view: { revision: 9 } });
});
test('stale revisions discard; missing preceding delta revision requests a complete snapshot', () => {
  expect(applyViewUpdate({ ...delta([]), baseRevision: 0, revision: 1 }, 'view-synthetic', page())).toEqual({ kind: 'discard-stale' });
  expect(applyViewUpdate({ ...delta([]), baseRevision: 3, revision: 4 }, 'view-synthetic', page())).toMatchObject({ kind: 'request-snapshot', request: { currentRevision: 1 } });
  expect(applyViewUpdate(delta([]), 'view-synthetic', null)).toMatchObject({ kind: 'request-snapshot', request: { currentRevision: null } });
});
test('ordered upserts/removals atomically preserve page data without mutating prior snapshots', () => {
  const before = page();const original = structuredClone(before);
  const result = applyViewUpdate(delta([{ kind: 'remove', itemId: 'a' }, upsert('c', 0), upsert('b', 0)]), before.viewId, before);
  expect(result).toMatchObject({ kind: 'applied', view: { revision: 2, sections: [{ items: [row('b'), row('c')] }] } });
  if (result.kind === 'applied') expect(result.view).not.toHaveProperty('selectedId');
  expect(before).toEqual(original);
});
test.each([
  [{ kind: 'remove', itemId: 'unknown' }], [upsert('c', 3)], [{ ...upsert('c', 0), sectionId: 'unknown' }],
  [upsert('c', 0), upsert('c', 1)], [{ kind: 'remove', itemId: 'a' }, upsert('a', 0)],
  [{ ...upsert('c', 0), image: { kind: 'asset', assetId: 'synthetic' } }],
].map(operations => ({ operations })))('invalid delta %# fails without changing previous page', ({ operations }) => {
  const before = page();const original = structuredClone(before);
  expect(() => applyViewUpdate(delta(operations), before.viewId, before)).toThrow(ContractError);expect(before).toEqual(original);
});
test('grid removal drops associated images and upsert may explicitly clear or replace an image', () => {
  const grid = parseContract(viewModelSchema, { ...page(), kind: 'grid', density: 'comfortable', images: [{ itemId: 'a', source: { kind: 'asset', assetId: 'old' } }] });
  const result = applyViewUpdate(delta([{ kind: 'remove', itemId: 'a' }, { ...upsert('b', 0), image: { kind: 'asset', assetId: 'new' } }]), grid.viewId, grid);
  expect(result).toMatchObject({ kind: 'applied', view: { images: [{ itemId: 'b', source: { assetId: 'new' } }] } });
  expect(applyViewUpdate(delta([{ ...upsert('a', 0), image: null }]), grid.viewId, grid)).toMatchObject({ kind: 'applied', view: { images: [] } });
});
test('wrong view/version, nonincreasing delta and oversized content fail typed', () => {
  for (const patch of [{ viewId: 'other' }, { protocolVersion: 2 }, { revision: 1 }]) {
    expect(() => applyViewUpdate({ ...delta([]), ...patch }, page().viewId, page())).toThrow(ContractError);
  }
  expect(() => applyViewUpdate(delta([]), 'other', page())).toThrow(ContractError);
  const operations = Array.from({ length: 30 }, (_, n) => ({ ...upsert(`x${n}`, n), item: { id: `x${n}`, title: 'x'.repeat(64000) } }));
  expect(() => applyViewUpdate(delta(operations), page().viewId, page())).toThrow(ContractError);
});
test('applied deltas cannot exceed total page bound', () => {
  const current = parseContract(viewModelSchema, { ...page(), selectedId: undefined, sections: [{ id: 'section', items: Array.from({ length: 500 }, (_, n) => row(`i${n}`)) }] });
  expect(() => applyViewUpdate(delta([upsert('overflow', 499)]), current.viewId, current)).toThrow(ContractError);
});
test('successive bounded deltas cannot create a page too large for snapshot recovery', () => {
  const current = parseContract(viewModelSchema, { ...page(), selectedId: undefined,
    sections: [{ id: 'section', items: Array.from({ length: 10 }, (_, n) => ({ id: `old${n}`, title: 'x'.repeat(64000) })) }] });
  const operations = Array.from({ length: 7 }, (_, n) => ({ ...upsert(`new${n}`, n), item: { id: `new${n}`, title: 'y'.repeat(64000) } }));
  expect(() => applyViewUpdate(delta(operations), current.viewId, current)).toThrow(ContractError);
});
test('navigation binds actual top identity and allows at most sixteen unique views', () => {
  const push = { protocolVersion: 1, kind: 'push', fromViewId: null, view: page() };
  expect(parseViewNavigation(push, []).kind).toBe('push');
  expect(parseViewNavigation({ protocolVersion: 1, kind: 'pop', fromViewId: page().viewId }, [page().viewId]).kind).toBe('pop');
  const stack = Array.from({ length: 15 }, (_, n) => `v${n}`);
  expect(parseViewNavigation({ ...push, fromViewId: 'v14' }, stack).kind).toBe('push');
  expect(() => parseViewNavigation({ ...push, fromViewId: 'v15' }, [...stack, 'v15'])).toThrow(ContractError);
  expect(() => parseViewNavigation({ ...push, fromViewId: 'other' }, stack)).toThrow(ContractError);
  expect(() => parseViewNavigation({ ...push, fromViewId: page().viewId }, [page().viewId])).toThrow(ContractError);
  expect(() => parseViewNavigation({ ...push, kind: 'replace', fromViewId: 'top' }, [page().viewId, 'top'])).toThrow(ContractError);
  expect(parseViewNavigation({ ...push, kind: 'replace', fromViewId: 'top' }, ['parent', 'top']).kind).toBe('replace');
  expect(() => parseViewNavigation({ ...push, kind: 'replace', fromViewId: page().viewId, view: { ...page(), revision: 0 } }, [page().viewId])).toThrow(ContractError);
});
test('date form fields use real calendar dates and validate inclusive limits without timezone coercion', () => {
  const form = { protocolVersion: 1, viewId: 'form', revision: 0, kind: 'form', title: 'Synthetic form', submitActionId: 'submit', cancelActionId: 'cancel',
    actions: ['submit', 'cancel'].map(id => ({ id, title: id, kind: 'invoke', effect: 'read' })),
    fields: [{ id: 'date', title: 'Date', kind: 'date', required: true, value: '2024-02-29', min: '2024-01-01', max: '2024-12-31' }] };
  expect(parseContract(viewModelSchema, form)).toMatchObject({ fields: [{ value: '2024-02-29' }] });
  for (const value of ['2023-02-29', '2024-02-30', '2024-01-01T00:00:00Z', '2025-01-01']) {
    expect(() => parseContract(viewModelSchema, { ...form, fields: [{ ...form.fields[0], value }] })).toThrow(ContractError);
  }
  expect(parseContract(viewModelSchema, { ...form, fields: [{ ...form.fields[0], value: null }] })).toMatchObject({ fields: [{ value: null }] });
});
