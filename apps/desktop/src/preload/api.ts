import {
  SHELL_CHANNELS, desktopShellStateSchema, shellCommandReplySchema, shellStateReplySchema,
} from '../../../../packages/contracts/src/desktop-shell.ts';
import type { DesktopShellApi } from '../../../../packages/contracts/src/desktop-shell.ts';

/** Private adapter, never exposed across contextBridge. No Electron event crosses it. */
export interface ShellTransport {
  invoke(channel: string, payload: unknown): Promise<unknown>;
  on(channel: string, listener: (event: unknown, value: unknown) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, value: unknown) => void): unknown;
}

export function createShellApi(transport: ShellTransport): DesktopShellApi {
  const unavailable = { ok: false as const, error: {
    code: 'internal' as const, message: 'Shell operation unavailable.', retryable: false,
  } };
  const command = async (channel: string, payload: unknown) => {
    try {
      const result = shellCommandReplySchema.safeParse(await transport.invoke(channel, payload));
      return result.success ? result.data : unavailable;
    } catch { return unavailable; }
  };
  return Object.freeze({
    getState: async () => {
      try {
        const result = shellStateReplySchema.safeParse(await transport.invoke(SHELL_CHANNELS.getState, { protocolVersion: 1 }));
        return result.success ? result.data : unavailable;
      } catch { return unavailable; }
    },
    openDataSettings: () => command(SHELL_CHANNELS.openDataSettings, { protocolVersion: 1 }),
    hideLauncher: () => command(SHELL_CHANNELS.hide, { protocolVersion: 1 }),
    reportContentHeight: (height: number) => command(SHELL_CHANNELS.contentHeight, { protocolVersion: 1, height }),
    quit: () => command(SHELL_CHANNELS.quit, { protocolVersion: 1 }),
    onState: (listener: Parameters<DesktopShellApi['onState']>[0]) => {
      if (typeof listener !== 'function') throw new TypeError('A state listener is required.');
      let active = true;
      const wrapped = (_event: unknown, value: unknown) => {
        const state = desktopShellStateSchema.safeParse(value);
        if (active && state.success) listener(state.data);
      };
      transport.on(SHELL_CHANNELS.state, wrapped);
      return () => {
        if (!active) return;
        active = false;
        transport.removeListener(SHELL_CHANNELS.state, wrapped);
      };
    },
    runtime: Object.freeze({ sandboxed: true, contextIsolated: true }),
  });
}
