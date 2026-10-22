import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spikeRoot } from '../../build.ts';
const source = dirname(fileURLToPath(import.meta.url));
export async function buildNativeSession(destination = join(source, 'dist')) {
  await mkdir(destination, { recursive: true });
  for (const [input, output] of [['gnome-extension.js', 'extension.js'], ['kwin-script.js', 'kwin-script.js']]) await copyFile(join(source, input!), join(destination, output!));
  await writeFile(join(destination, 'metadata.json'), JSON.stringify({ uuid: 's001-launcher-observer@linuxcast.invalid',
    name: 'Linuxcast S0-01 private launcher observer', description: 'Disposable diagnostic observer, never production companion', version: 1, 'shell-version': ['48'] }, null, 2) + '\n');
  const sourceSha256: Record<string, string> = {};
  for (const input of ['build.ts', 'check.ts', 'protocol.ts', 'run-session.py', 'supervision.py', 'private.py', 'gnome-extension.js', 'kwin-script.js', 'kwin-bus.py', 'decoy.py',
    '../../src/main.ts', '../../src/profile.ts', '../../src/preload.ts', '../../src/contract.ts', '../../src/renderer/App.tsx', '../../src/renderer/style.css', '../../build.ts']) {
    sourceSha256[input] = createHash('sha256').update(await readFile(join(source, input))).digest('hex');
  }
  const outputSha256: Record<string, string> = {};
  for (const name of ['extension.js', 'kwin-script.js', 'metadata.json']) outputSha256[name] = createHash('sha256').update(await readFile(join(destination, name))).digest('hex');
  await writeFile(join(destination, 'manifest.json'), JSON.stringify({ kind: 'S0-01-private-native-compositor-probe', sourceSha256,
    outputSha256,
    designTokensSha256: createHash('sha256').update(await readFile(new URL('../../../../docs/design/tokens.json', import.meta.url))).digest('hex'),
    launcherDesktopFileSha256: createHash('sha256').update(await readFile(join(spikeRoot, 'resources/io.github.ianwijma.Linuxcast.desktop'))).digest('hex') }, null, 2) + '\n');
  return destination;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await buildNativeSession());
