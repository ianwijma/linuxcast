import { afterEach, expect, test, vi } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildGuestHarness } from './guest/build.ts';
import { parseCommand, parseHandle, parsePollResult } from './protocol.ts';
import { ClipboardTransfer, CommandQueue, Companion, MIME_LIMITS, clampRect } from './model.ts';
import type { Backend, NativeWindow, Source } from './model.ts';
import { gnomeSelectionSource, kwinLoop, BUS } from './adapters.ts';
import type { CallDBus } from './adapters.ts';
import { gnomeWindow, kwinWindow } from './window-adapters.ts';
import type { KwinWindow } from './window-adapters.ts';

const instance = '00000000-0000-4000-8000-000000000001';
afterEach(() => vi.useRealTimers());

test.each<Backend>(['gnome48', 'kwin6.3'])('%s window handles read current geometry and reject stale/unsafe operations', backend => {
  const companion = new Companion(backend, 'synthetic-session');
  expect(() => companion.geometry({ session: '', instance, generation: 0, id: '' })).toThrow('COMPANION_MISSING');
  companion.connect(backend === 'gnome48' ? '48.0' : '6.3.6');
  let rect = { x: -100, y: 30, width: 800, height: 600 };
  let alive = true;
  let state: 'normal' | 'maximized' | 'fullscreen' = 'normal';
  const window: NativeWindow = { geometry: () => rect, place: value => { rect = value; }, alive: () => alive,
    state: () => state, workArea: () => ({ x: -1920, y: 0, width: 1920, height: 1080 }) };
  const handle = companion.register(window);
  expect(companion.register(window)).toEqual(handle);
  rect = { x: -900.5, y: 100.25, width: 640, height: 480 };
  expect(companion.geometry(handle)).toEqual(rect);
  expect(companion.place(handle, { x: 9000, y: -100, width: 9000, height: 10 })).toEqual({ x: -1920, y: 0, width: 1920, height: 32 });
  for (state of ['maximized', 'fullscreen'] as const) expect(() => companion.place(handle, rect)).toThrow('WINDOW_STATE_REQUIRES_REVIEW');
  expect(() => companion.geometry({ ...handle, session: 'another-session' })).toThrow('STALE_WINDOW_HANDLE');
  alive = false; expect(() => companion.geometry(handle)).toThrow('WINDOW_GONE');
  alive = true;
  companion.disconnect(); companion.connect(backend === 'gnome48' ? '48.1' : '6.3.6');
  expect(() => companion.geometry(handle)).toThrow('STALE_WINDOW_HANDLE');
});

test('missing, disabled, restarted and wrong-version companions have repair actions', () => {
  const gnome = new Companion('gnome48', 'fixture');
  expect(gnome.status.action).toContain('enable');
  expect(gnome.connect('42.9').state).toBe('unsupported');
  expect(gnome.status.action).toContain('GNOME 48');
  expect(gnome.connect('48.0', false).state).toBe('permission-required');
  gnome.connect('48.0');
  expect(gnome.disconnect()).toMatchObject({ state: 'temporarily-unavailable', reason: 'COMPANION_DISCONNECTED' });
  expect(gnome.status.action).toContain('reload');
  expect(() => clampRect({ x: NaN, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 100, height: 100 })).toThrow('INVALID_GEOMETRY');
});

test('GNOME native API-shaped window fixture changes live rect and invalidates unmanaged handle', () => {
  let rect = { x: 0, y: 0, width: 300, height: 200 };
  let unmanaged = () => {};
  const native = gnomeWindow({ get_frame_rect: () => rect, get_work_area_current_monitor: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    move_resize_frame: (user, x, y, width, height) => { expect(user).toBe(true); rect = { x, y, width, height }; },
    is_fullscreen: () => false, get_maximized: () => 0, connect: (_signal, callback) => { unmanaged = callback; return 1; }, disconnect: () => {} });
  const companion = new Companion('gnome48', 'fixture'); companion.connect('48.0');
  const handle = companion.register(native);
  companion.place(handle, { x: 100, y: 100, width: 400, height: 300 });
  expect(companion.geometry(handle)).toEqual({ x: 100, y: 100, width: 400, height: 300 });
  unmanaged(); expect(() => companion.geometry(handle)).toThrow('WINDOW_GONE');
});

test('KWin native API-shaped fixture preserves fractional geometry and handles window removal', () => {
  const window: KwinWindow = { frameGeometry: { x: 0, y: 0, width: 300, height: 200 }, fullScreen: false, maximizeMode: 0, moveable: true, resizeable: true };
  let removed: (window: KwinWindow) => void = () => {};
  const native = kwinWindow(window, { clientArea: (option, current) => { expect(option).toBe(2); expect(current).toBe(window); return { x: -1000, y: 0, width: 1000, height: 800 }; },
    windowRemoved: { connect: callback => { removed = callback; }, disconnect: () => {} } }, 2);
  const companion = new Companion('kwin6.3', 'fixture'); companion.connect('6.3.6');
  const handle = companion.register(native);
  companion.place(handle, { x: -500.25, y: 10.5, width: 400.25, height: 300.5 });
  expect(companion.geometry(handle)).toEqual({ x: -500.25, y: 10.5, width: 400.25, height: 300.5 });
  window.moveable = false; expect(() => companion.place(handle, window.frameGeometry)).toThrow('WINDOW_GEOMETRY_DENIED');
  removed(window); expect(() => companion.geometry(handle)).toThrow('WINDOW_GONE');
});

test.each<Backend>(['gnome48', 'kwin6.3'])('%s clipboard events enforce MIME/owner generation and no feedback loop', async backend => {
  const transfer = new ClipboardTransfer(`${backend}-synthetic-session`);
  let calls = 0;
  const source: Source = { read: async () => { calls++; return new TextEncoder().encode('public fixture'); } };
  transfer.ownerChanged(['text/plain']);
  expect((await transfer.read('text/plain', source)).status).toBe('permission-required');
  expect(calls).toBe(0);
  transfer.grant(true);
  expect((await transfer.read('text/plain', source)).status).toBe('accepted');
  const generation = transfer.ownerChanged(['text/plain'], true);
  expect((await transfer.read('text/plain', source)).reason).toBe('LINUXCAST_OWNERSHIP_LOOP');
  let restored = false;
  expect(transfer.restoreIfStillOwned(generation, () => { restored = true; })).toBe(true);
  expect(restored).toBe(true);
  restored = false;
  transfer.ownerChanged(['text/plain']);
  expect(transfer.restoreIfStillOwned(generation, () => { restored = true; })).toBe(false);
  expect(restored).toBe(false);
  for (const mime of ['application/unknown', '__proto__', 'constructor']) {
    transfer.ownerChanged([mime]);
    expect((await transfer.read(mime, source)).reason).toContain('UNSUPPORTED_MIME');
  }
  expect(calls).toBe(1);
});

test('clipboard transfer caps bytes before acceptance and cancels stale or revoked work immediately', async () => {
  const transfer = new ClipboardTransfer('synthetic-session'); transfer.grant(true); transfer.ownerChanged(['text/plain']);
  const oversized: Source = { read: async (_mime, maximum) => { expect(maximum).toBe(MIME_LIMITS['text/plain']! + 1); return new Uint8Array(maximum); } };
  expect((await transfer.read('text/plain', oversized)).reason).toBe('MIME_SIZE_LIMIT');
  let finish: (value: Uint8Array) => void = () => {};
  const pending: Source = { read: () => new Promise(resolve => { finish = resolve; }) };
  const old = transfer.read('text/plain', pending);
  transfer.ownerChanged(['image/png']);
  expect((await old).status).toBe('cancelled');
  finish(new Uint8Array([1]));
  transfer.ownerChanged(['text/plain']);
  const revoked = transfer.read('text/plain', pending); transfer.grant(false);
  expect((await revoked).reason).toBe('permission-revoked');
  transfer.grant(true);
  const controller = new AbortController(); controller.abort();
  expect((await transfer.read('text/plain', { read: () => { throw new Error('must not start'); } }, controller.signal)).reason).toBe('caller-cancelled');
  const timed = transfer.read('text/plain', pending, undefined, 10);
  expect((await timed).reason).toBe('transfer-deadline');
});

test('GNOME-shaped transfer uses bounded Meta async API and propagates cancellation to GCancellable', async () => {
  let cancelled = false;
  let complete: (() => void) | undefined;
  let closed = false;
  const source = gnomeSelectionSource({
    transfer_async: (type, mime, maximum, _stream, _cancel, callback) => {
      expect([type, mime, maximum]).toEqual([1, 'text/plain', 10]);
      complete = () => callback({} as never, {});
    }, transfer_finish: () => true,
  }, 1, () => ({ close: () => { closed = true; }, steal_as_bytes: () => ({ get_data: () => new Uint8Array([1, 2]) }) }), () => ({ cancel: () => { cancelled = true; } }));
  const controller = new AbortController();
  const pending = source.read('text/plain', 10, controller.signal);
  controller.abort(); expect(cancelled).toBe(true);
  complete!();
  await expect(pending).rejects.toThrow('CANCELLED');
  expect(closed).toBe(true);
});

test('native startup failure closes its stream and returns a safe typed error', async () => {
  let closed = false;
  const source = gnomeSelectionSource({ transfer_async: () => { throw new Error('synthetic native failure body'); }, transfer_finish: () => false },
    1, () => ({ close: () => { closed = true; }, steal_as_bytes: () => ({ get_data: () => new Uint8Array() }) }), () => ({ cancel: () => {} }));
  await expect(source.read('text/plain', 10, new AbortController().signal)).rejects.toThrow('GNOME_TRANSFER_FAILED');
  expect(closed).toBe(true);
});

test('KWin helper long poll has one outstanding request/ack, expiry and bounded queue', async () => {
  let now = 10;
  const queue = new CommandQueue(() => now, peer => peer.startsWith(':synthetic.'));
  expect(() => queue.handshake(':spoofed.1')).toThrow('UNEXPECTED_COMPANION_PEER');
  const generation = queue.handshake(':synthetic.1');
  const handle = { session: 'synthetic', instance, generation, id: 'own-window' };
  const poll = queue.next(':synthetic.1', generation);
  expect(() => queue.next(':synthetic.1', generation)).toThrow('ONE_PENDING');
  const id = queue.enqueue(':synthetic.1', generation, { operation: 'geometry', handle });
  expect(await poll).toMatchObject({ kind: 'command', command: { id } });
  expect(() => queue.next(':synthetic.1', generation)).toThrow('ONE_PENDING');
  expect(() => queue.ack(':spoofed.2', generation, id, 'ok')).toThrow('STALE_COMPANION');
  queue.ack(':synthetic.1', generation, id, 'ok');
  expect(() => queue.ack(':synthetic.1', generation, id, 'ok')).toThrow('STALE_COMMAND_ACK');
  const expired = queue.enqueue(':synthetic.1', generation, { operation: 'geometry', handle }, 10);
  now = 21;
  expect(await queue.next(':synthetic.1', generation, 5)).toMatchObject({ kind: 'empty', reason: 'POLL_DEADLINE' });
  expect(queue.outcomes.get(expired)).toBe('EXPIRED');
  for (let index = 0; index < 16; index++) queue.enqueue(':synthetic.1', generation, { operation: 'geometry', handle });
  expect(() => queue.enqueue(':synthetic.1', generation, { operation: 'geometry', handle })).toThrow('QUEUE_FULL');
  queue.reset();
});

test('helper or script restart invalidates in-flight and queued commands without replay', async () => {
  let now = 0;
  const queue = new CommandQueue(() => now, peer => peer.startsWith(':synthetic.'));
  const generation = queue.handshake(':synthetic.1');
  const handle = { session: 'synthetic', instance, generation, id: 'window' };
  const id = queue.enqueue(':synthetic.1', generation, { operation: 'geometry', handle }, 10);
  await queue.next(':synthetic.1', generation);
  now = 11;
  expect(() => queue.ack(':synthetic.1', generation, id, 'ok')).toThrow('STALE_COMMAND_ACK');
  expect(() => queue.next(':synthetic.1', generation)).toThrow('ONE_PENDING');
  const fresh = queue.handshake(':synthetic.2');
  expect(() => queue.next(':synthetic.1', generation)).toThrow('STALE_COMPANION');
  const waiting = queue.next(':synthetic.2', fresh);
  queue.reset();
  expect(await waiting).toMatchObject({ kind: 'reconnect' });
  const final = queue.handshake(':synthetic.3');
  expect(await queue.next(':synthetic.3', final, 5)).toMatchObject({ kind: 'empty', reason: 'POLL_DEADLINE' });
  queue.reset();
});

function loopFixture() {
  vi.useFakeTimers();
  const calls: { method: string; body: Record<string, unknown>; reply(value: unknown): void }[] = [];
  const issues: string[] = [];
  let effects = 0;
  const callDBus: CallDBus = (service, path, iface, method, body, callback) => {
    expect([service, path, iface]).toEqual([BUS.service, BUS.path, BUS.interface]);
    calls.push({ method, body: JSON.parse(body) as Record<string, unknown>, reply: value => callback(JSON.stringify(value)) });
  };
  const loop = kwinLoop(callDBus, (ms, callback) => {
    const began = Date.now(); const timer = setTimeout(callback, ms);
    return { cancel: () => clearTimeout(timer), elapsed: () => Date.now() - began };
  }, () => { effects++; return 'ok'; }, reason => issues.push(reason));
  loop.start(); loop.start();
  return { calls, issues, loop, effects: () => effects };
}

test('outbound KWin loop acknowledges before repoll and never executes late or unknown commands', () => {
  const f = loopFixture();
  expect(f.calls.map(call => call.method)).toEqual(['Handshake']);
  f.calls[0]!.reply({ protocolVersion: 1, generation: 7 });
  expect(f.calls[1]!.method).toBe('NextCommand');
  vi.advanceTimersByTime(100);
  f.calls[1]!.reply({ kind: 'command', expiresInMs: 50, command: { id: '7-1', generation: 7, operation: 'geometry', handle: { session: 'synthetic', instance, generation: 7, id: 'window' }, expires: 100 } });
  expect(f.effects()).toBe(0);
  expect(f.calls[2]!.body.outcome).toBe('expired');
  expect(f.calls).toHaveLength(3);
  f.calls[2]!.reply({ kind: 'ack' });
  expect(f.calls[3]!.method).toBe('NextCommand');
  f.calls[3]!.reply({ kind: 'command', expiresInMs: 100, command: { id: '7-2', generation: 7, operation: 'eval', handle: { generation: 7 } } });
  expect(f.issues).toEqual(['COMPANION_PROTOCOL_FAILURE']);
});

test('KWin D-Bus error without callback halts once; late replies cannot resume polling', () => {
  const f = loopFixture();
  f.calls[0]!.reply({ protocolVersion: 1, generation: 3 });
  vi.advanceTimersByTime(1501);
  expect(f.issues).toEqual(['COMPANION_DBUS_TIMEOUT']);
  const before = f.calls.length;
  f.calls[1]!.reply({ kind: 'empty', reason: 'POLL_DEADLINE' });
  f.loop.start();
  expect(f.calls).toHaveLength(before);
  expect(f.effects()).toBe(0);
});

test('outbound valid command executes once and a repeated command ID stops the loop', () => {
  const f = loopFixture();
  f.calls[0]!.reply({ protocolVersion: 1, generation: 2 });
  const command = { id: '2-1', generation: 2, operation: 'geometry', handle: { session: 'synthetic', instance, generation: 2, id: 'window' }, expires: 100 };
  f.calls[1]!.reply({ kind: 'command', command, expiresInMs: 100 });
  expect(f.effects()).toBe(1);
  expect(f.calls[2]!.body.outcome).toBe('ok');
  f.calls[2]!.reply({ kind: 'ack' });
  f.calls[3]!.reply({ kind: 'command', command, expiresInMs: 100 });
  expect(f.effects()).toBe(1);
  expect(f.issues).toEqual(['COMPANION_PROTOCOL_FAILURE']);
});

test.each<Backend>(['gnome48', 'kwin6.3'])('%s reconstructed companion cannot resolve earlier-instance handles with the same session label', backend => {
  const version = backend === 'gnome48' ? '48.0' : '6.3.6';
  let effects = 0;
  const native = (x: number): NativeWindow => ({ geometry: () => ({x, y: 0, width: 200, height: 100}),
    workArea: () => ({x: 0, y: 0, width: 800, height: 600}), place: () => { effects++; }, alive: () => true, state: () => 'normal' });
  const before = new Companion(backend, 'same-desktop-session'); before.connect(version);
  const old = before.register(native(10));
  const restarted = new Companion(backend, 'same-desktop-session'); restarted.connect(version);
  const fresh = restarted.register(native(99));
  expect(fresh.session).toBe(old.session);
  expect(fresh.generation).toBe(old.generation);
  expect(fresh.id).toBe(old.id);
  expect(fresh.instance).not.toBe(old.instance);
  expect(() => restarted.geometry(old)).toThrow('STALE_WINDOW_HANDLE');
  expect(() => restarted.place(old, {x: 0, y: 0, width: 200, height: 100})).toThrow('STALE_WINDOW_HANDLE');
  expect(effects).toBe(0);
  expect(restarted.geometry(fresh).x).toBe(99);
  expect(restarted.register(native(123)).instance).toBe(fresh.instance);
});

const validWireCommand = () => ({ id: '7-1', generation: 7, operation: 'geometry',
  handle: { session: 'synthetic', instance, generation: 7, id: 'window' }, expires: 100 });
const wireReply = (command: unknown = validWireCommand()) => ({kind: 'command', expiresInMs: 100, command});
const invalidReplies: [string, unknown][] = [
  ['unknown envelope field', {...wireReply(), unexpected: true}],
  ['unknown command field', wireReply({...validWireCommand(), unexpected: true})],
  ['missing placement rectangle', wireReply({...validWireCommand(), operation: 'place'})],
  ['rectangle on geometry', wireReply({...validWireCommand(), rect: {x:0,y:0,width:100,height:100}})],
  ['missing handle fields', wireReply({...validWireCommand(), handle: {generation: 7}})],
  ['unknown handle field', wireReply({...validWireCommand(), handle: {...validWireCommand().handle, unexpected: true}})],
  ['empty session', wireReply({...validWireCommand(), handle: {...validWireCommand().handle, session: ''}})],
  ['oversize handle ID', wireReply({...validWireCommand(), handle: {...validWireCommand().handle, id: 'x'.repeat(129)}})],
  ['non-string handle ID', wireReply({...validWireCommand(), handle: {...validWireCommand().handle, id: 42}})],
  ['missing instance epoch', wireReply({...validWireCommand(), handle: {session:'synthetic',generation:7,id:'window'}})],
  ['malformed instance epoch', wireReply({...validWireCommand(), handle: {...validWireCommand().handle, instance: 'caller-session'}})],
  ['stale handle generation', wireReply({...validWireCommand(), handle: {...validWireCommand().handle, generation: 6}})],
  ['string geometry', wireReply({...validWireCommand(), operation: 'place', rect: {x:'0',y:0,width:100,height:100}})],
  ['negative rectangle width', wireReply({...validWireCommand(), operation: 'place', rect: {x:0,y:0,width:-4,height:100}})],
  ['zero rectangle height', wireReply({...validWireCommand(), operation: 'place', rect: {x:0,y:0,width:100,height:0}})],
  ['out-of-bound coordinate', wireReply({...validWireCommand(), operation: 'place', rect: {x:1000001,y:0,width:100,height:100}})],
  ['unknown rectangle field', wireReply({...validWireCommand(), operation: 'place', rect: {x:0,y:0,width:100,height:100,extra:true}})],
  ['null rectangle', wireReply({...validWireCommand(), operation: 'place', rect: null})],
  ['array rectangle', wireReply({...validWireCommand(), operation: 'place', rect: [0,0,100,100]})],
  ['missing expiry', wireReply({...validWireCommand(), expires: undefined})],
  ['negative expiry', wireReply({...validWireCommand(), expires: -1})],
  ['unsafe expiry', wireReply({...validWireCommand(), expires: Number.MAX_VALUE})],
  ['string expiry', wireReply({...validWireCommand(), expires: '100'})],
  ['missing remaining deadline', {kind:'command',command:validWireCommand()}],
  ['zero remaining deadline', {...wireReply(), expiresInMs: 0}],
  ['negative remaining deadline', {...wireReply(), expiresInMs: -1}],
  ['oversize remaining deadline', {...wireReply(), expiresInMs: 5001}],
  ['nonfinite remaining deadline', {...wireReply(), expiresInMs: Infinity}],
  ['malformed ID', wireReply({...validWireCommand(), id: '7-0'})],
  ['wrong command generation', wireReply({...validWireCommand(), generation: 6})],
  ['unknown operation', wireReply({...validWireCommand(), operation: 'eval'})],
  ['empty reply with unknown field', {kind:'empty',reason:'POLL_DEADLINE',unexpected:true}],
  ['empty reply without reason', {kind:'empty'}],
  ['reconnect reply with unknown field', {kind:'reconnect',reason:'HELPER_RESTARTED',unexpected:true}],
];
test.each(invalidReplies)('KWin rejects %s before any execution or ack', (_name, reply) => {
  const f = loopFixture();
  f.calls[0]!.reply({protocolVersion:1,generation:7});
  f.calls[1]!.reply(reply);
  expect(f.effects()).toBe(0);
  expect(f.calls.map(call => call.method)).toEqual(['Handshake', 'NextCommand']);
  expect(f.issues).toEqual(['COMPANION_PROTOCOL_FAILURE']);
  // A late valid reply cannot revive the stopped loop or execute the same ID.
  f.calls[1]!.reply(wireReply());
  expect(f.effects()).toBe(0);
});
test.each([
  {protocolVersion:1,generation:7,unexpected:true},
  {protocolVersion:1,generation:0},
  {protocolVersion:1,generation:1.5},
  {protocolVersion:2,generation:7},
])('KWin rejects malformed handshake before polling: %j', reply => {
  const f = loopFixture(); f.calls[0]!.reply(reply);
  expect(f.calls).toHaveLength(1);
  expect(f.effects()).toBe(0);
  expect(f.issues).toEqual(['COMPANION_PROTOCOL_FAILURE']);
});
test('KWin requires exact acknowledgement fields before requesting another command', () => {
  const f = loopFixture(); f.calls[0]!.reply({protocolVersion:1,generation:7});
  f.calls[1]!.reply(wireReply());
  expect(f.effects()).toBe(1);
  f.calls[2]!.reply({kind:'ack',unexpected:true});
  expect(f.calls).toHaveLength(3);
  expect(f.issues).toEqual(['COMPANION_PROTOCOL_FAILURE']);
});
test('KWin accepts bounded fractional placement only after complete validation', () => {
  const f = loopFixture(); f.calls[0]!.reply({protocolVersion:1,generation:7});
  f.calls[1]!.reply(wireReply({...validWireCommand(), operation:'place',rect:{x:-100.5,y:20.25,width:400.5,height:300.25}}));
  expect(f.effects()).toBe(1);
  expect(f.calls[2]!.method).toBe('Ack');
  expect(f.calls[2]!.body.outcome).toBe('ok');
});


test('wire parsing rejects non-JSON records and nonfinite geometry without exposing seeded content', () => {
  for (const handle of [null, [], Object.create({generation:7}), {...validWireCommand().handle, [Symbol('extra')]: true}]) {
    expect(() => parseHandle(handle)).toThrow();
  }
  for (const coordinate of [NaN, Infinity, -Infinity]) {
    expect(() => parseCommand({...validWireCommand(),operation:'place',rect:{x:coordinate,y:0,width:100,height:100}},7)).toThrow();
  }
  expect(() => parsePollResult(JSON.parse('{"kind":"empty","reason":"public","__proto__":{"payload":"private-canary"}}'),7)).toThrow('INVALID_PROTOCOL_FIELDS');
});
test('GI/Qt adapter runtime bundles without Node builtins or helper nonce generation', async () => {
  const result = await build({entryPoints:[fileURLToPath(new URL('./adapters.ts',import.meta.url)),fileURLToPath(new URL('./window-adapters.ts',import.meta.url))],
    bundle:true,platform:'neutral',format:'esm',outdir:'unused',write:false,metafile:true,logLevel:'silent'});
  const inputs = Object.keys(result.metafile!.inputs);
  expect(inputs.some(input => input.endsWith('model.ts') || input.endsWith('helper-epoch.ts'))).toBe(false);
  expect(inputs.some(input => input.endsWith('protocol.ts'))).toBe(true);
});


test('fresh helper processes generate distinct instance epochs without caller-provided state', () => {
  const program = `import {Companion} from ${JSON.stringify(new URL('./model.ts', import.meta.url).href)};
    const companion = new Companion('gnome48', 'same-desktop-session'); companion.connect('48.0');
    console.log(JSON.stringify(companion.register({geometry:()=>({x:0,y:0,width:100,height:100}),
      place(){}, workArea:()=>({x:0,y:0,width:800,height:600}), alive:()=>true,state:()=> 'normal'})));`;
  const run = () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {encoding:'utf8',timeout:5000,maxBuffer:4096});
    expect(result.status, result.stderr).toBe(0);
    return parseHandle(JSON.parse(result.stdout));
  };
  const first = run(), restarted = run();
  expect(first.session).toBe(restarted.session);
  expect(first.id).toBe(restarted.id);
  expect(first.generation).toBe(restarted.generation);
  expect(first.instance).not.toBe(restarted.instance);
});


test('guest harness builds real adapter bundles with source hashes without starting a compositor', async () => {
  const destination = mkdtempSync(join(tmpdir(),'linuxcast-s002-build-'));
  try {
    await buildGuestHarness(destination);
    const manifest = JSON.parse(readFileSync(join(destination,'manifest.json'),'utf8'));
    expect(manifest.kind).toBe('task-owned-real-adapter-guest-harness');
    expect(manifest.sourceSha256['../adapters.ts']).toMatch(/^[0-9a-f]{64}$/u);
    const bundle = readFileSync(join(destination,'desktop-api.js'),'utf8');
    expect(bundle).not.toContain('node:');
    const metadata = JSON.parse(readFileSync(join(destination,'metadata.json'),'utf8'));
    expect(metadata['shell-version']).toEqual(['48']);
    expect(metadata.uuid).toBe('s002-native@linuxcast.invalid');
  } finally { rmSync(destination,{recursive:true,force:true}); }
});
test('guest session harness refuses startup without an explicit disposable-guest request', () => {
  for (const args of [[], ['--inner','/tmp']]) {
    const result = spawnSync('/usr/bin/python3',[fileURLToPath(new URL('./guest/run-session.py',import.meta.url)),'gnome-wayland',...args],{encoding:'utf8',timeout:5000,maxBuffer:4096});
    expect(result.status).toBe(3);
    expect(JSON.parse(result.stdout)).toEqual({state:'unavailable',reason:'EXPLICIT_DISPOSABLE_DEBIAN13_GUEST_REQUIRED',physicalDesktopMatrixEstablished:false});
  }
});
