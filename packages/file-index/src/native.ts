import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { FrameDecoder, encodeFrame, parseContract } from '../../contracts/src/index.ts';
import { nativeEventSchema, rootConfigSchema } from './contracts.ts';
import type { NativeEvent, RootConfig } from './contracts.ts';

export class IndexUnavailable extends Error {
  readonly reason: 'native-unavailable' | 'protocol-invalid' | 'root-unavailable' | 'unsupported' | 'deadline-exceeded';
  constructor(reason: IndexUnavailable['reason']) {
    super(`File index unavailable: ${reason}.`);
    this.reason=reason;
  }
}
/** Trusted main supplies the fixed packaged executable. Never accept it in IPC. */
export class NativeIndexSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly chunks: AsyncIterator<Buffer>;
  private readonly decoder = new FrameDecoder();
  private readonly events: NativeEvent[] = [];
  private readonly exited: Promise<void>;
  private busy = false;
  private ended = false;
  private closing: Promise<void> | undefined;
  private constructor(executable: string) {
    if (!isAbsolute(executable)) throw new IndexUnavailable('native-unavailable');
    this.child = spawn(executable, ['index'], {stdio:['pipe','pipe','pipe'], env:{LANG:'C.UTF-8'}});
    this.child.stderr.resume(); // Native stderr is fixed codes; never forward raw diagnostics.
    this.child.stdin.on('error', () => {});
    this.child.on('error', () => {});
    this.chunks = this.child.stdout[Symbol.asyncIterator]();
    this.exited = new Promise(resolve => {this.child.once('exit', () => resolve());this.child.once('error', () => resolve());});
  }
  static async open(executable: string, config: RootConfig): Promise<NativeIndexSession> {
    const normalized = parseContract(rootConfigSchema,config);
    const session = new NativeIndexSession(executable);
    const timer=setTimeout(() => session.child.kill('SIGKILL'),5000);
    try {
      if ((await session.read()).kind !== 'ready') throw new IndexUnavailable('protocol-invalid');
      const id=randomUUID(); await session.send({kind:'configure',id,protocolVersion:1,config:normalized});
      const event=await session.read();
      if (!('id' in event) || event.id!==id) throw new IndexUnavailable('protocol-invalid');
      if (event.kind==='failed') throw new IndexUnavailable(event.reason==='unsupported'?'unsupported':'root-unavailable');
      if (event.kind!=='configured') throw new IndexUnavailable('protocol-invalid');
      return session;
    } catch (error) {await session.close();throw error instanceof IndexUnavailable?error:new IndexUnavailable('native-unavailable');}
    finally {clearTimeout(timer);}
  }
  private async send(value: unknown): Promise<void> {
    if (this.ended) throw new IndexUnavailable('native-unavailable');
    if (!this.child.stdin.write(encodeFrame(value))) await once(this.child.stdin,'drain');
  }
  private async read(): Promise<NativeEvent> {
    while (!this.events.length) {
      const {done,value}=await this.chunks.next();
      if (done) {this.decoder.finish();throw new IndexUnavailable('native-unavailable');}
      this.decoder.push(value, data => {
        if (this.events.length>=256) throw new IndexUnavailable('protocol-invalid');
        this.events.push(parseContract(nativeEventSchema,data));
      });
    }
    return this.events.shift()!;
  }
  async *scan(id: string, signal?: AbortSignal, timeoutMs=120_000): AsyncGenerator<Extract<NativeEvent,{kind:'batch'|'finished'}>> {
    if (this.busy || this.ended || signal?.aborted) throw new IndexUnavailable('native-unavailable');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>300_000) throw new IndexUnavailable('deadline-exceeded');
    this.busy=true; let finished=false; let timedOut=false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const cancel=() => {
      void this.send({kind:'cancel'}).catch(() => {});
      killTimer ??= setTimeout(() => this.child.kill('SIGKILL'),1000);
    };
    const timer=setTimeout(() => {timedOut=true;cancel();},timeoutMs);
    signal?.addEventListener('abort',cancel,{once:true});
    try {
      await this.send({kind:'scan',id});
      if (signal?.aborted) cancel();
      for (;;) {
        const event=await this.read();
        if (!('id' in event) || event.id!==id || (event.kind!=='batch' && event.kind!=='finished')) throw new IndexUnavailable('protocol-invalid');
        if (event.kind==='finished') {
          if (timedOut) throw new IndexUnavailable('deadline-exceeded');
          finished=true;
        }
        yield event;
        if (finished) break;
      }
      if (timedOut) throw new IndexUnavailable('deadline-exceeded');
    } finally {
      clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',cancel);
      this.busy=false;
      if (!finished || timedOut) await this.close();
    }
  }
  async poll(): Promise<Extract<NativeEvent,{kind:'watch'}>> {
    if (this.busy || this.ended) throw new IndexUnavailable('native-unavailable');
    this.busy=true; const id=randomUUID(); const timer=setTimeout(() => this.child.kill('SIGKILL'),5000);
    try {
      await this.send({kind:'poll',id});const event=await this.read();
      if (event.kind!=='watch' || event.id!==id) throw new IndexUnavailable('protocol-invalid');
      return event;
    } catch {await this.close();throw new IndexUnavailable('native-unavailable');}
    finally {clearTimeout(timer);this.busy=false;}
  }
  close(): Promise<void> {
    this.closing ??= (async () => {
      this.ended=true;
      this.child.stdin.end(encodeFrame({kind:'close'}));
      const timer=setTimeout(() => this.child.kill('SIGKILL'),1000);
      try {await this.exited;} finally {clearTimeout(timer);}
    })();
    return this.closing;
  }
}
