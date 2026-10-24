import { serveStorage } from './service.ts';
// Electron utilityProcess has parentPort; Node's IPC channel is used by the
// cross-process tests. Neither transport exposes a local query server.
type ParentPort = { postMessage(value: unknown): void; on(event: 'message', listener: (event: {data:unknown}) => void): void };
const parentPort = (process as NodeJS.Process & {parentPort?: ParentPort}).parentPort;
if (!parentPort && !process.send) throw new Error('Storage requires a parent-owned IPC channel.');
const service = serveStorage({
  send: value => {
    const closing = value !== null && typeof value === 'object' && 'kind' in value && value.kind === 'closed';
    if (parentPort) {
      parentPort.postMessage(value);
      if (closing) setImmediate(() => process.exit(0));
    } else process.send?.(value, () => { if (closing) process.exit(0); });
  },
  onMessage: listener => {
    if (parentPort) parentPort.on('message', event => listener(event.data));
    else process.on('message', listener);
  },
});
process.once('disconnect', () => { void service.close().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void service.close().finally(() => process.exit(0)); });
