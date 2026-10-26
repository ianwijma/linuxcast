import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, applyNodeChanges, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, EmptyState, ErrorState, LoadingState, TextField, UnavailableState } from '@linuxcast/ui';
import '@linuxcast/ui/styles.css';
import type { WorkflowEditorApi, WorkflowDefinition } from '@linuxcast/contracts';
import { EDITOR_NODE_REGISTRY, EDITOR_NODE_TYPES } from '@linuxcast/workflows/registry';
import { WorkflowEditorController } from './controller.ts';
import './editor.css';

const categories = ['Triggers', 'Inputs', 'Actions', 'Automations', 'User Interface', 'Utilities', 'Outputs'];
type CanvasNode = Node<{ label: string; category: string; input: string | null; outputs: string[] }, 'workflow'>;
function WorkflowCard({ data }: NodeProps<CanvasNode>) {
  return <div className="wf-node">
    {data.input && <Handle type="target" id="in" position={Position.Left} role="img" aria-label={`${data.input} input in`} />}
    <span className="wf-caption">{data.category}</span><strong>{data.label}</strong>
    <span className="wf-caption">{data.input ? `${data.input} in` : 'Start'} → {data.outputs.map(port => `${port} · text`).join(', ')}</span>
    {data.outputs.map(port => <Handle key={port} type="source" id={port} position={Position.Right} role="img" aria-label={`text output ${port}`} />)}
  </div>;
}
const nodeTypes = { workflow: WorkflowCard };
function Select({ label, value, onChange, children, disabled = false }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; disabled?: boolean }) {
  const id = useId(); return <div className="lc-field"><label className="lc-field-label" htmlFor={id}>{label}</label><select id={id} className="lc-input lc-focus" value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>{children}</select></div>;
}
function Confirmation({ title, message, confirm, onConfirm, onCancel }: { title: string; message: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  const id = useId(), description = useId(), ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement; ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  return <div className="wf-modal-backdrop"><div className="wf-dialog lc-state" ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} aria-describedby={description} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onCancel(); }
    if (event.key === 'Tab') { const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]; const first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}><h2 id={id}>{title}</h2><p id={description}>{message}</p><div className="wf-actions"><Button onClick={onCancel}>Keep editing</Button><Button variant="danger" onClick={onConfirm}>{confirm}</Button></div></div></div>;
}
export function WorkflowEditor({ api }: { api: WorkflowEditorApi }) {
  const [controller] = useState(() => new WorkflowEditorController(api));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
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
  const nodes: CanvasNode[] = (draft?.nodes ?? []).map(node => {
    const entry = EDITOR_NODE_TYPES.find(item => item.type === node.type), registration = EDITOR_NODE_REGISTRY.get(node.type);
    let outputs: string[] = []; try { outputs = [...(registration?.outputPorts(node.config) ?? [])]; } catch { /* Invalid drafts remain editable. */ }
    return { id: node.id, type: 'workflow', position: draft?.editor.positions[node.id] ?? { x: 0, y: 0 }, ...(measurements[node.id] ? { measured: measurements[node.id] } : {}), selected: node.id === state.selected,
      data: { label: node.label || entry?.title || 'Unknown node', category: entry?.category ?? 'Unavailable', input: registration?.inputKind ?? null, outputs }, ariaLabel: `${node.label || entry?.title || 'Unknown node'}, ${entry?.category ?? 'Unavailable'}` };
  });
  const edges = (draft?.edges ?? []).map(edge => ({ id: edge.id, source: edge.from.nodeId, sourceHandle: edge.from.port, target: edge.to.nodeId, targetHandle: edge.to.port,
    ariaLabel: `Connection ${edge.from.nodeId} ${edge.from.port} to ${edge.to.nodeId} in` }));
  const source = draft?.nodes.find(node => node.id === from);
  let ports: string[] = []; try { ports = source ? [...(EDITOR_NODE_REGISTRY.get(source.type)?.outputPorts(source.config) ?? [])] : []; } catch { /* Same fixed editable invalid state. */ }
  return <main className="wf-editor" onKeyDown={event => {
    if (event.nativeEvent.isComposing || confirm) return;
    if (event.repeat) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') event.preventDefault(); return; }
    if (event.key === 'Escape') { event.preventDefault(); void controller.requestClose(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!state.busy && !locked) void controller.write('save'); }
  }}>
    <header className="wf-header"><div><p className="wf-caption">LOCAL WORKFLOW</p><h1>Workflow editor</h1><p className="lc-muted">One recoverable draft · execution unavailable</p></div><div className="wf-actions">
      <Button disabled={!draft || state.blocked || state.loading || state.closing} busy={state.busy} variant="primary" onClick={() => { void controller.write('save'); }}>Save workflow</Button>
      <Button disabled={!draft || state.blocked || state.loading || state.closing} busy={state.busy} onClick={() => confirmAction('revert')}>Revert</Button>
      <Button disabled={state.loading || state.closing} aria-disabled={state.busy} onClick={() => confirmAction('reload')}>Reload</Button>
      <Button disabled title="Workflow execution is not available yet" aria-describedby="wf-run-reason">Run unavailable</Button>
      <Button disabled={locked} onClick={() => { void controller.requestClose(); }}>Close editor</Button>
    </div></header>
    <p id="wf-run-reason" className="wf-caption">Run cannot execute this graph. Permission declarations are descriptions, not grants.</p>
    <div role="status" aria-live="polite" className="wf-save-state">{state.blocked ? 'Reload required before writing again' : state.busy ? 'Writing local draft…' : state.dirty ? 'Unsaved local changes' : state.record ? 'Draft stored locally' : 'No stored workflow'}</div>
    {state.message && <div role="alert" className="wf-notice">{state.message}</div>}
    {state.connectionError && <div role="alert" className="wf-notice">{state.connectionError}</div>}
    {state.validation && <div role="alert" className="wf-notice">{state.validation}</div>}
    {state.closeFailed && <ErrorState title="The editor is still open" description="Review the status above. Keep editing or Reload to review the stored draft. Discard and close leaves storage as it is; an earlier pending write may still have reached storage." action={<div className="wf-actions"><Button onClick={() => controller.keepEditing()}>Keep editing</Button><Button onClick={() => { void controller.requestClose(); }}>Retry close</Button><Button variant="danger" onClick={() => setConfirm('discard')}>Discard and close</Button></div>} />}
    {state.loading ? <LoadingState label="Loading workflow…" /> : !draft ? <EmptyState title="Create a local workflow" description="Add and connect nodes, then save a valid version. No workflow will run automatically." action={<Button disabled={state.blocked} variant="primary" onClick={() => { controller.create(); requestAnimationFrame(() => nameRef.current?.focus()); }}>New workflow</Button>} /> : <>
      <div className="wf-name"><TextField ref={nameRef} label="Workflow name" value={draft.name} maxLength={128} disabled={locked} onChange={event => controller.rename(event.target.value)} /><div className="wf-actions"><Button disabled={!state.canUndo || locked} onClick={() => controller.undo()}>Undo</Button><Button disabled={!state.canRedo || locked} onClick={() => controller.redo()}>Redo</Button><Button disabled={!state.dirty || state.busy || state.blocked || locked} onClick={() => { void controller.write('draft'); }}>Retry draft</Button></div></div>
      <div className="wf-workspace">
        <aside className="wf-panel" aria-label="Node palette"><h2>Node palette</h2><TextField type="search" label="Search node palette" value={palette} onChange={event => setPalette(event.target.value)} />
          {categories.map(category => { const entries = EDITOR_NODE_TYPES.filter(item => item.category === category && `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(palette.toLowerCase())); return <section key={category} className="wf-category"><h3>{category}</h3>{entries.length ? entries.map(item => <Button className="wf-palette-item" key={item.type} disabled={locked || draft.nodes.length >= 1000} onClick={() => add(item.type)}><span><strong>Add {item.title}</strong><span className="wf-caption">{item.description}</span></span></Button>) : <p className="wf-caption">{EDITOR_NODE_TYPES.some(item => item.category === category) ? 'No matching nodes.' : 'Nodes in this category are not available yet.'}</p>}</section>; })}
        </aside>
        <section className="wf-center" aria-label="Workflow graph"><div className="wf-section-heading"><h2>Canvas</h2><span className="wf-caption">{draft.nodes.length} nodes · {draft.edges.length} connections</span></div>
          <div className="wf-canvas"><ReactFlow<CanvasNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} minZoom={0.25} maxZoom={2} viewport={viewport} onViewportChange={setViewport} deleteKeyCode={null} nodesDraggable={!locked} nodesConnectable={!locked} elementsSelectable={!locked}
            onNodesChange={changes => { const updated = applyNodeChanges(changes, nodes); const dimensions = changes.filter(change => change.type === 'dimensions'); if (dimensions.length) setMeasurements(previous => ({ ...previous, ...Object.fromEntries(updated.filter(node => node.measured?.width && node.measured.height).map(node => [node.id, { width: node.measured!.width!, height: node.measured!.height! }])) }));
              for (const change of changes) { if (change.type === 'select' && change.selected) controller.select(change.id); if (change.type === 'position' && change.position) controller.positions({ [change.id]: change.position }); } }}
            onNodeClick={(_, node) => controller.select(node.id)} onConnect={connection => { if (connection.sourceHandle && connection.targetHandle === 'in') controller.connect(connection.source, connection.sourceHandle, connection.target); }}
            onMoveEnd={(event, viewport) => { if (event) controller.viewport(viewport); }} proOptions={{ hideAttribution: false }}><Background gap={24} color="var(--lc-border)" /><Controls showInteractive={false} /></ReactFlow></div>
          <p className="wf-caption">Positions and zoom are layout only. Use the structured controls below without dragging.</p>
          <section aria-label="Structured nodes"><h2>Nodes</h2>{draft.nodes.length ? <ul className="wf-node-list">{draft.nodes.map(node => <li key={node.id}><Button aria-pressed={node.id === state.selected} disabled={locked} onClick={() => { controller.select(node.id); requestAnimationFrame(() => labelRef.current?.focus()); }}>{node.label || EDITOR_NODE_TYPES.find(item => item.type === node.type)?.title || 'Unknown node'} · {node.id}</Button></li>)}</ul> : <p className="lc-muted">No nodes yet. Add a Keyword from the palette.</p>}</section>
          <section aria-label="Structured connections"><h2>Connections</h2><div className="wf-connections"><Select label="Connection source" value={from} disabled={locked} onChange={value => { setFrom(value); setPort('out'); }}><option value="">Choose a source</option>{draft.nodes.map(node => <option key={node.id} value={node.id}>{node.label || node.type} · {node.id}</option>)}</Select><Select label="Output port" value={port} disabled={locked} onChange={setPort}>{!ports.length && <option value="out">Choose a source first</option>}{ports.map(port => <option key={port} value={port}>{port} · text</option>)}</Select><Select label="Connection target" value={to} disabled={locked} onChange={setTo}><option value="">Choose a target</option>{draft.nodes.filter(node => EDITOR_NODE_REGISTRY.get(node.type)?.inputKind !== null).map(node => <option key={node.id} value={node.id}>{node.label || node.type} · {node.id} · text in</option>)}</Select><Button disabled={!source || !draft.nodes.some(node => node.id === to) || !ports.includes(port) || locked} onClick={() => controller.connect(from, port, to)}>Connect nodes</Button></div>
            <ul className="wf-edge-list">{draft.edges.map(edge => <li key={edge.id}><span>{draft.nodes.find(node => node.id === edge.from.nodeId)?.label || edge.from.nodeId} ({edge.from.port}) → {draft.nodes.find(node => node.id === edge.to.nodeId)?.label || edge.to.nodeId} (in)</span><Button disabled={locked} onClick={() => controller.disconnect(edge.id)} aria-label={`Remove connection ${edge.id}`}>Remove connection</Button></li>)}</ul></section>
        </section>
        <aside className="wf-panel" aria-label="Node inspector"><h2>Node inspector</h2>{current ? <div className="wf-inspector" key={current.id}>
          <p className="wf-caption">{current.id} · {current.type}</p><TextField ref={labelRef} label="Node label" value={current.label ?? ''} maxLength={128} disabled={locked} onChange={event => controller.configure(current.id, event.target.value, current.config)} />
          {current.type === 'input.keyword' ? <><TextField label="Keyword" value={String(current.config.keyword ?? '')} maxLength={64} disabled={locked} {...(!EDITOR_NODE_REGISTRY.get(current.type)?.config.safeParse(current.config).success ? {error: 'Use a keyword without spaces or control characters.'} : {})} onChange={event => update({ ...current.config, keyword: event.target.value })} /><Select label="Argument" value={String(current.config.argument)} disabled={locked} onChange={argument => update({ ...current.config, argument })}><option value="required">Required</option><option value="optional">Optional</option><option value="none">None</option></Select><label className="wf-check"><input type="checkbox" checked={current.config.trimQuery === true} disabled={locked} onChange={event => update({ ...current.config, trimQuery: event.target.checked })} />Trim query</label></> : current.type === 'utility.transform' ? <><Select label="Text operation" value={String(current.config.operation)} disabled={locked} onChange={operation => update({ ...current.config, operation })}>{['trim', 'upper', 'lower', 'title', 'normalize'].map(operation => <option key={operation} value={operation}>{operation}</option>)}</Select><TextField label="Locale (optional)" value={String(current.config.locale ?? '')} maxLength={64} disabled={locked} onChange={event => { const { locale: _locale, ...config } = current.config; void _locale; update(event.target.value ? { ...config, locale: event.target.value } : config); }} /><p className="wf-caption">Source is fixed to input#/0. Other bindings are not available yet.</p></> : current.type === 'output.clipboard' ? <UnavailableState title="Clipboard execution unavailable" description="Text is fixed to input#/0. Paste is off; clipboard history is excluded. The clipboard.write declaration does not grant permission or copy anything." /> : <UnavailableState title="Node configuration unavailable" description="This node is not in the current editing palette." />}
          <div className="wf-actions"><Button variant="danger" disabled={locked} onClick={() => { controller.remove(current.id); requestAnimationFrame(() => nameRef.current?.focus()); }}>Delete node</Button></div>
        </div> : <p className="lc-muted">Select a node on the canvas or in the structured list to configure it.</p>}</aside>
      </div>
    </>}
    {confirm && <Confirmation title={confirm === 'reload' ? 'Replace local edits?' : confirm === 'revert' ? 'Revert this draft?' : 'Discard and close?'} message={confirm === 'reload' ? 'Reload replaces your local edits with the authoritative stored draft. An unconfirmed write may have reached storage.' : confirm === 'revert' ? 'Restore the last explicitly saved workflow, or a new empty draft if nothing has been saved.' : 'Close without another write. Local unsaved changes will be discarded; an earlier write may still have reached storage.'} confirm={confirm === 'reload' ? 'Reload stored draft' : confirm === 'revert' ? 'Revert draft' : 'Close without saving'} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm; setConfirm(null); if (action === 'reload') void controller.load(); else if (action === 'revert') void controller.write('revert'); else void controller.closeWithoutFlush(); }} />}
  </main>;
}
export default WorkflowEditor;
