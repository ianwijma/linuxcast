import type Database from 'better-sqlite3';
import { secretReferenceSchema } from '@linuxcast/platform-contracts/secrets';
import type { SecretReferenceRecord } from '@linuxcast/platform-contracts/secrets';
import { StorageError } from './errors.ts';
const columns = 'id,owner_kind AS ownerKind,owner_id AS ownerId,created_at AS createdAt,updated_at AS updatedAt';
export function getSecretReference(db: Database.Database, id: string): SecretReferenceRecord | null {
  const row = db.prepare(`SELECT ${columns} FROM secret_references WHERE id=?`).get(id);
  return row ? secretReferenceSchema.parse(row) : null;
}
export function putSecretReference(db: Database.Database, input: SecretReferenceRecord): SecretReferenceRecord {
  const record = secretReferenceSchema.parse(input), prior = getSecretReference(db, record.id);
  if (prior && (prior.ownerKind !== record.ownerKind || prior.ownerId !== record.ownerId ||
    prior.createdAt !== record.createdAt || Date.parse(record.updatedAt) < Date.parse(prior.updatedAt))) throw new StorageError('conflict');
  db.prepare(`INSERT INTO secret_references(id,owner_kind,owner_id,created_at,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`)
    .run(record.id, record.ownerKind, record.ownerId, record.createdAt, record.updatedAt);
  return record;
}
export function listSecretReferences(db: Database.Database, params: {afterId?: string; limit: number}) {
  const rows = db.prepare(`SELECT ${columns} FROM secret_references WHERE id>? ORDER BY id LIMIT ?`)
    .all(params.afterId ?? '', params.limit + 1).map(row => secretReferenceSchema.parse(row));
  const records = rows.slice(0, params.limit);
  return {records, nextCursor: rows.length > params.limit ? records.at(-1)!.id : null};
}
