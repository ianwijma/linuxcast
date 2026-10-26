import { loadWorkflowEditor, writeWorkflowEditor } from './workflow-editor.ts';
import type { WorkflowEditorWrite, WorkflowEditorRecord } from '../../contracts/src/workflow-editor.ts';
import { clearLocalData, exportLocalData } from './data-controls.ts';
import type { DataClearParams, DataClearResult, DataExportParams, DataExportResult } from '@linuxcast/platform-contracts/data-controls';
import { getSecretReference, putSecretReference, listSecretReferences } from './secrets.ts';
import type { SecretReferenceRecord } from '@linuxcast/platform-contracts/secrets';
import { FILE_INDEX_METHODS } from '@linuxcast/file-index/contracts';
import type { FileIndexMethod, FileIndexMethods } from '@linuxcast/file-index/contracts';
import { dispatchFileIndex, FileIndexRepositoryError } from '@linuxcast/file-index/repository';
import type Database from 'better-sqlite3';
import { dispatchQuicklinks,QuicklinkRepositoryError } from '@linuxcast/quicklinks/repository';
import { QUICKLINK_STORAGE_METHODS } from '../../contracts/src/quicklinks.ts';
import type { QuicklinkStorageMethod,QuicklinkStorageMethods } from '../../contracts/src/quicklinks.ts';
import type { DecisionRecord } from '@linuxcast/platform-contracts/permissions';
import { listPermissionDecisions, putPermissionDecision, revokePermissionDecision } from './permissions.ts';
import { conversationRecordSchema, messageRevisionRecordSchema, parseContract, parseRepositoryRequest,
  MAX_ENVELOPE_BYTES, uiTextSchema } from '../../contracts/src/index.ts';
import type { MessageRevisionRecord } from '../../contracts/src/index.ts';
import { storageContracts } from './method-contracts.ts';
import { StorageError } from './errors.ts';

type Conversation = ReturnType<typeof conversationRecordSchema.parse>;
export type SettingId = 'ui.theme' | 'launcher.shortcut' | 'onboarding.completed' | 'clipboard.historyEnabled';
export interface Setting { id: SettingId; revision: number; value: string | boolean; modifiedAt: string }
export interface CommandUsage { commandId: string; useCount: number; lastUsedAt: string | null; pinned: boolean; alias: string | null }
export interface CommandVisibility { commandId: string; hidden: boolean }
export interface StorageMethods extends FileIndexMethods,QuicklinkStorageMethods {
  'workflows.editor.get': {params: Record<string,never>; result: WorkflowEditorRecord|null};
  'workflows.editor.write': {params: WorkflowEditorWrite; result: WorkflowEditorRecord};
  'dataControls.clear': {params: DataClearParams; result: DataClearResult};
  'dataControls.export': {params: DataExportParams; result: DataExportResult};
  'secretRefs.get': {params: {id: string}; result: SecretReferenceRecord | null};
  'secretRefs.put': {params: {record: SecretReferenceRecord}; result: SecretReferenceRecord};
  'secretRefs.delete': {params: {id: string}; result: boolean};
  'secretRefs.list': {params: {afterId?: string; limit: number}; result: {records: SecretReferenceRecord[]; nextCursor: string | null}};
  'permissions.list': { params: {principalKey: string; afterId?: string; limit: number}; result: {records: DecisionRecord[]; nextCursor: string | null} };
  'permissions.put': { params: {record: DecisionRecord}; result: DecisionRecord };
  'permissions.revoke': { params: {id: string}; result: boolean };
  'settings.get': { params: {id: SettingId}; result: Setting | null };
  'settings.set': { params: {id: SettingId; expectedRevision: number; value: string | boolean}; result: Setting };
  'commands.setPinned': { params: {commandId: string; pinned: boolean}; result: CommandUsage };
  'commands.setAlias': { params: {commandId: string; alias: string | null}; result: CommandUsage };
  'commands.recordUse': { params: {commandId: string}; result: CommandUsage };
  'commands.getUsage': { params: {commandId: string}; result: CommandUsage | null };
  'commands.listHidden': { params: Record<string, never>; result: string[] };
  'commands.setHidden': { params: CommandVisibility; result: CommandVisibility };
  'ai.conversations.get': { params: {id: string}; result: Conversation | null };
  'ai.conversations.put': { params: {record: Conversation; expectedRevision: number}; result: Conversation };
  'ai.messages.appendRevision': { params: {record: MessageRevisionRecord}; result: MessageRevisionRecord };
  'ai.messages.list': { params: {conversationId: string; afterId?: string; limit: number}; result: MessageRevisionRecord[] };
}
export type StorageMethod = keyof StorageMethods;
export const STORAGE_METHODS: readonly StorageMethod[] = [...FILE_INDEX_METHODS,...QUICKLINK_STORAGE_METHODS, 'workflows.editor.get', 'workflows.editor.write', 'dataControls.clear', 'dataControls.export', 'secretRefs.get', 'secretRefs.put', 'secretRefs.delete', 'secretRefs.list', 'permissions.list', 'permissions.put', 'permissions.revoke', 'settings.get', 'settings.set', 'commands.recordUse', 'commands.getUsage', 'commands.setPinned', 'commands.setAlias', 'commands.listHidden', 'commands.setHidden',
  'ai.conversations.get', 'ai.conversations.put', 'ai.messages.appendRevision', 'ai.messages.list'];
function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StorageError('invalid-request');
  if (Object.keys(value).some(k => !required.includes(k) && !optional.includes(k)) || required.some(k => !Object.hasOwn(value, k))) {
    throw new StorageError('invalid-request');
  }
  return value as Record<string, unknown>;
}
function identifier(value: unknown, uuid = false): string {
  if (typeof value !== 'string' || !(uuid ? /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu : /^[a-z][a-z0-9._:-]{0,199}$/u).test(value)) {
    throw new StorageError('invalid-request');
  }
  return value;
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new StorageError('invalid-request');
  return value;
}
function settingId(value: unknown): SettingId {
  if (typeof value !== 'string' || !['ui.theme', 'launcher.shortcut', 'onboarding.completed', 'clipboard.historyEnabled'].includes(value)) throw new StorageError('invalid-request');
  return value as SettingId;
}
function settingValue(id: SettingId, value: unknown): string | boolean {
  if (id === 'ui.theme' && typeof value === 'string' && ['system', 'dark', 'light'].includes(value)) return value as string;
  if (id === 'launcher.shortcut' && typeof value === 'string' && value.length <= 100 && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return value;
  if ((id === 'onboarding.completed' || id === 'clipboard.historyEnabled') && typeof value === 'boolean') return value;
  throw new StorageError('invalid-request');
}
export function transaction<T>(db: Database.Database, operation: () => T): T {
  return db.transaction(operation).immediate();
}
export class Repositories {
  private readonly db: Database.Database;
  constructor(db: Database.Database) { this.db = db; }
  dispatch(value: unknown): { requestId: string; method: StorageMethod; result: unknown } {
    const request = parseRepositoryRequest(value, storageContracts);
    if (request.requestId.length > 128 || request.method.length > 128 || Buffer.byteLength(JSON.stringify(request)) > MAX_ENVELOPE_BYTES - 4096 || !STORAGE_METHODS.includes(request.method as StorageMethod)) {
      throw new StorageError('invalid-request');
    }
    const method = request.method as StorageMethod;
    const result = transaction(this.db, () => {
      const value = parseContract(storageContracts.get(method)!.result, this.execute(method, request.params));
      if (Buffer.byteLength(JSON.stringify(value)) > MAX_ENVELOPE_BYTES - 4096) throw new StorageError('invalid-request');
      return value;
    });
    return { requestId: request.requestId, method, result };
  }
  private execute(method: StorageMethod, input: unknown): unknown {
    const db = this.db;
    if((QUICKLINK_STORAGE_METHODS as readonly string[]).includes(method)){
      try{return dispatchQuicklinks(db,method as QuicklinkStorageMethod,input);}
      catch(error){if(error instanceof QuicklinkRepositoryError)throw new StorageError(error.reason);throw error;}
    }
    if ((FILE_INDEX_METHODS as readonly string[]).includes(method)) {
      try { return dispatchFileIndex(db, method as FileIndexMethod, input); }
      catch (error) { if (error instanceof FileIndexRepositoryError) throw new StorageError('conflict'); throw error; }
    }
    switch (method) {
      case 'workflows.editor.get': return loadWorkflowEditor(db);
      case 'workflows.editor.write': return writeWorkflowEditor(db,input);
      case 'dataControls.clear': return clearLocalData(db, input as DataClearParams);
      case 'dataControls.export': return exportLocalData(db, input as DataExportParams);
      case 'secretRefs.get': return getSecretReference(db, (input as StorageMethods['secretRefs.get']['params']).id);
      case 'secretRefs.put': return putSecretReference(db, (input as StorageMethods['secretRefs.put']['params']).record);
      case 'secretRefs.delete': return db.prepare('DELETE FROM secret_references WHERE id=?').run((input as StorageMethods['secretRefs.delete']['params']).id).changes !== 0;
      case 'secretRefs.list': return listSecretReferences(db, input as StorageMethods['secretRefs.list']['params']);
      case 'permissions.list': return listPermissionDecisions(db, input as StorageMethods['permissions.list']['params']);
      case 'permissions.put': return putPermissionDecision(db, (input as StorageMethods['permissions.put']['params']).record);
      case 'permissions.revoke': return revokePermissionDecision(db, (input as StorageMethods['permissions.revoke']['params']).id);
      case 'settings.get': {
        const p = object(input, ['id']); return this.getSetting(settingId(p.id));
      }
      case 'settings.set': {
        const p = object(input, ['id', 'value', 'expectedRevision']);
        const id = settingId(p.id); const value = settingValue(id, p.value); const expected = revision(p.expectedRevision);
        return transaction(db, () => {
          const current = this.getSetting(id);
          if ((current?.revision ?? 0) !== expected) throw new StorageError('conflict');
          const record: Setting = { id, value, revision: expected + 1, modifiedAt: new Date().toISOString() };
          db.prepare('INSERT INTO settings(id,revision,value,modified_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,value=excluded.value,modified_at=excluded.modified_at')
            .run(id, record.revision, JSON.stringify(value), record.modifiedAt);
          return record;
        });
      }
      case 'commands.getUsage': {
        const p = object(input, ['commandId']); return this.getUsage(identifier(p.commandId));
      }
      case 'commands.listHidden': return (db.prepare('SELECT command_id FROM command_visibility ORDER BY command_id').all() as {command_id:string}[]).map(row => row.command_id);
      case 'commands.setHidden': {
        const {commandId,hidden}=input as CommandVisibility;
        if(hidden){
          const exists=db.prepare('SELECT 1 FROM command_visibility WHERE command_id=?').get(commandId);
          const {count}=db.prepare('SELECT count(*) AS count FROM command_visibility').get() as {count:number};
          if(!exists && count>=4102)throw new StorageError('conflict');
          db.prepare('INSERT OR IGNORE INTO command_visibility(command_id) VALUES(?)').run(commandId);
        }else db.prepare('DELETE FROM command_visibility WHERE command_id=?').run(commandId);
        return {commandId,hidden};
      }
      case 'commands.setPinned': {
        const p = object(input, ['commandId', 'pinned']); const commandId = identifier(p.commandId);
        if (typeof p.pinned !== 'boolean') throw new StorageError('invalid-request');
        db.prepare('INSERT INTO command_usage(command_id,use_count,last_used_at,pinned,alias) VALUES(?,0,NULL,?,NULL) ON CONFLICT(command_id) DO UPDATE SET pinned=excluded.pinned')
          .run(commandId, Number(p.pinned));
        return this.getUsage(commandId);
      }
      case 'commands.setAlias': {
        // The full schema is validated before dispatch; update only alias atomically.
        const {commandId,alias}=input as StorageMethods['commands.setAlias']['params'];
        db.prepare('INSERT INTO command_usage(command_id,use_count,last_used_at,pinned,alias) VALUES(?,0,NULL,0,?) ON CONFLICT(command_id) DO UPDATE SET alias=excluded.alias')
          .run(commandId,alias);
        return this.getUsage(commandId);
      }
      case 'commands.recordUse': {
        const p = object(input, ['commandId']); const commandId = identifier(p.commandId);
        return transaction(db, () => {
          db.prepare('INSERT INTO command_usage(command_id,use_count,last_used_at,pinned,alias) VALUES(?,1,?,0,NULL) ON CONFLICT(command_id) DO UPDATE SET use_count=use_count+1,last_used_at=excluded.last_used_at')
            .run(commandId, new Date().toISOString());
          return this.getUsage(commandId);
        });
      }
      case 'ai.conversations.get': {
        const p = object(input, ['id']); return this.getConversation(identifier(p.id, true));
      }
      case 'ai.conversations.put': {
        const p = object(input, ['record', 'expectedRevision']); const record = parseContract(conversationRecordSchema, p.record);
        const expected = revision(p.expectedRevision);
        if (record.revision !== expected + 1 || Date.parse(record.modifiedAt) < Date.parse(record.createdAt)) throw new StorageError('invalid-request');
        return transaction(db, () => {
          const current = this.getConversation(record.id);
          if ((current?.revision ?? 0) !== expected || (current && (current.createdAt !== record.createdAt || Date.parse(current.modifiedAt) > Date.parse(record.modifiedAt)))) {
            throw new StorageError('conflict');
          }
          db.prepare('INSERT INTO conversations(id,revision,project_id,created_at,modified_at,record) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,project_id=excluded.project_id,modified_at=excluded.modified_at,record=excluded.record')
            .run(record.id, record.revision, record.projectId, record.createdAt, record.modifiedAt, JSON.stringify(record));
          return record;
        });
      }
      case 'ai.messages.appendRevision': {
        const p = object(input, ['record']); const record = parseContract(messageRevisionRecordSchema, p.record);
        if (Date.parse(record.modifiedAt) < Date.parse(record.createdAt)) throw new StorageError('invalid-request');
        return transaction(db, () => {
          if (!this.getConversation(record.conversationId)) throw new StorageError('conflict');
          if (db.prepare('SELECT id FROM message_revisions WHERE id=?').get(record.id)) throw new StorageError('conflict');
          const lineage = db.prepare('SELECT conversation_id FROM message_revisions WHERE message_id=? LIMIT 1').get(record.messageId) as {conversation_id:string}|undefined;
          if (lineage && lineage.conversation_id !== record.conversationId) throw new StorageError('conflict');
          const branch = db.prepare('SELECT conversation_id FROM message_revisions WHERE branch_id=? LIMIT 1').get(record.branchId) as {conversation_id:string}|undefined;
          if (branch && branch.conversation_id !== record.conversationId) throw new StorageError('conflict');
          const latest = db.prepare('SELECT max(revision) AS revision FROM message_revisions WHERE message_id=? AND branch_id=?')
            .get(record.messageId, record.branchId) as {revision:number|null};
          if (record.revision !== (latest.revision ?? 0) + 1) throw new StorageError('conflict');
          if (record.parentRevisionId) {
            const parent = db.prepare('SELECT conversation_id FROM message_revisions WHERE id=?').get(record.parentRevisionId) as {conversation_id:string}|undefined;
            if (!parent || parent.conversation_id !== record.conversationId) throw new StorageError('conflict');
          } else if (record.revision > 1) throw new StorageError('conflict');
          const next = db.prepare('SELECT coalesce(max(sequence),0)+1 AS sequence FROM message_revisions WHERE conversation_id=?').get(record.conversationId) as {sequence:number};
          db.prepare('INSERT INTO message_revisions(id,conversation_id,message_id,sequence,branch_id,revision,parent_revision_id,created_at,record) VALUES(?,?,?,?,?,?,?,?,?)')
            .run(record.id, record.conversationId, record.messageId, next.sequence, record.branchId, record.revision, record.parentRevisionId, record.createdAt, JSON.stringify(record));
          return record;
        });
      }
      case 'ai.messages.list': {
        const p = object(input, ['conversationId', 'limit'], ['afterId']); const id = identifier(p.conversationId, true);
        if (!Number.isInteger(p.limit) || Number(p.limit) < 1 || Number(p.limit) > 100) throw new StorageError('invalid-request');
        const cursor = p.afterId === undefined ? '' : identifier(p.afterId, true);
        const anchor = cursor ? db.prepare('SELECT sequence FROM message_revisions WHERE conversation_id=? AND id=?').get(id, cursor) as {sequence:number}|undefined : undefined;
        if (cursor && !anchor) throw new StorageError('conflict');
        // Opaque UUID cursor resolves to an owner-assigned insertion sequence.
        const rows = db.prepare('SELECT record FROM message_revisions WHERE conversation_id=? AND sequence>? ORDER BY sequence LIMIT ?')
          .all(id, anchor?.sequence ?? 0, Number(p.limit)) as {record:string}[];
        const result = rows.map(r => parseContract(messageRevisionRecordSchema, JSON.parse(r.record)));
        if (Buffer.byteLength(JSON.stringify(result)) > MAX_ENVELOPE_BYTES - 4096) throw new StorageError('invalid-request');
        return result;
      }
    }
  }
  private getSetting(id: SettingId): Setting | null {
    const row = this.db.prepare('SELECT revision,value,modified_at FROM settings WHERE id=?').get(id) as {revision:number;value:string;modified_at:string}|undefined;
    return row ? { id, revision: row.revision, value: settingValue(id, JSON.parse(row.value)), modifiedAt: row.modified_at } : null;
  }
  private getUsage(commandId: string): CommandUsage | null {
    const row = this.db.prepare('SELECT use_count,last_used_at,pinned,alias FROM command_usage WHERE command_id=?').get(commandId) as
      {use_count:number;last_used_at:string|null;pinned:number;alias:string|null}|undefined;
    return row ? { commandId, useCount: row.use_count, lastUsedAt: row.last_used_at, pinned: row.pinned === 1,
      alias: row.alias === null ? null : parseContract(uiTextSchema, row.alias) } : null;
  }
  private getConversation(id: string): Conversation | null {
    const row = this.db.prepare('SELECT record FROM conversations WHERE id=?').get(id) as {record:string}|undefined;
    return row ? parseContract(conversationRecordSchema, JSON.parse(row.record)) : null;
  }
}
