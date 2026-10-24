import * as z from 'zod';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, parseContract } from './protocol.ts';
import { permissionRequestSchema, settingDefinitionSchema } from './settings.ts';
import { uiTextSchema as text } from './scalars.ts';
import { workflowValueSchema } from './workflows.ts';
const id = text.min(1);
export const packageIdentitySchema = id.regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u);
export const semanticVersionSchema = id.refine(value => {
  const build = value.split('+'); if (build.length > 2) return false;
  if (build[1] !== undefined && !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/u.test(build[1])) return false;
  const dash = build[0]!.indexOf('-');
  const core = dash < 0 ? build[0]! : build[0]!.slice(0, dash);
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(core)) return false;
  if (dash < 0) return true;
  return build[0]!.slice(dash + 1).split('.').every(part => /^[A-Za-z0-9-]+$/u.test(part) && (!/^[0-9]+$/u.test(part) || part === '0' || !part.startsWith('0')));
});
const modifiers = z.array(z.enum(['Ctrl', 'Alt', 'Shift', 'Super'])).refine(value => new Set(value).size === value.length);
export const workflowNodeSchema = z.strictObject({ id, type: id, typeVersion: z.literal(1), label: text.optional(),
  config: z.record(z.string(), jsonValueSchema), disabled: z.boolean().optional(), timeoutMs: z.number().int().positive().max(86400000).optional(),
  onError: z.enum(['stop', 'route']).optional() });
const endpoint = z.strictObject({ nodeId: id, port: id });
export const workflowEdgeSchema = z.strictObject({ id, from: endpoint, to: z.strictObject({ nodeId: id, port: z.literal('in') }),
  order: z.number().int().nonnegative(), activation: z.strictObject({ modifiers }).optional(), keepLauncherOpen: z.boolean().optional() });
const graph = { nodes: z.array(workflowNodeSchema).max(1000), edges: z.array(workflowEdgeSchema).max(4000) };
/** The normative one-entry/return/error subgraph semantics use explicit node/port
 * references. Subgraphs are named once in the package; nesting is a registry-
 * validated call relation, not an implicitly recursive JSON object.
 */
export const workflowSubgraphSchema = z.strictObject({ ...graph, entryNodeId: id,
  exits: z.strictObject({ return: endpoint, error: endpoint }) });
const coordinate = z.number();
const workflowShape = z.strictObject({ schemaVersion: z.literal(1), id: packageIdentitySchema, version: semanticVersionSchema,
  name: text, description: text, author: z.strictObject({ name: text, url: text.optional() }), license: id, minHostVersion: semanticVersionSchema,
  permissions: z.array(permissionRequestSchema), settings: z.array(settingDefinitionSchema),
  defaults: z.strictObject({ runTimeoutMs: z.number().int().positive().max(86400000), maxNodeExecutions: z.number().int().positive().max(10000),
    maxConcurrentNodes: z.number().int().positive().max(4) }), ...graph,
  subgraphs: z.record(z.string(), workflowSubgraphSchema).optional(),
  editor: z.strictObject({ positions: z.record(z.string(), z.strictObject({ x: coordinate, y: coordinate })),
    notes: z.array(z.strictObject({ id, text, nodeId: id.optional(), x: coordinate, y: coordinate })),
    viewport: z.strictObject({ x: coordinate, y: coordinate, zoom: z.number().positive() }).optional() }),
});
export const workflowDefinitionSchema = z.preprocess((value, context) => {
  if (!workflowValueSchema.safeParse(value).success) {
    context.addIssue({ code: 'custom', message: 'Invalid workflow definition.' }); return z.NEVER;
  }
  return value;
}, workflowShape);
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowNodeContract = { typeVersion: 1; config: z.ZodType; outputPorts: (config: unknown) => ReadonlySet<string> };
export type WorkflowNodeContracts = ReadonlyMap<string, WorkflowNodeContract>;
/** Validates compatibility with the host-owned node registry. It neither grants
 * permissions nor compiles/runs a graph. Cycles, bounded subgraph/call depth,
 * trigger enablement, bindings and effect policy belong to workflow-core.
 */
export function parseWorkflowDefinition(value: unknown, registry: WorkflowNodeContracts): WorkflowDefinition {
  const workflow = parseContract(workflowDefinitionSchema, value);
  const subgraphs = Object.values(workflow.subgraphs ?? {});
  if ([workflow, ...subgraphs].reduce((n, item) => n + item.nodes.length, 0) > 1000 ||
    [workflow, ...subgraphs].reduce((n, item) => n + item.edges.length, 0) > 4000 ||
    new Set(workflow.settings.map(item => item.id)).size !== workflow.settings.length ||
    new Set(workflow.permissions.map(item => item.id)).size !== workflow.permissions.length) throw new ContractError('Invalid workflow limits or identities.');
  function checkGraph<T extends { nodes: WorkflowDefinition['nodes']; edges: WorkflowDefinition['edges'] }>(item: T): T {
    const ports = new Map<string, ReadonlySet<string>>();
    const nodes = item.nodes.map(node => {
      const contract = registry.get(node.type);
      if (!contract || contract.typeVersion !== node.typeVersion || ports.has(node.id)) throw new ContractError('Unknown or duplicate workflow node.');
      const config = parseContract(contract.config, node.config);
      const json = parseContract(workflowValueSchema, config);
      if (json === null || typeof json !== 'object' || Array.isArray(json)) throw new ContractError('Invalid workflow node configuration.');
      try { ports.set(node.id, contract.outputPorts(json)); }
      catch { throw new ContractError('Invalid workflow node ports.'); }
      return { ...node, config: json };
    });
    const edgeIds = new Set<string>(); const orders = new Set<string>();
    for (const edge of item.edges) {
      const order = JSON.stringify([edge.from.nodeId, edge.from.port, edge.order]);
      if (edgeIds.has(edge.id) || orders.has(order) || !ports.has(edge.to.nodeId) || !ports.get(edge.from.nodeId)?.has(edge.from.port)) throw new ContractError('Invalid workflow edge reference.');
      edgeIds.add(edge.id); orders.add(order);
    }
    if ('entryNodeId' in item) {
      const child = item as unknown as z.infer<typeof workflowSubgraphSchema>;
      if (!ports.has(child.entryNodeId) || Object.values(child.exits).some(exit => !ports.get(exit.nodeId)?.has(exit.port))) throw new ContractError('Invalid workflow subgraph reference.');
    }
    return { ...item, nodes };
  }
  return parseContract(workflowDefinitionSchema, { ...checkGraph(workflow), ...(workflow.subgraphs ? { subgraphs: Object.fromEntries(Object.entries(workflow.subgraphs).map(([key, child]) => [key, checkGraph(child)])) } : {}) });
}
