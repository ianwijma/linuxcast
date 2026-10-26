import * as z from 'zod';
import { workflowBindingSchema } from '../../contracts/src/workflows.ts';
import type { WorkflowDefinition, WorkflowNodeContract } from '../../contracts/src/workflow-graph.ts';

export type WorkflowPortKind = 'text' | 'number' | 'boolean' | 'json';
export type GraphNodeRegistration = WorkflowNodeContract & {
  inputKind: WorkflowPortKind | null;
  outputKinds: (config: unknown) => ReadonlyMap<string, WorkflowPortKind>;
  subgraphReferences?: (config: unknown) => readonly string[];
};
export type GraphNodeRegistry = ReadonlyMap<string, GraphNodeRegistration>;
const out = () => new Set(['out']);
const textOutput = () => new Map([['out', 'text' as const]]);
const common = { typeVersion: 1 as const, outputPorts: out, outputKinds: textOutput };
/** Fixed application-owned editing schemas; these registrations grant no execution authority. */
export const EDITOR_NODE_REGISTRY: GraphNodeRegistry = new Map([
  ['input.keyword', { ...common, inputKind: null, config: z.strictObject({
    keyword: z.string().min(1).max(64).regex(/^[^\s\p{Cc}\p{Cs}]+$/u),
    argument: z.enum(['required', 'optional', 'none']), trimQuery: z.boolean(),
  }) }],
  ['utility.transform', { ...common, inputKind: 'text', config: z.strictObject({
    operation: z.enum(['trim', 'upper', 'lower', 'title', 'normalize']),
    source: workflowBindingSchema, locale: z.string().min(1).max(64).optional(),
  }) }],
  ['output.clipboard', { ...common, inputKind: 'text', config: z.strictObject({
    text: workflowBindingSchema, paste: z.literal(false), history: z.literal('exclude'),
  }) }],
]);
export const EDITOR_NODE_TYPES = [
  { type: 'input.keyword', title: 'Keyword', category: 'Inputs', description: 'Start with a submitted text query.', config: { keyword: 'text', argument: 'required', trimQuery: false } },
  { type: 'utility.transform', title: 'Transform text', category: 'Utilities', description: 'Trim or change text using an explicit operation.', config: { operation: 'trim', source: { ref: 'input#/0' } } },
  { type: 'output.clipboard', title: 'Copy text', category: 'Outputs', description: 'Copy approved text from a saved workflow. No paste or history capture.', config: { text: { ref: 'input#/0' }, paste: false, history: 'exclude' } },
] as const;
export function createWorkflowDraft(): WorkflowDefinition {
  return { schemaVersion: 1, id: 'org.linuxcast.user.draft', version: '1.0.0', name: 'Untitled workflow', description: '',
    author: { name: 'Local user' }, license: 'GPL-3.0-only', minHostVersion: '1.0.0', permissions: [], settings: [],
    defaults: { runTimeoutMs: 600000, maxNodeExecutions: 10000, maxConcurrentNodes: 4 },
    nodes: [], edges: [], editor: { positions: {}, notes: [] } };
}
