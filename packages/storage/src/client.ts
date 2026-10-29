import {noteContentKey,noteWriteSchema} from '../../contracts/src/notes.ts';
import type {NoteRecord,NotesList} from '../../contracts/src/notes.ts';
import { createWorkflowDraft } from '../../workflows/src/registry.ts';
import { stableWorkflowJson } from './workflow-editor-json.ts';
import { STORAGE_REASONS } from './errors.ts';
import { quicklinkSaveSchema } from '../../contracts/src/quicklinks.ts';
import type { StorageReason } from './errors.ts';
import type { DataExportResult } from '@linuxcast/platform-contracts/data-controls';
import type { SecretReferenceRecord } from '@linuxcast/platform-contracts/secrets';
import { rootConfigSchema } from '@linuxcast/file-index/contracts';
import type { RootState, FileCandidate } from '@linuxcast/file-index/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { principalKeyMaterial, scopeKeyMaterial } from '@linuxcast/platform-contracts/permissions';
import type { DecisionRecord } from '@linuxcast/platform-contracts/permissions';
import { fileSearchOptionsSchema,fileSearchMatchesDirectory,fileSearchMatchesOptions } from '../../contracts/src/file-search.ts';
import { MAX_ENVELOPE_BYTES, parseRepositoryResponse } from '../../contracts/src/index.ts';
import { storageContracts } from './method-contracts.ts';
import type { StorageMethod, StorageMethods } from './repositories.ts';
export type { StorageMethod, StorageMethods, Setting, SettingId, CommandUsage, CommandVisibility } from './repositories.ts';
export interface ClientPort { send(value: unknown): void; onMessage(listener: (value: unknown) => void): () => void }
export class StorageRequestError extends Error {
  readonly effectOutcome: 'not-dispatched' | 'unknown';
  readonly automaticReplay = false;
  readonly reasonCode: StorageReason | undefined;
  constructor(effectOutcome: 'not-dispatched' | 'unknown', reason: string, reasonCode?: StorageReason) {
    super(reason); this.name = 'StorageRequestError'; this.effectOutcome = effectOutcome; this.reasonCode = reasonCode;
  }
}

function checkIdentity(method: string, params: Record<string, unknown>, result: unknown): void {
  if (result === null) return;
  const row = result as Record<string, unknown>;
  let valid = true;
  if(method==='notes.get')valid=row.id===params.id;
  else if(method==='notes.write'){const input=noteWriteSchema.parse(params),record=result as NoteRecord;valid=record.id===input.id&&record.revision===input.expectedRevision+1&&noteContentKey(record.draft)===noteContentKey(input.content)&&(input.action!=='save'||record.saved!==null&&noteContentKey(record.saved)===noteContentKey(input.content))&&(input.action!=='draft'||input.expectedRevision!==0||record.saved===null);}
  else if(method==='notes.list'){const page=result as NotesList,cursor=params.cursor as {updatedAt:string;id:string}|undefined;let before=cursor;valid=page.query===params.query&&page.records.every(value=>{const ordered=!before||value.updatedAt<before.updatedAt||value.updatedAt===before.updatedAt&&value.id<before.id;before={updatedAt:value.updatedAt,id:value.id};return ordered;})&&(page.nextCursor===null||page.records.length===100&&page.nextCursor.updatedAt===page.records.at(-1)!.updatedAt&&page.nextCursor.id===page.records.at(-1)!.id);}
  else if(method==='workflows.runs.put'||method==='workflows.steps.put')valid=stableWorkflowJson(row)===stableWorkflowJson(params.record);
  else if(method==='workflows.runs.recover')valid=true;
  else if(method==='workflows.editor.write')valid=row.revision===Number(params.expectedRevision)+1&&(params.action==='revert'||stableWorkflowJson(row.draft)===stableWorkflowJson(params.draft))&&(params.action!=='save'||stableWorkflowJson(row.saved)===stableWorkflowJson(params.draft))&&(params.action!=='revert'||stableWorkflowJson(row.draft)===stableWorkflowJson(row.saved??createWorkflowDraft()));
  else if(method==='quicklinks.get'||method==='quicklinks.remove')valid=row.id===params.id&&row.revision===params.revision;
  else if(method==='quicklinks.save'){
    const expected=quicklinkSaveSchema.parse(params);
    valid=(expected.id===undefined||row.id===expected.id)&&row.revision===expected.expectedRevision+1&&row.name===expected.name&&row.url===expected.url&&JSON.stringify(row.webSearch)===JSON.stringify(expected.webSearch)&&JSON.stringify(row.pathArgument)===JSON.stringify(expected.pathArgument)&&JSON.stringify(row.tags??[])===JSON.stringify(expected.tags??[])&&(row.pinned??false)===(expected.pinned??false)&&(row.hidden??false)===(expected.hidden??false);
  }
  else if(method==='rates.cache.get')valid=row.base===params.base&&row.quote===params.quote;
  else if(method==='rates.cache.put'){const expected=params.snapshot as Record<string,unknown>;valid=['provider','base','quote','rate','asOfDate','fetchedAt'].every(key=>row[key]===expected[key]);}
  else if (method === 'dataControls.clear') valid = row.category === params.category;
  else if (method === 'dataControls.export') {
    const exported = result as DataExportResult, ids = params.ids as string[] | undefined;
    valid = exported.category === params.category;
    if (exported.category === 'ai-conversations') {
      const selected = new Set(exported.conversations.map(record=>record.id));
      valid &&= selected.size === exported.conversations.length && exported.conversations.every(record=>!ids||ids.includes(record.id)) &&
        exported.messageRevisions.every(record=>selected.has(record.conversationId));
    } else {
      const identities = exported.category === 'settings' ? exported.records.map(record=>record.id) : exported.records.map(record=>record.commandId);
      valid &&= new Set(identities).size === identities.length && identities.every(id=>!ids||ids.includes(id));
    }
  } else if (method === 'secretRefs.get') valid = row.id === params.id;
  else if (method === 'secretRefs.put') {
    const expected = params.record as SecretReferenceRecord, actual = result as SecretReferenceRecord;
    valid = actual.id === expected.id && actual.ownerKind === expected.ownerKind && actual.ownerId === expected.ownerId &&
      actual.createdAt === expected.createdAt && actual.updatedAt === expected.updatedAt;
  } else if (method === 'secretRefs.list') {
    const page = result as {records: SecretReferenceRecord[]; nextCursor: string | null};
    valid = page.records.length <= Number(params.limit) && page.records.every((record, index) =>
      record.id > (index === 0 ? (params.afterId as string | undefined) ?? '' : page.records[index - 1]!.id)) &&
      (page.nextCursor === null || page.nextCursor === page.records.at(-1)?.id);
  } else if (method === 'files.roots.put') {
    valid = JSON.stringify(rootConfigSchema.parse((result as RootState).config)) === JSON.stringify(rootConfigSchema.parse(params.config));
  } else if (method === 'files.roots.list') {
    const roots = result as RootState[];
    valid = roots.every((root, index) => index === 0 || root.config.id > roots[index - 1]!.config.id);
  } else if (method === 'files.scan.finish') {
    const root = result as RootState;
    valid = root.config.id === params.rootId && root.generation === params.scanId;
  } else if (method === 'files.search') {
    const candidates = result as FileCandidate[],options=params.options===undefined?undefined:fileSearchOptionsSchema.parse(params.options);
    valid = candidates.length <= Number(params.limit) && candidates.every(candidate =>
      (params.rootId === undefined || candidate.rootId === params.rootId) && candidate.id === `${candidate.rootId}:${candidate.path}`&&fileSearchMatchesOptions(candidate,options)&&fileSearchMatchesDirectory(candidate,params.directory as string|undefined));
  } else if (method === 'permissions.list') {
    const page = result as {records: DecisionRecord[]; nextCursor: string | null};
    valid = page.records.every(record => createHash('sha256').update(principalKeyMaterial(record.principal)).digest('hex') === params.principalKey) &&
      page.records.length <= Number(params.limit) &&
      page.records.every((record, index) => record.id > (index === 0 ? (params.afterId as string | undefined) ?? '' : page.records[index - 1]!.id)) &&
      (page.nextCursor === null || page.nextCursor === page.records.at(-1)?.id);
  } else if (method === 'permissions.put') {
    const expected = params.record as DecisionRecord, actual = result as DecisionRecord;
    valid = principalKeyMaterial(actual.principal) === principalKeyMaterial(expected.principal) &&
      actual.declarationHash === expected.declarationHash && actual.permissionId === expected.permissionId &&
      scopeKeyMaterial(actual.scope) === scopeKeyMaterial(expected.scope) && actual.decision === expected.decision &&
      actual.updatedAt === expected.updatedAt;
  } else if (method.startsWith('settings.')) valid = row.id === params.id;
  else if (method === 'commands.setPinned') valid = row.commandId === params.commandId && row.pinned === params.pinned;
  else if (method === 'commands.setAlias') valid = row.commandId === params.commandId && row.alias === params.alias;
  else if (method === 'commands.setHidden') valid = row.commandId === params.commandId && row.hidden === params.hidden;
  else if (method === 'commands.listHidden') valid = true; // Sorted unique identities are checked by the result schema.
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
        response.outcome === 'cancelled' ? 'Storage request cancelled.' : response.failure.message,
        response.outcome === 'failed' && (STORAGE_REASONS as readonly unknown[]).includes(response.failure.details?.reasonCode)
          ? response.failure.details!.reasonCode as StorageReason : undefined));
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
