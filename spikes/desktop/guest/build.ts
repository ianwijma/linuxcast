import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
export async function buildGuestHarness(destination = join(source, 'dist')): Promise<string> {
  await mkdir(destination, {recursive:true});
  await build({entryPoints:[join(source,'desktop-api.ts')],outdir:destination,bundle:true,platform:'neutral',format:'esm',target:'es2022',logLevel:'silent'});
  await build({entryPoints:[join(source,'kwin-script.js')],outfile:join(destination,'kwin-script.js'),bundle:true,platform:'neutral',format:'iife',target:'es2016',logLevel:'silent'});
  await build({entryPoints:[join(source,'restart-script.js')],outfile:join(destination,'restart-script.js'),bundle:true,platform:'neutral',format:'iife',target:'es2016',logLevel:'silent'});
  await build({entryPoints:[join(source,'restart-helper.ts')],outfile:join(destination,'restart-helper.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
  await build({entryPoints:[join(source,'queue-helper.ts')],outfile:join(destination,'queue-helper.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
  await build({entryPoints:[join(source,'clipboard-client.ts')],outfile:join(destination,'clipboard-client.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
  await copyFile(join(source,'restart-bus.py'),join(destination,'restart-bus.py'));
  await copyFile(join(source,'restart-driver.py'),join(destination,'restart-driver.py'));
  await copyFile(join(source,'canary.py'),join(destination,'canary.py'));
  await copyFile(join(source,'kwin-bus.py'),join(destination,'kwin-bus.py'));
  await copyFile(join(source,'selection-event.py'),join(destination,'selection-event.py'));
  await copyFile(join(source,'run-session.py'),join(destination,'run-session.py'));
  await copyFile(join(source,'supervision.py'),join(destination,'supervision.py'));
  await copyFile(join(source,'private_context.py'),join(destination,'private_context.py'));
  await copyFile(join(source,'debugger_filter.py'),join(destination,'debugger_filter.py'));
  await copyFile(join(source,'post_stop.py'),join(destination,'post_stop.py'));
  await copyFile(join(source,'gnome-extension.js'),join(destination,'extension.js'));
  await writeFile(join(destination,'metadata.json'),JSON.stringify({uuid:'s002-native@linuxcast.invalid',name:'Linuxcast S0-02 isolated native canary',description:'Disposable guest-only API evidence; never a production companion',version:1,'shell-version':['48']},null,2));
  await copyFile(join(source,'../native/own-canary.py'),join(destination,'x11-private-selection.py'));
  const files = ['../adapters.ts','../window-adapters.ts','../protocol.ts','../model.ts','gnome-extension.js','kwin-script.js','queue-helper.ts','clipboard-client.ts','kwin-bus.py','run-session.py','restart-helper.ts','restart-script.js','restart-bus.py','restart-driver.py','supervision.py','native-pipe.ts','../helper-epoch.ts','canary.py','selection-event.py','../native/own-canary.py','build.ts','desktop-api.ts','private_context.py','debugger_filter.py','post_stop.py'];
  const hashes: Record<string,string> = {};
  for (const file of files) hashes[file] = createHash('sha256').update(await readFile(join(source,file))).digest('hex');
  const outputs=['desktop-api.js','kwin-script.js','restart-script.js','restart-helper.mjs','queue-helper.mjs','clipboard-client.mjs',
    'restart-bus.py','restart-driver.py','canary.py','kwin-bus.py','selection-event.py','run-session.py','supervision.py','extension.js','metadata.json','x11-private-selection.py','private_context.py','debugger_filter.py','post_stop.py'];
  const outputHashes: Record<string,string> = {};
  for (const file of outputs) outputHashes[file] = createHash('sha256').update(await readFile(join(destination,file))).digest('hex');
  await writeFile(join(destination,'manifest.json'),JSON.stringify({kind:'task-owned-real-adapter-guest-harness',sourceSha256:hashes,outputSha256:outputHashes},null,2));
  return destination;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await buildGuestHarness());
