/** S0-02 private fixture vocabulary. These are proposals, not frozen contracts. */
export type Backend = 'gnome48' | 'kwin6.3';
export type State = { state: 'available' | 'component-required' | 'permission-required' | 'unsupported' | 'temporarily-unavailable'; reason: string; action: string; generation: number };
import { DesktopError, parseHandle, parseCommandInput, validRect } from './protocol.ts';
import type { Rect, Handle, Command, CommandInput, PollResult } from './protocol.ts';
import { newCompanionInstance } from './helper-epoch.ts';
export { DesktopError, validRect } from './protocol.ts';
export type { Rect, Handle, Command, PollResult } from './protocol.ts';

export function clampRect(rect: Rect, workArea: Rect): Rect {
  validRect(rect); validRect(workArea);
  const width = Math.min(Math.max(64, rect.width), workArea.width);
  const height = Math.min(Math.max(32, rect.height), workArea.height);
  return { x: Math.min(Math.max(rect.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(rect.y, workArea.y), workArea.y + workArea.height - height), width, height };
}

export interface NativeWindow {
  geometry(): Rect;
  place(rect: Rect): void;
  workArea(): Rect;
  alive(): boolean;
  state(): 'normal' | 'maximized' | 'fullscreen';
}

export class Companion {
  private nextId = 0;
  private readonly instance = newCompanionInstance();
  private readonly windows = new Map<string, NativeWindow>();
  private identities = new WeakMap<NativeWindow, string>();
  status: State = { state: 'component-required', reason: 'COMPANION_MISSING', action: 'Explicitly enable the matching desktop companion', generation: 0 };
  readonly backend: Backend;
  readonly session: string;
  constructor(backend: Backend, session: string) { this.backend = backend; this.session = session; }
  connect(version: string, permission = true): State {
    this.windows.clear();
    this.identities = new WeakMap();
    this.status.generation++;
    if (!(this.backend === 'gnome48' ? /^48\./ : /^6\.3\./).test(version)) {
      return this.status = { state: 'unsupported', reason: 'COMPANION_VERSION_MISMATCH',
        action: `Use the ${this.backend === 'gnome48' ? 'GNOME 48' : 'KWin 6.3'} companion on its supported session`, generation: this.status.generation };
    }
    return this.status = { state: permission ? 'available' : 'permission-required',
      reason: permission ? 'READY' : 'COMPANION_CONSENT_REQUIRED', action: permission ? '' : 'Enable the companion explicitly in desktop settings', generation: this.status.generation };
  }
  disconnect(): State {
    this.windows.clear();
    return this.status = { state: 'temporarily-unavailable', reason: 'COMPANION_DISCONNECTED',
      action: 'Reconnect or reload the enabled companion; refresh window handles', generation: this.status.generation + 1 };
  }
  private available(): void {
    if (this.status.state !== 'available') throw new DesktopError(this.status.reason, this.status.action);
  }
  register(window: NativeWindow): Handle {
    this.available();
    if (!window.alive()) throw new DesktopError('WINDOW_GONE');
    const existing = this.identities.get(window);
    if (existing && this.windows.has(existing)) return { session: this.session, instance: this.instance, generation: this.status.generation, id: existing };
    if (this.windows.size >= 256) for (const [id, value] of this.windows) if (!value.alive()) this.windows.delete(id);
    if (this.windows.size >= 256) throw new DesktopError('WINDOW_REGISTRY_LIMIT', 'Refresh the bounded window registry before adding more handles');
    const id = `window-${++this.nextId}`;
    this.windows.set(id, window);
    this.identities.set(window, id);
    return { session: this.session, instance: this.instance, generation: this.status.generation, id };
  }
  private resolve(handle: Handle): NativeWindow {
    this.available();
    try { handle = parseHandle(handle); } catch { throw new DesktopError('STALE_WINDOW_HANDLE'); }
    if (handle.instance !== this.instance || handle.session !== this.session
        || handle.generation !== this.status.generation || !this.windows.has(handle.id)) throw new DesktopError('STALE_WINDOW_HANDLE');
    const value = this.windows.get(handle.id)!;
    if (!value.alive()) { this.windows.delete(handle.id); throw new DesktopError('WINDOW_GONE'); }
    return value;
  }
  geometry(handle: Handle): Rect {
    const rect = this.resolve(handle).geometry();
    validRect(rect);
    return { ...rect };
  }
  place(handle: Handle, rect: Rect): Rect {
    const window = this.resolve(handle);
    if (window.state() !== 'normal') throw new DesktopError('WINDOW_STATE_REQUIRES_REVIEW', 'Leave maximized or fullscreen mode before moving this window');
    const target = clampRect(rect, window.workArea());
    window.place(target);
    // The caller still needs a compositor event/ack before claiming completion.
    return target;
  }
}

export const MIME_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  'text/plain;charset=utf-8': 1024 * 1024, 'text/plain': 1024 * 1024,
  'text/html': 1024 * 1024, 'text/uri-list': 1024 * 1024, 'image/png': 10 * 1024 * 1024,
});
export type ClipboardResult = { status: 'accepted' | 'skipped' | 'cancelled' | 'permission-required' | 'unavailable'; reason: string; ownerGeneration: number; session: string; mime: string; bytes?: Uint8Array };
export type Source = { read(mime: string, maximumBytes: number, signal: AbortSignal): Promise<Uint8Array> };

export class ClipboardTransfer {
  private ownerGeneration = 0;
  private owned = false;
  private permission = false;
  private mimes: string[] = [];
  private active: AbortController | undefined;
  readonly session: string;
  constructor(session: string) { this.session = session; }
  grant(permission: boolean): void { this.permission = permission; if (!permission) this.active?.abort('permission-revoked'); }
  ownerChanged(mimes: string[], linuxcastOwned = false): number {
    this.active?.abort('owner-changed');
    this.ownerGeneration++;
    this.owned = linuxcastOwned;
    this.mimes = mimes.length <= 32 && mimes.every(mime => mime.length <= 128) ? [...mimes] : [];
    return this.ownerGeneration;
  }
  disconnect(): void { this.active?.abort('companion-disconnected'); this.ownerGeneration++; this.mimes = []; }
  async read(mime: string, source: Source, signal?: AbortSignal, timeoutMs = 1000): Promise<ClipboardResult> {
    const ownerGeneration = this.ownerGeneration;
    const base = { ownerGeneration, session: this.session, mime };
    if (!this.permission) return { ...base, status: 'permission-required', reason: 'ENABLE_CLIPBOARD_HISTORY' };
    if (this.owned) return { ...base, status: 'skipped', reason: 'LINUXCAST_OWNERSHIP_LOOP' };
    const limit = Object.hasOwn(MIME_LIMITS, mime) ? MIME_LIMITS[mime] : undefined;
    if (limit === undefined || !this.mimes.includes(mime)) return { ...base, status: 'skipped', reason: 'UNSUPPORTED_MIME_USE_CURRENT_CLIPBOARD' };
    this.active?.abort('superseded-transfer');
    const active = new AbortController();
    this.active = active;
    const abort = () => active.abort('caller-cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    if (active.signal.aborted) {
      signal?.removeEventListener('abort', abort);
      this.active = undefined;
      return { ...base, status: 'cancelled', reason: String(active.signal.reason) };
    }
    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new DesktopError(String(active.signal.reason)));
      active.signal.addEventListener('abort', onAbort, { once: true });
      if (active.signal.aborted) onAbort();
    });
    const deadline = setTimeout(() => active.abort('transfer-deadline'), Math.min(timeoutMs, 1000));
    try {
      // Limit+1 detects oversize instead of silently accepting a truncated clip.
      const bytes = await Promise.race([source.read(mime, limit + 1, active.signal), cancelled]);
      if (ownerGeneration !== this.ownerGeneration || active.signal.aborted) return { ...base, status: 'cancelled', reason: 'STALE_OWNER' };
      if (bytes.byteLength > limit) return { ...base, status: 'skipped', reason: 'MIME_SIZE_LIMIT' };
      return { ...base, status: 'accepted', reason: 'READY', bytes: bytes.slice() };
    } catch (error) {
      return { ...base, status: active.signal.aborted ? 'cancelled' : 'unavailable',
        reason: active.signal.aborted ? String(active.signal.reason) : error instanceof DesktopError ? error.message : 'TRANSFER_FAILED' };
    } finally {
      clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
      if (onAbort) active.signal.removeEventListener('abort', onAbort);
      if (this.active === active) this.active = undefined;
    }
  }
  restoreIfStillOwned(generation: number, restore: () => void): boolean {
    if (!this.owned || generation !== this.ownerGeneration) return false;
    restore();
    return true;
  }
}

type Pending = { resolve(value: PollResult): void; timer: ReturnType<typeof setTimeout> };

/** One authenticated script, one long-poll and one unacknowledged command. */
export class CommandQueue {
  private peer: string | undefined;
  private generation = 0;
  private serial = 0;
  private queue: Command[] = [];
  private inFlight: Command | undefined;
  private pending: Pending | undefined;
  readonly outcomes = new Map<string, string>();
  private readonly now: () => number;
  private readonly authorizedPeer: (peer: string) => boolean;
  constructor(now: () => number = () => Number(process.hrtime.bigint() / 1000000n), authorizedPeer: (peer: string) => boolean = () => false) {
    this.now = now; this.authorizedPeer = authorizedPeer;
  }
  handshake(authenticatedPeer: string): number {
    if (!this.authorizedPeer(authenticatedPeer)) throw new DesktopError('UNEXPECTED_COMPANION_PEER');
    this.reset('COMPANION_RECONNECTED');
    this.peer = authenticatedPeer;
    return this.generation;
  }
  private identity(peer: string, generation: number): void {
    if (!this.authorizedPeer(peer) || this.peer !== peer || generation !== this.generation) throw new DesktopError('STALE_COMPANION_GENERATION');
  }
  private outcome(id: string, value: string): void {
    this.outcomes.set(id, value);
    if (this.outcomes.size > 64) this.outcomes.delete(this.outcomes.keys().next().value!);
  }
  reset(reason = 'HELPER_RESTARTED'): void {
    this.generation++;
    for (const command of [...this.queue, ...(this.inFlight ? [this.inFlight] : [])]) this.outcome(command.id, reason);
    this.queue = [];
    this.inFlight = undefined;
    this.peer = undefined;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.resolve({ kind: 'reconnect', reason }); this.pending = undefined; }
  }
  enqueue(peer: string, generation: number, value: CommandInput, lifetimeMs = 1000): string {
    this.identity(peer, generation);
    const input = parseCommandInput(value);
    if (input.handle.generation !== generation) throw new DesktopError('STALE_WINDOW_HANDLE');
    if (this.queue.length >= 16) throw new DesktopError('COMMAND_QUEUE_FULL');
    if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0 || lifetimeMs > 5000) throw new DesktopError('COMMAND_DEADLINE');
    const command: Command = { ...input, id: `${generation}-${++this.serial}`, generation, expires: this.now() + lifetimeMs };
    this.queue.push(command);
    this.dispatch();
    return command.id;
  }
  private expire(): void {
    this.queue = this.queue.filter(command => {
      if (command.expires <= this.now()) { this.outcome(command.id, 'EXPIRED'); return false; }
      return true;
    });
    if (this.inFlight && this.inFlight.expires <= this.now()) {
      this.outcome(this.inFlight.id, 'EXPIRED_OUTCOME_UNKNOWN');
    }
  }
  private dispatch(): void {
    this.expire();
    if (!this.pending || this.inFlight || !this.queue.length) return;
    const command = this.queue.shift()!;
    this.inFlight = command;
    const pending = this.pending;
    this.pending = undefined;
    clearTimeout(pending.timer);
    pending.resolve({ kind: 'command', command, expiresInMs: command.expires - this.now() });
  }
  next(peer: string, generation: number, waitMs = 500): Promise<PollResult> {
    this.identity(peer, generation);
    this.expire();
    if (this.pending || this.inFlight) throw new DesktopError('ONE_PENDING_REQUEST_OR_ACK_ONLY');
    if (!Number.isFinite(waitMs) || waitMs <= 0 || waitMs > 1000) throw new DesktopError('POLL_DEADLINE');
    const promise = new Promise<PollResult>(resolve => {
      const timer = setTimeout(() => { this.pending = undefined; resolve({ kind: 'empty', reason: 'POLL_DEADLINE' }); }, waitMs);
      this.pending = { resolve, timer };
    });
    this.dispatch();
    return promise;
  }
  ack(peer: string, generation: number, id: string, outcome: 'ok' | 'denied' | 'expired' | 'failed'): void {
    this.identity(peer, generation);
    this.expire();
    if (!this.inFlight || this.inFlight.id !== id || this.inFlight.expires <= this.now()
        || !['ok', 'denied', 'expired', 'failed'].includes(outcome)) throw new DesktopError('STALE_COMMAND_ACK');
    this.outcome(id, outcome);
    this.inFlight = undefined;
  }
}
