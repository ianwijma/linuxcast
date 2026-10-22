// All fixtures are hand-authored public synthetic data; never record real API traffic.
export const frame = (delta: Record<string, unknown>, finish: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
export const done = 'data: [DONE]\n\n';
export const success = ': OPENROUTER PROCESSING\n\n' + frame({ content: 'Synthetic 🌱 ' }) + frame({ content: 'answer' }) + frame({}, 'stop') +
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '', role: 'assistant' }, finish_reason: 'stop' }], usage: { total_tokens: 5 } })}\n\n` + done;
export const tool = frame({ tool_calls: [{ index: 0, id: 'synthetic-call-1', type: 'function', function: { name: 'fixture_write', arguments: '{"target":' } }] }) +
  frame({ tool_calls: [{ index: 0, function: { arguments: '"synthetic.txt"}' } }] }) + frame({}, 'tool_calls') + done;
export function response(text: string, size = 7, failureAtEnd = false): Response {
  const bytes = new TextEncoder().encode(text); let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset < bytes.length) { controller.enqueue(bytes.slice(offset, offset + size)); offset += size; }
      else if (failureAtEnd) controller.error(new Error('synthetic transport private body sentinel'));
      else controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
}
