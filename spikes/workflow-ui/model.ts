/** S0 feasibility contracts only. F0-01 owns the production schemas and registry. */
export type Action = {
  id: string;
  title: string;
  kind: "invoke";
  effect: "read" | "write" | "destructive";
  disabledReason?: string;
};
type Base = {
  protocolVersion: 1;
  viewId: string;
  revision: number;
  title: string;
  loading?: boolean;
  status?: { kind: "info" | "warning" | "error"; message: string };
  actions?: Action[];
};
export type ListView = Base & {
  kind: "list";
  search: { placeholder: string; query: string; mode: "host" };
  sections: {
    id: string;
    title: string;
    items: {
      id: string;
      title: string;
      subtitle: string;
      disabledReason?: string;
    }[];
  }[];
  selectedId?: string;
  empty?: { title: string; description: string };
};
export type FormView = Base & {
  kind: "form";
  fields: {
    id: string;
    kind: "text";
    title: string;
    value: string;
    required: boolean;
  }[];
  submitActionId: string;
  cancelActionId: string;
};
export type ViewModel = ListView | FormView;
function reject(): never {
  throw new Error(
    "Unsupported or invalid ViewModel. Use protocol 1 List/Form fields supported by this host prototype.",
  );
}
function object(v: unknown, keys: string[]): Record<string, unknown> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(v))
  )
    reject();
  const r = v as Record<string, unknown>;
  if (Object.keys(r).some((k) => !keys.includes(k))) reject();
  return r;
}
function str(v: unknown): asserts v is string {
  if (typeof v !== "string" || new TextEncoder().encode(v).length > 65536)
    reject();
}
function array(v: unknown): unknown[] {
  if (!Array.isArray(v) || v.length > 500) reject();
  return v;
}
function unique(ids: unknown[]) {
  if (new Set(ids).size !== ids.length || ids.some((v) => v === "")) reject();
}
/** Validates objects received as data; never evaluates fields or includes rejected content in diagnostics. */
export function parseView(value: unknown): ViewModel {
  const v = object(value, [
    "protocolVersion",
    "viewId",
    "revision",
    "title",
    "loading",
    "status",
    "actions",
    "kind",
    ...(typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "list"
      ? ["search", "sections", "selectedId", "empty"]
      : ["fields", "submitActionId", "cancelActionId"]),
  ]);
  if (
    v.protocolVersion !== 1 ||
    !Number.isSafeInteger(v.revision) ||
    (v.revision as number) < 0
  )
    reject();
  str(v.viewId);
  str(v.title);
  if (!v.viewId) reject();
  if (v.loading !== undefined && typeof v.loading !== "boolean") reject();
  if (v.status !== undefined) {
    const s = object(v.status, ["kind", "message"]);
    if (!["info", "warning", "error"].includes(s.kind as string)) reject();
    str(s.message);
  }
  const actions = v.actions === undefined ? [] : array(v.actions);
  actions.forEach((a) => {
    const r = object(a, ["id", "title", "kind", "effect", "disabledReason"]);
    str(r.id);
    str(r.title);
    if (
      r.kind !== "invoke" ||
      !["read", "write", "destructive"].includes(r.effect as string)
    )
      reject();
    if (r.disabledReason !== undefined) str(r.disabledReason);
  });
  unique(actions.map((a) => (a as Action).id));
  if (v.kind === "list") {
    const s = object(v.search, ["placeholder", "query", "mode"]);
    str(s.placeholder);
    str(s.query);
    if (s.mode !== "host") reject();
    const ids: unknown[] = [];
    const sections = array(v.sections);
    sections.forEach((section) => {
      const r = object(section, ["id", "title", "items"]);
      str(r.id);
      str(r.title);
      array(r.items).forEach((item) => {
        const i = object(item, ["id", "title", "subtitle", "disabledReason"]);
        str(i.id);
        str(i.title);
        str(i.subtitle);
        if (i.disabledReason !== undefined) str(i.disabledReason);
        ids.push(i.id);
      });
    });
    unique(sections.map((s) => (s as { id: string }).id));
    unique(ids);
    if (ids.length > 500) reject();
    if (v.selectedId !== undefined) {
      str(v.selectedId);
      if (!ids.includes(v.selectedId)) reject();
    }
    if (v.empty !== undefined) {
      const e = object(v.empty, ["title", "description"]);
      str(e.title);
      str(e.description);
    }
  } else if (v.kind === "form") {
    const fields = array(v.fields);
    fields.forEach((field) => {
      const f = object(field, ["id", "kind", "title", "value", "required"]);
      str(f.id);
      str(f.title);
      str(f.value);
      if (f.kind !== "text" || typeof f.required !== "boolean") reject();
    });
    unique(fields.map((f) => (f as { id: string }).id));
    str(v.submitActionId);
    str(v.cancelActionId);
    if (v.submitActionId === v.cancelActionId) reject();
    for (const id of [v.submitActionId, v.cancelActionId])
      if (!actions.some((a) => (a as Action).id === id)) reject();
  } else reject();
  if (new TextEncoder().encode(JSON.stringify(value)).length > 1_048_576)
    reject();
  return structuredClone(value) as ViewModel;
}
export function acceptsAction(
  view: ViewModel,
  revision: number,
  actionId: string,
) {
  return (
    revision === view.revision &&
    view.actions?.some((a) => a.id === actionId && !a.disabledReason) === true
  );
}
export type NodeKind =
  "input.keyword" | "utility.transform" | "output.clipboard" | "fixture.number";
export const registry: Record<
  NodeKind,
  {
    title: string;
    category: string;
    icon: string;
    input: "text" | null;
    output: "text" | "number" | null;
  }
> = {
  "input.keyword": {
    title: "Keyword",
    category: "Inputs",
    icon: "⌨",
    input: null,
    output: "text",
  },
  "utility.transform": {
    title: "Trim Text",
    category: "Utilities",
    icon: "≡",
    input: "text",
    output: "text",
  },
  "output.clipboard": {
    title: "Copy Text",
    category: "Outputs",
    icon: "▣",
    input: "text",
    output: null,
  },
  "fixture.number": {
    title: "Number fixture",
    category: "Utilities",
    icon: "#",
    input: null,
    output: "number",
  },
};
export type WorkflowNode = {
  id: string;
  type: NodeKind;
  typeVersion: 1;
  label: string;
  config: { text: string };
};
export type WorkflowEdge = {
  id: string;
  from: { nodeId: string; port: "out" };
  to: { nodeId: string; port: "in" };
  order: number;
};
export type ExecutionGraph = {
  schemaVersion: 1;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};
export type Layout = { positions: Record<string, { x: number; y: number }> };
export function edgeError(
  graph: ExecutionGraph,
  from: string,
  to: string,
  sourcePort = "out",
  targetPort = "in",
): string | null {
  const source = graph.nodes.find((n) => n.id === from);
  const target = graph.nodes.find((n) => n.id === to);
  if (!source || !target) return "Connection rejected: choose existing nodes.";
  if (sourcePort !== "out" || targetPort !== "in")
    return "Connection rejected: unknown port.";
  if (!registry[source.type].output || !registry[target.type].input)
    return "Connection rejected: these nodes do not have the required ports.";
  if (registry[source.type].output !== registry[target.type].input)
    return "Connection rejected: number output cannot connect to text input.";
  if (graph.edges.some((e) => e.from.nodeId === from && e.to.nodeId === to))
    return "Connection rejected: this edge already exists.";
  const reachable = (id: string, seen = new Set<string>()): boolean => {
    if (id === from) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return graph.edges.some(
      (e) => e.from.nodeId === id && reachable(e.to.nodeId, seen),
    );
  };
  if (reachable(to))
    return "Connection rejected: ordinary graph cycles are not allowed.";
  return null;
}
export function connect(
  graph: ExecutionGraph,
  from: string,
  to: string,
  id: string,
): ExecutionGraph {
  const error = edgeError(graph, from, to);
  if (error) throw new Error(error);
  return {
    ...graph,
    edges: [
      ...graph.edges,
      {
        id,
        from: { nodeId: from, port: "out" },
        to: { nodeId: to, port: "in" },
        order: Math.max(-1, ...graph.edges.filter((e) => e.from.nodeId === from && e.from.port === "out").map((e) => e.order)) + 1,
      },
    ],
  };
}
export function removeNode(graph: ExecutionGraph, id: string): ExecutionGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter(
      (e) => e.from.nodeId !== id && e.to.nodeId !== id,
    ),
  };
}
