import Database from 'better-sqlite3';
import { join } from 'node:path';
import { StorageError } from './errors.ts';
import { acquireOwnerLock, defaultDataDirectory, privateDirectory, privateFile, requireLocalFilesystem } from './paths.ts';
import { confirmLaunch, foundationMigrations, migrate, schemaVersion, validateDatabase } from './migrations.ts';
import type { Migration } from './migrations.ts';
import { Repositories } from './repositories.ts';

export interface OwnerOptions {
  dataDirectory?: string;
  applicationBuild: string;
  /** Trusted main supplies the packaged, rebuilt addon path; never renderer data. */
  nativeBinding?: string;
  retryFailedMigration?: boolean;
  /** Trusted build/test assembly only. Never accepted over repository IPC. */
  migrations?: readonly Migration[];
}
export class StorageOwner {
  readonly sqliteVersion: string;
  readonly version: number;
  readonly directory: string;
  private readonly db: Database.Database;
  private readonly releaseLock: () => Promise<void>;
  private readonly repositories: Repositories;
  private closed = false;
  private closing: Promise<void> | undefined;
  private constructor(db: Database.Database, directory: string, release: () => Promise<void>) {
    this.db = db; this.directory = directory; this.releaseLock = release;
    this.sqliteVersion = (db.prepare('SELECT sqlite_version() AS version').get() as {version:string}).version;
    this.version = schemaVersion(db); this.repositories = new Repositories(db);
  }
  static async open(options: OwnerOptions): Promise<StorageOwner> {
    let release: (() => Promise<void>) | undefined;
    let db: Database.Database | undefined;
    try {
      if (!options.applicationBuild || options.applicationBuild.length > 200) throw new StorageError('invalid-request');
      const directory = await privateDirectory(options.dataDirectory ?? defaultDataDirectory());
      await requireLocalFilesystem(directory);
      release = await acquireOwnerLock(directory);
      const path = join(directory, 'linuxcast.db');
      await privateFile(path, true);
      await privateFile(`${path}-wal`); await privateFile(`${path}-shm`);
      const migrations = options.migrations ?? await foundationMigrations();
      // Validate before enabling WAL or making schema changes. A newer schema is
      // never opened by feature repositories or modified to fit an older build.
      const probe = new Database(path, { readonly: true, fileMustExist: true, ...(options.nativeBinding ? {nativeBinding:options.nativeBinding} : {}) });
      try {
        const version = schemaVersion(probe);
        if (version > migrations.length) throw new StorageError('newer-schema');
        validateDatabase(probe, version);
        const sqliteVersion = (probe.prepare('SELECT sqlite_version() AS version').get() as {version:string}).version;
        const pieces = sqliteVersion.split('.').map(Number);
        if (pieces.length !== 3 || pieces.some(n => !Number.isSafeInteger(n)) ||
          pieces[0]! < 3 || (pieces[0] === 3 && (pieces[1]! < 51 || (pieces[1] === 51 && pieces[2]! < 3)))) {
          throw new StorageError('sqlite-version-unsupported');
        }
      } finally { probe.close(); }
      db = new Database(path, { timeout: 5000, ...(options.nativeBinding ? {nativeBinding:options.nativeBinding} : {}) });
      db.pragma('foreign_keys = ON');
      if (db.pragma('journal_mode = WAL', { simple: true }) !== 'wal') throw new StorageError('storage-unavailable');
      db.pragma('synchronous = FULL'); db.pragma('busy_timeout = 5000'); db.pragma('wal_autocheckpoint = 1000');
      db.pragma('trusted_schema = OFF');
      if (db.pragma('foreign_keys', {simple:true}) !== 1 || db.pragma('synchronous', {simple:true}) !== 2 ||
        db.pragma('busy_timeout', {simple:true}) !== 5000 || db.pragma('wal_autocheckpoint', {simple:true}) !== 1000) {
        throw new StorageError('storage-unavailable');
      }
      await migrate(db, directory, options.applicationBuild, migrations, options.retryFailedMigration);
      return new StorageOwner(db, directory, release);
    } catch (error) {
      if (db?.open) db.close();
      if (release) await release();
      if (error instanceof StorageError) throw error;
      if (error && typeof error === 'object' && 'code' in error && ['SQLITE_CORRUPT', 'SQLITE_NOTADB'].includes(String(error.code))) throw new StorageError('corrupt-database');
      throw new StorageError('storage-unavailable');
    }
  }
  request(request: unknown): ReturnType<Repositories['dispatch']> {
    if (this.closed) throw new StorageError('storage-unavailable');
    try { return this.repositories.dispatch(request); }
    catch (error) {
      if (error instanceof StorageError) throw error;
      // Contract/parser/SQL errors may contain content; never expose them.
      throw new StorageError('invalid-request');
    }
  }
  async confirmSuccessfulLaunch(): Promise<void> {
    if (this.closed) throw new StorageError('storage-unavailable');
    await confirmLaunch(this.directory);
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = (async () => {
      try { this.db.close(); } finally { await this.releaseLock(); }
    })();
    return this.closing;
  }
}
