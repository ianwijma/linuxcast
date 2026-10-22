export const MAX_FRAME = 1024 * 1024;
export const MAX_DIAGNOSTICS = 1024 * 1024;
export const MAX_REQUESTS = 64;
export type Envelope = {
  protocolVersion: 1;
  sessionId: string;
  requestId: string;
  method: string;
  params: Record<string, unknown>;
};

export class ProtocolError extends Error {}

export function frame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value));
  if (!body.length || body.length > MAX_FRAME) throw new ProtocolError('FRAME_SIZE');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

/** Incremental framing never accumulates more than one bounded body. */
export class Decoder {
  private header = Buffer.alloc(0);
  private body: Buffer | undefined;
  private used = 0;
  push(chunk: Buffer, consume: (value: unknown) => void): void {
    while (chunk.length) {
      if (!this.body) {
        const count = Math.min(4 - this.header.length, chunk.length);
        this.header = Buffer.concat([this.header, chunk.subarray(0, count)]);
        chunk = chunk.subarray(count);
        if (this.header.length !== 4) continue;
        const length = this.header.readUInt32BE();
        if (!length || length > MAX_FRAME) throw new ProtocolError('FRAME_SIZE');
        this.body = Buffer.alloc(length);
        this.header = Buffer.alloc(0);
      }
      const count = Math.min(this.body.length - this.used, chunk.length);
      chunk.copy(this.body, this.used, 0, count);
      this.used += count;
      chunk = chunk.subarray(count);
      if (this.used === this.body.length) {
        let value: unknown;
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(this.body);
          value = JSON.parse(text);
        } catch { throw new ProtocolError('FRAME_JSON'); }
        this.body = undefined;
        this.used = 0;
        consume(value);
      }
    }
  }
  finish(): void {
    if (this.header.length || this.body) throw new ProtocolError('FRAME_TRUNCATED');
  }
}

export function envelope(value: unknown, sessionId: string): Envelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProtocolError('ENVELOPE');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join(',') !== 'method,params,protocolVersion,requestId,sessionId'
      || item.protocolVersion !== 1 || item.sessionId !== sessionId
      || typeof item.requestId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(item.requestId)
      || typeof item.method !== 'string' || item.method.length > 64
      || !item.params || typeof item.params !== 'object' || Array.isArray(item.params)) {
    throw new ProtocolError('ENVELOPE');
  }
  return item as Envelope;
}

/** This is a fixed spike broker, not the future SDK or permission schema. */
export function brokerReply(request: Envelope): Record<string, unknown> {
  if (Object.keys(request.params).length) throw new ProtocolError('PARAMS');
  if (request.method === 'fixture.read') return { ok: true, value: 'public broker fixture' };
  if (request.method === 'fixture.denied') return { ok: false, code: 'PERMISSION_DENIED' };
  throw new ProtocolError('METHOD');
}
