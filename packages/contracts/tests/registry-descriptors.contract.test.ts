import { expect, test } from 'vitest';
import * as z from 'zod';
import { ContractError } from '../src/protocol.ts';
import { parseToolDescriptor, parseWorkflowNodeDescriptor, type WorkflowDescriptorRegistry } from '../src/registry-descriptors.ts';
const schema = { schemaVersion: 1 as const, schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } };
const owner = { kind: 'builtin' as const, id: 'linuxcast.synthetic', version: '1.0.0' };
const common = () => ({ schemaVersion: 1, owner, title: 'Synthetic operation', description: 'Synthetic fixture only', inputSchema: schema, outputSchema: schema,
  requiredCapabilities: ['synthetic.data'], permissions: [{ id: 'synthetic.read', reason: 'Fixture scope', scope: { root: 'synthetic' } }], effect: 'read', timeoutMs: 10000 });
const node = () => ({ ...common(), type: 'utility.synthetic', typeVersion: 1, category: 'utility', configSchema: schema,
  executorId: 'synthetic-executor', retry: 'safe', editorFields: [{ path: '/text', title: 'Text', sensitive: false }],
  examples: [{ title: 'Synthetic example', config: { text: 'config' }, input: { text: 'in' }, output: { text: 'out' } }] });
const tool = () => ({ ...common(), id: 'linuxcast:synthetic', operationId: 'synthetic-executor', workingDirectory: 'optional',
  scopeRequirements: [{ id: 'source', kind: 'directory', required: true }], idempotency: 'safe' });
const valueSchema = z.strictObject({ text: z.string() });
function registry(): WorkflowDescriptorRegistry {
  return { implementations: new Map([['synthetic-executor', { owner, effect: 'read', retrySafe: true, hostIdempotencyKey: false,
    permissionIds: new Set(['synthetic.read']), capabilityIds: new Set(['synthetic.data']), workingDirectory: 'optional',
    scopeRequirements: [{ id: 'source', kind: 'directory', required: true }] }]]),
  capabilities: new Set(['synthetic.data']), permissionScopes: new Map([['synthetic.read', z.strictObject({ root: z.string(), mode: z.literal('read').default('read') })]]),
  validJsonSchema: value => JSON.stringify(value) === JSON.stringify(schema),
  validEditorField: (_, path) => path === '/text',
  validExample: (_, example) => [example.config, example.input, example.output].every(value => valueSchema.safeParse(value).success) };
}
test('node metadata normalizes permission scopes and matches runtime/editor example validators', () => {
  const result = parseWorkflowNodeDescriptor(node(), registry());
  expect(result.permissions[0]?.scope).toEqual({ root: 'synthetic', mode: 'read' });
  expect(result.examples[0]?.output).toEqual({ text: 'out' });
});
test('tool metadata resolves registered effect, owner and safe retry classification', () => {
  expect(parseToolDescriptor(tool(), registry())).toMatchObject({ owner, idempotency: 'safe', workingDirectory: 'optional' });
  expect(() => parseToolDescriptor({ ...tool(), idempotency: 'host-key' }, registry())).toThrow(ContractError);
});
test.each([
  { schemaVersion: 2 }, { effect: 'write' }, { requiredCapabilities: [] }, { requiredCapabilities: ['unknown'] },
  { permissions: [] }, { permissions: [{ id: 'unknown', reason: 'fixture' }] },
  { owner: { ...owner, version: '2.0.0' } }, { owner: { ...owner, kind: 'extension' } },
  { timeoutMs: 0 }, { timeoutMs: 86400001 }, { operationId: 'unknown' }, { workingDirectory: 'none' },
  { scopeRequirements: [] }, { scopeRequirements: [{ id: 'source', kind: 'directory', required: false }] },
  { inputSchema: { schemaVersion: 1, schema: { type: 'unknown' } } },
])('tool rejects invalid or weaker metadata %#', patch => expect(() => parseToolDescriptor({ ...tool(), ...patch }, registry())).toThrow(ContractError));
test('unknown/duplicate references, bad editor paths and inconsistent examples reject before registration', () => {
  for (const patch of [
    { executorId: 'unknown' }, { owner: { ...owner, kind: 'mcp' } }, { typeVersion: 2 },
    { editorFields: [{ path: '/missing', title: 'Missing', sensitive: false }] },
    { editorFields: [...node().editorFields, ...node().editorFields] },
    { examples: [{ ...node().examples[0], output: { text: 7 } }] },
    { permissions: [...node().permissions, ...node().permissions] },
    { requiredCapabilities: ['synthetic.data', 'synthetic.data'] },
  ]) expect(() => parseWorkflowNodeDescriptor({ ...node(), ...patch }, registry())).toThrow(ContractError);
});
test('package/server annotations cannot make a nonretryable implementation safe', () => {
  const registered = registry();
  const original = registered.implementations.get('synthetic-executor')!;
  registered.implementations = new Map([['synthetic-executor', { ...original, retrySafe: false }]]);
  expect(() => parseToolDescriptor(tool(), registered)).toThrow(ContractError);
  expect(() => parseWorkflowNodeDescriptor(node(), registered)).toThrow(ContractError);
  expect(parseWorkflowNodeDescriptor({ ...node(), retry: 'never' }, registered).retry).toBe('never');
});
test('MCP runtime versions are opaque and match the trusted discovery identity exactly', () => {
  const registered = registry(); const mcpOwner = { kind: 'mcp' as const, id: 'synthetic-mcp', version: '2026-01-build' };
  registered.implementations = new Map([['synthetic-executor', { ...registered.implementations.get('synthetic-executor')!, owner: mcpOwner }]]);
  expect(parseToolDescriptor({ ...tool(), owner: mcpOwner }, registered).owner).toEqual(mcpOwner);
  expect(() => parseToolDescriptor({ ...tool(), owner: { ...mcpOwner, version: 'other' } }, registered)).toThrow(ContractError);
});
test('accepted schemas and normalized nested scopes have no caller-owned aliases', () => {
  const input = structuredClone(node()); const registered = registry();
  const rawScope = { root: 'synthetic', nested: { value: 1 } };
  input.permissions[0]!.scope = rawScope;
  registered.permissionScopes = new Map([['synthetic.read', z.custom(() => true)]]);
  const result = parseWorkflowNodeDescriptor(input, registered);
  rawScope.nested.value = 2; input.configSchema.schema.properties.text.type = 'number';
  expect(result.permissions[0]?.scope).toEqual({ root: 'synthetic', nested: { value: 1 } });
  expect(result.configSchema.schema).toMatchObject({ properties: { text: { type: 'string' } } });
});
test('compiler exceptions and oversized/prototype-bearing schemas fail with typed errors', () => {
  const registered = registry(); registered.validJsonSchema = () => { throw new Error('private diagnostic'); };
  expect(() => parseToolDescriptor(tool(), registered)).toThrow(ContractError);
  for (const payload of [
    { ...tool(), description: 'x'.repeat(1024 * 1024) },
    { ...tool(), inputSchema: { schemaVersion: 1, schema: new Date() } },
    { ...tool(), inputSchema: { schemaVersion: 1, schema: JSON.parse('{"__proto__":{}}') as unknown } },
  ]) expect(() => parseToolDescriptor(payload, registry())).toThrow(ContractError);
});
