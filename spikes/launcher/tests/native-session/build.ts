import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
const source = dirname(fileURLToPath(import.meta.url));
// Bounded current application/build inputs. Frozen install is the dependency
// authority; package/lock fingerprints are included, not installed modules.
const sources = ['build.ts', 'check.ts', 'protocol.ts', 'run-session.py', 'supervision.py', 'observer_startup.py', 'private.py', 'artifacts.py', 'gnome-extension.js', 'kwin-script.js', 'kwin-bus.py', 'decoy.py', 'owned-x11.py',
  '../../src/main.ts', '../../src/profile.ts', '../../src/preload.ts', '../../src/contract.ts', '../../src/renderer/main.tsx', '../../src/renderer/App.tsx', '../../src/renderer/style.css', '../../build.ts', '../../resources/index.html',
  '../../../../package.json', '../../../../bun.lock', '../../../../apps/desktop/package.json'];
export async function buildNativeSession(destination = join(source, 'dist'), sourceDirectory = source) {
  await mkdir(destination, { recursive: true });
  await copyFile(join(sourceDirectory, 'gnome-extension.js'), join(destination, 'extension.js'));
  const kwin = await transform(await readFile(join(sourceDirectory, 'kwin-script.js'), 'utf8'), { target: 'es2016', format: 'iife', loader: 'js' });
  await writeFile(join(destination, 'kwin-script.js'), kwin.code);
  await writeFile(join(destination, 'metadata.json'), JSON.stringify({ uuid: 's001-launcher-observer@linuxcast.invalid',
    name: 'Linuxcast S0-01 private launcher observer', description: 'Disposable diagnostic observer, never production companion', version: 1, 'shell-version': ['48'] }, null, 2) + '\n');
  const sourceSha256: Record<string, string> = {};
  for (const input of sources) {
    sourceSha256[input] = createHash('sha256').update(await readFile(join(sourceDirectory, input))).digest('hex');
  }
  const outputSha256: Record<string, string> = {};
  for (const name of ['extension.js', 'kwin-script.js', 'metadata.json']) outputSha256[name] = createHash('sha256').update(await readFile(join(destination, name))).digest('hex');
  await writeFile(join(destination, 'manifest.json'), JSON.stringify({ kind: 'S0-01-private-native-compositor-probe', sourceSha256,
    outputSha256,
    designTokensSha256: createHash('sha256').update(await readFile(join(sourceDirectory, '../../../../docs/design/tokens.json'))).digest('hex'),
    launcherDesktopFileSha256: createHash('sha256').update(await readFile(join(sourceDirectory, '../../resources/io.github.ianwijma.Linuxcast.desktop'))).digest('hex') }, null, 2) + '\n');
  return destination;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await buildNativeSession());
