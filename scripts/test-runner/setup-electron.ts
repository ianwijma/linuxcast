import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Electron 45 moved its download out of package postinstall. Invoke the pinned
// checksum-verifying installer explicitly; never fetch an unversioned CLI.
const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url));
const result = spawnSync(process.execPath, [require.resolve('electron/install.js')], {
  cwd: fileURLToPath(new URL('../..', import.meta.url)), stdio: 'inherit',
});
if (result.error) console.error(`Electron setup failed: ${result.error.message}`);
process.exitCode = result.status ?? 1;
