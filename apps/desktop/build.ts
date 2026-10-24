import { build } from 'esbuild';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, 'apps/desktop/dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of ['main', 'preload']) {
  await build({ absWorkingDir: root, entryPoints: [`apps/desktop/src/${entry}/index.ts`],
    outfile: join(output, `${entry}.cjs`), platform: 'node', format: 'cjs', bundle: true,
    external: ['electron'], target: 'node24', legalComments: 'linked' });
}
await build({ absWorkingDir: root, entryPoints: ['apps/desktop/src/renderer/index.tsx'],
  outdir: join(output, 'renderer'), platform: 'browser', format: 'esm', bundle: true, jsx: 'automatic',
  minify: true, target: 'chrome145', define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'file', '.woff': 'file' }, assetNames: 'fonts/[name]-[hash]', legalComments: 'linked' });
await build({ absWorkingDir: root, entryPoints: ['packages/storage/src/utility.ts'],
  outfile: join(output, 'storage.cjs'), platform: 'node', format: 'cjs', bundle: true,
  target: 'node24',
  banner: { js: "const storageModuleUrl = require('node:url').pathToFileURL(__filename).href;" },
  define: { 'import.meta.url': 'storageModuleUrl' },
  legalComments: 'linked' });
await mkdir(join(output, 'migrations'), { recursive: true });
await cp(join(root, 'packages/storage/src/migrations/001-foundation.sql'), join(output, 'migrations/001-foundation.sql'));
await mkdir(join(output, 'sqlite'), { recursive: true });
await cp(join(root, 'packages/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node'), join(output, 'sqlite/better_sqlite3.node'));
await cp(join(root, 'apps/desktop/src/renderer/index.html'), join(output, 'renderer/index.html'));
const resources = await readdir(join(output, 'renderer'), { recursive: true, withFileTypes: true });
const assets = resources.filter(entry => entry.isFile() && !entry.name.endsWith('.LEGAL.txt'))
  .map(entry => relative(join(output, 'renderer'), join(entry.parentPath, entry.name))).sort();
await writeFile(join(output, 'assets.json'), JSON.stringify(assets, null, 2) + '\n');
console.log(`Built Linuxcast desktop with ${assets.length} packaged renderer assets.`);
