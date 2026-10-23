import { expect, it } from 'vitest';
import { ContractError, encodeFrame, FrameDecoder, parseContract, viewModelSchema } from '../src/index.ts';

const base = { protocolVersion: 1, viewId: 'synthetic-view', revision: 1, title: 'Synthetic view' };
const item = { id: 'synthetic-item', title: 'Synthetic item' };
const list = { ...base, kind: 'list', search: { placeholder: 'Search', query: '', mode: 'host' },
  sections: [{ id: 'synthetic-section', items: [item] }], selectedId: item.id };
const action = { id: 'synthetic-submit', title: 'Submit', kind: 'invoke', effect: 'write' };
const actions = [action, { ...action, id: 'synthetic-cancel', title: 'Cancel', effect: 'read' }];
const form = { ...base, kind: 'form', fields: [{ id: 'synthetic-field', title: 'Name', kind: 'text', required: true, value: '' }],
  actions, submitActionId: action.id, cancelActionId: 'synthetic-cancel' };
const asset = { kind: 'asset', assetId: 'synthetic-asset' };

it.each([
  list,
  { ...list, kind: 'grid', density: 'comfortable', images: [{ itemId: item.id, source: asset }] },
  { ...base, kind: 'detail', markdown: '# Synthetic', metadata: [], attachments: [asset] },
  form,
  { ...base, kind: 'text', text: 'Synthetic', editable: true, actions, submitActionId: action.id },
  { ...base, kind: 'image', source: asset, description: 'Synthetic image' },
  { ...base, kind: 'pdf', source: { kind: 'file', fileRef: { kind: 'file', grantId: 'synthetic-grant', entryId: 'synthetic-entry', displayName: 'Synthetic' } } },
])('round-trips declarative $kind snapshots through bounded framing', value => {
  const expected = parseContract(viewModelSchema, value); let actual: unknown;
  const decoder = new FrameDecoder(); decoder.push(encodeFrame(value), decoded => { actual = parseContract(viewModelSchema, decoded); }); decoder.finish();
  expect(actual).toEqual(expected);
});
it.each(['html', 'css', 'onClick', 'script', 'iframe', 'webView', 'reactComponent'])(
  'rejects executable/custom renderer field %s', name => {
    expect(() => parseContract(viewModelSchema, { ...list, [name]: 'synthetic-only' })).toThrow(ContractError);
  });
it.each([
  { ...list, protocolVersion: 2 },
  { ...list, revision: -1 },
  { ...list, selectedId: 'absent' },
  { ...list, sections: [{ id: 'a', items: [item, item] }] },
  { ...list, sections: [{ id: 'a', items: [] }, { id: 'a', items: [] }] },
  { ...list, sections: [{ id: 'a', items: [{ ...item, icon: { kind: 'file', fileRef: { kind: 'file', grantId: 'synthetic-grant', entryId: 'synthetic-entry', displayName: 'Synthetic', path: '/synthetic-only' } } }] }] },
  { ...list, sections: [{ id: 'a', items: [{ ...item, actions: [{ ...action, handler: 'synthetic-only' }] }] }] },
  { ...base, kind: 'image', source: { kind: 'asset', url: 'https://synthetic.invalid/picture' }, description: 'Synthetic' },
  { ...base, kind: 'pdf', source: { kind: 'file', fileRef: { path: '/synthetic-only' } } },
  { ...list, kind: 'grid', density: 'compact', images: [{ itemId: 'absent', source: asset }] },
  { ...form, submitActionId: 'absent' },
  { ...form, cancelActionId: action.id },
  { ...form, fields: [form.fields[0], form.fields[0]] },
  { ...form, fields: [{ id: 'secret', title: 'Secret', required: true, kind: 'secret', value: 'synthetic-private-canary' }] },
  { ...form, fields: [{ id: 'enum', title: 'Choice', required: true, kind: 'enum', value: 'absent', options: [{ label: 'Choice', value: 'present' }] }] },
  { ...form, fields: [{ id: 'number', title: 'Count', required: true, kind: 'number', value: 4, min: 5 }] },
  { ...base, kind: 'text', text: '', editable: false, actions, submitActionId: action.id },
])('rejects malformed snapshot %# without raw diagnostics', value => {
  try { parseContract(viewModelSchema, value); expect.fail('Expected rejection.'); }
  catch (error) { expect(error).toBeInstanceOf(ContractError); expect(String(error)).not.toContain('synthetic-private-canary'); }
});
it('enforces 500 items across sections, not per-section only', () => {
  const items = (start: number, length: number) => Array.from({ length }, (_, offset) => ({ ...item, id: `synthetic-${start + offset}` }));
  const page = { ...list, selectedId: undefined, sections: [{ id: 'a', items: items(0, 250) }, { id: 'b', items: items(250, 250) }] };
  expect(() => parseContract(viewModelSchema, page)).not.toThrow();
  page.sections[1]!.items.push({ ...item, id: 'synthetic-overflow' });
  expect(() => parseContract(viewModelSchema, page)).toThrow(ContractError);
});
it('bounds UTF-8 field bytes while preserving the exact limit', () => {
  expect(() => parseContract(viewModelSchema, { ...list, title: 'é'.repeat(32768) })).not.toThrow();
  expect(() => parseContract(viewModelSchema, { ...list, title: 'é'.repeat(32769) })).toThrow(ContractError);
});
it('accepts secret fields only without a published value and file fields only by opaque reference', () => {
  expect(() => parseContract(viewModelSchema, { ...form, fields: [
    { id: 'secret', title: 'Secret', required: true, kind: 'secret' },
    { id: 'file', title: 'File', required: true, kind: 'file', value: { kind: 'file', grantId: 'synthetic-grant', entryId: 'synthetic-entry', displayName: 'Synthetic' } },
  ] })).not.toThrow();
});

it('keeps application picker references distinct from file grants', () => {
  const field = { id: 'application', title: 'Application', required: true, kind: 'application',
    value: { kind: 'application', id: 'synthetic.desktop', displayName: 'Synthetic' } };
  expect(() => parseContract(viewModelSchema, { ...form, fields: [field] })).not.toThrow();
  expect(() => parseContract(viewModelSchema, { ...form, fields: [{ ...field,
    value: { kind: 'file', grantId: 'synthetic-grant', entryId: 'synthetic-entry', displayName: 'Synthetic' },
  }] })).toThrow(ContractError);
});
