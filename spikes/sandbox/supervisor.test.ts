import { expect, test } from 'vitest';
import { runFixture } from './supervisor.ts';

test('missing sandbox supervisor cannot fall back to a direct Node fixture', async () => {
  let ready = false;
  const result = await runFixture({ mode: 'boundaries', tools: { systemdRun: '/no-such-linuxcast-test-supervisor' }, onReady: () => { ready = true; } });
  expect(result.status).toBe('unavailable');
  expect(result.code).toBe('BACKEND_MISSING');
  expect(result.cleanupVerified).toBe(true);
  expect(result.report).toBeUndefined();
  expect(ready).toBe(false);
});

test('missing bubblewrap is rejected before any runtime or supervisor launch', async () => {
  let ready = false;
  const result = await runFixture({ mode: 'boundaries', tools: { bwrap: '/no-such-linuxcast-test-bwrap' }, onReady: () => { ready = true; } });
  expect(result).toEqual({ status: 'unavailable', code: 'BACKEND_MISSING', cleanupVerified: true, diagnosticsBytes: 0 });
  expect(ready).toBe(false);
});
