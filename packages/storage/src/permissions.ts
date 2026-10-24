import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { permissionDecisionRecordSchema, principalKeyMaterial, scopeKeyMaterial } from '@linuxcast/platform-contracts/permissions';
import type { DecisionRecord } from '@linuxcast/platform-contracts/permissions';
import { StorageError } from './errors.ts';
import { MAX_ENVELOPE_BYTES } from '../../contracts/src/index.ts';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const permissionPrincipalKey = (record: DecisionRecord) => digest(principalKeyMaterial(record.principal));
const keys = (record: DecisionRecord) => [permissionPrincipalKey(record), record.declarationHash, record.permissionId, digest(scopeKeyMaterial(record.scope))] as const;
const parse = (row: { record: string }) => permissionDecisionRecordSchema.parse(JSON.parse(row.record));

/** Only the trusted owner calls these methods after request-schema validation. */
export function listPermissionDecisions(db: Database.Database, params: { principalKey: string; afterId?: string; limit: number }) {
  const rows = db.prepare('SELECT record FROM permission_decisions WHERE principal_key=? AND id>? ORDER BY id LIMIT ?')
    .all(params.principalKey, params.afterId ?? '', params.limit + 1) as { record: string }[];
  const records: DecisionRecord[] = [];
  let bytes = 0;
  for (const row of rows.slice(0, params.limit)) {
    const record = parse(row), size = Buffer.byteLength(JSON.stringify(record)) + 1;
    if (bytes + size > MAX_ENVELOPE_BYTES - 8192) break;
    records.push(record); bytes += size;
  }
  if (rows.length && !records.length) throw new StorageError('invalid-request');
  return { records, nextCursor: rows.length > records.length ? records.at(-1)!.id : null };
}

export function putPermissionDecision(db: Database.Database, input: DecisionRecord): DecisionRecord {
  return db.transaction(() => {
    const record = permissionDecisionRecordSchema.parse(input);
    const key = keys(record);
    const currentRow = db.prepare('SELECT record FROM permission_decisions WHERE principal_key=? AND declaration_hash=? AND permission_id=? AND scope_key=?').get(...key) as {record:string}|undefined;
    const idRow = db.prepare('SELECT record FROM permission_decisions WHERE id=?').get(record.id) as {record:string}|undefined;
    if (idRow && JSON.stringify(keys(parse(idRow))) !== JSON.stringify(key)) throw new StorageError('conflict');
    const current = currentRow ? parse(currentRow) : undefined;
    if (current && (Date.parse(record.updatedAt) < Date.parse(current.updatedAt) ||
      (Date.parse(record.updatedAt) === Date.parse(current.updatedAt) && record.decision !== current.decision))) throw new StorageError('conflict');
    const stored = permissionDecisionRecordSchema.parse({ ...record,
      id: current?.id ?? record.id, createdAt: current?.createdAt ?? record.createdAt });
    db.prepare(`INSERT INTO permission_decisions(id,principal_key,declaration_hash,permission_id,scope_key,decision,created_at,updated_at,record)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(principal_key,declaration_hash,permission_id,scope_key)
      DO UPDATE SET decision=excluded.decision,updated_at=excluded.updated_at,record=excluded.record`)
      .run(stored.id, ...key, stored.decision, stored.createdAt, stored.updatedAt, JSON.stringify(stored));
    return stored;
  }).immediate();
}

export function revokePermissionDecision(db: Database.Database, id: string): boolean {
  return db.transaction(() => db.prepare('DELETE FROM permission_decisions WHERE id=?').run(id).changes !== 0).immediate();
}
