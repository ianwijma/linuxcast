/** Real guest restart experiment only; standard-output is parent-owned bounded IPC. */
import { writeFileSync } from 'node:fs';
import { CommandQueue } from '../model.ts';
import { newCompanionInstance } from '../helper-epoch.ts';
import { DesktopError, parseHandle } from '../protocol.ts';
import type { Handle } from '../protocol.ts';

const root = process.env.LINUXCAST_S002_RESULT_DIR ?? '';
const pid = Number(process.env.LINUXCAST_S002_CANARY_PID);
const phase = process.env.LINUXCAST_S002_RESTART_PHASE;
const base = Number(process.env.LINUXCAST_S002_GENERATION_BASE ?? '0');
if (process.env.LINUXCAST_S002_PRIVATE_GUEST !== '1' || !root.startsWith('/tmp/linuxcast-s002-') || !Number.isSafeInteger(pid) || pid < 1
    || !['crash','fresh'].includes(phase ?? '') || !Number.isSafeInteger(base) || base < 0 || base > 4) process.exit(3);
const old: Handle | null = phase === 'fresh' ? parseHandle(JSON.parse(process.env.LINUXCAST_S002_OLD_HANDLE ?? 'null')) : null;
const handle: Handle = {session:'isolated-debian-guest-restart',instance:newCompanionInstance(),generation:base+1,id:'own-canary'};
let peer = '', stage = 0, staleGenerationRejected = false;
const outcomes: string[] = [];
const queue = new CommandQueue(undefined,value => value === peer && /^:[0-9]+\.[0-9]+$/u.test(peer));
// The trusted experiment coordinator carries a bounded generation base across
// actual helper processes. Instance identity is always generated inside helper.
for (let index=0;index<base;index++) queue.reset();
const metrics = () => writeFileSync(`${root}/restart-${phase}-metrics.json`,JSON.stringify({phase,handle,stage,outcomes,staleGenerationRejected}),{mode:0o600});
metrics();
const answer = (id: number, reply: unknown) => process.stdout.write(`${JSON.stringify({id,reply})}\n`);
let buffered = '';
async function request(encoded: string) {
  let id = 0;
  try {
    const frame = JSON.parse(encoded) as Record<string,unknown>;
    if (Object.keys(frame).sort().join() !== 'body,id,method,peer' || !Number.isSafeInteger(frame.id) || Number(frame.id)<1
        || typeof frame.peer !== 'string' || !/^:[0-9]+\.[0-9]+$/u.test(frame.peer) || !frame.body || typeof frame.body !== 'object' || Array.isArray(frame.body)) throw new Error();
    id = Number(frame.id);
    const value = frame.body as Record<string,unknown>;
    const keys = Object.keys(value).sort().join();
    if (value.protocolVersion !== 1) throw new Error();
    if (frame.method === 'CanaryContext' && keys === 'protocolVersion') answer(id,{pid,handle,phase});
    else if (frame.method === 'Handshake' && keys === 'backend,protocolVersion' && value.backend === 'kwin6.3') {
      peer = frame.peer;
      if (queue.handshake(peer) !== handle.generation) throw new Error();
      if (old) {
        try { queue.enqueue(peer,handle.generation,{operation:'geometry',handle:old}); }
        catch (error) { staleGenerationRejected = error instanceof DesktopError && error.message === 'STALE_WINDOW_HANDLE'; }
        // Deliberately update only the generation. The stale instance must still
        // be denied in the real script before calling its native window adapter.
        queue.enqueue(peer,handle.generation,{operation:'geometry',handle:{...old,generation:handle.generation}});
      } else queue.enqueue(peer,handle.generation,{operation:'geometry',handle});
      metrics(); answer(id,{protocolVersion:1,generation:handle.generation});
    } else if (frame.method === 'NextCommand' && keys === 'generation,protocolVersion' && frame.peer === peer && value.generation === handle.generation) {
      answer(id,await queue.next(peer,handle.generation,1000));
    } else if (frame.method === 'Ack' && keys === 'generation,id,outcome,protocolVersion' && frame.peer === peer && value.generation === handle.generation
        && typeof value.id === 'string' && ['ok','denied','expired','failed'].includes(String(value.outcome))) {
      queue.ack(peer,handle.generation,value.id,value.outcome as 'ok'|'denied'|'expired'|'failed');
      stage++; outcomes.push(String(value.outcome));
      if (phase === 'crash' && stage === 1) queue.enqueue(peer,handle.generation,{operation:'place',handle,rect:{x:640,y:360,width:200,height:150}},5000);
      else if (phase === 'fresh' && stage === 1) queue.enqueue(peer,handle.generation,{operation:'geometry',handle});
      metrics(); answer(id,{kind:'ack'});
    } else throw new Error();
  } catch { answer(id,{kind:'error',reason:'INVALID_PRIVATE_RESTART_REQUEST'}); }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data',(chunk: string) => {
  buffered += chunk;
  if (Buffer.byteLength(buffered)>65536) process.exit(2);
  for (;;) {
    const newline = buffered.indexOf('\n'); if (newline<0) break;
    const frame=buffered.slice(0,newline); buffered=buffered.slice(newline+1); void request(frame);
  }
});
process.stdin.on('end',() => {queue.reset();process.exit(0);});
