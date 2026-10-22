import { DesktopError, parseAck, parseHandshake, parsePollResult } from './protocol.ts';
import type { Command } from './protocol.ts';
import type { Source } from './model.ts';

export type NativeBytes = { get_data(): Uint8Array };
export type MemoryStream = { close(cancel: null): void; steal_as_bytes(): NativeBytes };
export type NativeCancel = { cancel(): void };
export interface MetaSelection {
  transfer_async(type: number, mime: string, maximum: number, output: MemoryStream, cancellable: NativeCancel, callback: (selection: MetaSelection, result: unknown) => void): void;
  transfer_finish(result: unknown): boolean;
}

/** API-shaped bridge for Meta.Selection, exercised with synthetic GI fixtures.
 * St.Clipboard.get_content has no size cap and is deliberately not the reader. */
export function gnomeSelectionSource(selection: MetaSelection, clipboardType: number,
  memory: () => MemoryStream, cancellable: () => NativeCancel): Source {
  return {
    read: (mime, maximum, signal) => new Promise((resolve, reject) => {
      const output = memory();
      const nativeCancel = cancellable();
      const abort = () => nativeCancel.cancel();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { signal.removeEventListener('abort', abort); output.close(null); reject(new DesktopError('CANCELLED')); return; }
      const completed = (_selection: MetaSelection, result: unknown) => {
        signal.removeEventListener('abort', abort);
        try {
          if (signal.aborted) throw new DesktopError('CANCELLED');
          if (!selection.transfer_finish(result)) throw new DesktopError('GNOME_TRANSFER_FAILED');
          output.close(null);
          const bytes = output.steal_as_bytes().get_data();
          if (bytes.byteLength > maximum) throw new DesktopError('NATIVE_TRANSFER_BOUND_VIOLATION');
          resolve(bytes);
        } catch {
          try { output.close(null); } catch { /* already closed */ }
          reject(new DesktopError(signal.aborted ? 'CANCELLED' : 'GNOME_TRANSFER_FAILED'));
        }
      };
      try { selection.transfer_async(clipboardType, mime, maximum, output, nativeCancel, completed); }
      catch {
        signal.removeEventListener('abort', abort);
        try { output.close(null); } catch { /* failed before stream activation */ }
        reject(new DesktopError('GNOME_TRANSFER_FAILED'));
      }
    }),
  };
}

export const BUS = { service: 'io.github.ianwijma.Linuxcast.Spike.Desktop1', path: '/io/github/ianwijma/Linuxcast/Spike/Desktop1', interface: 'io.github.ianwijma.Linuxcast.Spike.Desktop1' } as const;
export type CallDBus = (service: string, path: string, iface: string, method: 'Handshake' | 'NextCommand' | 'Ack', json: string, callback: (reply: string) => void) => void;
export type Watchdog = { cancel(): void; elapsed(): number };
export type TimerFactory = (milliseconds: number, expired: () => void) => Watchdog;

/** Outbound-only KWin loop. A lost D-Bus reply must stop this loop: KWin6.3.6
 * doesn't call JavaScript callbacks on a D-Bus error. Reload creates a new loop. */
export function kwinLoop(callDBus: CallDBus, timer: TimerFactory,
  execute: (command: Command) => 'ok' | 'denied' | 'failed', unavailable: (reason: string, action: string) => void) {
  let closed = false;
  let started = false;
  let busy = false;
  let generation: number;
  let lastSerial = 0;
  let watchdog: Watchdog | undefined;
  const stop = (reason: string) => {
    if (closed) return;
    closed = true;
    watchdog?.cancel();
    unavailable(reason, 'Reload the explicitly enabled companion and negotiate a fresh generation; do not replay commands');
  };
  const invoke = (method: 'Handshake' | 'NextCommand' | 'Ack', value: unknown, callback: (value: Record<string, unknown>, elapsed: number) => void) => {
    if (closed) return;
    if (busy) { stop('DUPLICATE_PENDING_DBUS_CALL'); return; }
    busy = true;
    const current = timer(1500, () => stop('COMPANION_DBUS_TIMEOUT'));
    watchdog = current;
    callDBus(BUS.service, BUS.path, BUS.interface, method, JSON.stringify(value), reply => {
      if (closed) return;
      const elapsed = current.elapsed();
      current.cancel();
      busy = false;
      try {
        if (typeof reply !== 'string' || reply.length > 65536) throw new DesktopError('INVALID_DBUS_REPLY');
        const parsed: unknown = JSON.parse(reply);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new DesktopError('INVALID_DBUS_REPLY');
        callback(parsed as Record<string, unknown>, elapsed);
      } catch { stop('COMPANION_PROTOCOL_FAILURE'); }
    });
  };
  const poll = () => invoke('NextCommand', { protocolVersion: 1, generation }, (reply, elapsed) => {
    const parsed = parsePollResult(reply, generation);
    if (parsed.kind === 'reconnect') { stop('COMPANION_RESTARTED'); return; }
    if (parsed.kind === 'empty') { poll(); return; }
    const command = parsed.command;
    const serial = Number(command.id.split('-')[1]);
    if (serial <= lastSerial) throw new DesktopError('REPLAYED_COMMAND');
    lastSerial = serial;
    // The whole request elapsed time bounds reply transit conservatively. A
    // QTimer remainingTime-backed elapsed value avoids wall-clock adjustments.
    const outcome = elapsed >= parsed.expiresInMs ? 'expired' : execute(command);
    invoke('Ack', { protocolVersion: 1, generation, id: command.id, outcome }, ack => {
      parseAck(ack);
      poll();
    });
  });
  return {
    start(): void {
      if (started || closed) return;
      started = true;
      invoke('Handshake', { protocolVersion: 1, backend: 'kwin6.3' }, reply => {
        generation = parseHandshake(reply).generation;
        poll();
      });
    },
    stop: () => stop('COMPANION_STOPPED'),
  };
}
