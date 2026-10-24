import { randomUUID } from 'node:crypto';
import { MAX_ENVELOPE_BYTES, parseRepositoryResponse } from '../../contracts/src/index.ts';
import { storageContracts } from './method-contracts.ts';
import type { StorageMethod, StorageMethods } from './repositories.ts';
export type { StorageMethod, StorageMethods, Setting, SettingId, CommandUsage } from './repositories.ts';
export interface ClientPort { send(value: unknown): void; onMessage(listener: (value: unknown) => void): () => void }
export class StorageRequestError extends Error {
  readonly effectOutcome: 'not-dispatched' | 'unknown';
  readonly automaticReplay = false;
  constructor(effectOutcome: 'not-dispatched' | 'unknown', reason: string) {
    super(reason); this.name = 'StorageRequestError'; this.effectOutcome = effectOutcome;
  }
}

function checkIdentity(method: string, params: Record<string, unknown>, result: unknown): void {
  if (result === null) return;
  const row = result as Record<string, unknown>;
  let valid = true;
  if (method.startsWith('settings.')) valid = row.id === params.id;
  else if (method.startsWith('commands.')) valid = row.commandId === params.commandId;
  else if (method === 'ai.conversations.get') valid = row.id === params.id;
  else if (method === 'ai.messages.list') valid = (result as {conversationId:string}[]).every(r => r.conversationId === params.conversationId);
  else if (method === 'ai.conversations.put' || method === 'ai.messages.appendRevision') {
    const expected = params.record as Record<string, unknown>;
    valid = row.id === expected.id && row.revision === expected.revision;
    if (method === 'ai.messages.appendRevision') valid &&= row.conversationId === expected.conversationId;
  }
  if (!valid) throw new Error('Mismatched storage result.');
}

/** Main-owned client. Do not expose this generic method dispatcher in preload. */
export function createStorageClient(port: ClientPort) {
  const pending = new Map<string, { method: string; params: Record<string, unknown>; resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }>();
  let closed = false;
  const unsubscribe = port.onMessage(value => {
    if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'response' || !('response' in value)) return;
    try {
      if (Buffer.byteLength(JSON.stringify(value)) > MAX_ENVELOPE_BYTES) throw new Error();
      if (!value.response || typeof value.response !== 'object' || !('requestId' in value.response) || typeof value.response.requestId !== 'string') throw new Error();
      const entry = pending.get(value.response.requestId);
      if (!entry) return;
      const response = parseRepositoryResponse(value.response, {requestId:value.response.requestId,method:entry.method}, storageContracts);
      if (response.outcome === 'completed') checkIdentity(entry.method, entry.params, response.result);
      pending.delete(response.requestId); entry.cleanup();
      if (response.outcome === 'completed') entry.resolve(response.result);
      else entry.reject(new StorageRequestError(response.outcome === 'cancelled' ? response.effectOutcome : 'not-dispatched',
        response.outcome === 'cancelled' ? 'Storage request cancelled.' : response.failure.message));
    } catch { disconnect(); }
  });
  function disconnect(): void {
    if (closed) return; closed = true; unsubscribe();
    for (const entry of pending.values()) { entry.cleanup(); entry.reject(new StorageRequestError('unknown', 'Storage connection interrupted; review before retrying.')); }
    pending.clear();
  }
  function request<M extends StorageMethod>(method: M, params: StorageMethods[M]['params'], options: {signal?: AbortSignal; timeoutMs?: number} = {}): Promise<StorageMethods[M]['result']> {
    if (closed || options.signal?.aborted) return Promise.reject(new StorageRequestError('not-dispatched', 'Storage request unavailable.'));
    const timeout = options.timeoutMs ?? 5000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000 || pending.size >= 256) return Promise.reject(new StorageRequestError('not-dispatched', 'Storage request unavailable.'));
    const requestId = randomUUID();
    const envelope = { kind: 'request', request: { schemaVersion: 1, requestId, method, params }, deadline: Date.now() + timeout };
    try { if (Buffer.byteLength(JSON.stringify(envelope)) > MAX_ENVELOPE_BYTES) throw new Error(); }
    catch { return Promise.reject(new StorageRequestError('not-dispatched', 'Storage request is too large.')); }
    return new Promise((resolve, reject) => {
      const cancel = () => { try { port.send({ kind: 'cancel', requestId }); } catch { disconnect(); } };
      const timer = setTimeout(() => {
        const entry = pending.get(requestId);
        if (!entry) return;
        pending.delete(requestId); entry.cleanup(); cancel();
        reject(new StorageRequestError('unknown', 'Storage response timed out; review before retrying.'));
      }, timeout);
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); };
      pending.set(requestId, { method, params: JSON.parse(JSON.stringify(params)) as Record<string, unknown>, resolve: value => resolve(value as StorageMethods[M]['result']), reject, cleanup });
      options.signal?.addEventListener('abort', cancel, {once: true});
      try { port.send(envelope); } catch { disconnect(); }
    });
  }
  return { request, disconnect };
}
