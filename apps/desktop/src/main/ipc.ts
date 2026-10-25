import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import {
  SHELL_CHANNELS, shellRequestSchema, shellContentHeightRequestSchema,
} from '../../../../packages/contracts/src/desktop-shell.ts';
import type { DesktopShellState, ShellCommandReply, ShellStateReply } from '../../../../packages/contracts/src/desktop-shell.ts';
import { APP_URL } from './assets.ts';

type ShellReply = ShellCommandReply | ShellStateReply;
type ShellResult = ShellReply | Promise<ShellReply>;
export interface ShellActions {
  contents(): WebContents | undefined;
  state(): DesktopShellState;
  hide(): void;
  resize(height: number): void;
  quit(): void;
  quitting(): boolean;
  openDataSettings?(): void | Promise<void>;
}

function failure(code: 'invalid-request' | 'permission-denied' | 'cancelled' | 'internal'): ShellCommandReply {
  const message = {
    'invalid-request': 'Invalid shell request.', 'permission-denied': 'Shell request denied.',
    cancelled: 'Linuxcast is quitting.', internal: 'Shell operation unavailable.',
  }[code];
  return { ok: false, error: { code, message, retryable: false } };
}

export function trustedAppSender(event: IpcMainInvokeEvent, contents: WebContents | undefined, expectedUrl: string): boolean {
  try {
    return !!contents && !contents.isDestroyed() && event.sender === contents &&
      event.senderFrame === contents.mainFrame && event.senderFrame?.url === expectedUrl && contents.getURL() === expectedUrl;
  } catch { return false; }
}

export function trustedShellSender(event: IpcMainInvokeEvent, contents: WebContents | undefined): boolean {
  return trustedAppSender(event, contents, APP_URL);
}

export function registerShellIpc(ipc: Pick<IpcMain, 'handle' | 'removeHandler'>, actions: ShellActions): () => void {
  const handlers: Array<[string, (event: IpcMainInvokeEvent, payload: unknown) => ShellResult]> = [];
  const operations: Array<[string, () => ShellResult]> = [
    [SHELL_CHANNELS.getState, () => ({ ok: true, value: actions.state() })],
    [SHELL_CHANNELS.openDataSettings, () => { if (!actions.openDataSettings) return failure('internal'); return Promise.resolve().then(() => actions.openDataSettings!()).then(() => ({ok:true as const,value:null}), () => failure('internal')); }],
    [SHELL_CHANNELS.hide, () => { actions.hide(); return { ok: true, value: null }; }],
    // Reply before asynchronous teardown closes the sender's window.
    [SHELL_CHANNELS.quit, () => { setImmediate(() => actions.quit()); return { ok: true, value: null }; }],
  ];
  for (const [channel, operation] of operations) {
    handlers.push([channel, (event, payload) => {
      if (!trustedShellSender(event, actions.contents())) return failure('permission-denied');
      if (!shellRequestSchema.safeParse(payload).success) return failure('invalid-request');
      if (actions.quitting()) return failure('cancelled');
      try { return operation(); } catch { return failure('internal'); }
    }]);
  }
  handlers.push([SHELL_CHANNELS.contentHeight, (event, payload) => {
    if (!trustedShellSender(event, actions.contents())) return failure('permission-denied');
    const parsed = shellContentHeightRequestSchema.safeParse(payload);
    if (!parsed.success) return failure('invalid-request');
    if (actions.quitting()) return failure('cancelled');
    try { actions.resize(parsed.data.height); return { ok: true, value: null }; }
    catch { return failure('internal'); }
  }]);
  for (const [channel, handler] of handlers) ipc.handle(channel, handler);
  return () => { for (const [channel] of handlers) ipc.removeHandler(channel); };
}
