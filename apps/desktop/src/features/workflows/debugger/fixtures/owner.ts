import type { WorkflowDefinition, WorkflowRunApi, WorkflowRunState } from '@linuxcast/contracts';
import { createWorkflowDraft } from '@linuxcast/workflows/registry';
export const savedDefinition: WorkflowDefinition = { ...createWorkflowDraft(), name: 'Public trim workflow', permissions: [{ id: 'clipboard.write', reason: 'Copy submitted text' }], nodes: [
  { id: 'start', type: 'input.keyword', typeVersion: 1 as const, label: 'Public keyword', config: { keyword: 'public', argument: 'required', trimQuery: false } },
  { id: 'trim', type: 'utility.transform', typeVersion: 1 as const, label: 'Trim text', config: { operation: 'trim', source: { ref: 'input#/0' } } },
  { id: 'copy', type: 'output.clipboard', typeVersion: 1 as const, label: 'Copy text', config: { text: { ref: 'input#/0' }, paste: false, history: 'exclude' } },
], edges: [{ id: 'e1', from: { nodeId: 'start', port: 'out' }, to: { nodeId: 'trim', port: 'in' as const }, order: 0 }, { id: 'e2', from: { nodeId: 'trim', port: 'out' }, to: { nodeId: 'copy', port: 'in' as const }, order: 0 }] };
export const multipleEntryDefinition: WorkflowDefinition = { ...structuredClone(savedDefinition), nodes: [...structuredClone(savedDefinition.nodes),
  {id: 'second', type: 'input.keyword', typeVersion: 1, label: 'Second public Keyword', config: {keyword: 'second', argument: 'required', trimQuery: false}},
  {id: 'disabled', type: 'input.keyword', typeVersion: 1, label: 'Disabled public Keyword', disabled: true, config: {keyword: 'disabled', argument: 'required', trimQuery: false}},
] };
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function snapshot(patch: Partial<WorkflowRunState> = {}): WorkflowRunState {
  return { runId: uuid(1), sequence: 1, editorRevision: 5, workflowName: savedDefinition.name, triggerNodeId: 'start', state: 'waiting-ui', steps: [
    { activationId: uuid(11), nodeId: 'start', nodeType: 'input.keyword', state: 'succeeded', durationMs: 1 },
    { activationId: uuid(12), nodeId: 'trim', nodeType: 'utility.transform', state: 'succeeded', durationMs: 2 },
    { activationId: uuid(13), nodeId: 'copy', nodeType: 'output.clipboard', state: 'running' },
  ], prompt: { id: uuid(50), permissionId: 'clipboard.write', choices: ['once', 'persistent', 'deny'], text: 'PUBLIC TEXT' }, effectOutcome: 'not-dispatched', requiresReview: false, ...patch };
}
/** Synthetic public request observer. It does not execute a workflow or write a clipboard. */
export function createRunFixture(mode = '') {
  let state: WorkflowRunState | null = null;
  if (mode === 'attached') state = snapshot();
  if (mode === 'denied') state = terminal('failed', { errorCode: 'permission-denied' });
  if (mode === 'large-result') state = terminal('succeeded', { effectOutcome: 'completed', output: 'PUBLIC <script>plain</script>\n'.repeat(2000), steps: Array.from({length: 50}, (_, i) => ({activationId: uuid(i + 100), nodeId: 'trim', nodeType: 'utility.transform', state: 'succeeded', durationMs: i})) });
  let serial = state ? 1 : 0;
  const listeners = new Set<(value: WorkflowRunState) => void>();
  const calls = { starts: [] as Parameters<WorkflowRunApi['startWorkflowRun']>[0][], decisions: [] as Parameters<WorkflowRunApi['decideWorkflowRun']>[0][], cancels: [] as Parameters<WorkflowRunApi['cancelWorkflowRun']>[0][], resets: [] as Parameters<WorkflowRunApi['resetWorkflowClipboardPermission']>[0][], gets: 0 };
  const emit = (value: WorkflowRunState) => { state = structuredClone(value); for (const listener of listeners) listener(structuredClone(value)); };
  function terminal(kind: 'succeeded' | 'failed' | 'cancelled', patch: Partial<WorkflowRunState> = {}): WorkflowRunState { const { prompt: _prompt, ...base } = state ?? snapshot(); void _prompt; return { ...base, sequence: base.sequence + 1, state: kind, steps: base.steps.map(step => ({ ...step, state: kind === 'succeeded' ? 'succeeded' : kind, durationMs: 3 })), ...patch }; }
  const api: WorkflowRunApi = {
    async getWorkflowRun() { calls.gets++; return { ok: true, value: structuredClone(state) }; },
    async startWorkflowRun(input) { calls.starts.push(structuredClone(input)); if (mode === 'unavailable') return { ok: false, error: { code: 'unavailable', message: 'Synthetic unavailable' } }; emit(snapshot({ runId: uuid(++serial), triggerNodeId: input.triggerNodeId, prompt: { id: uuid(50 + serial), permissionId: 'clipboard.write', choices: ['once', 'persistent', 'deny'], text: input.input.trim() }, output: input.input.trim() })); return { ok: true, value: structuredClone(state) }; },
    async decideWorkflowRun(input) { calls.decisions.push(structuredClone(input)); if (mode === 'pending') await new Promise(resolve => setTimeout(resolve, 800)); if (!state || state.runId !== input.runId || state.prompt?.id !== input.promptId) return { ok: false, error: { code: 'conflict', message: 'Synthetic conflict' } }; const value = input.decision === 'deny' ? terminal('failed', { errorCode: 'permission-denied' }) : mode === 'unknown' ? terminal('failed', { errorCode: 'unknown-outcome', effectOutcome: 'unknown', requiresReview: true }) : terminal('succeeded', { effectOutcome: 'completed' }); if (mode === 'mismatch') value.runId = uuid(999); emit(value); return { ok: true, value }; },
    async cancelWorkflowRun(input) { calls.cancels.push(structuredClone(input)); if (!state || state.runId !== input.runId) return { ok: false, error: { code: 'conflict', message: 'Synthetic conflict' } }; const value = terminal('cancelled', { errorCode: 'cancelled' }); emit(value); return { ok: true, value }; },
    async resetWorkflowClipboardPermission(input) { calls.resets.push(structuredClone(input)); if (state && ['queued', 'running', 'waiting-ui', 'cancelling'].includes(state.state)) emit(terminal('cancelled', { errorCode: 'cancelled' })); return { ok: true, value: structuredClone(state) }; },
    onWorkflowRun(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return { api, calls, emit, get state() { return state; }, get listenerCount() { return listeners.size; } };
}
