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
it('exposes only a named registered-application action and validates exact requested identity receipts',async()=>{
  const {api,transport}=fixture(),request={commandId:`application:${'a'.repeat(64)}`,revision:1,actionId:'NewWindow'};
  for(const value of [{...request,commandId:'linuxcast:quit'},{...request,actionId:'../private'},{...request,revision:0},{...request,desktopId:'public.desktop'},{...request,argv:[]}])expect(await api.executeApplicationAction!(value as never)).toMatchObject({ok:false});
  expect(transport.invoke).not.toHaveBeenCalled();transport.invoke.mockResolvedValue({ok:true,value:{outcome:'requested',actionId:'NewWindow'}});
  expect(await api.executeApplicationAction!(request)).toEqual({ok:true,value:{outcome:'requested',actionId:'NewWindow'}});expect(transport.invoke).toHaveBeenCalledExactlyOnceWith(LAUNCHER_CHANNELS.applicationAction,{protocolVersion:1,...request});
  for(const value of [{outcome:'requested',actionId:'Compose'},{outcome:'completed',actionId:'NewWindow'},{outcome:'dispatched',actionId:'NewWindow'},{outcome:'requested',actionId:'NewWindow',private:'SYNTHETIC_PRIVATE'},{outcome:'requested',actionId:'x'.repeat(1048577)}]){transport.invoke.mockResolvedValue({ok:true,value});expect(await api.executeApplicationAction!(request)).toMatchObject({ok:false});}
});
it('exposes only the strict named visibility method and rejects recovery, extra fields and malformed acknowledgements',async()=>{
  const {api,transport}=fixture(),valid={commandId:'linuxcast:calculator' as const,revision:1,hidden:true};
  for(const request of [{...valid,commandId:'linuxcast:hide'},{...valid,commandId:'linuxcast:quit',hidden:false},{...valid,hidden:'true'},{...valid,revision:0},{...valid,path:'/private'}])expect(await api.setLauncherHidden!(request as never)).toMatchObject({ok:false});
  expect(transport.invoke).not.toHaveBeenCalled();transport.invoke.mockResolvedValue({ok:true,value:{revision:2,commands:[],rankingAvailable:true,visibilityAvailable:true,nextCursor:null}});
  expect(await api.setLauncherHidden!(valid)).toMatchObject({ok:true,value:{visibilityAvailable:true}});expect(transport.invoke).toHaveBeenCalledExactlyOnceWith(LAUNCHER_CHANNELS.setHidden,{protocolVersion:1,...valid});
  for(const value of [{ok:true,value:{revision:2,commands:[],rankingAvailable:true,visibilityAvailable:'true'}},{ok:true,value:{revision:2,commands:[],rankingAvailable:true,private:'SYNTHETIC_PRIVATE'}},{ok:true,value:'x'.repeat(1048577)}]){transport.invoke.mockResolvedValue(value);expect(await api.setLauncherHidden!(valid)).toMatchObject({ok:false});}
});
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
    expect(Object.keys(api).sort()).toEqual(['checkDictionarySpelling','copyDictionarySpellingSuggestion','releaseDictionarySpelling','searchDictionaryDefinitions','readDictionaryDefinition','configureDictionaryDefinitions','releaseDictionaryDefinitionsSearch','searchDictionary','copyDictionaryWord','releaseDictionarySearch','searchEmoji','copyEmoji','setEmojiFavourite','setEmojiKeywords','updateEmojiFrecency','releaseEmojiSearch','searchLauncherNotes','openLauncherNote','getRateConfiguration','configureRateSource','convertRate','copyRateResult','clearRateCache','exportQuicklink','listQuicklinks','getQuicklink','saveQuicklink','removeQuicklink','openQuicklink','executeApplicationAction', 'setLauncherHidden', 'copyCalculatorResult', 'openLauncherUrl', 'setLauncherAlias', 'setLauncherPinned', 'getLauncherCommands', 'executeLauncherCommand', 'getState', 'openDataSettings', 'hideLauncher', 'reportContentHeight', 'quit', 'onState', 'runtime'].sort());
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

it('validates closed colour copy receipts without exposing an arbitrary renderer clipboard writer',async()=>{
  const invoke=vi.fn(async()=>({ok:true,value:{outcome:'copied',colour:'rgb',text:'rgb(255 0 0 / 0.5)'}} as unknown));
  const api=createShellApi({invoke,on:vi.fn(),removeListener:vi.fn()});
  expect(await api.copyCalculatorResult!({revision:1,expression:'rgb(255 0 0 / 0.5) to rgb'})).toMatchObject({ok:true,value:{colour:'rgb'}});
  for(const value of [{outcome:'copied',colour:'rgb',text:'url(private)'},{outcome:'copied',colour:'hex',text:'#ff0000',unit:'m'},{outcome:'copied',colour:'hsl',text:'hsl(0 101% 0%)'}]){invoke.mockResolvedValueOnce({ok:true,value});expect(await api.copyCalculatorResult!({revision:1,expression:'#fff to rgb'})).toMatchObject({ok:false});}
  invoke.mockClear();expect(await api.copyCalculatorResult!({revision:1,expression:'#fff to rgb',text:'private'} as never)).toMatchObject({ok:false});expect(invoke).not.toHaveBeenCalled();
});

it('carries only strict canonical zoned-date receipts over the existing expression-only copy method',async()=>{
 const {api,transport}=fixture(),request={revision:1,expression:'2024-01-01T00:00[UTC] to UTC'},value={outcome:'copied',dateTime:'zoned',text:'2024-01-01T00:00:00+00:00[UTC]'};transport.invoke.mockResolvedValue({ok:true,value});expect(await api.copyCalculatorResult!(request)).toEqual({ok:true,value});expect(transport.invoke).toHaveBeenCalledExactlyOnceWith(LAUNCHER_CHANNELS.copyCalculatorResult,{protocolVersion:1,...request});
 for(const patch of [{dateTime:'other'},{text:'arbitrary'},{unit:'m'},{colour:'hex'},{expression:'private'}]){transport.invoke.mockResolvedValue({ok:true,value:{...value,...patch}});expect(await api.copyCalculatorResult!(request)).toMatchObject({ok:false});}
});
