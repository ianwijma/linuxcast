import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { SHELL_APP_ID, SHELL_CHANNELS } from '../../../../packages/contracts/src/desktop-shell.ts';
import type { DesktopShellState } from '../../../../packages/contracts/src/desktop-shell.ts';
import { APP_URL } from './assets.ts';
import { registerShellIpc, trustedAppSender } from './ipc.ts';

const state: DesktopShellState = { protocolVersion: 1, identity: SHELL_APP_ID, visible: true, focused: false,
  appearance: 'dark', activation: { id: 'launcher.activate', state: 'temporarily-unavailable', backend: null, generation: 0 } };
function fixture() {
  const frame = { url: APP_URL };
  const contents = { mainFrame: frame, isDestroyed: () => false, getURL: () => APP_URL } as unknown as WebContents;
  const event = { sender: contents, senderFrame: frame } as IpcMainInvokeEvent;
  const handlers = new Map<string, (event: IpcMainInvokeEvent, payload: unknown) => unknown>();
  const actions = { contents: () => contents, state: () => state, hide: vi.fn(), resize: vi.fn(), quit: vi.fn(), quitting: () => false };
  const remove = registerShellIpc({ handle: (channel, handler) => { handlers.set(channel, handler); },
    removeHandler: channel => { handlers.delete(channel); } } as Pick<IpcMain, 'handle' | 'removeHandler'>, actions);
  const invoke = (channel: string, payload: unknown = { protocolVersion: 1 }, sender = event) => handlers.get(channel)!(sender, payload);
  return { frame, contents, event, handlers, actions, invoke, remove };
}

describe('renderer to main boundary', () => {
  it('registers only fixed named methods and dispatches validated own-frame requests', () => {
    const f = fixture();
    expect([...f.handlers.keys()].sort()).toEqual([SHELL_CHANNELS.getState, SHELL_CHANNELS.openDataSettings, SHELL_CHANNELS.hide, SHELL_CHANNELS.contentHeight, SHELL_CHANNELS.quit].sort());
    expect(f.invoke(SHELL_CHANNELS.getState)).toEqual({ ok: true, value: state });
    expect(f.invoke(SHELL_CHANNELS.hide)).toEqual({ ok: true, value: null }); expect(f.actions.hide).toHaveBeenCalledOnce();
    expect(f.invoke(SHELL_CHANNELS.contentHeight, { protocolVersion: 1, height: 400 })).toEqual({ ok: true, value: null });
    expect(f.actions.resize).toHaveBeenCalledWith(400); f.remove(); expect(f.handlers.size).toBe(0);
  });
  it('rejects another window, same-URL subframe, navigated frame and destroyed sender', () => {
    const f = fixture();
    for (const event of [
      { sender: {}, senderFrame: f.frame },
      { sender: f.contents, senderFrame: { url: APP_URL } },
      { sender: f.contents, senderFrame: null },
    ]) expect(f.invoke(SHELL_CHANNELS.hide, { protocolVersion: 1 }, event as IpcMainInvokeEvent)).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    f.frame.url = 'https://example.com';
    expect(f.invoke(SHELL_CHANNELS.hide)).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
    f.frame.url = APP_URL; f.contents.getURL = () => 'file:///private';
    expect(f.invoke(SHELL_CHANNELS.hide)).toMatchObject({ ok: false });
    f.contents.getURL = () => APP_URL; f.contents.isDestroyed = () => true;
    expect(f.invoke(SHELL_CHANNELS.hide)).toMatchObject({ ok: false });
    expect(f.actions.hide).not.toHaveBeenCalled();
  });
  it('rejects unknown fields, wrong versions and unbounded height without reflecting content', () => {
    const f = fixture();
    for (const payload of [null, [], {}, { protocolVersion: 2 }, { protocolVersion: 1, secret: 'SYNTHETIC_PRIVATE' }]) {
      const reply = f.invoke(SHELL_CHANNELS.quit, payload);
      expect(reply).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
      expect(JSON.stringify(reply)).not.toContain('SYNTHETIC_PRIVATE');
    }
    for (const height of [-1, 0, 31, 4097, Infinity, NaN, '400', 50.5])
      expect(f.invoke(SHELL_CHANNELS.contentHeight, { protocolVersion: 1, height })).toMatchObject({ ok: false });
    expect(f.actions.resize).not.toHaveBeenCalled(); expect(f.actions.quit).not.toHaveBeenCalled();
  });
  it('returns fixed internal errors and cancels requests once Quit starts', () => {
    const f = fixture();
    f.actions.hide.mockImplementation(() => { throw new Error('SYNTHETIC_PRIVATE'); });
    const reply = f.invoke(SHELL_CHANNELS.hide);
    expect(reply).toEqual({ ok: false, error: { code: 'internal', message: 'Shell operation unavailable.', retryable: false } });
    f.actions.quitting = () => true;
    expect(f.invoke(SHELL_CHANNELS.getState)).toMatchObject({ ok: false, error: { code: 'cancelled' } });
  });
  it('acknowledges Quit before teardown closes the sender', async () => {
    const f = fixture();
    expect(f.invoke(SHELL_CHANNELS.quit)).toEqual({ ok: true, value: null });
    expect(f.actions.quit).not.toHaveBeenCalled();
    await new Promise<void>(resolve => setImmediate(resolve)); expect(f.actions.quit).toHaveBeenCalledOnce();
  });
});

it('binds each data workspace to its exact contents, main frame and packaged document',()=>{
  const url='linuxcast-app://shell/data-settings.html',frame={url},contents={isDestroyed:()=>false,getURL:()=>url,mainFrame:frame};
  const event={sender:contents,senderFrame:frame};
  expect(trustedAppSender(event as unknown as IpcMainInvokeEvent,contents as unknown as WebContents,url)).toBe(true);
  for(const bad of [{...event,sender:{}},{...event,senderFrame:{url}},{...event,senderFrame:{url:'linuxcast-app://shell/index.html'}}])
    expect(trustedAppSender(bad as unknown as IpcMainInvokeEvent,contents as unknown as WebContents,url)).toBe(false);
  expect(trustedAppSender(event as unknown as IpcMainInvokeEvent,contents as unknown as WebContents,'linuxcast-app://shell/index.html')).toBe(false);
});

it('awaits workspace opening and reports its rejection without exposing exception content',async()=>{
  const f=fixture();
  // Re-register with the same trusted sender and one failing native-window opener.
  f.remove();
  const remove=registerShellIpc({handle:(channel,handler)=>{f.handlers.set(channel,handler as never);},removeHandler:channel=>{f.handlers.delete(channel);}},
    {...f.actions,openDataSettings:async()=>{throw new Error('Synthetic private path');}});
  expect(await f.invoke(SHELL_CHANNELS.openDataSettings)).toMatchObject({ok:false,error:{code:'internal',message:'Shell operation unavailable.'}});remove();
});
