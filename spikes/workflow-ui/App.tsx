import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import tokens from "../../docs/design/tokens.json" with { type: "json" };
import {
  configFixture,
  graphFixture,
  layoutFixture,
  listFixture,
  stateFixtures,
} from "./fixtures.ts";
import {
  acceptsAction,
  connect,
  edgeError,
  parseView,
  registry,
  removeNode,
  type ExecutionGraph,
  type Layout,
  type ListView,
  type NodeKind,
} from "./model.ts";
import { HostForm, HostList } from "./host/Views.tsx";
type CanvasNode = Node<{ label: string; kind: NodeKind }, "workflow">;
function WorkflowCard({ data }: NodeProps<CanvasNode>) {
  const entry = registry[data.kind];
  return (
    <div className="workflow-card">
      {entry.input && (
        <Handle
          type="target"
          id="in"
          position={Position.Left}
          role="img"
          aria-label={`${entry.input} input`}
        />
      )}
      <small>{entry.category}</small>
      <strong title={data.label}>
        <span aria-hidden="true">{entry.icon}</span> <bdi>{data.label}</bdi>
      </strong>
      <span className="port-caption">
        {entry.input ?? "start"} → {entry.output ?? "end"}
      </span>
      {entry.output && (
        <Handle
          type="source"
          id="out"
          position={Position.Right}
          role="img"
          aria-label={`${entry.output} output`}
        />
      )}
    </div>
  );
}
const nodeTypes = { workflow: WorkflowCard };
function FitGraph({ count }: { count: number }) {
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    // Wait for the controlled-node adapter and ResizeObserver measurements.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!cancelled) void fitView({ padding: 0.2, duration: 0 });
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [initialized, count, fitView]);
  return null;
}
export function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [graph, setGraph] = useState<ExecutionGraph>(
    structuredClone(graphFixture),
  );
  const [measurements, setMeasurements] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [layout, setLayout] = useState<Layout>(structuredClone(layoutFixture));
  const [selected, setSelected] = useState("trim");
  const [revision, setRevision] = useState(1);
  const [palette, setPalette] = useState("");
  const [target, setTarget] = useState("copy");
  const [notice, setNotice] = useState(
    "Local fixture loaded. Execution is unavailable in this prototype.",
  );
  const [error, setError] = useState("");
  const [state, setState] = useState("ready");
  const [draftDirty, setDraftDirty] = useState(false);
  const serial = useRef(1);
  const paletteRef = useRef<HTMLInputElement>(null);
  const current = graph.nodes.find((n) => n.id === selected);
  const themeStyle = {
    ...Object.fromEntries(
      Object.entries(tokens.themes[theme]).map(([k, v]) => [`--${k}`, v]),
    ),
    "--font-ui": tokens.font.ui,
    "--font-mono": tokens.font.mono,
    ...Object.fromEntries(
      Object.entries(tokens.fontSize).map(([k, v]) => [
        `--type-${k}`,
        `${v}px`,
      ]),
    ),
    ...Object.fromEntries(
      tokens.spacing.map((v) => [`--space-${v}`, `${v}px`]),
    ),
    ...Object.fromEntries(
      Object.entries(tokens.radius).map(([k, v]) => [
        `--radius-${k}`,
        `${v}px`,
      ]),
    ),
  } as React.CSSProperties;
  const list = useMemo(() => {
    const { selectedId: _old, ...base } = listFixture;
    void _old;
    const view: ListView = {
      ...base,
      revision,
      sections: [
        {
          id: "nodes",
          title: "Nodes",
          items: graph.nodes.map((n) => ({
            id: n.id,
            title: n.label,
            subtitle: n.type,
          })),
        },
      ],
      ...(current ? { selectedId: current.id } : {}),
    };
    const fixture = stateFixtures[state];
    return parseView(
      fixture
        ? {
            ...view,
            ...(fixture.loading ? { loading: true } : {}),
            ...(fixture.status ? { status: fixture.status } : {}),
            ...(state === "empty"
              ? { sections: [], selectedId: undefined }
              : {}),
          }
        : view,
    ) as ListView;
  }, [graph, revision, current, state]);
  const choose = (id: string) => {
    if (draftDirty && id !== selected) {
      setError(
        "Apply or cancel configuration changes before selecting another node.",
      );
      return;
    }
    setSelected(id);
    setError("");
  };
  function changed(next: ExecutionGraph, message: string) {
    setGraph(next);
    setRevision((r) => r + 1);
    setNotice(message);
    setError("");
  }
  function add(kind: NodeKind) {
    if (draftDirty) {
      setError("Apply or cancel configuration changes before adding a node.");
      return;
    }
    if (graph.nodes.length >= 500) {
      setError("This prototype supports 500 nodes. Remove a node to continue.");
      return;
    }
    const id = `node-${serial.current++}`;
    changed(
      {
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id,
            type: kind,
            typeVersion: 1,
            label: registry[kind].title,
            config: {
              text: kind === "fixture.number" ? "42" : "Sample configuration",
            },
          },
        ],
      },
      `${registry[kind].title} added to the local graph.`,
    );
    setLayout((l) => ({
      positions: {
        ...l.positions,
        [id]: { x: 264, y: 240 + graph.nodes.length * 16 },
      },
    }));
    choose(id);
  }
  function connectTo(from: string, to: string) {
    const reason = edgeError(graph, from, to);
    if (reason) {
      setError(reason);
      return;
    }
    changed(
      connect(graph, from, to, `edge-${serial.current++}`),
      "Nodes connected. Execution order follows connections.",
    );
  }
  const canvasNodes: CanvasNode[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "workflow",
    position: layout.positions[n.id] ?? { x: 0, y: 0 },
    measured: measurements[n.id] ?? {},
    data: { label: n.label, kind: n.type },
    selected: n.id === selected,
    ariaLabel: `${n.label}, ${registry[n.type].category}`,
  }));
  const edges = graph.edges.map((e) => ({
    id: e.id,
    source: e.from.nodeId,
    target: e.to.nodeId,
    sourceHandle: e.from.port,
    targetHandle: e.to.port,
    ariaLabel: `${graph.nodes.find((n) => n.id === e.from.nodeId)?.label} to ${graph.nodes.find((n) => n.id === e.to.nodeId)?.label}`,
  }));
  return (
    <main data-theme={theme} style={themeStyle}>
      <header>
        <div>
          <p className="eyebrow">LINUXCAST / FEASIBILITY S0-06</p>
          <h1>Trim Text</h1>
          <p className="muted">Workflow editor · local session</p>
        </div>
        <div className="header-actions">
          <span className="badge">In-memory draft</span>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            Use {theme === "dark" ? "light" : "dark"} appearance
          </button>
          <button
            disabled
            title="The workflow runtime is not connected in this feasibility prototype"
          >
            Run unavailable
          </button>
        </div>
      </header>
      <p className="boundary">
        Renderer prototype · versioned fixtures · no extension code, permissions
        or desktop operations execute here.
      </p>
      <div className="workspace">
        <aside aria-label="Node palette">
          <h2>Node palette</h2>
          <label>
            Search palette
            <input
              ref={paletteRef}
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              placeholder="Find a node…"
            />
          </label>
          <div className="palette">
            {Object.entries(registry)
              .filter(([, entry]) =>
                `${entry.title} ${entry.category}`
                  .toLowerCase()
                  .includes(palette.toLowerCase()),
              )
              .map(([kind, entry]) => (
                <div key={kind}>
                  <p className="caption">{entry.category}</p>
                  <button
                    onClick={() => add(kind as NodeKind)}
                    aria-label={`Add ${entry.title}`}
                  >
                    <span className="row-icon" aria-hidden="true">
                      {entry.icon}
                    </span>
                    <span>
                      <strong>{entry.title}</strong>
                      <small>
                        {entry.input ?? "start"} → {entry.output ?? "end"}
                      </small>
                    </span>
                    <span aria-hidden="true">+</span>
                  </button>
                </div>
              ))}
            {!Object.entries(registry).some(([, e]) =>
              `${e.title} ${e.category}`
                .toLowerCase()
                .includes(palette.toLowerCase()),
            ) && <p>No matching nodes. Clear the search to browse.</p>}
          </div>
          <p className="caption">
            Choose Add with Enter or Space. Connect nodes in the inspector.
            Dragging is optional.
          </p>
        </aside>
        <section className="canvas-column" aria-label="Workflow workspace">
          <div className="section-heading">
            <h2>Graph</h2>
            <span className="caption">
              {graph.nodes.length} nodes · {graph.edges.length} connections
            </span>
          </div>
          <div className="canvas" data-testid="graph">
            <ReactFlow<CanvasNode>
              nodes={canvasNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.25}
              maxZoom={2}
              onNodeClick={(_, n) => choose(n.id)}
              onNodeDragStop={(_, n) =>
                setLayout((l) => ({
                  positions: { ...l.positions, [n.id]: n.position },
                }))
              }
              onNodesChange={(changes) => {
                for (const c of changes) {
                  if (c.type === "dimensions" && c.dimensions) {
                    const size = c.dimensions;
                    setMeasurements((previous) =>
                      previous[c.id]?.width === size.width &&
                      previous[c.id]?.height === size.height
                        ? previous
                        : { ...previous, [c.id]: size },
                    );
                  }
                  if (c.type === "position" && c.position)
                    setLayout((l) => ({
                      positions: { ...l.positions, [c.id]: c.position! },
                    }));
                }
              }}
              onConnect={(c) => {
                if (c.sourceHandle !== "out" || c.targetHandle !== "in") {
                  setError("Connection rejected: unknown port.");
                  return;
                }
                connectTo(c.source, c.target);
              }}
              deleteKeyCode={null}
              colorMode={theme}
              proOptions={{ hideAttribution: false }}
            >
              <FitGraph count={graph.nodes.length} />
              <Background color="var(--border)" gap={24} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <p className="caption">
            Positions are presentation data. Moving a node never changes its
            configuration or connections.
          </p>
          <div className="section-heading">
            <h2>Structured node list</h2>
            <label className="inline-label">
              Fixture state
              <select
                aria-label="Fixture state"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                {[
                  "ready",
                  "loading",
                  "empty",
                  "error",
                  "permission",
                  "cancelled",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <HostList key={state} view={list} onSelect={choose} />
          {state === "error" && (
            <button onClick={() => setState("ready")}>
              Retry local fixture
            </button>
          )}
        </section>
        <aside aria-label="Configuration inspector">
          <h2>Inspector</h2>
          {current ? (
            <>
              <p className="caption">
                {current.type} · v{current.typeVersion}
              </p>
              <HostForm
                key={current.id}
                onDirtyChange={setDraftDirty}
                view={configFixture(current, revision)}
                onCancel={() => {
                  setError("");
                  setNotice(
                    "Configuration changes cancelled. The graph is unchanged.",
                  );
                }}
                onSubmit={(values) => {
                  const view = configFixture(current, revision);
                  if (!acceptsAction(view, revision, "save")) return;
                  changed(
                    {
                      ...graph,
                      nodes: graph.nodes.map((n) =>
                        n.id === current.id
                          ? {
                              ...n,
                              label: values.label!,
                              config: { text: values.text! },
                            }
                          : n,
                      ),
                    },
                    "Configuration applied to the local graph.",
                  );
                }}
              />
              <hr />
              <h3>Connect without dragging</h3>
              <p className="caption">
                From {current.label} ·{" "}
                {registry[current.type].output ?? "no output port"}
              </p>
              <label>
                Target node
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Choose a target</option>
                  {graph.nodes
                    .filter((n) => n.id !== current.id)
                    .map((n) => (
                      <option value={n.id} key={n.id}>
                        {n.label} ({registry[n.type].input ?? "no input"})
                      </option>
                    ))}
                </select>
              </label>
              <button onClick={() => connectTo(current.id, target)}>
                Connect selected node
              </button>
              <h3>Connections</h3>
              {graph.edges.filter(
                (e) => e.from.nodeId === selected || e.to.nodeId === selected,
              ).length ? (
                <ul className="connections">
                  {graph.edges
                    .filter(
                      (e) =>
                        e.from.nodeId === selected || e.to.nodeId === selected,
                    )
                    .map((e) => (
                      <li key={e.id}>
                        <span
                          title={`${graph.nodes.find((n) => n.id === e.from.nodeId)?.label} → ${graph.nodes.find((n) => n.id === e.to.nodeId)?.label}`}
                        >
                          {
                            graph.nodes.find((n) => n.id === e.from.nodeId)
                              ?.label
                          }{" "}
                          →{" "}
                          {graph.nodes.find((n) => n.id === e.to.nodeId)?.label}
                        </span>
                        <button
                          aria-label={`Remove connection ${e.id}`}
                          onClick={() =>
                            changed(
                              {
                                ...graph,
                                edges: graph.edges.filter(
                                  (other) => other.id !== e.id,
                                ),
                              },
                              "Connection removed.",
                            )
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="caption">No connections for this node.</p>
              )}
              <div className="button-row">
                <button
                  onClick={() => {
                    const pos = layout.positions[current.id] ?? { x: 0, y: 0 };
                    setLayout({
                      positions: {
                        ...layout.positions,
                        [current.id]: { ...pos, y: pos.y + 24 },
                      },
                    });
                    setNotice("Node moved down. Execution graph unchanged.");
                  }}
                >
                  Move node down
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    changed(
                      removeNode(graph, current.id),
                      "Node and its incident connections removed.",
                    );
                    setDraftDirty(false);
                    setLayout((previous) => {
                      const { [current.id]: removed, ...positions } =
                        previous.positions;
                      void removed;
                      return { positions };
                    });
                    setMeasurements((previous) => {
                      const { [current.id]: removed, ...remaining } = previous;
                      void removed;
                      return remaining;
                    });
                    setSelected(
                      graph.nodes.find((n) => n.id !== current.id)?.id ?? "",
                    );
                    paletteRef.current?.focus();
                  }}
                >
                  Remove node
                </button>
              </div>
            </>
          ) : (
            <p>Select a node, or add one from the palette.</p>
          )}
          <hr />
          <h3>Execution capability</h3>
          <p className="notice warning">
            Clipboard access is unavailable. This prototype can edit the graph;
            the full client will request permission before executing effects.
          </p>
        </aside>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <footer>
        <span role="status">{notice}</span>
        <span>
          <kbd>Tab</kbd> controls <kbd>↑ ↓</kbd> list rows <kbd>Enter</kbd>{" "}
          activate
        </span>
      </footer>
      <details className="diagnostics">
        <summary>Inspect fixture graph data</summary>
        <h2>Execution graph</h2>
        <pre data-testid="execution">{JSON.stringify(graph, null, 2)}</pre>
        <h2>Presentation layout</h2>
        <pre data-testid="layout">{JSON.stringify(layout, null, 2)}</pre>
      </details>
    </main>
  );
}
