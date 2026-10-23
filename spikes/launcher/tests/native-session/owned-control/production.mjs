import { readFileSync, lstatSync, realpathSync, openSync, readSync, closeSync, fstatSync, constants } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { setTimeout, clearTimeout } from 'node:timers';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { spawn } from 'node:child_process';
import { endianness } from 'node:os';
export const AUTHORITY = 'd21bd6cbd368c8d74405d878c04ba385342c600b5636f3fbb5bca8a26d89ce20';
export const SOURCE_REVIEW = 'c9a706cb39de47c7fb4f94f77b0c3e854f5f958b8e73f7e50ef7e9b9e5ec6d79';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHash = path => {
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const info=fstatSync(fd);if(!info.isFile() || info.size>8*1024*1024)throw new Error('CONTROL_SOURCE_BOUND');
    const digest=createHash('sha256'),buffer=Buffer.alloc(65536);let total=0,count;
    while((count=readSync(fd,buffer,0,buffer.length,null))!==0){total+=count;if(total>8*1024*1024)throw new Error('CONTROL_SOURCE_BOUND');digest.update(buffer.subarray(0,count));}
    return digest.digest('hex');
  } finally { closeSync(fd); }
};
export function verifySources(sourceRoot) {
  if (!sourceRoot.startsWith('/') || realpathSync(sourceRoot) !== sourceRoot) throw new Error('CONTROL_SOURCE_ROOT');
  const encoded = readFileSync(new URL('./runtime-authority.json', import.meta.url));
  if (hash(encoded) !== AUTHORITY) throw new Error('CONTROL_AUTHORITY');
  const authority = JSON.parse(encoded), directory = join(sourceRoot, 'spikes/launcher/tests/native-session');
  if (Object.keys(authority.sourceSha256).length !== 25) throw new Error('CONTROL_SOURCE_COUNT');
  const inputs = Object.entries(authority.sourceSha256).map(([name, digest]) => [resolve(directory, name), digest]);
  inputs.push([join(sourceRoot, 'docs/design/tokens.json'), authority.designTokensSha256],
    [join(sourceRoot, 'spikes/launcher/resources/io.github.ianwijma.Linuxcast.desktop'), authority.launcherDesktopFileSha256]);
  for (const [path, digest] of inputs) {
    if (!path.startsWith(sourceRoot + '/') || realpathSync(path) !== path || !lstatSync(path).isFile() || sourceHash(path) !== digest) throw new Error('CONTROL_SOURCE_CHANGED');
  }
  return directory;
}
export async function loadProduction(sourceRoot, expect, transportSpawn = spawn) {
  const directory = verifySources(sourceRoot);
  const protocol = await import(pathToFileURL(join(directory, 'protocol.ts')).href);
  const text = readFileSync(join(directory, 'check.ts'), 'utf8');
  const begin = text.indexOf('class OwnedX11Failed'), end = text.indexOf('const observe = async', begin);
  if (begin < 0 || end < 0) throw new Error('CONTROL_EXTRACTION');
  const trace = new protocol.NativeTrace(); let replies = 0;
  const nativeTrace = { begin: trace.begin.bind(trace), snapshot: trace.snapshot.bind(trace), reply: (...args) => { replies++; return trace.reply(...args); } };
  const context = { expect, Buffer, setTimeout, clearTimeout, performance, randomBytes, endianness, spawn:transportSpawn, fileURLToPath, URL, process,
    APP_URL: 'linuxcast://launcher/index.html', ...protocol, report: {}, nativeTrace, application: undefined, pid: 0 };
  const exposure = `
globalThis.control = {
 configure(app,page) { application=app; ownedPage=page; ownedGeneration=1; },
 capture(deadline) { return captureOwnedWindow(application,ownedPage,deadline); },
 async positive() { return observeOwned(1,'initial-native-launch'); },
 async negative(primary,auxiliary) {
   if (!ownedBinding || ownedBinding.pid!==primary.pid || ownedBinding.xid!==primary.xid || ownedBinding.handle!==primary.handle) throw new Error('CONTROL_PRIMARY_REQUIRED');
   const retained=ownedBinding, channel=ownedChannel, before=repliesRead(); let commands=0, rejected=false;
   ownedBinding=Object.freeze({...retained,xid:auxiliary.xid,handle:auxiliary.handle});
   ownedChannel={send(...args) { commands++; return channel.send(...args); },abort() { channel.abort(); }};
   try { await observeOwned(2,'initial-native-launch'); }
   catch(error) { rejected=error instanceof OwnedX11Failed && error.kind==='binding'; }
   finally { ownedBinding=retained; }
   return {rejected,helperCommands:commands,newReplies:repliesRead()-before,traceState:nativeTrace.snapshot().state,
     originalBindingPreserved:retained.pid===primary.pid && retained.xid===primary.xid && retained.handle===primary.handle};
 },
 abort() { ownedChannel?.abort(); }
};`;
  context.repliesRead = () => replies;
  const code = stripTypeScriptTypes(text.slice(begin, end) + exposure).replaceAll('import.meta.url', JSON.stringify(pathToFileURL(join(directory, 'check.ts')).href));
  runInNewContext(code, context, { timeout: 1000 });
  return { api: context.control, protocol };
}
