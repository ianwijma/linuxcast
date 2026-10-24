import { describe, expect, it, vi } from 'vitest';
import { SHELL_APP_ID, SHELL_CHANNELS } from '../../../../packages/contracts/src/desktop-shell.ts';
import { createShellApi } from './api.ts';
const state = { protocolVersion: 1, identity: SHELL_APP_ID, visible: true, focused: false,
  appearance: 'dark', activation: { id: 'launcher.activate', state: 'temporarily-unavailable', backend: null, generation: 0 } };
function fixture() {
  const transport = { invoke: vi.fn<(channel: string, payload: unknown) => Promise<unknown>>(async () => ({ ok: true, value: null })),
    on: vi.fn(), removeListener: vi.fn() };
  return { transport, api: createShellApi(transport) };
}
describe('sandboxed preload API', () => {
  it('exposes named methods, no channel forwarding or event objects', async () => {
    const { api, transport } = fixture();
    expect(Object.keys(api).sort()).toEqual(['getState', 'hideLauncher', 'reportContentHeight', 'quit', 'onState', 'runtime'].sort());
    expect(Object.isFrozen(api)).toBe(true); expect(Object.isFrozen(api.runtime)).toBe(true);
    await api.hideLauncher(); expect(transport.invoke).toHaveBeenLastCalledWith(SHELL_CHANNELS.hide, { protocolVersion: 1 });
    await api.reportContentHeight(300); expect(transport.invoke).toHaveBeenLastCalledWith(SHELL_CHANNELS.contentHeight, { protocolVersion: 1, height: 300 });
    await api.quit(); expect(transport.invoke).toHaveBeenLastCalledWith(SHELL_CHANNELS.quit, { protocolVersion: 1 });
    transport.invoke.mockResolvedValue({ ok: true, value: state });
    expect(await api.getState()).toEqual({ ok: true, value: state });
    expect(transport.invoke).toHaveBeenLastCalledWith(SHELL_CHANNELS.getState, { protocolVersion: 1 });
  });
  it('validates replies and drops unexpected data, transport errors and private error strings', async () => {
    const { api, transport } = fixture();
    for (const value of [undefined, { ok: true, value: 'SYNTHETIC_PRIVATE' }, { ok: true, value: null, raw: 'SYNTHETIC_PRIVATE' }]) {
      transport.invoke.mockResolvedValue(value);
      expect(await api.hideLauncher()).toEqual({ ok: false, error: { code: 'internal', message: 'Shell operation unavailable.', retryable: false } });
    }
    transport.invoke.mockRejectedValue(new Error('SYNTHETIC_PRIVATE'));
    expect(JSON.stringify(await api.getState())).not.toContain('SYNTHETIC_PRIVATE');
  });
  it('passes only validated state, unsubscribes exactly once and ignores queued events after disposal', () => {
    const { api, transport } = fixture(), listener = vi.fn();
    const dispose = api.onState(listener), receive = transport.on.mock.calls[0]![1];
    const privateEvent = { sender: 'SYNTHETIC_PRIVATE' };
    receive(privateEvent, state); expect(listener).toHaveBeenLastCalledWith(state);
    receive(privateEvent, { ...state, extra: 'SYNTHETIC_PRIVATE' }); expect(listener).toHaveBeenCalledTimes(1);
    dispose(); dispose();
    expect(transport.removeListener).toHaveBeenCalledTimes(1);
    expect(transport.removeListener).toHaveBeenCalledWith(SHELL_CHANNELS.state, receive);
    receive(privateEvent, state); expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(listener.mock.calls)).not.toContain('SYNTHETIC_PRIVATE');
  });
});
