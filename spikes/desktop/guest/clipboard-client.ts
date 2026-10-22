/** Packaged wl-clipboard data-control evidence, not a production C adapter. */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ClipboardTransfer } from '../model.ts';
import type { Source } from '../model.ts';
import {readNativePipe} from './native-pipe.ts';

const root = process.env.LINUXCAST_S002_RESULT_DIR ?? '';
if (process.env.LINUXCAST_S002_PRIVATE_GUEST !== '1' || !root.startsWith('/tmp/linuxcast-s002-') || process.env.GDK_BACKEND !== 'wayland'
    || !process.env.WAYLAND_DISPLAY?.startsWith('linuxcast-s002-')) process.exit(3);
const publicPayload = 'public Linuxcast S0-02 isolated Wayland selection';
let bindingV2 = false;
function terminate(child: ReturnType<typeof spawn>) {
  try { if (child.pid) process.kill(-child.pid,'SIGKILL'); } catch { /* already gone */ }
}
const source: Source = {read: (_mime,maximum,signal) => {
  let debug='';
  return readNativePipe('/usr/bin/wl-paste',['--no-newline','--type','text/plain'],{...process.env,WAYLAND_DEBUG:'1'},maximum,signal,chunk=>{
    debug=(debug+chunk.toString('utf8')).slice(-8192);
    if (/wl_registry[^\n]*\.bind\([^\n]*"zwlr_data_control_manager_v1"[^\n]*,\s*2\s*,/u.test(debug)) bindingV2=true;
  });
}};
let owner: ReturnType<typeof spawn> | undefined;
let ownerEvents = 0;
let nativeClientFailure = false;
const watch = spawn('/usr/bin/wl-paste',['--watch','/usr/bin/python3',fileURLToPath(new URL('./selection-event.py',import.meta.url))],{env:process.env,stdio:['ignore','pipe','ignore'],detached:true});
watch.once('error',() => { nativeClientFailure = true; });
let events = '';
watch.stdout!.on('data',(chunk: Buffer) => {
  events = (events+chunk.toString('utf8')).slice(-4096);
  const frames = events.split('\n'); events = frames.pop() ?? '';
  for (const frame of frames) {
    try { if (JSON.parse(frame).event === 'native-selection-change') ownerEvents++; } catch { /* no raw output retained */ }
  }
});
async function copy(bytes: string) {
  if (owner) terminate(owner);
  owner = spawn('/usr/bin/wl-copy',['--foreground','--type','text/plain'],{env:process.env,stdio:['pipe','ignore','ignore'],detached:true});
  owner.once('error',() => { nativeClientFailure = true; });
  owner.stdin!.on('error',() => { nativeClientFailure = true; });
  owner.stdin!.end(bytes);
  await new Promise(resolve => setTimeout(resolve,200));
}
const result: Record<string,unknown> = {kind:'packaged-wl-clipboard-current-ClipboardTransfer-on-isolated-KWin-display',state:'running',hostClipboardTouched:false,
  guestClipboard:'fresh-private-compositor-public-test-selection',productionDataControlAdapter:false};
try {
  await copy(publicPayload);
  const transfer = new ClipboardTransfer('isolated-debian-guest'); transfer.grant(true); transfer.ownerChanged(['text/plain']);
  const accepted = await transfer.read('text/plain',source);
  result.publicPayloadMatches = accepted.status === 'accepted' && Buffer.from(accepted.bytes!).toString('utf8') === publicPayload;
  result.negotiatedWlrDataControlV2 = bindingV2;
  result.nativeOwnerEvents = ownerEvents;
  transfer.grant(false);
  result.deniedBeforeNativeRead = (await transfer.read('text/plain',{read:() => {throw new Error('MUST_NOT_READ');}})).status === 'permission-required';
  transfer.grant(true); transfer.ownerChanged(['application/x-linuxcast-s002-unsupported']);
  result.unsupportedMimeRejected = (await transfer.read('application/x-linuxcast-s002-unsupported',source)).status === 'skipped';
  transfer.ownerChanged(['text/plain']);
  const cancellation = new AbortController();
  const pending = transfer.read('text/plain',source,cancellation.signal);
  cancellation.abort();
  result.cancelled = (await pending).status === 'cancelled';
  await copy('A'.repeat(1024*1024+128));
  transfer.ownerChanged(['text/plain']);
  result.oversizeRejected = (await transfer.read('text/plain',source)).reason === 'MIME_SIZE_LIMIT';
  result.nativeOwnerEvents = ownerEvents;
  result.nativeClientFailure = nativeClientFailure;
  result.state = !nativeClientFailure && ownerEvents >= 2 && ['publicPayloadMatches','negotiatedWlrDataControlV2','deniedBeforeNativeRead','unsupportedMimeRejected','cancelled','oversizeRejected'].every(key => result[key] === true) ? 'passed' : 'failed';
} catch { result.state = 'unavailable'; result.reason = 'ISOLATED_NATIVE_CLIPBOARD_CLIENT_UNAVAILABLE'; }
finally { if (owner) terminate(owner); terminate(watch); }
await writeFile(`${root}/clipboard-result.json`,JSON.stringify(result),{mode:0o600});
process.exitCode = result.state === 'passed' ? 0 : 3;
