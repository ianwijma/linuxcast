import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const electron = require('electron/package.json') as { version: string };
const cli = resolve(dirname(require.resolve('@electron/rebuild')), 'cli.js');
const result = spawnSync(process.execPath, [cli, '--version', electron.version, '--arch', process.arch,
  '--module-dir', 'packages/storage', '--only', 'better-sqlite3', '--force', '--build-from-source', '--jobs', '2'],
{ cwd: root, stdio: 'inherit', env: { ...process.env, npm_config_force_build: '1' } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
