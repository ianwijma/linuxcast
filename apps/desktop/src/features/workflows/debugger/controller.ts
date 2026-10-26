import { workflowDefinitionSchema, workflowRunInputSchema, workflowRunReplySchema, workflowRunSnapshotSchema, workflowRunStartSchema, type WorkflowDefinition, type WorkflowRunApi, type WorkflowRunState } from '@linuxcast/contracts';
export const isActiveRun = (state: WorkflowRunState | null) => !!state && ['queued', 'running', 'waiting-ui', 'cancelling'].includes(state.state);
export type RunPanelState = {
  loading: boolean; pending: 'start' | 'decide' | 'cancel' | 'reset' | null;
  snapshot: WorkflowRunState | null; input: string; entry: string; inputError: string;
  error: string; notice: string; unconfirmed: boolean; requiresReview: boolean;
};
const uncertain = 'The run request could not be confirmed. Check your clipboard if a copy was underway, then Refresh run before another action. Do not replay the previous effect.';
const same = (a: unknown, b: unknown): boolean => {
  const stable = (value: unknown) => JSON.stringify(value, (_key, child: unknown) => child && typeof child === 'object' && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b, 'en'))) : child);
  return stable(a) === stable(b);
};
export class WorkflowRunController {
  readonly revision: number; readonly initialEntry: string | undefined; readonly definition: WorkflowDefinition | null;
  #api: WorkflowRunApi; #listeners = new Set<() => void>(); #unsubscribe: (() => void) | undefined;
  #disposed = false; #read = 0; #operation = 0; #events = 0; #retired = new Set<string>();
  #start: { entry: string; previousId: string | undefined; acceptedId?: string } | undefined;
  #state: RunPanelState;
  constructor(api: WorkflowRunApi, revision: number, definition: WorkflowDefinition, initialEntry?: string) {
    this.#api = api; this.revision = revision; this.initialEntry = initialEntry;
    const parsed = workflowDefinitionSchema.safeParse(definition); this.definition = parsed.success && Number.isSafeInteger(revision) && revision > 0 ? parsed.data : null;
    this.#state = { loading: true, pending: null, snapshot: null, input: '', entry: initialEntry ?? this.entries[0]?.id ?? '', inputError: '', error: '', notice: '', unconfirmed: false, requiresReview: false };
  }
  get entries() { return this.definition?.nodes.filter(node => node.type === 'input.keyword' && !node.disabled) ?? []; }
  get requestedEntryUnavailable() { return this.initialEntry !== undefined && !this.entries.some(node => node.id === this.initialEntry); }
  getSnapshot = () => this.#state;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #publish(patch: Partial<RunPanelState>) { if (!this.#disposed) { this.#state = { ...this.#state, ...patch }; for (const listener of this.#listeners) listener(); } }
  #unknown() { this.#publish({ unconfirmed: true, error: uncertain }); }
  async #bound<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([Promise.resolve().then(operation), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('deadline')), 5000); })]); }
    finally { clearTimeout(timer); }
  }
  async attach() {
    if (this.#disposed || this.#unsubscribe) return;
    this.#unsubscribe = this.#api.onWorkflowRun(value => {
      if (this.#disposed) return;
      const parsed = workflowRunSnapshotSchema.safeParse(value);
      if (!parsed.success) { this.#unknown(); return; }
      if (this.#accept(parsed.data, 'event')) this.#events++;
    });
    await this.refresh();
  }
  #accept(next: WorkflowRunState, source: 'event' | 'read' | 'start' | 'reply'): boolean {
    if (this.#disposed || this.#retired.has(next.runId)) return false;
    const current = this.#state.snapshot;
    if (current?.runId === next.runId) {
      if (next.sequence < current.sequence) return false;
      if (next.editorRevision !== current.editorRevision || next.triggerNodeId !== current.triggerNodeId || next.workflowName !== current.workflowName || (!isActiveRun(current) && isActiveRun(next))) { this.#unknown(); return false; }
      if (next.sequence === current.sequence) { if (!same(next, current)) this.#unknown(); return false; }
    } else if (current) {
      if (source === 'event') {
        if (!this.#start || next.editorRevision !== this.revision || next.triggerNodeId !== this.#start.entry || next.workflowName !== this.definition?.name || this.#start.acceptedId) return false;
        this.#start.acceptedId = next.runId;
      } else if (source === 'reply') return false;
      this.#retired.add(current.runId); if (this.#retired.size > 100) this.#retired.delete(this.#retired.values().next().value!);
    } else if (source === 'event' && this.#start) {
      if (next.editorRevision !== this.revision || next.triggerNodeId !== this.#start.entry || next.workflowName !== this.definition?.name) return false;
      this.#start.acceptedId = next.runId;
    }
    this.#publish({ snapshot: next, requiresReview: next.requiresReview || next.effectOutcome === 'unknown' || (current?.runId === next.runId && this.#state.requiresReview) }); return true;
  }
  async refresh() {
    if (this.#disposed || this.#state.pending) return;
    const read = ++this.#read, events = this.#events; this.#publish({ loading: true });
    try {
      const reply = workflowRunReplySchema.parse(await this.#bound(() => this.#api.getWorkflowRun()));
      if (this.#disposed || read !== this.#read) return;
      if (!reply.ok) { this.#publish({ error: 'Run state is unavailable. Refresh run to reconnect before starting or approving anything.', unconfirmed: true }); return; }
      if (events !== this.#events && (!reply.value || reply.value.runId !== this.#state.snapshot?.runId)) return;
      if (reply.value) {
        const current = this.#state.snapshot;
        // Older reads never erase a newer event, including its uncertainty warning.
        if (current?.runId === reply.value.runId && reply.value.sequence < current.sequence) return;
        const accepted = this.#accept(reply.value, 'read');
        if (!accepted && !same(this.#state.snapshot, reply.value)) return;
      } else if (events === this.#events) this.#publish({ snapshot: null, requiresReview: false });
      this.#publish({ error: '', unconfirmed: false, notice: '' });
    } catch { if (!this.#disposed && read === this.#read) this.#publish({ error: 'Run state could not be verified. Refresh run before starting or approving anything.', unconfirmed: true }); }
    finally { if (!this.#disposed && read === this.#read) this.#publish({ loading: false }); }
  }
  input(value: string) { if (!this.#state.pending && !isActiveRun(this.#state.snapshot)) this.#publish({ input: value, inputError: '' }); }
  entry(id: string) {
    if (this.requestedEntryUnavailable || this.#state.pending || isActiveRun(this.#state.snapshot) || !this.entries.some(node => node.id === id)) return;
    const entry = this.entries.find(node => node.id === id)!;
    this.#publish({ entry: id, input: entry.config.argument === 'none' ? '' : this.#state.input, inputError: '' });
  }
  async #mutate(kind: NonNullable<RunPanelState['pending']>, operation: () => Promise<unknown>, validate: (next: WorkflowRunState | null) => boolean): Promise<boolean> {
    if (this.#disposed || this.#state.pending || this.#state.loading) return false;
    const token = ++this.#operation; ++this.#read; this.#publish({ pending: kind, error: this.#state.unconfirmed ? this.#state.error : '', notice: '' });
    try {
      const reply = workflowRunReplySchema.parse(await this.#bound(operation));
      if (this.#disposed || token !== this.#operation) return false;
      if (!reply.ok) {
        if (reply.error.code === 'unknown-outcome' || (kind === 'start' && this.#start?.acceptedId)) this.#unknown();
        else this.#publish({ error: reply.error.code === 'invalid-request' ? 'The saved version or request is no longer valid. Return to the editor, save a valid version and reopen Run.' : reply.error.code === 'conflict' ? 'The run or saved version changed. Refresh run before another action.' : 'This operation is unavailable. Check the workflow or clipboard capability, then try a deliberate new action.', unconfirmed: reply.error.code === 'conflict' });
        return false;
      }
      if (!validate(reply.value)) { this.#unknown(); return false; }
      if (reply.value) {
        const before = this.#state.snapshot;
        if (before?.runId === reply.value.runId && (before.editorRevision !== reply.value.editorRevision || before.triggerNodeId !== reply.value.triggerNodeId || before.workflowName !== reply.value.workflowName)) { this.#unknown(); return false; }
        const accepted = this.#accept(reply.value, kind === 'start' ? 'start' : 'reply');
        if (!accepted && !same(this.#state.snapshot, reply.value) && !(before?.runId === reply.value.runId && reply.value.sequence < before.sequence)) { this.#unknown(); return false; }
      }
      return true;
    } catch { if (!this.#disposed && token === this.#operation) this.#unknown(); return false; }
    finally { if (!this.#disposed && token === this.#operation) this.#publish({ pending: null }); }
  }
  async start() {
    if (this.#disposed || this.requestedEntryUnavailable || this.#state.pending || this.#state.loading || this.#state.unconfirmed || isActiveRun(this.#state.snapshot) || !this.definition || !this.entries.some(node => node.id === this.#state.entry)) return false;
    const request = workflowRunStartSchema.safeParse({ editorRevision: this.revision, triggerNodeId: this.#state.entry, input: this.#state.input });
    if (!request.success || !workflowRunInputSchema.safeParse(this.#state.input).success) { this.#publish({ inputError: 'Use text up to 16 KiB without unpaired Unicode surrogates.' }); return false; }
    this.#start = { entry: request.data.triggerNodeId, previousId: this.#state.snapshot?.runId };
    const result = await this.#mutate('start', () => this.#api.startWorkflowRun(request.data), next => !!next && next.runId !== this.#start?.previousId && next.editorRevision === this.revision && next.triggerNodeId === request.data.triggerNodeId && next.workflowName === this.definition?.name && (!this.#start?.acceptedId || next.runId === this.#start.acceptedId));
    this.#start = undefined; return result;
  }
  async decide(decision: 'once' | 'persistent' | 'deny') {
    const current = this.#state.snapshot, prompt = current?.prompt;
    if (this.#state.unconfirmed || !current || current.state !== 'waiting-ui' || !prompt || !prompt.choices.includes(decision)) return false;
    const id = current.runId;
    return this.#mutate('decide', () => this.#api.decideWorkflowRun({ runId: id, promptId: prompt.id, decision }), next => !!next && next.runId === id && next.prompt?.id !== prompt.id);
  }
  async cancel() {
    const current = this.#state.snapshot; if (!current || !isActiveRun(current)) return false;
    const id = current.runId;
    const ok = await this.#mutate('cancel', () => this.#api.cancelWorkflowRun({ runId: id }), next => next === null || (next.runId === id && (!isActiveRun(next) || next.state === 'cancelling')));
    if (ok) this.#publish({ notice: 'Cancellation requested. It does not undo a copy that already occurred.' }); return ok;
  }
  async resetPermission() {
    const id = this.#state.snapshot?.runId;
    const ok = await this.#mutate('reset', () => this.#api.resetWorkflowClipboardPermission({ editorRevision: this.revision }), next => next === null || (!isActiveRun(next) && (!id || next.runId === id)));
    if (ok) this.#publish({ notice: 'Clipboard access was reset for this saved version. Start a new run to request access again.' }); return ok;
  }
  dispose() { this.#disposed = true; this.#operation++; this.#read++; this.#unsubscribe?.(); this.#listeners.clear(); }
}
