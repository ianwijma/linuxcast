import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Duplex } from 'node:stream';
import { Decoder, envelope, frame, brokerReply, MAX_DIAGNOSTICS, MAX_REQUESTS, ProtocolError } from './protocol.ts';

const own = dirname(fileURLToPath(import.meta.url));
const NODE = '/tmp/linuxcast-node24/node';
export const NODE_SHA256 = 'e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb';
export const MODES = ['boundaries', 'idle', 'descendants', 'oversized', 'bad-json', 'truncated', 'stderr-flood', 'frame-flood', 'stale-session', 'unknown-method', 'spoof-principal', 'allocate', 'threads', 'cpu', 'crash'] as const;
export type Mode = typeof MODES[number];
export type Result = {
  status: 'completed' | 'unavailable' | 'failed' | 'cancelled';
  code: string;
  cleanupVerified: boolean;
  diagnosticsBytes: number;
  fixtureStarted?: boolean;
  report?: Record<string, unknown>;
  controls?: { memoryMax: string; tasksMax: string; cpuMax: string; memoryEvents: string; pidsEvents: string; cpuStat: string };
};
export type Options = {
  mode: Mode;
  signal?: AbortSignal;
  deadlineMs?: number;
  /** Synthetic host canaries only. Never pass real user paths into this spike. */
  canaries?: { file: string; sibling: string; database: string; unixSocket: string; tcpPort: number };
  onReady?: () => void;
  /** Dependency injection for fail-closed fixtures, not a product setting. */
  tools?: { bwrap?: string; systemdRun?: string };
};

function cleanEnvironment(): NodeJS.ProcessEnv {
  const runtime = `/run/user/${process.getuid?.()}`;
  return { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', XDG_RUNTIME_DIR: runtime,
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${runtime}/bus`,
    // Deliberately public canary proves bwrap clears even supervisor metadata.
    LINUXCAST_PARENT_CANARY: 'public environment canary' };
}

function tool(command: string, args: string[]) {
  return spawnSync(command, args, { env: cleanEnvironment(), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
}

function prepare(directory: string): { args: string[]; filterFd: number } {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('AMD64_LINUX_REQUIRED');
  const controllers = readFileSync('/sys/fs/cgroup/cgroup.controllers', 'utf8').split(/\s+/);
  if (!['memory', 'pids', 'cpu'].every(value => controllers.includes(value))) throw new Error('CGROUP_V2_REQUIRED');
  if (createHash('sha256').update(readFileSync(NODE)).digest('hex') !== NODE_SHA256) throw new Error('RUNTIME_CHECKSUM');
  if (tool(NODE, ['--version']).stdout.trim() !== 'v24.22.1') throw new Error('RUNTIME_VERSION');
  const runtime = join(directory, 'runtime');
  const libraryRoot = join(runtime, 'lib');
  mkdirSync(libraryRoot, { recursive: true, mode: 0o700 });
  copyFileSync(NODE, join(runtime, 'node'));
  if (createHash('sha256').update(readFileSync(join(runtime, 'node'))).digest('hex') !== NODE_SHA256) throw new Error('STAGED_RUNTIME_CHECKSUM');
  const linked = tool('/usr/bin/ldd', [NODE]);
  if (linked.status !== 0) throw new Error('RUNTIME_LIBRARIES');
  const libraries = [...new Set([...linked.stdout.matchAll(/(?:=>\s+|^\s*)(\/[^\s]+)\s+\(/gm)].map(item => item[1]!))];
  if (!libraries.some(path => basename(path) === 'ld-linux-x86-64.so.2')) throw new Error('RUNTIME_LOADER');
  const bindings: string[] = [];
  for (const library of libraries) {
    const name = basename(library);
    const target = join(libraryRoot, name);
    copyFileSync(realpathSync(library), target);
    bindings.push('--ro-bind', target, `/runtime/lib/${name}`);
  }
  const compiled = tool('/usr/bin/gcc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', join(own, 'seccomp.c'), '-o', join(directory, 'policy')]);
  if (compiled.status !== 0) throw new Error('SECCOMP_COMPILER_UNAVAILABLE');
  const emitted = spawnSync(join(directory, 'policy'), [], { timeout: 5000, maxBuffer: 65536, env: cleanEnvironment() });
  if (emitted.status !== 0 || !emitted.stdout.length || emitted.stdout.length % 8) throw new Error('SECCOMP_POLICY_UNAVAILABLE');
  writeFileSync(join(directory, 'policy.bpf'), emitted.stdout, { mode: 0o600 });
  mkdirSync(join(directory, 'package'), { mode: 0o700 });
  mkdirSync(join(directory, 'data'), { mode: 0o700 });
  copyFileSync(join(own, 'fixtures/extension.mjs'), join(directory, 'package/extension.mjs'));
  return { filterFd: openSync(join(directory, 'policy.bpf'), 'r'), args: [
    '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL',
    '--hostname', 'linuxcast-sandbox-fixture', '--clearenv', '--tmpfs', '/',
    '--dir', '/runtime', '--dir', '/runtime/lib', '--dir', '/lib64',
    '--ro-bind', join(runtime, 'node'), '/runtime/node', ...bindings,
    '--symlink', '/runtime/lib/ld-linux-x86-64.so.2', '/lib64/ld-linux-x86-64.so.2',
    '--ro-bind', join(directory, 'package'), '/package',
    '--bind', join(directory, 'data'), '/data', '--tmpfs', '/tmp',
    '--dir', '/home', '--dir', '/home/sandbox', '--proc', '/proc', '--dev', '/dev',
    '--setenv', 'PATH', '/runtime', '--setenv', 'HOME', '/home/sandbox',
    '--setenv', 'TMPDIR', '/tmp', '--setenv', 'LANG', 'C.UTF-8',
    '--setenv', 'LD_LIBRARY_PATH', '/runtime/lib', '--chdir', '/package',
    '--seccomp', '3', '--block-fd', '4', '--remount-ro', '/',
    '--', '/runtime/node', '--no-addons', '--disable-sigusr1', '/package/extension.mjs',
  ] };
}

function cgroupFor(unit: string): string {
  const result = tool('/usr/bin/systemctl', ['--user', 'show', unit, '--property=ControlGroup', '--value']);
  const name = result.stdout.trim();
  if (result.status !== 0 || !name.startsWith('/user.slice/') || name.split('/').includes('..')) throw new Error('CGROUP_UNAVAILABLE');
  return resolve('/sys/fs/cgroup', `.${name}`);
}

function readControls(cgroup: string): NonNullable<Result['controls']> {
  const read = (name: string) => {
    try { return readFileSync(join(cgroup, name), 'utf8').trim(); }
    catch { throw new Error(`${name.split('.')[0]!.toUpperCase()}_CONTROLLER_UNAVAILABLE`); }
  };
  return { memoryMax: read('memory.max'), tasksMax: read('pids.max'), cpuMax: read('cpu.max'),
    memoryEvents: read('memory.events'), pidsEvents: read('pids.events'), cpuStat: read('cpu.stat') };
}

function verifyControls(value: NonNullable<Result['controls']>): void {
  const [quota, period] = value.cpuMax.split(' ').map(Number);
  if (value.memoryMax !== '268435456' || value.tasksMax !== '64' || !quota || quota !== period) {
    throw new Error('RESOURCE_CONTROLS_UNAVAILABLE');
  }
}

function emptyCgroup(cgroup: string): boolean {
  try { return readFileSync(join(cgroup, 'cgroup.events'), 'utf8').includes('populated 0'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}

function absentScope(unit: string): boolean {
  const value = tool('/usr/bin/systemctl', ['--user', 'show', unit, '--property=LoadState', '--value']);
  return value.stdout.trim() === 'not-found';
}

/** Runs only a fixed synthetic fixture. It is deliberately not an extension API. */
export async function runFixture(options: Options): Promise<Result> {
  if (!MODES.includes(options.mode)) throw new Error('Unknown synthetic fixture');
  if (![options.tools?.systemdRun ?? '/usr/bin/systemd-run', options.tools?.bwrap ?? '/usr/bin/bwrap'].every(path => existsSync(path))) {
    return { status: 'unavailable', code: 'BACKEND_MISSING', cleanupVerified: true, diagnosticsBytes: 0 };
  }
  const directory = mkdtempSync(join(tmpdir(), 'linuxcast-sandbox-'));
  let prepared: ReturnType<typeof prepare>;
  try { prepared = prepare(directory); }
  catch (error) {
    rmSync(directory, { recursive: true, force: true });
    return { status: 'unavailable', code: error instanceof Error ? error.message : 'SETUP_UNAVAILABLE', cleanupVerified: true, diagnosticsBytes: 0 };
  }
  const unit = `linuxcast-sandbox-${randomUUID()}.scope`;
  const sessionId = randomUUID();
  const args = ['--user', '--scope', '--quiet', '--collect', '--no-ask-password', `--unit=${unit}`,
    '--property=MemoryMax=256M', '--property=MemorySwapMax=0', '--property=TasksMax=64', '--property=CPUQuota=100%',
    options.tools?.bwrap ?? '/usr/bin/bwrap', ...prepared.args];
  const child = spawn(options.tools?.systemdRun ?? '/usr/bin/systemd-run', args, {
    cwd: directory, env: cleanEnvironment(), stdio: ['pipe', 'pipe', 'pipe', prepared.filterFd, 'pipe'], detached: true,
  });
  const closed = new Promise<void>(done => { child.once('close', () => done()); });
  closeSync(prepared.filterFd);
  const result: Result = { status: 'failed', code: 'NO_REPORT', cleanupVerified: false, diagnosticsBytes: 0 };
  let ready = false;
  let finished = false;
  let cgroup: string | undefined;
  let startupDiagnostics = '';
  let stopping = false;
  let stoppedAt = 0;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let sampling: ReturnType<typeof setInterval> | undefined;
  let frames = 0;
  const requestIds = new Set<string>();
  const decoder = new Decoder();
  const gate = child.stdio[4] as Duplex;
  gate.on('error', () => {});
  const terminateScope = (signal: string) => {
    tool('/usr/bin/systemctl', ['--user', 'kill', '--kill-who=all', `--signal=${signal}`, unit]);
    try { if (child.pid) process.kill(-child.pid, signal as NodeJS.Signals); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  const stop = (status: Result['status'], code: string) => {
    if (stopping) return;
    stopping = true;
    stoppedAt = Date.now();
    result.status = status;
    result.code = code;
    if (cgroup) { try { result.controls = readControls(cgroup); } catch { /* collected */ } }
    terminateScope('SIGTERM');
    killTimer = setTimeout(() => terminateScope('SIGKILL'), 1000);
  };
  const cancel = () => stop('cancelled', 'CANCELLED');
  const write = (value: unknown) => {
    if (!child.stdin!.destroyed) child.stdin!.write(frame(value));
  };
  child.stdin!.on('error', () => {}); // peer exit is handled by exit/cleanup
  child.stderr!.on('data', (data: Buffer) => {
    result.diagnosticsBytes += data.length;
    if (!ready) startupDiagnostics = (startupDiagnostics + data.toString('utf8')).slice(0, 8192);
    if (result.diagnosticsBytes > MAX_DIAGNOSTICS) stop('failed', 'DIAGNOSTICS_LIMIT');
  });
  child.stdout!.on('data', (data: Buffer) => {
    if (stopping) return;
    try {
      decoder.push(data, value => {
        if (stopping) return;
        const request = envelope(value, sessionId);
        result.fixtureStarted = true;
        if (++frames > 256) throw new ProtocolError('FRAME_RATE_LIMIT');
        if (requestIds.has(request.requestId) || requestIds.size >= MAX_REQUESTS) throw new ProtocolError('REQUEST_LIMIT');
        requestIds.add(request.requestId);
        if (!ready) {
          if (request.method !== 'fixture.ready' || Object.keys(request.params).length) throw new ProtocolError('READY');
          cgroup = cgroupFor(unit);
          result.controls = readControls(cgroup);
          verifyControls(result.controls);
          ready = true;
          sampling = setInterval(() => {
            try { if (cgroup) result.controls = readControls(cgroup); } catch { /* collected */ }
          }, 20);
          clearTimeout(startupTimer);
          deadline = setTimeout(() => stop('failed', 'DEADLINE'), Math.min(options.deadlineMs ?? 30000, 30000));
          write({ protocolVersion: 1, sessionId, requestId: request.requestId, result: {
            mode: options.mode, canaries: options.canaries ?? {},
          } });
          options.onReady?.();
        } else if (request.method === 'fixture.report') {
          if (cgroup) result.controls = readControls(cgroup);
          result.report = request.params;
          result.status = 'completed';
          result.code = 'FIXTURE_COMPLETED';
          write({ protocolVersion: 1, sessionId, requestId: request.requestId, result: { ok: true } });
        } else {
          write({ protocolVersion: 1, sessionId, requestId: request.requestId, result: brokerReply(request) });
        }
        requestIds.delete(request.requestId);
      });
    } catch (error) {
      stop(ready ? 'failed' : 'unavailable', error instanceof Error ? error.message : 'PROTOCOL_FAILURE');
    }
  });
  const startupTimer = setTimeout(() => stop('unavailable', 'SANDBOX_STARTUP_TIMEOUT'), 5000);
  options.signal?.addEventListener('abort', cancel, { once: true });
  // bwrap cannot exec Node until the parent verifies actual cgroup controls.
  // The gate descriptor is consumed by bwrap, not exposed as a reusable token.
  void (async () => {
    const until = Date.now() + 5000;
    while (!stopping && !finished && Date.now() < until) {
      try {
        cgroup = cgroupFor(unit);
        result.controls = readControls(cgroup);
        verifyControls(result.controls);
        gate.end(Buffer.from([1]));
        return;
      } catch (error) {
        if ((error as Error).message !== 'CGROUP_UNAVAILABLE') {
          stop('unavailable', (error as Error).message);
          return;
        }
      }
      await new Promise(done => setTimeout(done, 20));
    }
  })().catch(() => stop('unavailable', 'PROFILE_VERIFICATION_FAILED'));
  write({ protocolVersion: 1, sessionId, requestId: 'start', method: 'fixture.start', params: {} });
  if (options.signal?.aborted) cancel();
  let childCode: number | null = null;
  await new Promise<void>(done => {
    child.once('error', () => { finished = true; result.status = 'unavailable'; result.code = 'BACKEND_MISSING'; done(); });
    child.once('exit', code => { finished = true; childCode = code; done(); });
  });
  clearTimeout(startupTimer);
  if (deadline) clearTimeout(deadline);
  if (sampling) clearInterval(sampling);
  options.signal?.removeEventListener('abort', cancel);
  // An exited launcher does not establish descendant cleanup. Always kill the
  // whole scope (including setsid descendants), then inspect kernel population.
  if (!cgroup) {
    try { cgroup = cgroupFor(unit); } catch { /* A failed scope may never exist. */ }
  }
  if (cgroup) {
    try { result.controls = readControls(cgroup); } catch { /* collected scope */ }
  }
  // Preserve the TERM grace period for any surviving scope members even when
  // the direct launcher has already exited. Empty scopes need no extra wait.
  while (stopping && cgroup && !emptyCgroup(cgroup) && Date.now() < stoppedAt + 1000) {
    await new Promise(done => setTimeout(done, 20));
  }
  if (killTimer) clearTimeout(killTimer);
  terminateScope('SIGKILL');
  const cleanupDeadline = Date.now() + 2000;
  while (cgroup && !emptyCgroup(cgroup) && Date.now() < cleanupDeadline) await new Promise(done => setTimeout(done, 20));
  // Drain the now-terminated process's pipes before checking report completeness.
  await Promise.race([closed, new Promise<void>(done => setTimeout(done, 500))]);
  result.cleanupVerified = cgroup ? emptyCgroup(cgroup) : child.pid === undefined || absentScope(unit);
  if (!result.cleanupVerified) { result.status = 'failed'; result.code = 'DESCENDANTS_REMAIN'; }
  if (!ready && !stopping && result.code !== 'BACKEND_MISSING') {
    result.status = 'unavailable';
    result.code = /namespace|Operation not permitted/.test(startupDiagnostics) ? 'NAMESPACES_UNAVAILABLE'
      : /seccomp/.test(startupDiagnostics) ? 'SECCOMP_UNAVAILABLE' : 'CONTAINMENT_UNAVAILABLE';
  } else if (ready && !stopping) {
    try { decoder.finish(); } catch (error) { result.status = 'failed'; result.code = (error as Error).message; }
    if (childCode !== 0) { result.status = 'failed'; result.code = `CHILD_EXIT_${childCode}`; }
  }
  rmSync(directory, { recursive: true, force: true });
  return result;
}

export function runtimePresent(): boolean { return existsSync(NODE); }
