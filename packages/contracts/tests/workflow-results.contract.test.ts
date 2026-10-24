import { expect, test } from 'vitest';
import { ContractError, encodeFrame, FrameDecoder } from '../src/index.ts';
import { parseNativeResults } from '../src/workflow-results.ts';
const ports = new Set(['out', 'inspect', 'copy']);
const row = () => ({ id: 'synthetic-row', title: 'Synthetic result', args: [{ kind: 'file', grantId: 'synthetic-grant', entryId: 'synthetic-entry', displayName: 'Synthetic' }],
  variables: { nested: { count: 1 } }, actions: [{ id: 'inspect', title: 'Inspect', port: 'inspect', modifiers: ['Shift', 'Ctrl'], args: [1], variables: { chosen: true } }] });
const results = () => ({ protocolVersion: 1, queryRevision: 3, items: [row()], nextCursor: 'opaque-synthetic', refreshAfterMs: 250,
  cache: { ttlMs: 1000, staleWhileRevalidate: true } });
test('native results preserve typed row/action payloads and canonical shortcut sets through framing', () => {
  let parsed: unknown;
  const decoder = new FrameDecoder();decoder.push(encodeFrame(results()), value => { parsed = parseNativeResults(value, ports); });decoder.finish();
  expect(parsed).toMatchObject({ queryRevision: 3, items: [{ enabled: true, actions: [{ modifiers: ['Ctrl', 'Shift'], args: [1], variables: { chosen: true } }] }] });
});
test('default caching/refresh remain off, and disabled rows retain their explicit state', () => {
  const result = parseNativeResults({ protocolVersion: 1, queryRevision: 0, items: [{ ...row(), enabled: false, disabledReason: 'Setup required' }] }, ports);
  expect(result.cache).toBeUndefined();expect(result.refreshAfterMs).toBeUndefined();expect(result.items[0]!.enabled).toBe(false);
});
test.each([{ protocolVersion: 2 }, { queryRevision: -1 }, { queryRevision: 0.5 }, { refreshAfterMs: 249 }, { refreshAfterMs: 300001 },
  { cache: { ttlMs: 999, staleWhileRevalidate: false } }, { cache: { ttlMs: 86400001, staleWhileRevalidate: false } }])('rejects version/counter/timer boundaries %#', patch => {
  expect(() => parseNativeResults({ ...results(), ...patch }, ports)).toThrow(ContractError);
});
test('exact timer and page upper bounds are accepted', () => {
  const value = { ...results(), refreshAfterMs: 300000, cache: { ttlMs: 86400000, staleWhileRevalidate: false },
    items: Array.from({ length: 500 }, (_, n) => ({ ...row(), id: `row-${n}` })) };
  expect(parseNativeResults(value, ports).items).toHaveLength(500);
  value.items.push({ ...row(), id: 'overflow' });expect(() => parseNativeResults(value, ports)).toThrow(ContractError);
});
test('duplicate rows/action IDs or equivalent nonempty shortcut sets reject atomically', () => {
  expect(() => parseNativeResults({ ...results(), items: [row(), row()] }, ports)).toThrow(ContractError);
  const item = row();const first = item.actions[0]!;
  for (const extra of [{ ...first }, { ...first, id: 'other', modifiers: ['Ctrl', 'Shift'] }, { ...first, id: 'other', modifiers: ['Ctrl', 'Ctrl'] }]) {
    expect(() => parseNativeResults({ ...results(), items: [{ ...item, actions: [first, extra] }] }, ports)).toThrow(ContractError);
  }
});
test('unbound actions do not override plain Return or gain shortcut authority', () => {
  const item = row();item.actions = [{ id: 'one', title: 'One', port: 'copy', modifiers: [], args: [], variables: { chosen: false } },
    { id: 'two', title: 'Two', port: 'inspect', modifiers: [], args: [], variables: { chosen: false } }];
  expect(parseNativeResults({ ...results(), items: [item] }, ports).items[0]!.actions).toHaveLength(2);
});
test('actions must reference a registered output and default out must exist', () => {
  expect(() => parseNativeResults(results(), new Set(['inspect']))).toThrow(ContractError);
  expect(() => parseNativeResults(results(), new Set(['out']))).toThrow(ContractError);
});
test('code, raw paths, malformed/prototype values and oversized frames fail safely', () => {
  const invalid = [
    { ...row(), html: '<script>synthetic</script>' }, { ...row(), icon: { kind: 'file', path: '/synthetic' } },
    { ...row(), args: [new Date()] }, { ...row(), variables: JSON.parse('{"__proto__":{"synthetic":true}}') },
    { ...row(), args: ['synthetic'.repeat(150000)] },
  ];
  for (const item of invalid) expect(() => parseNativeResults({ ...results(), items: [item] }, ports)).toThrow(ContractError);
});
test('accepted arguments and variables are detached from producer mutation', () => {
  const input = results();const result = parseNativeResults(input, ports);
  input.items[0]!.variables.nested.count = 9;input.items[0]!.args[0]!.displayName = 'Changed';
  expect(result.items[0]!.variables).toEqual({ nested: { count: 1 } });
  expect(result.items[0]!.args[0]).toMatchObject({ displayName: 'Synthetic' });
});
