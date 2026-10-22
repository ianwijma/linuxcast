import { describe, expect, test } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { Socket } from 'node:net';
import { FixtureJournal, ProviderSpike } from './provider.ts';
import type { Fetch, RunRequest, TrustedTool } from './provider.ts';
import { done, frame, response, success, tool } from './fixtures.ts';

const request = (): RunRequest => ({ runId: 'synthetic-run', selection: { revision: 4, providerProfileId: 'synthetic-profile', modelId: 'synthetic/model' }, prompt: 'Public synthetic prompt', timeoutMs: 1000, outputBytes: 16384 });
function fixture(text = success, transport?: Fetch, journal = new FixtureJournal()) {
  let executions = 0, allowed = true;
  const descriptor: TrustedTool = { name: 'fixture_write', description: 'Synthetic fixture effect', parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'], additionalProperties: false },
    validate: args => Object.keys(args).length === 1 && args.target === 'synthetic.txt', permitted: () => allowed,
    execute: async () => { executions++; return 'synthetic-result'; } };
  const broker = new ProviderSpike(journal, transport ?? (async () => response(text)), [descriptor]);
  return { broker, journal, descriptor, executions: () => executions, revoke: () => { allowed = false; } };
}
const assertTerminal = (row: ReturnType<ProviderSpike['read']>, state: string) => {
  expect(row?.state).toBe(state);
  expect(row?.events.filter(e => e.kind === 'terminal')).toHaveLength(1);
  expect(row?.events.map(e => e.sequence)).toEqual(row?.events.map((_, i) => i + 1));
  expect(row?.events.every(e => e.schemaVersion === 1 && e.runId === 'synthetic-run')).toBe(true);
};

describe('S0-05-AC01 strict streaming and provisional partial output', () => {
  test.each([1, 2, 7, 8192])('fragmented UTF-8/SSE success (%i bytes) commits once', async size => {
    const { broker } = fixture(success, async () => response(success, size));
    const row = await broker.start(request(), 'synthetic-key');
    assertTerminal(row, 'completed'); expect(row.committedText).toBe('Synthetic 🌱 answer');
  });
  test('CRLF and multi-line data parse according to SSE', async () => {
    const wire = 'data: {"choices":\r\ndata: [{"index":0,"delta":{"content":"synthetic"},"finish_reason":"stop"}]}\r\n\r\n' + done.replaceAll('\n', '\r\n');
    const row = await fixture(wire).broker.start(request(), 'synthetic-key');
    expect(row.committedText).toBe('synthetic');
  });
  test.each([
    ['transport EOF', frame({ content: 'partial' })],
    ['finished without DONE', frame({ content: 'partial' }, 'stop')],
    ['DONE without finish', frame({ content: 'partial' }) + done],
    ['malformed JSON', frame({ content: 'partial' }) + 'data: nope\n\n'],
    ['mid-stream provider error', frame({ content: 'partial' }) + 'data: {"error":{"message":"synthetic seeded secret"}}\n\n'],
    ['error finish', frame({ content: 'partial' }, 'error') + done],
    ['length limit', frame({ content: 'partial' }, 'length') + done],
    ['duplicate terminal', frame({ content: 'partial' }, 'stop') + frame({}, 'stop') + done],
    ['duplicate DONE', frame({ content: 'partial' }, 'stop') + done + done],
    ['data after DONE', frame({ content: 'partial' }, 'stop') + done + frame({ content: 'late' })],
    ['partial tool JSON', frame({ content: 'partial', tool_calls: [{ index: 0, id: 'call', function: { name: 'fixture_write', arguments: '{' } }] }, 'tool_calls') + done],
    ['unknown tool', frame({ content: 'partial', tool_calls: [{ index: 0, id: 'call', function: { name: 'unoffered', arguments: '{}' } }] }, 'tool_calls') + done],
    ['invalid arguments', tool.replace('synthetic.txt', 'forbidden.txt')],
    ['unknown delta variant', frame({ content: 'partial', function_call: { name: 'legacy-tool' } }, 'stop') + done],
  ])('%s never commits success or executes tools', async (_name, wire) => {
    const f = fixture(wire); const row = await f.broker.start(request(), 'synthetic-key');
    assertTerminal(row, 'failed'); expect(row.committedText).toBeUndefined(); expect(f.executions()).toBe(0);
    expect(row.failure).not.toContain('secret');
  });
  test('thrown transport after provisional text/finish is still failure', async () => {
    const f = fixture('', async () => response(frame({ content: 'partial' }, 'stop') + done, 1, true));
    const row = await f.broker.start(request(), 'synthetic-key');
    assertTerminal(row, 'failed'); expect(row.partialText).toBe('partial'); expect(row.committedText).toBeUndefined();
    expect(row.failure).toBe('transport');
  });
  test('invalid fragmented UTF-8 fails closed', async () => {
    const f = fixture('', async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0xc3, 0x28])); c.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } }));
    assertTerminal(await f.broker.start(request(), 'synthetic-key'), 'failed');
  });
  test('bounded stream rejects unbounded data and an unresponsive stream times out', async () => {
    const f = fixture(success); const r = request(); r.outputBytes = 10;
    expect((await f.broker.start(r, 'synthetic-key')).failure).toBe('limit');
    const timeout = fixture('', async () => new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/event-stream' } }));
    const slow = request(); slow.timeoutMs = 10;
    const row = await timeout.broker.start(slow, 'synthetic-key');
    assertTerminal(row, 'failed'); expect(row.failure).toBe('timeout');
  });
  test.each([401, 429, 502])('HTTP %i does not expose response errors or commit', async status => {
    const f = fixture('', async () => new Response('synthetic secret upstream body', { status }));
    const row = await f.broker.start(request(), 'synthetic-key'); assertTerminal(row, 'failed'); expect(row.failure).toBe('provider');
  });
  test('selection is snapshotted; HTTPS and no-redirect retain endpoint/billing', async () => {
    let init: RequestInit | undefined; const r = request();
    const f = fixture('', async (url, options) => { expect(url).toBe('https://openrouter.ai/api/v1/chat/completions'); init = options; r.selection.modelId = 'changed'; return response(success); });
    const row = await f.broker.start(r, 'synthetic-key');
    expect(row.selection.modelId).toBe('synthetic/model'); expect(init?.redirect).toBe('error');
    expect(JSON.parse(init?.body as string).model).toBe('synthetic/model');
    const clean = fixture(); await expect(clean.broker.start(request(), 'synthetic-key', 'http://example.test/v1')).rejects.toThrow('invalid-endpoint');
    expect(JSON.stringify(row)).not.toContain('synthetic-key'); expect(JSON.stringify(row)).not.toContain('Public synthetic prompt');
  });
  test('cancel during stream retains provisional text with exactly one cancelled terminal', async () => {
    const j = new FixtureJournal();
    const f = fixture('', async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(frame({ content: 'partial' }))); } }), { headers: { 'Content-Type': 'text/event-stream' } }), j);
    const pending = f.broker.start(request(), 'synthetic-key');
    await expect.poll(() => f.broker.read('synthetic-run')?.partialText).toBe('partial');
    f.broker.cancel('synthetic-run'); f.broker.cancel('synthetic-run');
    const row = await pending; assertTerminal(row, 'cancelled'); expect(row.committedText).toBeUndefined();
  });
});

describe('S0-05-AC02 approval, denial and reconnect', () => {
  test('complete tool pauses with no execution; denying survives reconnect and repeated approval', async () => {
    const f = fixture(tool); const row = await f.broker.start(request(), 'synthetic-key');
    expect(row.state).toBe('awaiting-approval'); expect(f.executions()).toBe(0);
    expect(f.broker.reconnect(row.runId)?.state).toBe('awaiting-approval');
    await f.broker.decide(row.runId, 'synthetic-call-1', 'deny');
    const replacement = fixture(tool, undefined, f.journal);
    assertTerminal(replacement.broker.reconnect(row.runId), 'failed');
    await replacement.broker.decide(row.runId, 'synthetic-call-1', 'approve');
    expect(f.executions() + replacement.executions()).toBe(0);
  });
  test('one approved effect survives concurrent approvals and repeated reconnects', async () => {
    const f = fixture(tool); await f.broker.start(request(), 'synthetic-key');
    await Promise.all([f.broker.decide('synthetic-run', 'synthetic-call-1', 'approve'), f.broker.decide('synthetic-run', 'synthetic-call-1', 'approve')]);
    for (let i = 0; i < 3; i++) { f.broker.reconnect('synthetic-run'); await f.broker.decide('synthetic-run', 'synthetic-call-1', 'approve'); }
    assertTerminal(f.broker.read('synthetic-run'), 'completed'); expect(f.executions()).toBe(1);
    await expect(f.broker.start(request(), 'synthetic-key')).rejects.toThrow('run-exists');
  });
  test('policy revocation before approval prevents execution', async () => {
    const f = fixture(tool); await f.broker.start(request(), 'synthetic-key'); f.revoke();
    await f.broker.decide('synthetic-run', 'synthetic-call-1', 'approve');
    expect(f.executions()).toBe(0); expect(f.broker.read('synthetic-run')?.failure).toBe('permission-denied');
  });
  test('cancel pending approval prevents later execution', async () => {
    const f = fixture(tool); await f.broker.start(request(), 'synthetic-key'); f.broker.cancel('synthetic-run');
    await f.broker.decide('synthetic-run', 'synthetic-call-1', 'approve');
    expect(f.executions()).toBe(0); assertTerminal(f.broker.read('synthetic-run'), 'cancelled');
  });
  test('unknown effect after host crash is interrupted-review and never replayed', async () => {
    const f = fixture(tool); await f.broker.start(request(), 'synthetic-key');
    const row = f.journal.get('synthetic-run')!; row.state = 'running-tool'; row.tools[0]!.state = 'dispatching'; f.journal.put(row);
    const recovered = fixture(tool, undefined, f.journal);
    assertTerminal(recovered.broker.reconnect('synthetic-run'), 'interrupted');
    await recovered.broker.decide('synthetic-run', 'synthetic-call-1', 'approve');
    expect(recovered.executions()).toBe(0); expect(recovered.broker.read('synthetic-run')?.failure).toBe('review-required');
  });
  test('effect failure is uncertain, never automatically retried', async () => {
    const f = fixture(tool); f.descriptor.execute = async () => { throw new Error('synthetic secret tool error'); };
    await f.broker.start(request(), 'synthetic-key'); await f.broker.decide('synthetic-run', 'synthetic-call-1', 'approve');
    const row = f.broker.reconnect('synthetic-run'); assertTerminal(row, 'interrupted'); expect(row?.failure).toBe('tool-outcome-unknown');
  });
  test('failure to persist dispatch intent prevents execution', async () => {
    class FailingJournal extends FixtureJournal {
      override put(row: Parameters<FixtureJournal['put']>[0]) {
        if (row.state === 'running-tool') throw new Error('synthetic store unavailable');
        super.put(row);
      }
    }
    const f = fixture(tool, undefined, new FailingJournal());
    await f.broker.start(request(), 'synthetic-key');
    await f.broker.decide('synthetic-run', 'synthetic-call-1', 'approve');
    expect(f.executions()).toBe(0); assertTerminal(f.broker.read('synthetic-run'), 'interrupted');
  });
  test('cancel during effect remains outcome-unknown and cannot replay', async () => {
    const f = fixture(tool); let settle: (value: string) => void = () => {};
    f.descriptor.execute = () => new Promise(resolve => { settle = resolve; });
    await f.broker.start(request(), 'synthetic-key');
    const pending = f.broker.decide('synthetic-run', 'synthetic-call-1', 'approve');
    expect(f.broker.read('synthetic-run')?.tools[0]?.state).toBe('dispatching');
    f.broker.cancel('synthetic-run'); settle('synthetic-result'); await pending;
    const row = f.broker.reconnect('synthetic-run'); assertTerminal(row, 'interrupted');
    expect(row?.failure).toBe('tool-outcome-unknown'); expect(row?.tools[0]?.state).toBe('dispatching');
  });
  test('hanging effect ignoring abort settles at persisted deadline; reconnect never replays', async () => {
    const f = fixture(tool); const r = request(); r.timeoutMs = 25;
    let attempts = 0, settle: (value: string) => void = () => {};
    f.descriptor.execute = () => { attempts++; return new Promise(resolve => { settle = resolve; }); };
    await f.broker.start(r, 'synthetic-key');
    const pending = f.broker.decide(r.runId, 'synthetic-call-1', 'approve');
    const dispatching = f.broker.read(r.runId)!;
    expect(dispatching.toolTimeoutMs).toBe(25); expect(dispatching.toolDeadline).toBeGreaterThan(Date.now() - 25);
    expect(f.broker.reconnect(r.runId)?.state).toBe('running-tool');
    const row = await pending;
    assertTerminal(row, 'interrupted'); expect(row?.failure).toBe('tool-outcome-unknown');
    const recovered = fixture(tool, undefined, f.journal);
    await recovered.broker.decide(r.runId, 'synthetic-call-1', 'approve');
    expect(recovered.broker.reconnect(r.runId)?.state).toBe('interrupted'); expect(attempts).toBe(1); expect(recovered.executions()).toBe(0);
    settle('late-result'); await Promise.resolve();
    assertTerminal(f.broker.read(r.runId), 'interrupted'); expect(f.broker.read(r.runId)?.tools[0]?.result).toBeUndefined();
  });
});

test('real HTTP fixture transport: native fetch handles success, dropped connection and cancellation', async () => {
  const connections = new Set<Socket>();
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (req.url === '/success') { res.end(success); return; }
    res.write(frame({ content: 'partial network fixture' }));
    if (req.url === '/drop') setTimeout(() => res.destroy(), 20);
  });
  server.on('connection', socket => { connections.add(socket); socket.on('close', () => connections.delete(socket)); });
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening'); const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fixture-listener-required');
    // This explicit test seam substitutes only the wire transport. Production endpoint remains HTTPS.
    const transport = (path: string): Fetch => async (_url, init) => fetch(`http://127.0.0.1:${address.port}/${path}`, init);
    const good = fixture('', transport('success')); assertTerminal(await good.broker.start(request(), 'synthetic-key'), 'completed');
    const drop = fixture('', transport('drop')); const broken = await drop.broker.start(request(), 'synthetic-key');
    assertTerminal(broken, 'failed'); expect(broken.partialText).toBe('partial network fixture'); expect(broken.committedText).toBeUndefined();
    const cancel = fixture('', transport('cancel')); const pending = cancel.broker.start(request(), 'synthetic-key');
    await expect.poll(() => cancel.broker.read('synthetic-run')?.partialText).toBe('partial network fixture');
    cancel.broker.cancel('synthetic-run'); assertTerminal(await pending, 'cancelled');
  } finally {
    for (const socket of connections) socket.destroy();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
