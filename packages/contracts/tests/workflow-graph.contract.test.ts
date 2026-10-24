import { expect, it } from 'vitest';
import * as z from 'zod';
import { ContractError, parseWorkflowDefinition, parseContract, semanticVersionSchema } from '../src/index.ts';
const node = { id: 'synthetic-node', type: 'synthetic.transform', typeVersion: 1, config: {} };
const workflow = () => ({ schemaVersion: 1, id: 'org.linuxcast.synthetic', version: '1.0.0', name: 'Synthetic', description: 'Synthetic graph',
  author: { name: 'Synthetic' }, license: 'GPL-3.0-only', minHostVersion: '1.0.0', permissions: [], settings: [],
  defaults: { runTimeoutMs: 600000, maxNodeExecutions: 10000, maxConcurrentNodes: 4 }, nodes: [node], edges: [],
  editor: { positions: { 'synthetic-node': { x: 0, y: 0 } }, notes: [] } });
const registry = new Map([['synthetic.transform', { typeVersion: 1 as const, config: z.strictObject({ operation: z.literal('trim').default('trim') }), outputPorts: () => new Set(['out', 'error']) }]]);
it('validates node configuration against the host registry and preserves inert editor data', () => {
  const parsed = parseWorkflowDefinition(workflow(), registry);
  expect(parsed.nodes[0]!.config).toEqual({ operation: 'trim' }); expect(parsed.editor).toEqual(workflow().editor);
});
it.each([{ schemaVersion: 2 }, { id: 'Not-Native' }, { version: 'latest' }, { execute: 'synthetic' },
  { defaults: { runTimeoutMs: 86400001, maxNodeExecutions: 10000, maxConcurrentNodes: 4 } },
  { nodes: [{ ...node, type: 'unknown' }] }, { nodes: [{ ...node, typeVersion: 2 }] }, { nodes: [node, node] },
  { nodes: [{ ...node, config: { arbitraryCode: 'synthetic' } }] }])('rejects incompatible/unknown/invalid workflow data %#', patch => {
  expect(() => parseWorkflowDefinition({ ...workflow(), ...patch }, registry)).toThrow(ContractError);
});
it('validates edge identity, destination, source port and unique source ordering', () => {
  const edge = { id: 'synthetic-edge', from: { nodeId: node.id, port: 'out' }, to: { nodeId: 'second', port: 'in' }, order: 0 };
  const graph = { ...workflow(), nodes: [node, { ...node, id: 'second' }], edges: [edge] };
  expect(parseWorkflowDefinition(graph, registry).edges).toEqual([edge]);
  for (const edges of [[{ ...edge, from: { ...edge.from, port: 'unknown' } }], [{ ...edge, to: { ...edge.to, nodeId: 'missing' } }],
    [edge, { ...edge, id: 'second-edge' }], [edge, { ...edge, order: 1 }]]) {
    expect(() => parseWorkflowDefinition({ ...graph, edges }, registry)).toThrow(ContractError);
  }
});
it('defines one explicit subgraph entry and named return/error exits', () => {
  const child = { nodes: [node], edges: [], entryNodeId: node.id, exits: { return: { nodeId: node.id, port: 'out' }, error: { nodeId: node.id, port: 'error' } } };
  expect(parseWorkflowDefinition({ ...workflow(), subgraphs: { synthetic: child } }, registry)).toHaveProperty('subgraphs.synthetic.entryNodeId', node.id);
  expect(() => parseWorkflowDefinition({ ...workflow(), subgraphs: { synthetic: { ...child, entryNodeId: 'missing' } } }, registry)).toThrow(ContractError);
});
it.each(['0.0.0', '1.2.3-alpha.1+synthetic', '1.0.0+build.01'])('accepts SemVer %s', value => { expect(parseContract(semanticVersionSchema, value)).toBe(value); });
it.each(['01.0.0', '1.2', '1.0.0-01', '1.0.0+', '1.0.0-alpha..1'])('rejects invalid SemVer %s', value => { expect(() => parseContract(semanticVersionSchema, value)).toThrow(ContractError); });

it('rechecks normalized defaults against workflow value limits and prototype restrictions', () => {
  for (const config of [z.strictObject({ constructor: z.string().default('synthetic') }),
    z.strictObject({ values: z.array(z.number()).default(Array(10001).fill(0)) })]) {
    const defaults = new Map([['synthetic.transform', { typeVersion: 1 as const, config, outputPorts: () => new Set(['out']) }]]);
    expect(() => parseWorkflowDefinition(workflow(), defaults)).toThrow(ContractError);
  }
});
