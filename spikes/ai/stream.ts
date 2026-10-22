// Spike-local protocol. F0-01 owns the eventual versioned shared contracts.
export class StreamFailure extends Error {
  readonly code: 'transport' | 'protocol' | 'limit' | 'provider' | 'unsupported';
  constructor(code: StreamFailure['code']) {
    super(code); // Never retain upstream exception text, content, headers, or URLs.
    this.code = code;
  }
}

export interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }
export type StreamPart = { kind: 'text'; text: string } | { kind: 'tools'; calls: ToolCall[] };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Incremental strict UTF-8 SSE framing, including CR, CRLF, comments and multi-line data. */
export async function* sse(body: ReadableStream<Uint8Array>, signal: AbortSignal, maxBytes: number): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let line = '', data: string[] = [], bytes = 0, afterCr = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const dispatch = (current: string): string | undefined => {
    if (current === '') {
      if (!data.length) return;
      const result = data.join('\n'); data = []; return result;
    }
    if (current.startsWith('data:')) data.push(current.slice(5).replace(/^ /, ''));
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) {
        if (decoder.decode() || line || data.length) throw new StreamFailure('protocol');
        break;
      }
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new StreamFailure('limit');
      for (const char of decoder.decode(chunk.value, { stream: true })) {
        if (afterCr && char === '\n') { afterCr = false; continue; }
        afterCr = char === '\r';
        if (char === '\r' || char === '\n') {
          const event = dispatch(line); line = '';
          if (event !== undefined) yield event;
        } else line += char;
      }
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** A finished choice alone is provisional. [DONE], clean EOF and valid tools are required. */
export async function* openRouterStream(body: ReadableStream<Uint8Array>, signal: AbortSignal, maxBytes: number): AsyncGenerator<StreamPart> {
  let done = false, finish: string | undefined;
  const tools = new Map<number, { id: string; name: string; args: string }>();
  for await (const data of sse(body, signal, maxBytes)) {
    if (done) throw new StreamFailure('protocol');
    if (data === '[DONE]') { if (!finish) throw new StreamFailure('protocol'); done = true; continue; }
    let frame: unknown;
    try { frame = JSON.parse(data); } catch { throw new StreamFailure('protocol'); }
    if (!record(frame)) throw new StreamFailure('protocol');
    if (frame.error !== undefined) throw new StreamFailure('provider');
    if (!Array.isArray(frame.choices)) throw new StreamFailure('protocol');
    // Support standard empty-choice usage frames and OpenRouter's repeated finish usage frame.
    if (!frame.choices.length && record(frame.usage) && finish) continue;
    if (frame.choices.length !== 1) throw new StreamFailure('protocol');
    const choice: unknown = frame.choices[0];
    if (!record(choice) || choice.index !== 0 || !record(choice.delta)) throw new StreamFailure('protocol');
    const delta = choice.delta;
    if (Object.keys(delta).some(key => !['role', 'content', 'tool_calls'].includes(key)) ||
        (delta.role !== undefined && delta.role !== 'assistant')) throw new StreamFailure('unsupported');
    if (finish) {
      if (!record(frame.usage) || choice.finish_reason !== finish ||
          Object.keys(delta).some(k => k !== 'role' && k !== 'content') ||
          (delta.content !== undefined && delta.content !== '')) throw new StreamFailure('protocol');
      continue;
    }
    if (delta.content !== undefined && delta.content !== null) {
      if (typeof delta.content !== 'string') throw new StreamFailure('protocol');
      if (delta.content) yield { kind: 'text', text: delta.content };
    }
    if (delta.tool_calls !== undefined) {
      if (!Array.isArray(delta.tool_calls)) throw new StreamFailure('protocol');
      for (const fragment of delta.tool_calls as unknown[]) {
        if (!record(fragment) || !Number.isSafeInteger(fragment.index) || (fragment.index as number) < 0 ||
            (fragment.index as number) >= 16) throw new StreamFailure('protocol');
        const index = fragment.index as number;
        const tool = tools.get(index) ?? { id: '', name: '', args: '' };
        if (fragment.id !== undefined) {
          if (typeof fragment.id !== 'string' || tool.id) throw new StreamFailure('protocol');
          tool.id = fragment.id;
        }
        if (fragment.type !== undefined && fragment.type !== 'function') throw new StreamFailure('unsupported');
        if (fragment.function !== undefined) {
          if (!record(fragment.function)) throw new StreamFailure('protocol');
          if (fragment.function.name !== undefined) {
            if (typeof fragment.function.name !== 'string') throw new StreamFailure('protocol');
            tool.name += fragment.function.name;
          }
          if (fragment.function.arguments !== undefined) {
            if (typeof fragment.function.arguments !== 'string') throw new StreamFailure('protocol');
            tool.args += fragment.function.arguments;
          }
        }
        tools.set(index, tool);
      }
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      if (choice.finish_reason !== 'stop' && choice.finish_reason !== 'tool_calls') throw new StreamFailure('provider');
      finish = choice.finish_reason;
    }
  }
  if (!done || !finish || (finish === 'tool_calls') !== (tools.size > 0)) throw new StreamFailure('protocol');
  const calls: ToolCall[] = [];
  for (const [index, tool] of [...tools].sort(([a], [b]) => a - b)) {
    if (index !== calls.length || !tool.id || !tool.name || calls.some(c => c.id === tool.id)) throw new StreamFailure('protocol');
    let args: unknown;
    try { args = JSON.parse(tool.args); } catch { throw new StreamFailure('protocol'); }
    if (!record(args)) throw new StreamFailure('protocol');
    calls.push({ id: tool.id, name: tool.name, arguments: args });
  }
  if (calls.length) yield { kind: 'tools', calls };
}
