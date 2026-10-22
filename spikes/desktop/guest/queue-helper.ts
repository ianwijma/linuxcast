/** Trusted, disposable guest helper. D-Bus peer identity is supplied only by its
 * fixed Gio parent after comparing the actual KWin unique bus owner. */
import { CommandQueue } from '../model.ts';
import { newCompanionInstance } from '../helper-epoch.ts';
import { parseRect } from '../protocol.ts';

const pid = Number(process.env.LINUXCAST_S002_CANARY_PID);
const root = process.env.LINUXCAST_S002_RESULT_DIR ?? '';
if (process.env.LINUXCAST_S002_PRIVATE_GUEST !== '1' || !root.startsWith('/tmp/linuxcast-s002-') || !Number.isSafeInteger(pid) || pid <= 0) process.exit(3);
const instance = newCompanionInstance();
const readOnlyControl = process.env.LINUXCAST_S002_READ_ONLY_CONTROL === '1';
let peer = '';
let stage = 0;
let outcomes: string[] = [];
let terminalReplySent = false;
const queue = new CommandQueue(undefined, value => value === peer && peer.startsWith(':'));
const handle = {session:'isolated-debian-guest',instance,generation:1,id:'own-canary'};
const geometry = () => queue.enqueue(peer,handle.generation,{operation:'geometry',handle},1000);
const placement = () => queue.enqueue(peer,handle.generation,{operation:'place',handle,rect:{x:32,y:32,width:400,height:240}},1000);
let buffered = '';
const answer = (id: number, reply: unknown) => process.stdout.write(`${JSON.stringify({id,reply})}\n`);
async function request(encoded: string) {
  let id = 0;
  try {
    const frame = JSON.parse(encoded) as Record<string,unknown>;
    if (Object.keys(frame).sort().join() !== 'body,id,method,peer' || !Number.isSafeInteger(frame.id) || Number(frame.id) < 1
        || typeof frame.peer !== 'string' || !/^:[0-9]+\.[0-9]+$/u.test(frame.peer) || !frame.body || typeof frame.body !== 'object' || Array.isArray(frame.body)) throw new Error();
    id = Number(frame.id);
    const value = frame.body as Record<string,unknown>;
    if (value.protocolVersion !== 1) throw new Error();
    const keys = Object.keys(value).sort().join();
    if (frame.method === 'CanaryContext' && keys === 'protocolVersion') {
      answer(id,{pid,handle});
    } else if (frame.method === 'Handshake' && keys === 'backend,protocolVersion' && value.backend === 'kwin6.3') {
      peer = frame.peer; handle.generation = queue.handshake(peer); stage = 0; outcomes = []; terminalReplySent = false; geometry();
      answer(id,{protocolVersion:1,generation:handle.generation});
    } else if (frame.method === 'NextCommand' && keys === 'generation,protocolVersion' && frame.peer === peer && value.generation === handle.generation) {
      if (stage === 3) { terminalReplySent = true; answer(id,{kind:'reconnect',reason:'CANARY_COMPLETED'}); }
      else answer(id,await queue.next(peer,handle.generation));
    } else if (frame.method === 'Ack' && keys === 'generation,id,outcome,protocolVersion' && frame.peer === peer && value.generation === handle.generation && typeof value.id === 'string') {
      if (!['ok','denied','expired','failed'].includes(String(value.outcome))) throw new Error();
      queue.ack(peer,handle.generation,value.id,value.outcome as 'ok'|'denied'|'expired'|'failed');
      outcomes.push(String(value.outcome));
      stage++;
      answer(id,{kind:'ack'});
      if (stage === 1) { if (readOnlyControl) geometry(); else placement(); }
      else if (stage === 2) setTimeout(geometry,250);
    } else if (frame.method === 'CanaryObservation' && keys === 'action,nativePlacementAttempted,observations,protocolVersion,reason,requested' && frame.peer === peer) {
      if (typeof value.action !== 'string' || value.action.length > 256 || typeof value.reason !== 'string' || !['COMPANION_RESTARTED','COMPANION_DBUS_TIMEOUT','COMPANION_PROTOCOL_FAILURE'].includes(value.reason)
          || typeof value.nativePlacementAttempted !== 'boolean' || !Array.isArray(value.observations) || value.observations.length > 3) throw new Error();
      const observations = value.observations.map(parseRect);
      const requested = value.requested === null ? null : parseRect(value.requested);
      const changed = observations.length === 2 && JSON.stringify(observations[0]) !== JSON.stringify(observations[1]);
      const applied = requested !== null && JSON.stringify(requested) === JSON.stringify(observations[1]);
      if (readOnlyControl) {
        const stable = observations.length === 3 && observations.every(rect => JSON.stringify(rect) === JSON.stringify(observations[0]));
        const complete = stage === 3 && terminalReplySent && outcomes.every(outcome => outcome === 'ok') && stable
          && value.nativePlacementAttempted === false && requested === null && value.reason === 'COMPANION_RESTARTED';
        answer(id,{kind:'diagnostic',state:'diagnostic',diagnosticStatus:complete ? 'READ_ONLY_CONTROL_COMPLETE' : 'READ_ONLY_CONTROL_FAILED',
          kindEvidence:'read-only-control-not-placement-or-clipboard-acceptance',nativePlacementAttempted:value.nativePlacementAttempted,
          placementAcceptanceEstablished:false,clipboardAcceptanceEstablished:false,nativeGeometryStable:stable,
          pollingStopped:terminalReplySent,observations,requested,transportAckCount:stage,outcomes,
          terminalReason:value.reason,normalClipboardTouched:false});
        return;
      }
      answer(id,{kind:'observed',state:stage === 3 && terminalReplySent && changed && applied && value.nativePlacementAttempted && outcomes.every(outcome => outcome === 'ok') && value.reason === 'COMPANION_RESTARTED' ? 'passed' : 'failed',
        kindEvidence:'actual-KWin6.3-script-native-window-and-current-queue',liveGeometryChanged:changed,targetApplied:applied,observations,requested,transportAckCount:stage,outcomes,
        nativePlacementAttempted:value.nativePlacementAttempted,pollingStopped:terminalReplySent,terminalReason:value.reason,normalClipboardTouched:false});
    } else throw new Error();
  } catch { answer(id,{kind:'error',reason:'INVALID_PRIVATE_GUEST_REQUEST'}); }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data',(chunk: string) => {
  buffered += chunk;
  if (Buffer.byteLength(buffered)>65536) process.exit(2);
  for (;;) {
    const newline = buffered.indexOf('\n');
    if (newline < 0) break;
    const frame = buffered.slice(0,newline); buffered = buffered.slice(newline+1);
    void request(frame);
  }
});
process.stdin.on('end',() => { queue.reset(); process.exit(0); });
