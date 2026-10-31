import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Background, BackgroundVariant, BaseEdge, Controls, EdgeLabelRenderer, Handle, Position, ReactFlow, applyNodeChanges, getBezierPath, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, EmptyState, ErrorState, GlyphTile, GroupCaption, LineIcon, LoadingState, StatePlate, TextField, UnavailableState } from '@linuxcast/ui';
import type { GlyphCategory, LineIconName } from '@linuxcast/ui';
import '@linuxcast/ui/styles.css';
import { workflowDisplayName } from '@linuxcast/contracts';
import type { WorkflowEditorApi, WorkflowDefinition } from '@linuxcast/contracts';
import { EDITOR_NODE_REGISTRY, EDITOR_NODE_TYPES } from '@linuxcast/workflows/registry';
import type { WorkflowRunApi,WorkflowEditorOpenIntent } from '@linuxcast/contracts';
import { WorkflowRunPanel } from '../debugger/index.tsx';
import { WorkflowEditorController } from './controller.ts';
import { configSummary, declaredEffects, flowSummary, isReceipt, isValidationMessage, nodeTile, splitMessage } from './ui/presentation.ts';
import { projectionFactor, toDisplay, toStored } from './ui/projection.ts';
import './editor.css';

/*
 * Existing workflow workspace in the selected Instrument composition (docs/design/DESIGN.md "Workflows",
 * "Shell and navigation", "Results and actions", "Controls, keycaps and line icons", "List, grid, detail and form",
 * "States and motion", "Accessibility"). Presentation only: the controller owns graph, draft, receipts and close.
 */
const categories = ['Triggers', 'Inputs', 'Actions', 'Automations', 'User Interface', 'Utilities', 'Outputs'];
type PortOutput = { port: string; kind: string };
type CanvasNode = Node<{ label: string; category: string; input: string | null; outputs: PortOutput[]; summary: string; tile: GlyphCategory; icon: LineIconName | undefined }, 'workflow'>;
type CanvasEdge = Edge<{ kind: string }, 'typed'>;
function WorkflowCard({ data, selected }: NodeProps<CanvasNode>) {
  return <div className="wf-node" data-selected={selected || undefined}>
    {data.input && <Handle type="target" id="in" position={Position.Left} role="img" aria-label={`${data.input} input in`} />}
    <span className="wf-node-head"><GlyphTile category={data.tile} icon={data.icon} /><span className="wf-node-category">{data.category}</span></span>
    <strong className="wf-node-title" title={data.label}>{data.label}</strong>
    <span className="wf-node-line" title={data.summary}>{data.summary}</span>
    <span className="wf-node-line wf-node-ports">{portLine(data.input, data.outputs)}</span>
    {data.outputs.map(({ port, kind }) => <Handle key={port} type="source" id={port} position={Position.Right} role="img" aria-label={`${kind} output ${port}`} />)}
  </div>;
}
const nodeTypes = { workflow: WorkflowCard };
function portLine(input: string | null, outputs: readonly PortOutput[]) { return `${input ? `${input} in` : 'Start'} → ${outputs.map(({ port, kind }) => `${port} · ${kind}`).join(', ')}`; }
/** Typed connection: controlBorder curve plus the port kind as a monospace label at its midpoint. The kind
 *  is also in the focusable edge's accessible name, so the decorative label is hidden from AT. */
function TypedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, interactionWidth }: EdgeProps<CanvasEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const kind = data?.kind ?? 'unknown';
  return <><BaseEdge id={id} path={path} {...(markerEnd ? { markerEnd } : {})} {...(interactionWidth === undefined ? {} : { interactionWidth })} />
    <EdgeLabelRenderer><span className="wf-edge-label" data-edge-id={id} title={`${kind} connection`} aria-hidden="true" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{kind}</span></EdgeLabelRenderer></>;
}
const edgeTypes = { typed: TypedEdge };
/** Measures the rem-token card width and the widest typed label slot; both follow root text size. */
function useMeasuredProjection(probe: HTMLElement | null): number {
  const [size, setSize] = useState({ card: 0, slot: 0 });
  useLayoutEffect(() => {
    if (!probe) return;
    const card = probe.querySelector<HTMLElement>('[data-probe="card"]'), slot = probe.querySelector<HTMLElement>('[data-probe="slot"]');
    if (!card || !slot) return;
    const measure = () => { /* Layout CSS px: unaffected by transforms and native zoom. */ const next = { card: card.offsetWidth, slot: slot.offsetWidth }; setSize(previous => previous.card === next.card && previous.slot === next.slot ? previous : next); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(card); observer.observe(slot);
    return () => observer.disconnect();
  }, [probe]);
  return projectionFactor(size.card, size.slot);
}
function Select({ label, value, onChange, children, disabled = false }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; disabled?: boolean }) {
  const id = useId(); return <div className="lc-field"><label className="lc-field-label" htmlFor={id}>{label}</label><select id={id} className="lc-input lc-focus" value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>{children}</select></div>;
}
function Confirmation({ title, message, confirm, onConfirm, onCancel }: { title: string; message: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  const id = useId(), description = useId(), ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement; ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  return <div className="wf-modal-backdrop"><div className="wf-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} aria-describedby={description} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onCancel(); }
    if (event.key === 'Tab') { const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]; const first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}><p className="wf-eyebrow">Confirm</p><h2 id={id}>{title}</h2><p id={description}>{message}</p><div className="wf-actions"><Button onClick={onCancel}>Keep editing</Button><Button variant="danger" onClick={onConfirm}>{confirm}</Button></div></div></div>;
}
/** Fixed controller notices keep their existing single `alert` region; the plate inside only classifies the copy. */
function Notice({ message, kind }: { message: string; kind: 'error' | 'unavailable' | 'receipt' }) {
  const { title, description } = splitMessage(message);
  return <div role="alert" className="wf-notice">{kind === 'receipt'
    ? <p className="wf-receipt"><LineIcon name="info" /><span>{message}</span></p>
    : <StatePlate kind={kind} layout="band" headingLevel={2} title={title} description={description || undefined} />}</div>;
}
function WorkspaceHeader({ children, status }: { children?: ReactNode; status?: ReactNode }) {
  return <header className="wf-header"><GlyphTile category="workflow" /><div className="wf-header-title"><h1>Workflow editor</h1>{status}</div>{children && <div className="wf-actions wf-header-actions">{children}</div>}</header>;
}
export function WorkflowEditor({ api, runApi,launchIntent }: { api: WorkflowEditorApi;runApi?:WorkflowRunApi;launchIntent?:WorkflowEditorOpenIntent }) {
  const [controller] = useState(() => new WorkflowEditorController(api));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [runOpen,setRunOpen]=useState(false),[initialEntry,setInitialEntry]=useState<string>(),[entryMessage,setEntryMessage]=useState('');
  const lastIntent=useRef(0);
  useEffect(()=>{if(!launchIntent||launchIntent.requestId<=lastIntent.current||state.loading||state.busy||state.closing)return;lastIntent.current=launchIntent.requestId;
    if(launchIntent.view==='editor'){setRunOpen(false);setInitialEntry(undefined);setEntryMessage('');return;}
    if(state.dirty||state.blocked||!state.record?.saved||state.record.revision!==launchIntent.editorRevision){setRunOpen(false);setInitialEntry(undefined);setEntryMessage('The saved workflow or draft changed. Reload the editor, then reopen the entry from the launcher. No run was started.');return;}
    setInitialEntry(launchIntent.triggerNodeId);setEntryMessage('');setRunOpen(true);
  },[launchIntent,state.loading,state.busy,state.closing,state.dirty,state.blocked,state.record]);
  const runButton=useRef<HTMLButtonElement>(null);
  const [palette, setPalette] = useState(''), [from, setFrom] = useState(''), [port, setPort] = useState('out'), [to, setTo] = useState('');
  const [confirm, setConfirm] = useState<'reload' | 'revert' | 'discard' | null>(null);
  const [viewport, setViewport] = useState({ x: 32, y: 32, zoom: 0.8 });
  const [measurements, setMeasurements] = useState<Record<string, { width: number; height: number }>>({});
  const nameRef = useRef<HTMLInputElement>(null), labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => { void controller.load(); const unsubscribe = api.onCloseRequested(() => controller.requestClose()); return () => { unsubscribe(); controller.dispose(); }; }, [controller, api]);
  const draft = state.draft, current = draft?.nodes.find(node => node.id === state.selected);
  useEffect(() => { setViewport(draft?.editor.viewport ?? { x: 32, y: 32, zoom: 0.8 }); }, [draft?.editor.viewport]);
  const locked = state.loading || state.closing || state.reverting;
  function add(type: string) { controller.add(type); requestAnimationFrame(() => labelRef.current?.focus()); }
  function update(config: WorkflowDefinition['nodes'][number]['config']) { if (current) controller.configure(current.id, current.label ?? '', config); }
  function confirmAction(action: 'reload' | 'revert') { if (state.dirty) setConfirm(action); else if (action === 'reload') void controller.load(); else void controller.write('revert'); }
  const titleOf = (type: string) => EDITOR_NODE_TYPES.find(item => item.type === type);
  const outputsOf = (node: WorkflowDefinition['nodes'][number]) => { try { return [...(EDITOR_NODE_REGISTRY.get(node.type)?.outputPorts(node.config) ?? [])]; } catch { return [] as string[]; /* Invalid drafts remain editable. */ } };
  const kindOf = (node: WorkflowDefinition['nodes'][number] | undefined, port: string) => { if (!node) return 'unknown'; try { return EDITOR_NODE_REGISTRY.get(node.type)?.outputKinds(node.config).get(port) ?? 'unknown'; } catch { return 'unknown'; } };
  const [probe, setProbe] = useState<HTMLDivElement | null>(null), factor = useMeasuredProjection(probe);
  const nodes: CanvasNode[] = (draft?.nodes ?? []).map(node => {
    const entry = titleOf(node.type), registration = EDITOR_NODE_REGISTRY.get(node.type), tile = nodeTile(node.type), outputs = outputsOf(node);
    const label = node.label || entry?.title || 'Unknown node', category = entry?.category ?? 'Unavailable', summary = configSummary(node);
    return { id: node.id, type: 'workflow', position: toDisplay(draft?.editor.positions[node.id] ?? { x: 0, y: 0 }, factor), ...(measurements[node.id] ? { measured: measurements[node.id] } : {}), selected: node.id === state.selected,
      ariaRole: 'button', domAttributes: { 'aria-pressed': node.id === state.selected },
      data: { label, category, input: registration?.inputKind ?? null, outputs: outputs.map(port => ({ port, kind: kindOf(node, port) })), summary, tile: tile.category, icon: tile.icon },
      /* No aria-label override: the node button is named from its visible card text (category, title,
         configuration, typed ports), so visible and accessible names cannot drift. */ };
  });
  const edges: CanvasEdge[] = (draft?.edges ?? []).map(edge => { const kind = kindOf(draft?.nodes.find(node => node.id === edge.from.nodeId), edge.from.port);
    return { id: edge.id, type: 'typed', source: edge.from.nodeId, sourceHandle: edge.from.port, target: edge.to.nodeId, targetHandle: edge.to.port, data: { kind },
      ariaLabel: `Connection ${edge.from.nodeId} ${edge.from.port} to ${edge.to.nodeId} in · ${kind}` }; });
  const probeKind = edges.reduce((longest, edge) => (edge.data?.kind.length ?? 0) > longest.length ? edge.data!.kind : longest, 'text');
  const source = draft?.nodes.find(node => node.id === from);
  const ports: string[] = source ? outputsOf(source) : [];
  if(runOpen&&runApi&&state.record?.saved)return <main className="wf-run-shell"><WorkspaceHeader /><WorkflowRunPanel api={runApi} editorRevision={state.record.revision} savedDefinition={state.record.saved} {...(initialEntry===undefined?{}:{initialEntry})} onClose={()=>{setRunOpen(false);requestAnimationFrame(()=>runButton.current?.focus());}}/></main>;
  const saveText = state.blocked ? 'Reload required before writing again' : state.busy ? 'Writing local draft…' : state.dirty ? 'Unsaved local changes' : state.record ? 'Draft stored locally' : 'No stored workflow';
  return <main className="wf-editor" onKeyDown={event => {
    if (event.nativeEvent.isComposing || confirm) return;
    if (event.repeat) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') event.preventDefault(); return; }
    if (event.key === 'Escape') { event.preventDefault(); void controller.requestClose(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!state.busy && !locked) void controller.write('save'); }
  }}>
    <WorkspaceHeader status={<p className="wf-header-status">{draft && <span className="wf-header-name" title={draft.name}>{workflowDisplayName(draft.name || 'Untitled workflow')}</span>}<span role="status" aria-live="polite" className="wf-save-state" data-state={state.blocked ? 'blocked' : state.dirty || state.busy ? 'dirty' : undefined}>{saveText}</span></p>}>
      <Button variant="ghost" disabled={state.loading || state.closing} aria-disabled={state.busy} onClick={() => confirmAction('reload')}>Reload</Button>
      <Button disabled={!draft || state.blocked || state.loading || state.closing} busy={state.busy} onClick={() => confirmAction('revert')}>Revert</Button>
      <Button ref={runButton} disabled={!runApi||!state.record?.saved||state.blocked||state.busy||state.dirty||locked} aria-describedby="wf-run-reason" onClick={()=>{setInitialEntry(undefined);setEntryMessage('');setRunOpen(true);}}>{runApi?'Run saved workflow':'Run unavailable'}</Button>
      <Button variant="ghost" shortcut={['Escape']} disabled={locked} onClick={() => { void controller.requestClose(); }}>Close editor</Button>
      <Button disabled={!draft || state.blocked || state.loading || state.closing} busy={state.busy} variant="primary" shortcut={['Ctrl', 'S']} onClick={() => { void controller.write('save'); }}>Save workflow</Button>
    </WorkspaceHeader>
    <div className="wf-body">
      <p id="wf-run-reason" className="wf-caption wf-run-reason">{runApi?'Run uses the last explicitly saved version; newer draft changes are excluded. Clipboard access requires broker approval.':'Run cannot execute this graph. Permission declarations are descriptions, not grants.'}</p>
      {entryMessage&&<Notice kind="unavailable" message={entryMessage} />}
      {state.message && <Notice kind={isReceipt(state.message) ? 'receipt' : isValidationMessage(state.message) ? 'error' : 'unavailable'} message={state.message} />}
      {state.connectionError && <Notice kind="error" message={state.connectionError} />}
      {state.validation && <Notice kind="error" message={state.validation} />}
      {state.closeFailed && <ErrorState layout="band" title="The editor is still open" description="Review the status above. Keep editing or Reload to review the stored draft. Discard and close leaves storage as it is; an earlier pending write may still have reached storage." action={<><Button onClick={() => controller.keepEditing()}>Keep editing</Button><Button onClick={() => { void controller.requestClose(); }}>Retry close</Button><Button variant="danger" onClick={() => setConfirm('discard')}>Discard and close</Button></>} />}
      {state.loading ? <LoadingState label="Loading workflow…" /> : !draft ? <EmptyState title="Create a local workflow" description="Add and connect nodes, then save a valid version. No workflow will run automatically." action={<Button disabled={state.blocked} variant="primary" onClick={() => { controller.create(); requestAnimationFrame(() => nameRef.current?.focus()); }}>New workflow</Button>} /> : <>
        <div className="wf-toolbar"><TextField ref={nameRef} label="Workflow name" value={draft.name} maxLength={128} disabled={locked} onChange={event => controller.rename(event.target.value)} /><div className="wf-actions"><Button disabled={!state.canUndo || locked} onClick={() => controller.undo()}>Undo</Button><Button disabled={!state.canRedo || locked} onClick={() => controller.redo()}>Redo</Button><Button disabled={!state.dirty || state.busy || state.blocked || locked} onClick={() => { void controller.write('draft'); }}>Retry draft</Button></div></div>
        <div className="wf-workspace">
          <aside className="wf-palette" aria-label="Node palette"><h2 className="wf-panel-title">Node palette</h2><TextField type="search" label="Search node palette" value={palette} onChange={event => setPalette(event.target.value)} />
            {categories.map(category => { const available = EDITOR_NODE_TYPES.filter(item => item.category === category), entries = available.filter(item => `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(palette.toLowerCase()));
              return <section key={category} className="wf-category"><GroupCaption role="heading" aria-level={3} aria-label={category} label={category} count={entries.length} flush />
                {entries.length ? entries.map(item => { const tile = nodeTile(item.type); return <Button variant="ghost" className="wf-palette-item" key={item.type} disabled={locked || draft.nodes.length >= 1000} onClick={() => add(item.type)}>
                  <GlyphTile category={tile.category} icon={tile.icon} /><span className="wf-palette-text"><span className="wf-palette-name"><span className="wf-visually-hidden">Add </span>{item.title}</span><span className="wf-caption">{item.description}</span></span><LineIcon name="plus" /></Button>; })
                  : <p className="wf-palette-empty"><LineIcon name={available.length ? 'stateFiltered' : 'stateEmpty'} /><span>{available.length ? 'No matching nodes.' : 'Nodes in this category are not available yet.'}</span></p>}</section>; })}
          </aside>
          <section className="wf-center" aria-label="Workflow graph">
            <div className="wf-canvas-toolbar"><h2 className="wf-panel-title">Canvas</h2><span className="wf-count">{draft.nodes.length} nodes · {draft.edges.length} connections</span><p className="wf-caption">Positions and zoom are layout only. Use the structured controls below without dragging.</p></div>
            <div className="wf-canvas" data-projection={factor}><div className="wf-canvas-probe" ref={setProbe} aria-hidden="true"><span data-probe="card" /><span data-probe="slot" className="wf-edge-label-slot"><span className="wf-edge-label">{probeKind}</span></span></div>{draft.nodes.length ? <ReactFlow<CanvasNode, CanvasEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} minZoom={0.25} maxZoom={2} viewport={viewport} onViewportChange={setViewport} deleteKeyCode={null} nodesDraggable={!locked} nodesConnectable={!locked} elementsSelectable={!locked}
              onNodesChange={changes => { const updated = applyNodeChanges(changes, nodes); const dimensions = changes.filter(change => change.type === 'dimensions'); if (dimensions.length) setMeasurements(previous => ({ ...previous, ...Object.fromEntries(updated.filter(node => node.measured?.width && node.measured.height).map(node => [node.id, { width: node.measured!.width!, height: node.measured!.height! }])) }));
                for (const change of changes) { if (change.type === 'select' && change.selected) controller.select(change.id); if (change.type === 'position' && change.position) controller.positions({ [change.id]: toStored(change.position, factor) }); } }}
              onNodeClick={(_, node) => controller.select(node.id)} onConnect={connection => { if (connection.sourceHandle && connection.targetHandle === 'in') controller.connect(connection.source, connection.sourceHandle, connection.target); }}
              onMoveEnd={(event, viewport) => { if (event) controller.viewport(viewport); }} proOptions={{ hideAttribution: false }}>{/* 16-unit canvasDot grid in flow coordinates (token canvasDotSpacing). */}<Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--lc-canvas-dot)" /><Controls showInteractive={false} /></ReactFlow>
              : <EmptyState title="Start with a Keyword" description="Add a Keyword from the palette, then Transform text and Copy text. Every step is also reachable from the structured controls below." />}</div>
            <div className="wf-structured">
              <section aria-label="Structured nodes"><h2 className="wf-panel-title">Nodes</h2>{draft.nodes.length ? <ol className="wf-steps">{draft.nodes.map((node, index) => { const tile = nodeTile(node.type), entry = titleOf(node.type), selected = node.id === state.selected;
                return <li key={node.id} className="wf-step" data-current={selected || undefined}><span className="wf-step-index" aria-hidden="true">{index + 1}</span><GlyphTile category={tile.category} icon={tile.icon} />
                  <Button variant="ghost" className="wf-step-select" aria-pressed={selected} disabled={locked} onClick={() => { controller.select(node.id); requestAnimationFrame(() => labelRef.current?.focus()); }}><span className="wf-step-title">{node.label || entry?.title || 'Unknown node'} · {node.id}</span><span className="wf-caption">{entry?.category ?? 'Unavailable'} · {flowSummary(draft, node, EDITOR_NODE_REGISTRY.get(node.type)?.inputKind != null)}</span></Button></li>; })}</ol> : <p className="lc-muted">No nodes yet. Add a Keyword from the palette.</p>}</section>
              <section aria-label="Structured connections"><h2 className="wf-panel-title">Connections</h2><div className="wf-connections"><Select label="Connection source" value={from} disabled={locked} onChange={value => { setFrom(value); setPort('out'); }}><option value="">Choose a source</option>{draft.nodes.map(node => <option key={node.id} value={node.id}>{node.label || node.type} · {node.id}</option>)}</Select><Select label="Output port" value={port} disabled={locked} onChange={setPort}>{!ports.length && <option value="out">Choose a source first</option>}{ports.map(port => <option key={port} value={port}>{port} · {kindOf(source, port)}</option>)}</Select><Select label="Connection target" value={to} disabled={locked} onChange={setTo}><option value="">Choose a target</option>{draft.nodes.filter(node => EDITOR_NODE_REGISTRY.get(node.type)?.inputKind !== null).map(node => <option key={node.id} value={node.id}>{node.label || node.type} · {node.id} · {EDITOR_NODE_REGISTRY.get(node.type)?.inputKind ?? 'unknown'} in</option>)}</Select><Button disabled={!source || !draft.nodes.some(node => node.id === to) || !ports.includes(port) || locked} onClick={() => controller.connect(from, port, to)}>Connect nodes</Button></div>
                {draft.edges.length ? <ul className="wf-edge-list">{draft.edges.map(edge => <li key={edge.id}><span className="wf-edge-text"><span>{draft.nodes.find(node => node.id === edge.from.nodeId)?.label || edge.from.nodeId} ({edge.from.port}) → {draft.nodes.find(node => node.id === edge.to.nodeId)?.label || edge.to.nodeId} (in)</span><span className="wf-edge-type">{kindOf(draft.nodes.find(node => node.id === edge.from.nodeId), edge.from.port)}</span></span><Button disabled={locked} onClick={() => controller.disconnect(edge.id)} aria-label={`Remove connection ${edge.id}`}>Remove connection</Button></li>)}</ul> : <p className="lc-muted">No connections yet.</p>}</section>
            </div>
          </section>
          <aside className="wf-inspector-panel" aria-label="Node inspector"><h2 className="wf-panel-title">Node inspector</h2>{current ? (() => { const tile = nodeTile(current.type), entry = titleOf(current.type), registration = EDITOR_NODE_REGISTRY.get(current.type), outputs = outputsOf(current); return <div className="wf-inspector" key={current.id}>
            <div className="wf-inspector-head"><GlyphTile category={tile.category} icon={tile.icon} /><div><p className="wf-inspector-name" title={current.label || entry?.title}>{current.label || entry?.title || 'Unknown node'}</p><p className="wf-caption">{entry?.category ?? 'Unavailable'}</p></div></div>
            <dl className="wf-facts"><div><dt>ID</dt><dd>{current.id}</dd></div><div><dt>Type</dt><dd>{current.type}</dd></div><div><dt>Input</dt><dd>{registration?.inputKind ? `${registration.inputKind} · in` : 'Starts the workflow'}</dd></div><div><dt>Output</dt><dd>{outputs.length ? outputs.map(port => `${port} · ${kindOf(current, port)}`).join(', ') : '—'}</dd></div><div><dt>Declared effects</dt><dd>{declaredEffects(current.type)}</dd></div></dl>
            <p className="wf-section-caption">Configuration</p>
            <TextField ref={labelRef} label="Node label" value={current.label ?? ''} maxLength={128} disabled={locked} onChange={event => controller.configure(current.id, event.target.value, current.config)} />
            {current.type === 'input.keyword' ? <><TextField label="Keyword" value={String(current.config.keyword ?? '')} maxLength={64} disabled={locked} {...(!registration?.config.safeParse(current.config).success ? {error: 'Use a keyword without spaces or control characters.'} : {})} onChange={event => update({ ...current.config, keyword: event.target.value })} /><Select label="Argument" value={String(current.config.argument)} disabled={locked} onChange={argument => update({ ...current.config, argument })}><option value="required">Required</option><option value="optional">Optional</option><option value="none">None</option></Select><label className="wf-check"><input type="checkbox" checked={current.config.trimQuery === true} disabled={locked} onChange={event => update({ ...current.config, trimQuery: event.target.checked })} />Trim query</label></> : current.type === 'utility.transform' ? <><Select label="Text operation" value={String(current.config.operation)} disabled={locked} onChange={operation => update({ ...current.config, operation })}>{['trim', 'upper', 'lower', 'title', 'normalize'].map(operation => <option key={operation} value={operation}>{operation}</option>)}</Select><TextField label="Locale (optional)" value={String(current.config.locale ?? '')} maxLength={64} disabled={locked} onChange={event => { const { locale: _locale, ...config } = current.config; void _locale; update(event.target.value ? { ...config, locale: event.target.value } : config); }} /><p className="wf-caption">Source is fixed to input#/0. Other bindings are not available yet.</p></> : current.type === 'output.clipboard' ? runApi ? <div className="wf-note"><LineIcon name="info" /><div><h3>Clipboard approval required</h3><p className="lc-muted">Text is fixed to input#/0. Run the saved version to review and approve copying. Paste is off; clipboard history is excluded. A declaration grants no permission.</p></div></div> : <UnavailableState layout="band" title="Clipboard execution unavailable" description="Text is fixed to input#/0. Paste is off; clipboard history is excluded. The clipboard.write declaration does not grant permission or copy anything." /> : <UnavailableState layout="band" title="Node configuration unavailable" description="This node is not in the current editing palette." />}
            <div className="wf-actions wf-inspector-actions"><Button variant="danger" disabled={locked} onClick={() => { controller.remove(current.id); requestAnimationFrame(() => nameRef.current?.focus()); }}>Delete node</Button></div>
          </div>; })() : <EmptyState title="Nothing selected" description="Select a node on the canvas or in the structured list to configure it." />}</aside>
        </div>
      </>}
    </div>
    {confirm && <Confirmation title={confirm === 'reload' ? 'Replace local edits?' : confirm === 'revert' ? 'Revert this draft?' : 'Discard and close?'} message={confirm === 'reload' ? 'Reload replaces your local edits with the authoritative stored draft. An unconfirmed write may have reached storage.' : confirm === 'revert' ? 'Restore the last explicitly saved workflow, or a new empty draft if nothing has been saved.' : 'Close without another write. Local unsaved changes will be discarded; an earlier write may still have reached storage.'} confirm={confirm === 'reload' ? 'Reload stored draft' : confirm === 'revert' ? 'Revert draft' : 'Close without saving'} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm; setConfirm(null); if (action === 'reload') void controller.load(); else if (action === 'revert') void controller.write('revert'); else void controller.closeWithoutFlush(); }} />}
  </main>;
}
export default WorkflowEditor;
