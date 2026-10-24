import { createHash } from 'node:crypto';
import { mkdir, lstat, realpath, statfs, open } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { StorageError } from './errors.ts';

export function defaultDataDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.XDG_DATA_HOME;
  return join(configured && isAbsolute(configured) ? configured : join(homedir(), '.local/share'), 'linuxcast');
}
export async function privateDirectory(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new StorageError('private-path-required');
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077)) {
    throw new StorageError('private-path-required');
  }
  return realpath(path);
}
export async function privateFile(path: string, create = false): Promise<void> {
  if (create) {
    try { const file = await open(path, 'wx', 0o600); await file.close(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o077)) {
      throw new StorageError('private-path-required');
    }
  } catch (error) { if (!create && (error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
}
export async function requireLocalFilesystem(path: string): Promise<void> {
  // Fail closed for filesystem types not validated for local SQLite WAL. Linux
  // ext*, XFS, Btrfs, tmpfs and overlay cover packaged target + test containers.
  const local = new Set([0xef53, 0x58465342, 0x9123683e, 0x01021994, 0x794c7630]);
  if (!local.has((await statfs(path)).type >>> 0)) throw new StorageError('local-filesystem-required');
}
export async function acquireOwnerLock(directory: string): Promise<() => Promise<void>> {
  if (process.platform !== 'linux' || !process.getuid) throw new StorageError('storage-unavailable');
  const identity = createHash('sha256').update(`${process.getuid()}\0${directory}\0linuxcast.db`).digest('hex');
  const server = createServer(socket => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', error => reject(new StorageError(
      (error as NodeJS.ErrnoException).code === 'EADDRINUSE' ? 'owner-already-running' : 'storage-unavailable')));
    server.listen(`\0linuxcast-storage-${identity}`, resolve);
  });
  return () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
