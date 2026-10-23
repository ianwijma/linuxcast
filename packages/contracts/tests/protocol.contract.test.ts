import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { capabilityStatusSchema, ContractError, encodeFrame, FrameDecoder, handshakeSchema,
  MAX_ENVELOPE_BYTES, parseContract, parseJson, parseRequest, rpcFailureSchema } from '../src/index.ts';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/protocol.json', import.meta.url), 'utf8')) as
  Array<{ id: string; kind: string; json: string; valid: boolean; expected?: Record<string, unknown> }>;
const methods = new Map([['ping', z.strictObject({})]]);

describe('shared native wire fixtures', () => {
  it('dispatches the registered schema output, including stripping, defaults and transforms', () => {
    const registry = new Map([['normalize', z.object({
      allowed: z.number().default(2), text: z.string().transform(value => value.toLowerCase()),
    })]]);
    const request = parseRequest({ protocolVersion: 1, id: 'fixture', method: 'normalize',
      params: { text: 'SYNTHETIC', extra: 'discard' } }, registry);
    expect(request.params).toEqual({ allowed: 2, text: 'synthetic' });
  });
  for (const fixture of fixtures) {
    it(fixture.id, () => {
      const run = () => {
        const value = parseJson(fixture.json);
        switch (fixture.kind) {
          case 'capability': return parseContract(capabilityStatusSchema, value);
          case 'handshake': return parseContract(handshakeSchema, value);
          case 'failure': return parseContract(rpcFailureSchema, value);
          case 'request': return parseRequest(value, methods);
          default: throw new Error('Unrecognized fixture kind.');
        }
      };
      if (fixture.valid) {
        const output = run();
        if (fixture.expected) {
          // Inspect every expected own key, including __proto__, without helpers
          // which may themselves omit prototype-named properties.
          for (const [key, value] of Object.entries(fixture.expected)) {
            expect((output as Record<string, unknown>)[key]).toStrictEqual(value);
          }
        }
      }
      else {
        expect(run).toThrow(ContractError);
        try { run(); } catch (error) {
          expect((error as ContractError).failure).toMatchObject({ code: 'invalid-request', retryable: false });
          expect((error as Error).message).not.toContain('synthetic-invocation');
        }
      }
    });
  }

  it('runs the Serde mirror against exactly these fixtures', () => {
    const result = spawnSync('cargo', ['test', '--locked', '--offline', '-p', 'linuxcast-protocol'], {
      cwd: new URL('../../../', import.meta.url), encoding: 'utf8', timeout: 60_000,
    });
    expect(result.error, result.error?.message).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }, 65_000);
});

describe('bounded UTF-8 framing', () => {
  it('handles fragmented multibyte JSON and coalesced frames without dropping a message', () => {
    const frames = [encodeFrame({ text: 'Synthetic 🐧' }), encodeFrame({ second: true })];
    const bytes = new Uint8Array(frames.reduce((n, b) => n + b.length, 0));
    bytes.set(frames[0]!); bytes.set(frames[1]!, frames[0]!.length);
    for (const split of [1, 3, 4, 5, bytes.length - 1, bytes.length]) {
      const decoder = new FrameDecoder(); const received: unknown[] = [];
      decoder.push(bytes.subarray(0, split), v => received.push(v));
      decoder.push(bytes.subarray(split), v => received.push(v));
      decoder.finish();
      expect(received).toEqual([{ text: 'Synthetic 🐧' }, { second: true }]);
    }
  });
  it('rejects an oversized claim using only its four header bytes, then refuses reuse', () => {
    const decoder = new FrameDecoder();
    const header = new Uint8Array(4); new DataView(header.buffer).setUint32(0, MAX_ENVELOPE_BYTES + 1);
    expect(() => decoder.push(header, () => { throw new Error('Must not dispatch'); })).toThrow(ContractError);
    expect(() => decoder.push(encodeFrame({}), () => {})).toThrow(ContractError);
  });
  it('accepts exactly 1 MiB and rejects larger outbound JSON', () => {
    const text = 'x'.repeat(MAX_ENVELOPE_BYTES - 2);
    const decoder = new FrameDecoder(); let actual: unknown;
    decoder.push(encodeFrame(text), value => { actual = value; }); decoder.finish();
    expect(actual).toBe(text);
    expect(() => encodeFrame(text + 'x')).toThrow(ContractError);
  });
  it.each([[0, 0, 0, 0], [0, 0, 0, 1, 255], [0, 0, 0, 1, 123]])('rejects malformed bodies %j', (...bytes) => {
    expect(() => new FrameDecoder().push(new Uint8Array(bytes), () => {})).toThrow(ContractError);
  });
  it.each([[0], [0, 0, 0, 2, 123]])('rejects truncated frames %j', (...bytes) => {
    const decoder = new FrameDecoder(); decoder.push(new Uint8Array(bytes), () => {});
    expect(() => decoder.finish()).toThrow(ContractError);
  });
  it('rejects nonfinite and non-JSON outbound data instead of silently changing it', () => {
    for (const value of [NaN, Infinity, undefined, { missing: undefined }, new Date()]) {
      expect(() => encodeFrame(value)).toThrow(ContractError);
    }
  });
  it('bounds nesting on both sides of the 64-container limit', () => {
    expect(() => parseJson('['.repeat(64) + '0' + ']'.repeat(64))).not.toThrow();
    expect(() => parseJson('['.repeat(65) + '0' + ']'.repeat(65))).toThrow(ContractError);
  });
});
