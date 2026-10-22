import { ProviderSpike, FixtureJournal } from './provider.ts';

// Deliberate one-shot paid request. No ambient provider-key lookup, plaintext storage or traffic capture.
if (process.env.LINUXCAST_AI_LIVE !== 'openrouter' || !process.env.LINUXCAST_AI_MODEL || process.stdin.isTTY) {
  console.error('UNAVAILABLE: opt in with LINUXCAST_AI_LIVE=openrouter, select LINUXCAST_AI_MODEL, and supply your API key on stdin. This sends one synthetic prompt and may incur charges.');
  process.exitCode = 3;
} else {
  let key = '';
  for await (const chunk of process.stdin) {
    key += String(chunk);
    if (key.length > 4096) { key = ''; break; }
  }
  key = key.trim();
  if (!key) { console.error('UNAVAILABLE: explicitly supplied credential required.'); process.exitCode = 3; }
  else {
    const broker = new ProviderSpike(new FixtureJournal(), fetch);
    const result = await broker.start({ runId: 'live-smoke', selection: { revision: 1, providerProfileId: 'explicit-live-openrouter', modelId: process.env.LINUXCAST_AI_MODEL },
      prompt: 'Reply with the word synthetic.', timeoutMs: 30_000, outputBytes: 65_536 }, key);
    key = '';
    // Allowlist summary only. Never print response/prompt, credentials, URL or upstream error.
    console.log(JSON.stringify({ backend: 'openrouter', state: result.state, failure: result.failure ?? null, responseBytes: Buffer.byteLength(result.partialText) }));
    process.exitCode = result.state === 'completed' ? 0 : 1;
  }
}
