import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

type Metadata = { name: string; version: string; license?: unknown; licenses?: unknown };
const root = fileURLToPath(new URL('../..', import.meta.url));
const installed = new Map<string, Metadata>();
const store = resolve(root, 'node_modules/.bun');
for (const directory of readdirSync(store)) {
  const modules = resolve(store, directory, 'node_modules');
  if (!existsSync(modules)) continue;
  for (const name of readdirSync(modules)) {
    const paths = name.startsWith('@')
      ? readdirSync(resolve(modules, name)).map(child => resolve(modules, name, child, 'package.json'))
      : [resolve(modules, name, 'package.json')];
    for (const path of paths) {
      if (!existsSync(path)) continue;
      const metadata = JSON.parse(readFileSync(path, 'utf8')) as Metadata;
      installed.set(`${metadata.name}@${metadata.version}`, metadata);
    }
  }
}
const lock = ts.parseConfigFileTextToJson('bun.lock', readFileSync(resolve(root, 'bun.lock'), 'utf8'));
if (lock.error) throw new Error('Cannot parse bun.lock');
const packages = (lock.config as { packages: Record<string, unknown[]> }).packages;
const dependencies = Object.entries(packages).map(([key, entry]) => {
  const resolved = String(entry[0]);
  // Workspaces have no registry checksum and are covered by project licensing.
  const metadata = installed.get(resolved);
  return { key, resolved, integrity: typeof entry.at(-1) === 'string' && /^sha(?:256|512)-/.test(String(entry.at(-1))) ? entry.at(-1) : null,
    manifestMetadataPresent: Boolean(metadata), license: metadata?.license ?? metadata?.licenses ?? null };
});
const hashes = Object.fromEntries(['bun.lock', 'Cargo.lock', 'rust-toolchain.toml'].map(name => [name,
  createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex')]));
writeFileSync(resolve(root, 'scripts/test-runner/dependency-inventory.json'), JSON.stringify({
  scope: 'F1-01 development dependencies, not the packaged 1.0 SBOM. Missing platform or non-registry manifest metadata has null licenses; re-inventory shipped contents at R1-03.',
  lockfileSha256: hashes, dependencies,
}, null, 2) + '\n');
console.log(`Inventoried ${dependencies.length} locked resolutions; ${dependencies.filter(item => item.manifestMetadataPresent).length} registry packages have manifest metadata.`);
