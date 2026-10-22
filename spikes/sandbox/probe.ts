import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir, release } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runFixture, NODE_SHA256 } from './supervisor.ts';

// This executable has no arbitrary package/path/command arguments. All test
// resources are newly created public canaries outside the sandbox mounts.
const directory = mkdtempSync(join(tmpdir(), 'linuxcast-probe-canary-'));
const tcp = createServer(socket => socket.destroy());
const unix = createServer(socket => socket.destroy());
try {
  mkdirSync(join(directory, 'sibling'));
  const file = join(directory, 'public-host.txt');
  const sibling = join(directory, 'sibling/public-data.txt');
  const database = join(directory, 'public-database.sqlite');
  for (const path of [file, sibling, database]) writeFileSync(path, 'public synthetic host canary');
  await new Promise<void>(resolve => tcp.listen(0, '127.0.0.1', resolve));
  const unixSocket = join(directory, 'public-display.sock');
  await new Promise<void>(resolve => unix.listen(unixSocket, resolve));
  const address = tcp.address();
  if (!address || typeof address === 'string') throw new Error('Synthetic listener unavailable');
  const version = (tool: string) => spawnSync(tool, ['--version'], { encoding: 'utf8', timeout: 5000 }).stdout.split('\n')[0];
  const os = readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="([^"]+)"$/m)?.[1];
  const userControllers = readFileSync(`/sys/fs/cgroup/user.slice/user-${process.getuid?.()}.slice/user@${process.getuid?.()}.service/cgroup.controllers`, 'utf8').trim();
  const result = await runFixture({ mode: 'boundaries', canaries: { file, sibling, database, unixSocket, tcpPort: address.port } });
  console.log(JSON.stringify({ task: 'S0-04', platform: { os, kernel: release(), architecture: process.arch,
    bwrap: version('/usr/bin/bwrap'), systemd: version('/usr/bin/systemd-run'),
    node: '24.22.1', nodeSha256: NODE_SHA256, userControllers }, result }, null, 2));
  process.exitCode = result.status === 'completed' ? 0 : result.status === 'unavailable' ? 3 : 1;
} finally {
  await Promise.all([new Promise<void>(resolve => tcp.close(() => resolve())), new Promise<void>(resolve => unix.close(() => resolve()))]);
  rmSync(directory, { recursive: true, force: true });
}
