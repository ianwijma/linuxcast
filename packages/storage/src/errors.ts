export type StorageReason = 'owner-already-running' | 'private-path-required' | 'local-filesystem-required' |
  'sqlite-version-unsupported' | 'newer-schema' | 'corrupt-database' | 'invalid-migration' |
  'backup-failed' | 'insufficient-space' | 'migration-failed' | 'recovery-required' |
  'invalid-request' | 'conflict' | 'storage-unavailable' | 'permission-denied';
/** Fixed operational codes only: no paths, SQL, record bodies or native errors. */
export class StorageError extends Error {
  readonly reason: StorageReason;
  readonly snapshotId: string | undefined;
  constructor(reason: StorageReason, snapshotId?: string) {
    super(`Storage unavailable: ${reason}.`);
    this.name = 'StorageError';
    this.reason = reason;
    this.snapshotId = snapshotId;
  }
}
