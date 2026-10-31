import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { STORAGE_MIGRATION_ASSETS } from '../../packages/storage/src/schema-version.ts';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, 'apps/desktop/dist');
execFileSync('cargo',['build','--locked','--release','-p','linuxcast-platform','--target-dir',join(root,'target')],{cwd:root,stdio:'inherit'});
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root,'target/release/linuxcast-platform'),join(output,'platform'));
await mkdir(join(output,'licenses/emoji'),{recursive:true});
for(const name of ['LICENSE-UNICODE.txt','LICENSE-CLDR-48.txt','provenance.json'])
  await cp(join(root,'packages/builtins/emoji/data',name),join(output,'licenses/emoji',name));
for (const entry of ['main', 'preload', 'credential-preload', 'permission-preload', 'data-preload', 'file-preload', 'workflow-preload', 'notes-preload']) {
  await build({ absWorkingDir: root, entryPoints: [`apps/desktop/src/${entry}/index.ts`],
    outfile: join(output, `${entry}.cjs`), platform: 'node', format: 'cjs', bundle: true,
    external: ['electron'], target: 'node24', legalComments: 'linked' });
}
await build({ absWorkingDir: root, entryPoints: ['apps/desktop/src/renderer/credential-settings.tsx', 'apps/desktop/src/renderer/permission-settings.tsx', 'apps/desktop/src/renderer/index.tsx', 'apps/desktop/src/renderer/data-settings.tsx', 'apps/desktop/src/renderer/file-search.tsx', 'apps/desktop/src/renderer/workflow-editor.tsx', 'apps/desktop/src/renderer/notes.tsx'],
  outdir: join(output, 'renderer'), platform: 'browser', format: 'esm', bundle: true, jsx: 'automatic',
  minify: true, target: 'chrome145', define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'file', '.woff': 'file' }, assetNames: 'fonts/[name]-[hash]', legalComments: 'linked' });
await build({ absWorkingDir: root, entryPoints: ['packages/storage/src/utility.ts'],
  outfile: join(output, 'storage.cjs'), platform: 'node', format: 'cjs', bundle: true,
  target: 'node24',
  banner: { js: "const storageModuleUrl = require('node:url').pathToFileURL(__filename).href;" },
  define: { 'import.meta.url': 'storageModuleUrl' },
  legalComments: 'linked' });
await build({absWorkingDir:root,entryPoints:['packages/workflows/src/utility.ts'],outfile:join(output,'workflow.cjs'),platform:'node',format:'cjs',bundle:true,target:'node24',legalComments:'linked'});
await mkdir(join(output, 'migrations'), { recursive: true });
for (const name of STORAGE_MIGRATION_ASSETS)
  await cp(join(root, 'packages/storage/src/migrations', name), join(output, 'migrations', name));
await mkdir(join(output, 'sqlite'), { recursive: true });
await cp(join(root, 'packages/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node'), join(output, 'sqlite/better_sqlite3.node'));
for (const name of ['index', 'credential-settings', 'permission-settings', 'data-settings', 'file-search', 'workflow-editor', 'notes'])
  await cp(join(root, `apps/desktop/src/renderer/${name}.html`), join(output, `renderer/${name}.html`));
const resources = await readdir(join(output, 'renderer'), { recursive: true, withFileTypes: true });
const assets = resources.filter(entry => entry.isFile() && !entry.name.endsWith('.LEGAL.txt'))
  .map(entry => relative(join(output, 'renderer'), join(entry.parentPath, entry.name))).sort();
await writeFile(join(output, 'assets.json'), JSON.stringify(assets, null, 2) + '\n');
console.log(`Built Linuxcast desktop with ${assets.length} packaged renderer assets.`);
