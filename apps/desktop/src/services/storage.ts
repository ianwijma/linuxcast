import { utilityProcess } from 'electron';
import { join } from 'node:path';
import { createStorageClient } from '@linuxcast/storage';
import type { ResidentService } from '../main/lifecycle.ts';

/** A trusted main-owned child. No database path or generic repository API enters preload. */
export function startStorage(resourcesDirectory: string, dataDirectory: string, applicationBuild: string): ResidentService & { confirmLaunch(): void } {
  const child = utilityProcess.fork(join(resourcesDirectory, 'storage.cjs'), [], {
    serviceName: 'Linuxcast storage', stdio: 'ignore',
    // Storage does not inherit provider keys, loader injection or desktop bus handles.
    env: {},
  });
  let ended = false;
  let stopping = false;
  let ready = false;
  let launched = false;
  let confirmed = false;
  let resolveExit: () => void = () => {};
  const exit = new Promise<void>(resolve => { resolveExit = resolve; });
  const client = createStorageClient({
    send: value => child.postMessage(value),
    onMessage: listener => { child.on('message', listener); return () => child.removeListener('message', listener); },
  });
  // Backup/migration duration depends on data size; explicit Quit remains bounded.
  const confirm = () => {
    if (ready && launched && !confirmed && !stopping && !ended) {
      confirmed = true;
      child.postMessage({ kind: 'confirm-launch' });
    }
  };
  child.on('message', (value: unknown) => {
    if (!value || typeof value !== 'object' || !('kind' in value)) return;
    if (value.kind === 'ready' && 'protocolVersion' in value && value.protocolVersion === 1 &&
      'schemaVersion' in value && value.schemaVersion === 1) {
      ready = true; confirm();
    } else if (value.kind === 'unavailable') {
      console.error('STORAGE_UNAVAILABLE');
      client.disconnect(); child.kill();
    }
  });
  child.once('exit', () => {
    ended = true; client.disconnect(); resolveExit();
    if (!stopping) console.error('STORAGE_PROCESS_EXITED');
  });
  child.once('spawn', () => {
    if (stopping) child.postMessage({ kind: 'shutdown' });
    else child.postMessage({ kind: 'initialize', dataDirectory, applicationBuild,
      nativeBinding: join(resourcesDirectory, 'sqlite/better_sqlite3.node') });
  });
  return {
    confirmLaunch() { launched = true; confirm(); },
    async stop() {
      stopping = true; client.disconnect();
      if (!ended) child.postMessage({ kind: 'shutdown' });
      await exit;
    },
    async terminate() {
      stopping = true; client.disconnect();
      if (!ended && !child.kill()) throw new Error('Storage termination unavailable.');
      await exit;
    },
  };
}
