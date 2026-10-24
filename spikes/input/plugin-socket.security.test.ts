import { execFile } from 'node:child_process';
import { chmodSync, chownSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import type { Result } from '../sandbox/supervisor.ts';

const execute = promisify(execFile);

test('mandatory extension sandbox cannot reach the input control socket hierarchy', async () => {
  // Same disposable guest gate as the kernel harness. Never provision this on a host.
  expect(process.getuid?.()).toBe(0);
  const marker = '/run/linuxcast-input-spike-lab';
  const metadata = lstatSync(marker);
  expect(metadata.isFile()).toBe(true);
  expect(metadata.uid).toBe(0);
  expect(metadata.mode & 0o777).toBe(0o600);
  expect(readFileSync(marker, 'utf8')).toBe('S0-03 disposable Debian synthetic devices only\n');
  expect(readFileSync('/etc/os-release', 'utf8')).toMatch(/^ID=debian$/m);
  expect(readFileSync('/etc/os-release', 'utf8')).toMatch(/^VERSION_ID="13"$/m);
  const parent = '/run/linuxcast-input-spike';
  mkdirSync(parent, { recursive: true, mode: 0o711 });
  const parentMetadata = lstatSync(parent);
  expect(parentMetadata.isDirectory()).toBe(true);
  expect(parentMetadata.uid).toBe(0);
  expect(parentMetadata.mode & 0o022).toBe(0);
  const directory = mkdtempSync(join(parent, 'plugin-denial-'));
  chmodSync(directory, 0o711);
  const path = join(directory, 'control.sock');
  let connections = 0;
  const server = createServer(socket => { connections++; socket.destroy(); });
  const env = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', TMPDIR: '/var/tmp' };
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
    chmodSync(path, 0o600);
    chownSync(path, 1000, 1000);
    const socketMetadata = lstatSync(path);
    expect(socketMetadata.isSocket()).toBe(true);
    expect(socketMetadata.uid).toBe(1000);
    expect(socketMetadata.mode & 0o777).toBe(0o600);
    // Positive control: the authorized ordinary process can reach the unchanged
    // socket permissions. This is a synthetic listener, not a live input service.
    await execute(process.execPath, ['--input-type=module', '-e',
      'import {createConnection} from "node:net"; const socket=createConnection(process.argv[1]); socket.on("error",()=>process.exit(3)); socket.on("connect",()=>socket.end());', path],
    { uid: 1000, gid: 1000, env, timeout: 5000 });
    await expect.poll(() => connections).toBe(1);
    connections = 0;
    const canaries = { file: join(directory, 'public-file'), sibling: join(directory, 'public-sibling'), database: join(directory, 'public-database'), unixSocket: path, tcpPort: 9 };
    const supervisor = new URL('../sandbox/supervisor.ts', import.meta.url).href;
    const result = await execute(process.execPath, ['--input-type=module', '-e',
      'const {runFixture}=await import(process.argv[1]); const result=await runFixture({mode:"boundaries",canaries:JSON.parse(process.argv[2])}); process.stdout.write(JSON.stringify(result));', supervisor, JSON.stringify(canaries)],
    { uid: 1000, gid: 1000, env, timeout: 30_000, maxBuffer: 64 * 1024 });
    const report = JSON.parse(result.stdout) as Result;
    expect(report.status, JSON.stringify(report)).toBe('completed');
    expect(report.cleanupVerified).toBe(true);
    // Accepted S0-04 calls its generic UNIX canary displayDenied. Here that
    // parameter is deliberately the root-owned input-control socket path.
    expect(report.report?.displayDenied).toBe(true);
    expect(report.report?.brokerAllowed).toBe(true);
    expect(report.controls?.memoryMax).toBe('268435456');
    expect(report.controls?.tasksMax).toBe('64');
    expect(report.controls?.cpuMax).toBe('100000 100000');
    expect(connections).toBe(0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
}, 40_000);
