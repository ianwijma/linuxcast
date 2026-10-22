import { afterAll, beforeAll, expect, test } from 'vitest';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFixture } from './supervisor.ts';
import type { Mode } from './supervisor.ts';

let directory: string;
let connections = 0;
const tcp = createServer(socket => { connections++; socket.destroy(); });
const unix = createServer(socket => { connections++; socket.destroy(); });
let canaries: NonNullable<Parameters<typeof runFixture>[0]['canaries']>;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'linuxcast-host-canary-'));
  mkdirSync(join(directory, 'sibling'));
  const file = join(directory, 'public-host.txt');
  const sibling = join(directory, 'sibling/public-data.txt');
  const database = join(directory, 'public-database.sqlite');
  for (const path of [file, sibling, database]) writeFileSync(path, 'public synthetic host canary');
  await new Promise<void>(resolve => tcp.listen(0, '127.0.0.1', resolve));
  const unixSocket = join(directory, 'public-display.sock');
  await new Promise<void>(resolve => unix.listen(unixSocket, resolve));
  const address = tcp.address();
  if (!address || typeof address === 'string') throw new Error('Synthetic TCP fixture unavailable');
  canaries = { file, sibling, database, unixSocket, tcpPort: address.port };
});

afterAll(async () => {
  await Promise.all([new Promise<void>(resolve => tcp.close(() => resolve())), new Promise<void>(resolve => unix.close(() => resolve()))]);
  rmSync(directory, { recursive: true, force: true });
});

test('real broker works while actual direct host access is denied', async () => {
  const result = await runFixture({ mode: 'boundaries', canaries });
  expect(result.status, JSON.stringify(result)).toBe('completed');
  expect(result.cleanupVerified).toBe(true);
  expect(Object.keys(result.report ?? {}).length).toBeGreaterThanOrEqual(20);
  expect(Object.values(result.report ?? {})).not.toContain(false);
  expect(connections).toBe(0);
  expect(result.controls?.memoryMax).toBe('268435456');
  expect(result.controls?.tasksMax).toBe('64');
}, 10000);

test.each<Mode>(['oversized', 'bad-json', 'truncated', 'stderr-flood', 'frame-flood', 'stale-session', 'unknown-method', 'spoof-principal', 'crash'])('host survives and cleans up hostile %s fixture', async mode => {
  const result = await runFixture({ mode });
  expect(result.status, JSON.stringify(result)).toBe('failed');
  expect(result.cleanupVerified).toBe(true);
  expect(result.code).not.toBe('NO_REPORT');
}, 10000);

test('missing bubblewrap reports unavailable without executing fixture code', async () => {
  let ready = false;
  const result = await runFixture({ mode: 'boundaries', tools: { bwrap: '/no-such-linuxcast-test-bwrap' }, onReady: () => { ready = true; } });
  expect(result.status).toBe('unavailable');
  expect(result.report).toBeUndefined();
  expect(result.fixtureStarted).toBeUndefined();
  expect(ready).toBe(false);
  expect(result.cleanupVerified).toBe(true);
}, 10000);

test('namespace setup failure reports unavailable and never executes Node', async () => {
  const fake = join(directory, 'namespace-denied');
  // A deterministic supervisor stand-in returns bwrap's startup denial before
  // creating any scope. This separates namespace failure from an independently
  // unavailable resource controller on the current host.
  writeFileSync(fake, '#!/bin/sh\necho "bwrap: Creating new namespace failed: Operation not permitted" >&2\nexit 1\n', { mode: 0o700 });
  const result = await runFixture({ mode: 'boundaries', tools: { systemdRun: fake } });
  expect(result.status).toBe('unavailable');
  expect(result.code).toBe('NAMESPACES_UNAVAILABLE');
  expect(result.report).toBeUndefined();
  expect(result.fixtureStarted).toBeUndefined();
  expect(result.cleanupVerified).toBe(true);
}, 10000);

test('cancellation kills a real detached descendant and verifies empty cgroup', async () => {
  const controller = new AbortController();
  const result = await runFixture({ mode: 'descendants', signal: controller.signal,
    onReady: () => { setTimeout(() => controller.abort(), 500); } });
  expect(result.status, JSON.stringify(result)).toBe('cancelled');
  expect(result.report?.detachedDescendantStarted).toBe(true);
  expect(result.cleanupVerified).toBe(true);
}, 10000);

test('wall deadline is independent of a noncooperative runtime', async () => {
  const result = await runFixture({ mode: 'idle', deadlineMs: 200 });
  expect(result.status, JSON.stringify(result)).toBe('failed');
  expect(result.code).toBe('DEADLINE');
  expect(result.cleanupVerified).toBe(true);
}, 10000);

test('memory pressure is contained by the kernel memory controller', async () => {
  const result = await runFixture({ mode: 'allocate', deadlineMs: 5000 });
  expect(result.status, JSON.stringify(result)).toBe('failed');
  expect(result.code).toMatch(/^CHILD_EXIT_/);
  expect(result.controls?.memoryMax).toBe('268435456');
  expect(result.controls?.memoryEvents).toMatch(/oom_kill [1-9]/);
  expect(result.cleanupVerified).toBe(true);
}, 10000);

test('thread pressure is bounded by the kernel task controller', async () => {
  const result = await runFixture({ mode: 'threads', deadlineMs: 5000 });
  expect(['completed', 'failed'], JSON.stringify(result)).toContain(result.status);
  if (result.status === 'completed') expect(result.report?.threadCreationDenied).toBe(true);
  else expect(result.code).toMatch(/^CHILD_EXIT_/);
  expect(result.controls?.pidsEvents).toMatch(/max [1-9]/);
  expect(result.cleanupVerified).toBe(true);
}, 10000);

test('CPU quota throttles parallel worker load before independent deadline', async () => {
  const result = await runFixture({ mode: 'cpu', deadlineMs: 1200 });
  expect(result.code, JSON.stringify(result)).toBe('DEADLINE');
  expect(result.controls?.cpuStat).toMatch(/nr_throttled [1-9]/);
  expect(result.cleanupVerified).toBe(true);
}, 10000);
