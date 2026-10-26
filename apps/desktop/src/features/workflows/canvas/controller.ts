import { workflowDefinitionSchema, workflowEditorReadResultSchema, workflowEditorWriteResultSchema, type WorkflowDefinition, type WorkflowEditorApi, type WorkflowEditorRecord } from '@linuxcast/contracts';
import { EDITOR_NODE_REGISTRY, EDITOR_NODE_TYPES, createWorkflowDraft } from '@linuxcast/workflows/registry';
import { validateWorkflow } from '@linuxcast/workflows/graph';

export type EditorState = {
  loading: boolean; draft: WorkflowDefinition | null; record: WorkflowEditorRecord | null;
  selected: string | null; dirty: boolean; busy: boolean; blocked: boolean;
  message: string; validation: string; connectionError: string; closing: boolean; closeFailed: boolean;
  canUndo: boolean; canRedo: boolean; reverting: boolean;
};
const clone = <T,>(value: T): T => structuredClone(value);
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, child: unknown) => child && typeof child === 'object' && !Array.isArray(child)
    ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b, 'en'))) : child);
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
export function graphError(draft: WorkflowDefinition): string {
  try { validateWorkflow(draft, EDITOR_NODE_REGISTRY); return ''; }
  catch { return 'Check node configuration and connections. Connections must use compatible ports and cannot form a cycle.'; }
}
export class WorkflowEditorController {
  #api: WorkflowEditorApi; #listeners = new Set<() => void>(); #disposed = false; #epoch = 0;
  #timer: ReturnType<typeof setTimeout> | undefined; #pending: Promise<boolean> | null = null;
  #reverting = false; #navigating = false;
  #undo: WorkflowDefinition[] = []; #redo: WorkflowDefinition[] = [];
  #state: EditorState = { loading: true, draft: null, record: null, selected: null, dirty: false, busy: false, blocked: false,
    message: '', validation: '', connectionError: '', closing: false, closeFailed: false, canUndo: false, canRedo: false, reverting: false };
  constructor(api: WorkflowEditorApi) { this.#api = api; }
  getSnapshot = () => this.#state;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #publish(patch: Partial<EditorState>) { if (this.#disposed) return; this.#state = { ...this.#state, ...patch }; for (const listener of this.#listeners) listener(); }
  async #bound<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([Promise.resolve().then(operation), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('deadline')), 5000); })]); }
    finally { clearTimeout(timer); }
  }
  async load(): Promise<void> {
    if (this.#disposed || this.#state.busy || this.#state.closing) return;
    const epoch = ++this.#epoch; clearTimeout(this.#timer); this.#publish({ loading: true, message: '' });
    try {
      const reply = workflowEditorReadResultSchema.parse(await this.#bound(() => this.#api.load()));
      if (this.#disposed || epoch !== this.#epoch) return;
      if (!reply.ok) { this.#publish({ loading: false, blocked: true, message: 'The workflow could not be loaded. Try Reload. Local edits have been retained.' }); return; }
      this.#undo = []; this.#redo = [];
      const draft = reply.value ? clone(reply.value.draft) : null;
      this.#publish({ loading: false, record: reply.value, draft, dirty: false, blocked: false, selected: null, canUndo: false, canRedo: false,
        validation: draft ? graphError(draft) : '', connectionError: '', message: '', closeFailed: false });
    } catch { if (!this.#disposed && epoch === this.#epoch) this.#publish({ loading: false, blocked: true, message: 'The workflow could not be loaded. Try Reload. Local edits have been retained.' }); }
  }
  create() { if (this.#state.draft || this.#state.loading || this.#state.blocked) return; this.#change(createWorkflowDraft()); }
  select(id: string) { if (this.#state.draft?.nodes.some(node => node.id === id)) this.#publish({ selected: id }); }
  #change(next: WorkflowDefinition, history = true) {
    if (this.#disposed || this.#state.loading || this.#state.closing || this.#reverting || !workflowDefinitionSchema.safeParse(next).success || same(next, this.#state.draft)) return;
    if (history && this.#state.draft) { this.#undo.push(clone(this.#state.draft)); this.#undo = this.#undo.slice(-100); this.#redo = []; }
    this.#publish({ draft: clone(next), dirty: !same(next, this.#state.record?.draft ?? null), validation: graphError(next), connectionError: '', canUndo: this.#undo.length > 0, canRedo: this.#redo.length > 0,
      selected: next.nodes.some(node => node.id === this.#state.selected) ? this.#state.selected : next.nodes[0]?.id ?? null,
      message: this.#state.blocked ? this.#state.message : '', closeFailed: false });
    this.#schedule();
  }
  #schedule() { clearTimeout(this.#timer); if (this.#state.dirty && !this.#state.blocked && !this.#state.busy && !this.#state.closing) this.#timer = setTimeout(() => { void this.write('draft'); }, 500); }
  rename(name: string) { if (this.#state.draft) this.#change({ ...this.#state.draft, name }); }
  add(type: string) {
    const item = EDITOR_NODE_TYPES.find(item => item.type === type), draft = this.#state.draft;
    if (!item || !draft || draft.nodes.length >= 1000) return;
    let serial = 1; while (draft.nodes.some(node => node.id === `node-${serial}`)) serial++;
    const id = `node-${serial}`;
    this.#change({ ...draft, nodes: [...draft.nodes, { id, type, typeVersion: 1, label: item.title, config: clone(item.config) }],
      permissions: type === 'output.clipboard' && !draft.permissions.some(permission => permission.id === 'clipboard.write')
        ? [...draft.permissions, { id: 'clipboard.write', reason: 'Copy the text you submit' }] : draft.permissions,
      editor: { ...draft.editor, positions: { ...draft.editor.positions, [id]: { x: draft.nodes.length * 240, y: 80 } } } });
    this.select(id);
  }
  configure(id: string, label: string, config: WorkflowDefinition['nodes'][number]['config']) {
    const draft = this.#state.draft; if (!draft) return;
    this.#change({ ...draft, nodes: draft.nodes.map(node => node.id === id ? { ...node, label, config: clone(config) } : node) });
  }
  positions(positions: Record<string, { x: number; y: number }>) {
    const draft = this.#state.draft; if (!draft) return;
    const next = { ...draft.editor.positions };
    for (const [id, position] of Object.entries(positions)) if (draft.nodes.some(node => node.id === id) && Number.isFinite(position.x) && Number.isFinite(position.y)) next[id] = position;
    this.#change({ ...draft, editor: { ...draft.editor, positions: next } });
  }
  viewport(viewport: { x: number; y: number; zoom: number }) {
    const draft = this.#state.draft; if (draft) this.#change({ ...draft, editor: { ...draft.editor, viewport } });
  }
  remove(id: string) {
    const draft = this.#state.draft; if (!draft || !draft.nodes.some(node => node.id === id)) return;
    const nodes = draft.nodes.filter(node => node.id !== id), positions = { ...draft.editor.positions }; delete positions[id];
    this.#change({ ...draft, nodes, edges: draft.edges.filter(edge => edge.from.nodeId !== id && edge.to.nodeId !== id),
      permissions: nodes.some(node => node.type === 'output.clipboard') ? draft.permissions : draft.permissions.filter(permission => permission.id !== 'clipboard.write'),
      editor: { ...draft.editor, positions, notes: draft.editor.notes.filter(note => note.nodeId !== id) } });
  }
  connect(from: string, port: string, to: string): boolean {
    const draft = this.#state.draft; if (!draft) return false;
    const order = Math.max(-1, ...draft.edges.filter(edge => edge.from.nodeId === from && edge.from.port === port).map(edge => edge.order)) + 1;
    let serial = 1; while (draft.edges.some(edge => edge.id === `edge-${serial}`)) serial++;
    const next = { ...draft, edges: [...draft.edges, { id: `edge-${serial}`, from: { nodeId: from, port }, to: { nodeId: to, port: 'in' as const }, order }] };
    try { validateWorkflow(next, EDITOR_NODE_REGISTRY); }
    catch { this.#publish({ connectionError: 'Connection rejected. Choose compatible output and input ports without creating a cycle. Check node configuration first.' }); return false; }
    this.#change(next); return true;
  }
  disconnect(id: string) { const draft = this.#state.draft; if (draft) this.#change({ ...draft, edges: draft.edges.filter(edge => edge.id !== id) }); }
  undo() { if (this.#state.closing || this.#state.loading || this.#reverting || !this.#undo.length || !this.#state.draft) return; this.#redo.push(clone(this.#state.draft)); this.#change(this.#undo.pop()!, false); }
  redo() { if (this.#state.closing || this.#state.loading || this.#reverting || !this.#redo.length || !this.#state.draft) return; this.#undo.push(clone(this.#state.draft)); this.#change(this.#redo.pop()!, false); }
  write(action: 'draft' | 'save' | 'revert'): Promise<boolean> {
    if (this.#pending) return this.#pending;
    if (this.#disposed || this.#state.loading || this.#state.blocked || !this.#state.draft) return Promise.resolve(false);
    if (action === 'save' && graphError(this.#state.draft)) { this.#publish({ validation: graphError(this.#state.draft), message: 'This graph is not valid. Correct the highlighted configuration or connections before Save.' }); return Promise.resolve(false); }
    clearTimeout(this.#timer);
    const draft = clone(this.#state.draft), previousSaved = clone(this.#state.record?.saved ?? null), expectedRevision = this.#state.record?.revision ?? 0, epoch = this.#epoch;
    this.#reverting = action === 'revert';
    this.#publish({ busy: true, reverting: this.#reverting, message: '' });
    this.#pending = (async () => {
      try {
        const reply = workflowEditorWriteResultSchema.parse(await this.#bound(() => this.#api.write({ expectedRevision, draft: clone(draft), action })));
        if (this.#disposed || epoch !== this.#epoch) return false;
        if (!reply.ok) {
          const blocked = reply.error.code === 'conflict' || reply.error.code === 'unknown-outcome';
          this.#publish({ blocked, message: blocked ? 'The draft write could not be confirmed. Reload before writing again; review any local edits first.' : 'The draft was not saved. Keep editing, then use Save or Retry draft. Check that local storage is available.' }); return false;
        }
        const expectedDraft = action === 'revert' ? previousSaved ?? createWorkflowDraft() : draft;
        const expectedSaved = action === 'save' ? draft : previousSaved;
        if (reply.value.revision !== expectedRevision + 1 || !same(reply.value.draft, expectedDraft) || !same(reply.value.saved, expectedSaved)) throw new Error('receipt');
        const current = action === 'revert' ? clone(reply.value.draft) : this.#state.draft;
        if (action === 'revert') { this.#undo = []; this.#redo = []; }
        this.#publish({ record: reply.value, draft: current, dirty: !same(current, reply.value.draft),
          validation: current ? graphError(current) : '', canUndo: this.#undo.length > 0, canRedo: this.#redo.length > 0,
          selected: current?.nodes.some(node => node.id === this.#state.selected) ? this.#state.selected : current?.nodes[0]?.id ?? null,
          message: action === 'save' ? 'Workflow saved. Execution remains unavailable.' : action === 'revert' ? 'Restored the last saved workflow.' : '' }); return true;
      } catch {
        if (!this.#disposed && epoch === this.#epoch) this.#publish({ blocked: true, message: 'The draft write could not be confirmed. Reload before writing again; review any local edits first.' }); return false;
      } finally {
        this.#pending = null; this.#reverting = false;
        if (!this.#disposed && epoch === this.#epoch) { this.#publish({ busy: false, reverting: false }); /* Known failures require an explicit retry. */ }
      }
    })();
    return this.#pending.then(result => { if (result && this.#state.dirty) this.#schedule(); return result; });
  }
  async requestClose(): Promise<boolean> {
    if (this.#disposed || this.#state.closing || this.#state.loading) return false;
    clearTimeout(this.#timer); this.#publish({ closing: true, closeFailed: false });
    const pendingOk = this.#pending ? await this.#pending : true;
    if (this.#disposed) return false;
    const ok = pendingOk && !this.#state.blocked && (!this.#state.dirty || await this.write('draft'));
    if (this.#disposed) return false;
    if (!ok) { this.#publish({ closing: false, closeFailed: true }); return false; }
    return await this.closeWithoutFlush();
  }
  keepEditing() { this.#publish({ closeFailed: false, closing: false }); }
  async closeWithoutFlush(): Promise<boolean> {
    if (this.#disposed || this.#navigating) return false;
    this.#navigating = true; this.#publish({ closing: true });
    try { await this.#bound(() => this.#api.close()); return true; }
    catch { this.#publish({ closing: false, closeFailed: true, message: 'The editor could not close. Keep editing or try Close again.' }); return false; }
    finally { this.#navigating = false; }
  }
  dispose() { this.#disposed = true; this.#epoch++; clearTimeout(this.#timer); this.#listeners.clear(); }
}
