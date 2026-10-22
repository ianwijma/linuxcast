// Public synthetic code only. This is not an extension SDK or a general host.
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout, setInterval, setImmediate } from 'node:timers';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';

if (process.argv[2] === 'child-idle') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else {
  let sessionId;
  let next = 0;
  let pending = new Map();
  let buffer = Buffer.alloc(0);
  function send(value) {
    const body = Buffer.from(JSON.stringify(value));
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length);
    process.stdout.write(Buffer.concat([header, body]));
  }
  function call(method, params = {}, override = {}) {
    const requestId = `request-${++next}`;
    return new Promise(resolve => {
      pending.set(requestId, resolve);
      send({ protocolVersion: 1, sessionId, requestId, method, params, ...override });
    });
  }
  process.stdin.on('data', data => {
    buffer = Buffer.concat([buffer, data]);
    while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32BE()) {
      const length = buffer.readUInt32BE();
      const value = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
      buffer = buffer.subarray(4 + length);
      if (value.method === 'fixture.start') {
        sessionId = value.sessionId;
        call('fixture.ready').then(run).catch(() => process.exit(2));
      } else {
        pending.get(value.requestId)?.(value.result);
        pending.delete(value.requestId);
      }
    }
  });
  const deniedFile = path => {
    try { readFileSync(path); return false; }
    catch (error) { return ['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR'].includes(error.code); }
  };
  const deniedConnect = options => new Promise(resolve => {
    const connection = createConnection(options);
    const timeout = setTimeout(() => { connection.destroy(); resolve(false); }, 1500);
    connection.once('connect', () => { clearTimeout(timeout); connection.destroy(); resolve(false); });
    connection.once('error', error => {
      clearTimeout(timeout);
      resolve(['ENOENT', 'EACCES', 'EPERM', 'ENETUNREACH', 'ECONNREFUSED'].includes(error.code));
    });
  });
  async function run({ mode, canaries }) {
    if (mode === 'boundaries') {
      const allowed = await call('fixture.read');
      const denied = await call('fixture.denied');
      writeFileSync('/data/public.txt', 'private fixture data');
      writeFileSync('/tmp/public.txt', 'private fixture temporary data');
      const status = readFileSync('/proc/self/status', 'utf8');
      let packageReadOnly = false;
      try { writeFileSync('/package/forbidden.txt', 'public'); }
      catch (error) { packageReadOnly = ['EROFS', 'EACCES'].includes(error.code); }
      const checks = {
        brokerAllowed: allowed.ok === true && allowed.value === 'public broker fixture',
        brokerDenied: denied.code === 'PERMISSION_DENIED',
        fileDenied: deniedFile(canaries.file), siblingDenied: deniedFile(canaries.sibling),
        databaseDenied: deniedFile(canaries.database),
        displayDenied: await deniedConnect({ path: canaries.unixSocket }),
        dbusDenied: await deniedConnect({ path: '/run/dbus/system_bus_socket' }),
        tcpDenied: await deniedConnect({ host: '127.0.0.1', port: canaries.tcpPort }),
        directInternetDenied: await deniedConnect({ host: '192.0.2.1', port: 443 }),
        environmentClean: ['LINUXCAST_PARENT_CANARY', 'NODE_OPTIONS', 'DBUS_SESSION_BUS_ADDRESS',
          'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'SSH_AUTH_SOCK'].every(key => process.env[key] === undefined),
        noHostRuntime: deniedFile('/run/user/1000/bus') && deniedFile('/dev/input/event0') && deniedFile('/dev/uinput'),
        privateHome: process.env.HOME === '/home/sandbox' && readdirSync('/home').join() === 'sandbox',
        packageReadOnly,
        privateData: readFileSync('/data/public.txt', 'utf8') === 'private fixture data',
        privateTemp: readFileSync('/tmp/public.txt', 'utf8') === 'private fixture temporary data',
        seccompEnforced: /^Seccomp:\s+2$/m.test(status),
        capabilitiesDropped: /^CapEff:\s+0+$/m.test(status) && /^CapAmb:\s+0+$/m.test(status),
        noNewPrivileges: /^NoNewPrivs:\s+1$/m.test(status),
        isolatedPid: process.pid < 10,
        minimalRuntime: readdirSync('/runtime').sort().join() === 'lib,node' && deniedFile('/usr/bin/sh'),
      };
      await call('fixture.report', checks);
      process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
    } else if (mode === 'oversized') {
      const header = Buffer.alloc(4); header.writeUInt32BE(1024 * 1024 + 1); process.stdout.write(header);
    } else if (mode === 'bad-json') {
      process.stdout.write(Buffer.from([0, 0, 0, 1, 123]));
    } else if (mode === 'truncated') {
      process.stdout.write(Buffer.from([0, 0, 0, 12, 123])); process.exit(0);
    } else if (mode === 'stale-session') {
      await call('fixture.read', {}, { sessionId: 'different-session' });
    } else if (mode === 'spoof-principal') {
      await call('fixture.read', {}, { packageId: 'builtin' });
    } else if (mode === 'unknown-method') {
      await call('files.read');
    } else if (mode === 'frame-flood') {
      for (let index = 0; index < 1000; index++) call('fixture.read');
    } else if (mode === 'stderr-flood') {
      function flood() {
        if (process.stderr.write(Buffer.alloc(65536, 120))) setImmediate(flood);
        else process.stderr.once('drain', flood);
      }
      flood();
    } else if (mode === 'descendants') {
      const descendant = spawn('/runtime/node', ['--no-addons', '--disable-sigusr1', '/package/extension.mjs', 'child-idle'], { detached: true, stdio: 'ignore' });
      descendant.on('error', () => process.exit(3));
      process.on('SIGTERM', () => {});
      await call('fixture.report', { detachedDescendantStarted: typeof descendant.pid === 'number' });
      setInterval(() => {}, 1000);
    } else if (mode === 'allocate') {
      const retained = [];
      function allocate() { retained.push(Buffer.alloc(8 * 1024 * 1024, 1)); setImmediate(allocate); }
      allocate();
    } else if (mode === 'threads') {
      const workers = [];
      let denied = false;
      try {
        for (let index = 0; index < 100; index++) workers.push(new Worker('setInterval(() => {}, 1000)', { eval: true }));
      } catch (error) { denied = ['ERR_WORKER_INIT_FAILED', 'EAGAIN'].includes(error.code); }
      await call('fixture.report', { threadCreationDenied: denied, workers: workers.length });
      for (const worker of workers) await worker.terminate();
      process.exit(denied ? 0 : 1);
    } else if (mode === 'cpu') {
      for (let index = 0; index < 3; index++) new Worker('while (true) {}', { eval: true });
      while (true) { /* bounded by independent CPU quota and command deadline */ }
    } else if (mode === 'crash') {
      process.exit(7);
    } else if (mode === 'idle') {
      setInterval(() => {}, 1000);
    } else {
      process.exit(4);
    }
  }
}
