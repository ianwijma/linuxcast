import { ContractError, MAX_ENVELOPE_BYTES } from './protocol.ts';
import { parseJson } from './json.ts';
import { jsonValueSchema } from './json-value.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export function encodeFrame(value: unknown): Uint8Array {
  let json: string | undefined;
  try {
    if (!jsonValueSchema.safeParse(value).success) throw new ContractError('Invalid JSON envelope.');
    json = JSON.stringify(value);
  }
  catch { throw new ContractError('Invalid JSON envelope.'); }
  if (json === undefined) throw new ContractError('Invalid JSON envelope.');
  const payload = encoder.encode(json);
  if (payload.length > MAX_ENVELOPE_BYTES) throw new ContractError('Protocol envelope exceeds 1 MiB.');
  parseJson(json);
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length, false);
  frame.set(payload, 4);
  return frame;
}

/** Incremental framing; inspect the header before allocating payload storage.
 * Any framing/consumer error poisons this connection. Reconnect and handshake anew.
 * Dispatch must validate the decoded JSON using the appropriate registered schema.
 */
export class FrameDecoder {
  private readonly header = new Uint8Array(4);
  private headerBytes = 0;
  private payload: Uint8Array | undefined;
  private payloadBytes = 0;
  private failed = false;

  push(chunk: Uint8Array, consume: (message: unknown) => void): void {
    if (this.failed) throw new ContractError('Protocol connection has failed.');
    try {
      let offset = 0;
      while (offset < chunk.length) {
        if (!this.payload) {
          const count = Math.min(4 - this.headerBytes, chunk.length - offset);
          this.header.set(chunk.subarray(offset, offset + count), this.headerBytes);
          this.headerBytes += count;
          offset += count;
          if (this.headerBytes !== 4) continue;
          const size = new DataView(this.header.buffer).getUint32(0, false);
          if (size > MAX_ENVELOPE_BYTES) throw new ContractError('Protocol envelope exceeds 1 MiB.');
          if (size === 0) throw new ContractError('Invalid JSON envelope.');
          this.payload = new Uint8Array(size);
        }
        const count = Math.min(this.payload.length - this.payloadBytes, chunk.length - offset);
        this.payload.set(chunk.subarray(offset, offset + count), this.payloadBytes);
        this.payloadBytes += count;
        offset += count;
        if (this.payloadBytes === this.payload.length) {
          let value: unknown;
          try { value = parseJson(decoder.decode(this.payload)); }
          catch { throw new ContractError('Invalid UTF-8 JSON envelope.'); }
          this.headerBytes = 0;
          this.payloadBytes = 0;
          this.payload = undefined;
          consume(value);
        }
      }
    } catch (error) {
      this.failed = true;
      this.payload = undefined;
      throw error;
    }
  }

  finish(): void {
    if (this.failed) throw new ContractError('Protocol connection has failed.');
    if (this.headerBytes !== 0 || this.payload) {
      this.failed = true;
      this.payload = undefined;
      throw new ContractError('Truncated protocol frame.');
    }
  }
}
