import type {
  ExecutionGraph,
  FormView,
  Layout,
  ListView,
  WorkflowNode,
} from "./model.ts";
export const graphFixture: ExecutionGraph = {
  schemaVersion: 1,
  nodes: [
    {
      id: "start",
      type: "input.keyword",
      typeVersion: 1,
      label: "Keyword",
      config: { text: "trim" },
    },
    {
      id: "trim",
      type: "utility.transform",
      typeVersion: 1,
      label: "Trim Text",
      config: { text: "Remove surrounding whitespace" },
    },
    {
      id: "copy",
      type: "output.clipboard",
      typeVersion: 1,
      label: "Copy Text",
      config: { text: "Clipboard permission required" },
    },
  ],
  edges: [
    {
      id: "start-trim",
      from: { nodeId: "start", port: "out" },
      to: { nodeId: "trim", port: "in" },
      order: 0,
    },
    {
      id: "trim-copy",
      from: { nodeId: "trim", port: "out" },
      to: { nodeId: "copy", port: "in" },
      order: 0,
    },
  ],
};
export const layoutFixture: Layout = {
  positions: {
    start: { x: 24, y: 64 },
    trim: { x: 264, y: 64 },
    copy: { x: 504, y: 64 },
  },
};
export const listFixture: ListView = {
  protocolVersion: 1,
  viewId: "workflow-nodes",
  revision: 1,
  title: "Workflow nodes",
  kind: "list",
  search: { placeholder: "Find a node…", query: "", mode: "host" },
  sections: [
    {
      id: "nodes",
      title: "Execution order follows connections",
      items: graphFixture.nodes.map((n) => ({
        id: n.id,
        title: n.label,
        subtitle: n.type,
      })),
    },
  ],
  selectedId: "trim",
  empty: { title: "No nodes", description: "Add a node from the palette." },
};
export function configFixture(node: WorkflowNode, revision: number): FormView {
  return {
    protocolVersion: 1,
    viewId: `configure-${node.id}`,
    revision,
    title: `Configure ${node.label}`,
    kind: "form",
    fields: [
      {
        id: "label",
        kind: "text",
        title: "Node label",
        value: node.label,
        required: true,
      },
      {
        id: "text",
        kind: "text",
        title: "Configuration text",
        value: node.config.text,
        required: true,
      },
    ],
    actions: [
      {
        id: "save",
        title: "Apply configuration",
        kind: "invoke",
        effect: "write",
      },
      { id: "cancel", title: "Cancel changes", kind: "invoke", effect: "read" },
    ],
    submitActionId: "save",
    cancelActionId: "cancel",
  };
}
const { selectedId: _selectedId, ...emptyBase } = listFixture;
void _selectedId;
export const stateFixtures: Record<string, ListView> = {
  loading: {
    ...listFixture,
    loading: true,
  },
  empty: { ...emptyBase, sections: [] },
  error: {
    ...listFixture,
    status: {
      kind: "error",
      message: "Fixture could not be loaded. Retry the local sample.",
    },
  },
  permission: {
    ...listFixture,
    status: {
      kind: "warning",
      message:
        "Clipboard permission required. Review permissions in the full client. This prototype cannot grant access.",
    },
  },
  cancelled: {
    ...listFixture,
    status: {
      kind: "info",
      message: "Preview cancelled. No clipboard operation was performed.",
    },
  },
};
