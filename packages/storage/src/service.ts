import { MAX_ENVELOPE_BYTES, parseContract, repositoryRequestSchema } from '../../contracts/src/index.ts';
import { StorageOwner } from './owner.ts';
import { STORAGE_METHODS } from './repositories.ts';
import { StorageError } from './errors.ts';
export interface StoragePort { send(value: unknown): void; onMessage(listener: (value: unknown) => void): void }
/** The only port is transferred by trusted main. It is not exposed to renderers,
 * extensions, sockets or provider callbacks. Broker authorization stays in main. */
export function serveStorage(port: StoragePort): { close(): Promise<void> } {
  let owner: StorageOwner | undefined;
  let opening: Promise<StorageOwner> | undefined;
  let closing: Promise<void> | undefined;
  let initialized = false;
  let closed = false;
  let processing = false;
  const queue: {request: ReturnType<typeof repositoryRequestSchema.parse>; deadline: number}[] = [];
  const cancelled = new Set<string>();
  const seen = new Set<string>();
  function fail(reason: string, snapshotId?: string): void { port.send({ kind: 'unavailable', reasonCode: reason, ...(snapshotId ? {snapshotId} : {}) }); }
  function terminal(request: { requestId:string;method:string }, extra: object): void {
    port.send({ kind: 'response', response: { schemaVersion: 1, requestId: request.requestId, method: request.method, ...extra } });
  }
  function drain(): void {
    if (processing || closed) return;
    processing = true;
    setImmediate(() => {
      try {
        const next = queue.shift();
        if (!next || !owner || closed) return;
        const { request, deadline } = next;
        if (cancelled.delete(request.requestId)) {
          terminal(request, { outcome: 'cancelled', effectOutcome: 'not-dispatched', automaticReplay: false, requiresReview: false });
        } else if (Date.now() >= deadline) {
          terminal(request, { outcome: 'failed', failure: { code: 'deadline-exceeded', message: 'Storage request expired.', retryable: false } });
        } else {
          try { terminal(request, { outcome: 'completed', result: owner.request(request).result }); }
          catch (error) {
            const reason = error instanceof StorageError ? error.reason : 'storage-unavailable';
            terminal(request, { outcome: 'failed', failure: { code: reason === 'conflict' ? 'conflict' : 'invalid-request',
              message: 'Storage request could not be completed.', retryable: false, details: { reasonCode: reason } } });
          }
        }
      } finally { processing = false; if (queue.length) drain(); }
    });
  }
  port.onMessage(value => {
    void (async () => {
      if (closed) return;
      let envelope: Record<string, unknown>;
      try {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value)) > MAX_ENVELOPE_BYTES) throw new Error();
        envelope = value as Record<string, unknown>;
      } catch { fail('invalid-request'); return; }
      if (envelope.kind === 'shutdown') { await close(); port.send({ kind: 'closed' }); return; }
      if (envelope.kind === 'initialize') {
        if (initialized) { fail('already-initialized'); return; }
        initialized = true;
        if (Object.keys(envelope).some(k => !['kind', 'dataDirectory', 'applicationBuild', 'retryFailedMigration', 'nativeBinding'].includes(k)) ||
          typeof envelope.dataDirectory !== 'string' || typeof envelope.applicationBuild !== 'string' ||
          (envelope.retryFailedMigration !== undefined && typeof envelope.retryFailedMigration !== 'boolean') ||
          (envelope.nativeBinding !== undefined && typeof envelope.nativeBinding !== 'string')) { fail('invalid-request'); return; }
        try {
          opening = StorageOwner.open({ dataDirectory: envelope.dataDirectory, applicationBuild: envelope.applicationBuild,
            retryFailedMigration: envelope.retryFailedMigration === true,
            ...(typeof envelope.nativeBinding === 'string' ? {nativeBinding:envelope.nativeBinding} : {}) });
          owner = await opening;
          if (closed) { await owner.close(); return; }
          port.send({ kind: 'ready', protocolVersion: 1, schemaVersion: owner.version, sqliteVersion: owner.sqliteVersion,
            ownerPid: process.pid, supportedMethods: STORAGE_METHODS });
        } catch (error) { fail(error instanceof StorageError ? error.reason : 'storage-unavailable', error instanceof StorageError ? error.snapshotId : undefined); }
        return;
      }
      if (!owner) { fail('not-initialized'); return; }
      if (envelope.kind === 'confirm-launch') {
        try { await owner.confirmSuccessfulLaunch(); port.send({ kind: 'launch-confirmed' }); }
        catch { fail('recovery-required'); }
        return;
      }
      if (envelope.kind === 'cancel' && typeof envelope.requestId === 'string') {
        if (queue.some(q => q.request.requestId === envelope.requestId)) cancelled.add(envelope.requestId);
        return;
      }
      try {
        if (envelope.kind !== 'request' || Object.keys(envelope).some(k => !['kind', 'request', 'deadline'].includes(k))) throw new Error();
        const request = parseContract(repositoryRequestSchema, envelope.request);
        if (request.requestId.length > 128 || request.method.length > 128) throw new Error();
        if (typeof envelope.deadline !== 'number' || !Number.isSafeInteger(envelope.deadline)) throw new Error();
        if (seen.has(request.requestId)) return; // Never replay a completed or pending write.
        if (seen.size >= 100_000 || queue.length >= 256) {
          terminal(request, { outcome: 'failed', failure: { code: 'capability-unavailable', message: 'Storage connection is full; reconnect.', retryable: false } });
          return;
        }
        seen.add(request.requestId);
        queue.push({ request, deadline: envelope.deadline }); drain();
      } catch { fail('invalid-request'); }
    })().catch(() => fail('storage-unavailable'));
  });
  function close(): Promise<void> {
    if (closing) return closing;
    closed = true;
    for (const item of queue.splice(0)) terminal(item.request, { outcome: 'cancelled', effectOutcome: 'not-dispatched', automaticReplay: false, requiresReview: false });
    closing = (async () => {
      const opened = owner ?? await opening?.catch(() => undefined);
      await opened?.close();
    })();
    return closing;
  }
  return { close };
}
