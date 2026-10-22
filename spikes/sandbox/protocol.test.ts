import { expect, test } from 'vitest';
import { brokerReply, Decoder, envelope, frame, MAX_FRAME } from './protocol.ts';

const request = { protocolVersion: 1, sessionId: 'parent-session', requestId: 'one', method: 'fixture.read', params: {} };

test('framing handles every split and multiple frames without changing data', () => {
  const encoded = frame(request);
  for (let split = 0; split < encoded.length; split++) {
    const decoder = new Decoder();
    const result: unknown[] = [];
    decoder.push(encoded.subarray(0, split), value => result.push(value));
    decoder.push(encoded.subarray(split), value => result.push(value));
    decoder.finish();
    expect(result).toEqual([request]);
  }
  const result: unknown[] = [];
  new Decoder().push(Buffer.concat([encoded, encoded]), value => result.push(value));
  expect(result).toEqual([request, request]);
});

test('oversized, zero, malformed UTF-8/JSON and truncated frames fail closed', () => {
  for (const size of [0, MAX_FRAME + 1, 0xffffffff]) {
    const header = Buffer.alloc(4); header.writeUInt32BE(size);
    expect(() => new Decoder().push(header, () => {})).toThrow('FRAME_SIZE');
  }
  for (const data of [Buffer.from([0, 0, 0, 1, 255]), Buffer.from([0, 0, 0, 1, 123])]) {
    expect(() => new Decoder().push(data, () => {})).toThrow('FRAME_JSON');
  }
  for (const data of [Buffer.from([0]), Buffer.from([0, 0, 0, 3, 123])]) {
    const decoder = new Decoder(); decoder.push(data, () => {});
    expect(() => decoder.finish()).toThrow('FRAME_TRUNCATED');
  }
});

test('broker identity comes from its channel and grants, not caller declarations', () => {
  expect(brokerReply(envelope(request, 'parent-session'))).toEqual({ ok: true, value: 'public broker fixture' });
  expect(brokerReply(envelope({ ...request, method: 'fixture.denied' }, 'parent-session'))).toEqual({ ok: false, code: 'PERMISSION_DENIED' });
  for (const item of [{ ...request, packageId: 'builtin' }, { ...request, sessionId: 'stale' }, { ...request, params: [] }]) {
    expect(() => envelope(item, 'parent-session')).toThrow('ENVELOPE');
  }
  expect(() => brokerReply(envelope({ ...request, method: 'files.read' }, 'parent-session'))).toThrow('METHOD');
  expect(() => brokerReply(envelope({ ...request, params: { path: '/etc/shadow' } }, 'parent-session'))).toThrow('PARAMS');
});
