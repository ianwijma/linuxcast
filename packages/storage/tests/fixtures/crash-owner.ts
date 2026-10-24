import { StorageOwner } from '../../src/owner.ts';
import { foundationMigrations } from '../../src/migrations.ts';
const directory = process.argv[2]!;
const mode = process.argv[3]!;
if (mode === 'transaction' || mode === 'commit') {
  // A real process death inside an actual SQLite migration transaction. The SQL
  // is fixed test assembly, not accepted from a repository caller.
  const migration = [...await foundationMigrations(), { version: 2, sql: 'CREATE TABLE crash_probe (id INTEGER) STRICT;' }];
  const Database = (await import('better-sqlite3')).default;
  const original = Database.prototype.exec;
  Database.prototype.exec = function(sql: string) {
    const result = original.call(this, sql);
    if ((mode === 'transaction' && sql.includes('CREATE TABLE crash_probe')) || (mode === 'commit' && sql === 'COMMIT')) {
      process.send?.({ kind: mode === 'transaction' ? 'inside-transaction' : 'after-commit' });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    }
    return result;
  };
  await StorageOwner.open({ dataDirectory: directory, applicationBuild: 'fixture-upgrade', migrations: migration });
} else {
  const owner = await StorageOwner.open({ dataDirectory: directory, applicationBuild: 'fixture-owner' });
  process.send?.({ kind: 'ready', sqliteVersion: owner.sqliteVersion });
}
