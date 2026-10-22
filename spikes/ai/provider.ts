import { openRouterStream, StreamFailure } from './stream.ts';
import type { ToolCall } from './stream.ts';

export interface Selection { revision: number; providerProfileId: string; modelId: string }
export interface RunRequest { runId: string; selection: Selection; prompt: string; timeoutMs: number; outputBytes: number }
export type RunState = 'preparing' | 'streaming' | 'awaiting-approval' | 'running-tool' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
export interface Event { schemaVersion: 1; runId: string; sequence: number; kind: 'started' | 'text' | 'approval' | 'tool-result' | 'terminal'; state: RunState }
export interface ToolEntry { call: ToolCall; state: 'pending' | 'denied' | 'dispatching' | 'committed'; result?: string }
export interface RunRecord {
  runId: string; selection: Selection; state: RunState; partialText: string; committedText?: string;
  toolTimeoutMs: number; toolDeadline?: number;
  failure?: string; events: Event[]; tools: ToolEntry[];
}
/** Trusted host storage seam. put() must atomically commit before returning; no secrets accepted. */
export interface Journal { get(runId: string): RunRecord | undefined; put(record: RunRecord): void }
/** Synthetic fixture storage only; not a production persistence implementation. */
export class FixtureJournal implements Journal {
  private records = new Map<string, RunRecord>();
  get(id: string) { const row = this.records.get(id); return row && structuredClone(row); }
  put(row: RunRecord) { this.records.set(row.runId, structuredClone(row)); }
}
export interface TrustedTool {
  name: string; description: string; parameters: Record<string, unknown>;
  validate(args: Record<string, unknown>): boolean;
  permitted(args: Record<string, unknown>): boolean;
  execute(args: Record<string, unknown>, signal: AbortSignal): Promise<string>;
}
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
const terminal = (state: RunState) => ['completed', 'cancelled', 'failed', 'interrupted'].includes(state);

/** Host-only fixture spike, deliberately unrelated to renderer/extension entry points. */
export class ProviderSpike {
  private active = new Map<string, AbortController>();
  private journal: Journal;
  private transport: Fetch;
  private tools: readonly TrustedTool[];
  constructor(journal: Journal, transport: Fetch, tools: readonly TrustedTool[] = []) {
    this.journal = journal; this.transport = transport; this.tools = tools;
  }
  private emit(row: RunRecord, kind: Event['kind']) {
    row.events.push({ schemaVersion: 1, runId: row.runId, sequence: row.events.length + 1, kind, state: row.state });
    this.journal.put(row);
  }
  private finish(row: RunRecord, state: 'completed' | 'failed' | 'cancelled' | 'interrupted', failure?: string) {
    if (terminal(row.state)) return;
    row.state = state;
    if (failure) row.failure = failure;
    if (state === 'completed') row.committedText = row.partialText;
    this.emit(row, 'terminal');
  }
  read(runId: string) { return this.journal.get(runId); }
  cancel(runId: string) {
    this.active.get(runId)?.abort();
    const row = this.journal.get(runId);
    if (row && !terminal(row.state)) {
      if (row.state === 'running-tool') this.finish(row, 'interrupted', 'tool-outcome-unknown');
      else this.finish(row, 'cancelled');
    }
  }
  /** UI reconnect never restarts inference or an effect. A new host instance recovers unknown work. */
  reconnect(runId: string): RunRecord | undefined {
    const row = this.journal.get(runId);
    if (row && !this.active.has(runId) && !terminal(row.state) && row.state !== 'awaiting-approval') {
      this.finish(row, 'interrupted', 'review-required');
    }
    return this.journal.get(runId);
  }
  async start(request: RunRequest, apiKey: string, endpoint = 'https://openrouter.ai/api/v1/chat/completions') {
    if (this.journal.get(request.runId)) throw new Error('run-exists');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error('invalid-endpoint');
    if (!request.runId || !request.selection.modelId || !apiKey || request.prompt.length > 4096 || !Number.isSafeInteger(request.timeoutMs) ||
        request.timeoutMs < 1 || request.timeoutMs > 60_000 || !Number.isSafeInteger(request.outputBytes) ||
        request.outputBytes < 1 || request.outputBytes > 1_048_576) throw new Error('invalid-request');
    const row: RunRecord = { runId: request.runId, selection: structuredClone(request.selection), state: 'preparing', partialText: '', toolTimeoutMs: request.timeoutMs, events: [], tools: [] };
    const controller = new AbortController();
    this.active.set(row.runId, controller);
    this.emit(row, 'started');
    const timer = setTimeout(() => controller.abort('timeout'), request.timeoutMs);
    try {
      const response = await this.transport(url.toString(), {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: row.selection.modelId, stream: true, max_tokens: 64, messages: [{ role: 'user', content: request.prompt }],
          ...(this.tools.length ? { tools: this.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}) }),
      });
      controller.signal.throwIfAborted();
      if (!response.ok) throw new StreamFailure('provider');
      if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) throw new StreamFailure('protocol');
      row.state = 'streaming'; this.journal.put(row);
      for await (const part of openRouterStream(response.body, controller.signal, request.outputBytes)) {
        if (part.kind === 'text') { row.partialText += part.text; this.emit(row, 'text'); }
        else for (const call of part.calls) {
          const tool = this.tools.find(t => t.name === call.name);
          if (!tool || !tool.validate(call.arguments)) throw new StreamFailure('unsupported');
          row.tools.push({ call, state: 'pending' });
        }
      }
      controller.signal.throwIfAborted();
      if (row.tools.length) { row.state = 'awaiting-approval'; this.emit(row, 'approval'); }
      else this.finish(row, 'completed');
    } catch (error) {
      // Use current persisted state: cancel may already have committed its only terminal event.
      const current = this.journal.get(row.runId)!;
      if (controller.signal.aborted) this.finish(current, controller.signal.reason === 'timeout' ? 'failed' : 'cancelled', controller.signal.reason === 'timeout' ? 'timeout' : undefined);
      else this.finish(current, 'failed', error instanceof StreamFailure ? error.code : 'transport');
    } finally { clearTimeout(timer); this.active.delete(row.runId); }
    return this.journal.get(row.runId)!;
  }
  /** Call only after trusted permission UI decided on this exact stored call. */
  async decide(runId: string, callId: string, decision: 'approve' | 'deny') {
    const row = this.journal.get(runId);
    if (!row || row.state !== 'awaiting-approval' || this.active.has(runId)) return this.journal.get(runId);
    const entry = row.tools.find(t => t.call.id === callId);
    if (!entry || entry.state !== 'pending') return row;
    const tool = this.tools.find(t => t.name === entry.call.name);
    if (decision === 'deny' || !tool || !tool.validate(entry.call.arguments) || !tool.permitted(entry.call.arguments)) {
      entry.state = 'denied'; this.finish(row, 'failed', 'permission-denied'); return this.journal.get(runId);
    }
    const controller = new AbortController(); this.active.set(runId, controller);
    row.state = 'running-tool'; entry.state = 'dispatching';
    row.toolDeadline = Date.now() + row.toolTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      this.journal.put(row); // Must succeed before dispatch; uncertainty never replays.
      const expired = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new Error('tool-interrupted'));
        controller.signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => controller.abort('timeout'), row.toolTimeoutMs);
      });
      // Stop waiting at the deadline even if a backend ignores abort. The effect may still
      // happen, so only an interrupted/unknown result is honest; never dispatch it again.
      const result = await Promise.race([tool.execute(structuredClone(entry.call.arguments), controller.signal), expired]);
      if (controller.signal.aborted || terminal(this.journal.get(runId)?.state ?? 'interrupted')) return this.journal.get(runId);
      entry.result = result.slice(0, 4096); entry.state = 'committed'; this.emit(row, 'tool-result');
      if (row.tools.some(t => t.state === 'pending')) { row.state = 'awaiting-approval'; this.emit(row, 'approval'); }
      else this.finish(row, 'completed');
    } catch {
      const current = this.journal.get(runId);
      if (current) this.finish(current, 'interrupted', 'tool-outcome-unknown');
    } finally {
      if (timer) clearTimeout(timer);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      this.active.delete(runId);
    }
    return this.journal.get(runId);
  }
}
