import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
export async function buildGuestHarness(destination = join(source, 'dist')): Promise<string> {
  await mkdir(destination, {recursive:true});
  await build({entryPoints:[join(source,'desktop-api.ts')],outdir:destination,bundle:true,platform:'neutral',format:'esm',target:'es2022',logLevel:'silent'});
  await build({entryPoints:[join(source,'kwin-script.js')],outfile:join(destination,'kwin-script.js'),bundle:true,platform:'neutral',format:'iife',target:'es2020',logLevel:'silent'});
  await build({entryPoints:[join(source,'queue-helper.ts')],outfile:join(destination,'queue-helper.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
  await build({entryPoints:[join(source,'clipboard-client.ts')],outfile:join(destination,'clipboard-client.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
  await copyFile(join(source,'canary.py'),join(destination,'canary.py'));
  await copyFile(join(source,'kwin-bus.py'),join(destination,'kwin-bus.py'));
  await copyFile(join(source,'selection-event.py'),join(destination,'selection-event.py'));
  await copyFile(join(source,'run-session.py'),join(destination,'run-session.py'));
  await copyFile(join(source,'gnome-extension.js'),join(destination,'extension.js'));
  await writeFile(join(destination,'metadata.json'),JSON.stringify({uuid:'s002-native@linuxcast.invalid',name:'Linuxcast S0-02 isolated native canary',description:'Disposable guest-only API evidence; never a production companion',version:1,'shell-version':['48']},null,2));
  await copyFile(join(source,'../native/own-canary.py'),join(destination,'x11-private-selection.py'));
  const files = ['../adapters.ts','../window-adapters.ts','../protocol.ts','../model.ts','gnome-extension.js','kwin-script.js','queue-helper.ts','clipboard-client.ts','kwin-bus.py','run-session.py'];
  const hashes: Record<string,string> = {};
  for (const file of files) hashes[file] = createHash('sha256').update(await readFile(join(source,file))).digest('hex');
  await writeFile(join(destination,'manifest.json'),JSON.stringify({kind:'task-owned-real-adapter-guest-harness',sourceSha256:hashes},null,2));
  return destination;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await buildGuestHarness());
