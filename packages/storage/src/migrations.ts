import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, open, rename, statfs, unlink, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { StorageError } from './errors.ts';
import { privateDirectory, privateFile } from './paths.ts';

export interface Migration { version: number; sql: string }
export interface RecoveryJournal {
  recordVersion: 1; id: string; fromVersion: number; toVersion: number;
  state: 'prepared' | 'migrating' | 'failed' | 'awaiting-confirmation' | 'confirmed';
  sha256: string; createdAt: string;
}
export async function foundationMigrations(): Promise<Migration[]> {
  return [{ version: 1, sql: await readFile(new URL('./migrations/001-foundation.sql', import.meta.url), 'utf8') }];
}
const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
async function fileDigest(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function flushDirectory(path: string): Promise<void> {
  const file = await open(path, 'r');
  try { await file.sync(); } finally { await file.close(); }
}
async function writeJournal(directory: string, journal: RecoveryJournal): Promise<void> {
  const temporary = join(directory, `${journal.id}.${randomUUID()}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(journal)); await file.sync(); } finally { await file.close(); }
  await rename(temporary, join(directory, `${journal.id}.json`));
  await flushDirectory(directory);
}
async function journals(directory: string): Promise<RecoveryJournal[]> {
  const results: RecoveryJournal[] = [];
  for (const name of await readdir(directory)) {
    if (!/^[0-9a-f-]{36}\.json$/u.test(name)) continue;
    await privateFile(join(directory, name));
    try {
      if ((await lstat(join(directory, name))).size > 4096) throw new Error();
      const text = await readFile(join(directory, name), 'utf8');
      if (Buffer.byteLength(text) > 4096) throw new Error();
      const data: unknown = JSON.parse(text);
      const j = data as RecoveryJournal;
      if (!j || j.recordVersion !== 1 || `${j.id}.json` !== name ||
        !Number.isSafeInteger(j.fromVersion) || !Number.isSafeInteger(j.toVersion) || j.fromVersion < 0 || j.toVersion <= j.fromVersion ||
        !['prepared', 'migrating', 'failed', 'awaiting-confirmation', 'confirmed'].includes(j.state) ||
        !/^[0-9a-f]{64}$/u.test(j.sha256) || !Number.isFinite(Date.parse(j.createdAt))) throw new Error();
      results.push(j);
    } catch { throw new StorageError('recovery-required'); }
  }
  return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function schemaVersion(db: Database.Database): number {
  const version: unknown = db.pragma('user_version', { simple: true });
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) throw new StorageError('corrupt-database');
  return version;
}
export function validateDatabase(db: Database.Database, version: number): void {
  if (db.pragma('quick_check', { simple: true }) !== 'ok' || (db.pragma('foreign_key_check') as unknown[]).length !== 0) {
    throw new StorageError('corrupt-database');
  }
  if (version > 0) {
    const row = db.prepare('SELECT schema_version, record_version FROM storage_metadata WHERE singleton=1').get() as
      { schema_version: number; record_version: number } | undefined;
    if (!row || row.schema_version !== version || row.record_version !== 1) throw new StorageError('corrupt-database');
  } else if ((db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get() as {count:number}).count !== 0) {
    throw new StorageError('corrupt-database');
  }
}
function validateMigrations(migrations: readonly Migration[]): void {
  if (!migrations.length || migrations.some((m, i) => m.version !== i + 1 || !m.sql.trim() ||
    /(?:^|;)\s*(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|VACUUM|ATTACH|DETACH|PRAGMA)\b/iu.test(m.sql.replace(/--[^\n]*/gu, '')))) {
    // Only reviewed transactional SQL migrations. Nontransactional migrations
    // need their own reviewed recovery design, never an implicit escape hatch.
    throw new StorageError('invalid-migration');
  }
}
export async function migrate(db: Database.Database, directory: string, build: string,
  migrations: readonly Migration[], retryFailedMigration = false): Promise<RecoveryJournal | undefined> {
  validateMigrations(migrations);
  const version = schemaVersion(db);
  if (version > migrations.length) throw new StorageError('newer-schema');
  validateDatabase(db, version);
  if (version > 0) {
    const applied = db.prepare('SELECT version, checksum FROM schema_migrations ORDER BY version').all() as { version:number;checksum:string }[];
    if (applied.length !== version || applied.some((m, i) => m.version !== i + 1 || m.checksum !== digest(migrations[i]!.sql))) {
      throw new StorageError('invalid-migration');
    }
  }
  const backupDirectory = await privateDirectory(join(directory, 'backups'));
  let pending: RecoveryJournal | undefined;
  for (const journal of await journals(backupDirectory)) {
    if (journal.state === 'confirmed' || (journal.state === 'failed' && version >= journal.toVersion)) continue;
    const snapshotPath = join(backupDirectory, `${journal.id}.db`);
    await privateFile(snapshotPath);
    if (await fileDigest(snapshotPath) !== journal.sha256) throw new StorageError('recovery-required', journal.id);
    if (journal.state === 'awaiting-confirmation' ||
      ((journal.state === 'prepared' || journal.state === 'migrating') && version === journal.toVersion)) {
      if (version < journal.toVersion) throw new StorageError('recovery-required', journal.id);
      journal.state = 'awaiting-confirmation';
      await writeJournal(backupDirectory, journal);
      pending = journal;
    } else if (version === journal.fromVersion && retryFailedMigration) {
      // Explicit retry keeps the previous compatible snapshot; the new attempt
      // gets a separate journal. Mark the old attempt failed, never prune it.
      journal.state = 'failed';
      await writeJournal(backupDirectory, journal);
    } else {
      throw new StorageError('recovery-required', journal.id);
    }
  }
  if (version === migrations.length) return pending;
  const pages = db.pragma('page_count', { simple: true }) as number;
  const pageSize = db.pragma('page_size', { simple: true }) as number;
  const free = await statfs(directory, { bigint: true });
  if (free.bavail * free.bsize < BigInt(Math.max(pages * pageSize * 2, 1024 * 1024))) {
    throw new StorageError('insufficient-space');
  }
  const id = randomUUID();
  const snapshot = join(backupDirectory, `${id}.db`);
  const journal: RecoveryJournal = { recordVersion: 1, id, fromVersion: version, toVersion: migrations.length,
    state: 'prepared', sha256: '', createdAt: new Date().toISOString() };
  try {
    await privateFile(snapshot, true);
    // better-sqlite3's SQLite online backup API includes committed WAL pages.
    await db.backup(snapshot);
    const file = await open(snapshot, 'r');
    try { await file.sync(); } finally { await file.close(); }
    journal.sha256 = await fileDigest(snapshot);
    await writeJournal(backupDirectory, journal);
  } catch { throw new StorageError('backup-failed'); }
  journal.state = 'migrating';
  await writeJournal(backupDirectory, journal);
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const migration of migrations.slice(version)) {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations(version,checksum,applied_at,application_build) VALUES(?,?,?,?)')
        .run(migration.version, digest(migration.sql), new Date().toISOString(), build);
    }
    db.prepare('INSERT INTO storage_metadata(singleton,schema_version,application_build,record_version) VALUES(1,?,?,1) ON CONFLICT(singleton) DO UPDATE SET schema_version=excluded.schema_version,application_build=excluded.application_build')
      .run(migrations.length, build);
    db.pragma(`user_version = ${migrations.length}`);
    validateDatabase(db, migrations.length);
    db.exec('COMMIT');
  } catch {
    if (db.inTransaction) db.exec('ROLLBACK');
    journal.state = 'failed';
    await writeJournal(backupDirectory, journal);
    throw new StorageError('migration-failed', id);
  }
  journal.state = 'awaiting-confirmation';
  await writeJournal(backupDirectory, journal);
  return journal;
}
/** Called only after the main owner confirms successful application launch. */
export async function confirmLaunch(directory: string): Promise<void> {
  const backupDirectory = join(directory, 'backups');
  const entries = await journals(backupDirectory);
  for (const journal of entries) {
    if (journal.state === 'awaiting-confirmation') {
      journal.state = 'confirmed';
      await writeJournal(backupDirectory, journal);
    }
  }
  const successful = entries.filter(j => j.state === 'confirmed');
  for (const journal of successful.slice(0, Math.max(0, successful.length - 3))) {
    await unlink(join(backupDirectory, `${journal.id}.db`)).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
    await unlink(join(backupDirectory, `${journal.id}.json`));
  }
  await flushDirectory(backupDirectory);
}
