import { describe, expect, it, vi } from 'vitest';
import { SHELL_APP_ID, SHELL_CHANNELS } from '../../../../packages/contracts/src/desktop-shell.ts';
import { createShellApi } from './api.ts';
import { LAUNCHER_CHANNELS } from '@linuxcast/contracts';
const state = { protocolVersion: 1, identity: SHELL_APP_ID, visible: true, focused: false,
  appearance: 'dark', activation: { id: 'launcher.activate', state: 'temporarily-unavailable', backend: null, generation: 0 } };
function fixture() {
  const transport = { invoke: vi.fn<(channel: string, payload: unknown) => Promise<unknown>>(async () => ({ ok: true, value: null })),
    on: vi.fn(), removeListener: vi.fn() };
  return { transport, api: createShellApi(transport) };
}
it('passes only validated calculator expressions and returns only bounded numeric-copy receipts',async()=>{
  const {api,transport}=fixture();
  transport.invoke.mockResolvedValue({ok:true,value:{outcome:'copied',text:'4'}});
  expect(await api.copyCalculatorResult!({revision:1,expression:'2+2'})).toEqual({ok:true,value:{outcome:'copied',text:'4'}});
  expect(transport.invoke).toHaveBeenLastCalledWith(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,revision:1,expression:'2+2'});
  transport.invoke.mockClear();for(const request of [{revision:0,expression:'2+2'},{revision:1,expression:'x'.repeat(513)},{revision:1,expression:'2+2',text:'arbitrary'}])expect(await api.copyCalculatorResult!(request)).toMatchObject({ok:false});expect(transport.invoke).not.toHaveBeenCalled();
  for(const reply of [{ok:true,value:{outcome:'copied',text:'NaN'}},{ok:true,value:{outcome:'copied',text:'4',expression:'private'}},{ok:true,value:{outcome:'copied',text:'x'.repeat(1048577)}}]){transport.invoke.mockResolvedValue(reply);expect(await api.copyCalculatorResult!({revision:1,expression:'2+2'})).toMatchObject({ok:false});}
});
it('keeps only a closed unit in calculator copy receipts',async()=>{
  const {api,transport}=fixture();transport.invoke.mockResolvedValue({ok:true,value:{outcome:'copied',text:'1000',unit:'m'}});
  expect(await api.copyCalculatorResult!({revision:1,expression:'1 km to m'})).toEqual({ok:true,value:{outcome:'copied',text:'1000',unit:'m'}});
  transport.invoke.mockResolvedValue({ok:true,value:{outcome:'copied',text:'1',unit:'arbitrary-private-content'}});
  expect(await api.copyCalculatorResult!({revision:1,expression:'1 km to m'})).toMatchObject({ok:false});
});
describe('sandboxed preload API', () => {
  it('exposes named methods, no channel forwarding or event objects', async () => {
    const { api, transport } = fixture();
    expect(Object.keys(api).sort()).toEqual(['copyCalculatorResult', 'openLauncherUrl', 'setLauncherAlias', 'setLauncherPinned', 'getLauncherCommands', 'executeLauncherCommand', 'getState', 'openDataSettings', 'hideLauncher', 'reportContentHeight', 'quit', 'onState', 'runtime'].sort());
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


describe('launcher preload boundary', () => {
  it('allows only registered command IDs with a current positive revision and validates reply shape', async () => {
    const {api,transport}=fixture();
    for(const request of [{commandId:'arbitrary:exec',revision:1},{commandId:'linuxcast:quit',revision:0},{commandId:'linuxcast:quit',revision:1,private:'SYNTHETIC_PRIVATE'}]) {
      expect((await api.executeLauncherCommand(request as never)).ok).toBe(false);
    }
    expect(transport.invoke).not.toHaveBeenCalled();
    transport.invoke.mockResolvedValue({ok:true,value:{outcome:'dispatched'}});
    expect(await api.executeLauncherCommand({commandId:'linuxcast:quit',revision:1})).toEqual({ok:true,value:{outcome:'dispatched'}});
    expect(transport.invoke).toHaveBeenLastCalledWith('launcher:execute',{protocolVersion:1,commandId:'linuxcast:quit',revision:1});
    transport.invoke.mockResolvedValue({ok:true,value:{outcome:'completed',private:'SYNTHETIC_PRIVATE'}});
    expect(JSON.stringify(await api.executeLauncherCommand({commandId:'linuxcast:hide',revision:1}))).not.toContain('SYNTHETIC_PRIVATE');
    expect((await api.getLauncherCommands()).ok).toBe(false);
  });
});


it('validates the named pin request and refuses extra fields or unregistered IDs',async()=>{
  const {api,transport}=fixture();
  for(const request of [{commandId:'arbitrary:command',revision:1,pinned:true},{commandId:'linuxcast:hide',revision:0,pinned:true},{commandId:'linuxcast:hide',revision:1,pinned:1},{commandId:'linuxcast:hide',revision:1,pinned:true,private:'SYNTHETIC_PRIVATE'}]) {
    expect((await api.setLauncherPinned(request as never)).ok).toBe(false);
  }
  expect(transport.invoke).not.toHaveBeenCalled();
  await api.setLauncherPinned({commandId:'linuxcast:hide',revision:1,pinned:true});
  expect(transport.invoke).toHaveBeenCalledExactlyOnceWith('launcher:set-pinned',{protocolVersion:1,commandId:'linuxcast:hide',revision:1,pinned:true});
});


it('bounds alias metadata before IPC and exposes only the named alias operation',async()=>{
  const {api,transport}=fixture();
  for(const alias of ['', ' leading', 'trailing ', 'x'.repeat(65), 'public\nprivate', '\u0085', '😀'.repeat(65), '\ud800'])expect((await api.setLauncherAlias({commandId:'linuxcast:hide',revision:1,alias})).ok).toBe(false);
  expect((await api.setLauncherAlias({commandId:'linuxcast:hide',revision:1,alias:'valid',query:'SYNTHETIC_PRIVATE'} as never)).ok).toBe(false);
  expect(transport.invoke).not.toHaveBeenCalled();
  await api.setLauncherAlias({commandId:'linuxcast:hide',revision:1,alias:'😀'.repeat(64)});
  expect(transport.invoke).toHaveBeenLastCalledWith('launcher:set-alias',{protocolVersion:1,commandId:'linuxcast:hide',revision:1,alias:'😀'.repeat(64)});
  await api.setLauncherAlias({commandId:'linuxcast:hide',revision:1,alias:null});
  expect(transport.invoke).toHaveBeenLastCalledWith('launcher:set-alias',{protocolVersion:1,commandId:'linuxcast:hide',revision:1,alias:null});
});


it('keeps URL opening a named typed HTTP action and refuses dangerous schemes/credentials before IPC',async()=>{
  const {api,transport}=fixture();
  for(const url of ['javascript:alert(1)','file:///etc/passwd','linuxcast://launcher/show','mailto:public@example.invalid','https://user:pass@example.invalid/','https://@example.invalid/','https:///example.invalid/','https://example.invalid/a b','https://example.invalid/%zz','https://example.invalid/\\evil','https://example.invalid/\ud800','https://example.invalid/?x=\nvalue','x'.repeat(8193)])expect((await api.openLauncherUrl({revision:1,url})).ok).toBe(false);
  expect((await api.openLauncherUrl({revision:1,url:'https://example.invalid',argv:['unsafe']} as never)).ok).toBe(false);
  expect(transport.invoke).not.toHaveBeenCalled();
  transport.invoke.mockResolvedValue({ok:true,value:{outcome:'dispatched'}});
  expect(await api.openLauncherUrl({revision:1,url:'HTTPS://EXAMPLE.invalid:443/路径?public=%24%28literal%29'})).toEqual({ok:true,value:{outcome:'dispatched'}});
  expect(transport.invoke).toHaveBeenCalledExactlyOnceWith('launcher:open-url',{protocolVersion:1,revision:1,url:'https://example.invalid/%E8%B7%AF%E5%BE%84?public=%24%28literal%29'});
  transport.invoke.mockResolvedValue({ok:true,value:{outcome:'completed'}});
  expect((await api.openLauncherUrl({revision:1,url:'http://[::1]:8080/'})).ok).toBe(false);
});
