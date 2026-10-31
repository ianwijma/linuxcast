// @vitest-environment jsdom
// Synthetic typed DataSettingsApi fixtures only. Native dialogs, main allowlists and real files are
// covered by apps/desktop/tests/diagnostics.integration.test.ts; this is no Electron/AT/desktop proof.
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSettingsActionReply, DataSettingsApi } from '@linuxcast/contracts';
import { LocalDataSettings } from './local-data.tsx';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type StateReply = Awaited<ReturnType<DataSettingsApi['getState']>>;
const outcome = (value: 'saved' | 'cleared' | 'cancelled' | 'opened'): DataSettingsActionReply => ({ ok: true, value: { outcome: value } });
const failure = (code: 'internal' | 'permission-denied', message: string): DataSettingsActionReply => ({ ok: false, error: { code, message, retryable: false } });
function fixture(state: StateReply | Promise<StateReply> = { ok: true, value: { appearance: 'dark' } }) {
  const listeners = new Set<(value: 'dark' | 'light') => void>();
  const unsubscribe = vi.fn();
  const api = {
    getState: vi.fn<DataSettingsApi['getState']>().mockImplementation(async () => state),
    exportCategory: vi.fn<DataSettingsApi['exportCategory']>().mockResolvedValue(outcome('saved')),
    clearCategory: vi.fn<DataSettingsApi['clearCategory']>().mockResolvedValue(outcome('cleared')),
    openCredentials: vi.fn<DataSettingsApi['openCredentials']>().mockResolvedValue(outcome('opened')),
    close: vi.fn<DataSettingsApi['close']>().mockResolvedValue(outcome('cancelled')),
    onAppearance: vi.fn<DataSettingsApi['onAppearance']>().mockImplementation(listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); unsubscribe(); };
    }),
  };
  return { api, unsubscribe, emit: (value: 'dark' | 'light') => act(() => { for (const listener of listeners) listener(value); }) };
}
const mount = (api: DataSettingsApi | undefined) => render(<StrictMode><LocalDataSettings api={api} /></StrictMode>);
const button = (name: string) => screen.getByRole('button', { name });
const searchbox = () => screen.getByRole('searchbox', { name: 'Search data categories' });
const nav = () => within(screen.getByRole('navigation', { name: 'Data categories' }));
const status = () => within(screen.getByRole('status'));
const theme = (container: HTMLElement) => container.querySelector('[data-lc-theme]')!.getAttribute('data-lc-theme');
const ready = async () => waitFor(() => expect((button('Export application logs') as HTMLButtonElement).disabled).toBe(false));
const sections = () => screen.queryAllByRole('region').filter(region => region.classList.contains('ld-category')).map(region => region.getAttribute('aria-labelledby'));

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Local data categories and search', () => {
  it('lists the existing categories with stable actions, focuses search and filters both navigation and content', async () => {
    const { api } = fixture();
    mount(api);
    await ready();
    expect(document.activeElement).toBe(searchbox());
    expect(screen.getByRole('heading', { level: 1, name: 'Local data' })).toBeTruthy();
    expect(sections()).toEqual(['category-credentials', 'category-settings', 'category-command-usage', 'category-ai-conversations', 'category-file-index', 'category-application-logs', 'category-tool-diagnostics']);
    const actions = screen.getAllByRole('button').map(element => element.getAttribute('aria-label') ?? element.textContent?.replace(/Escape$/, ''));
    expect(actions.filter(name => /^(Export|Clear|Manage|Close)/.test(name ?? ''))).toEqual(['Close settings', 'Manage credentials', 'Export settings', 'Export command usage', 'Clear command usage',
      'Export ai conversations', 'Clear ai conversations', 'Clear file index', 'Export application logs', 'Clear application logs', 'Export tool diagnostics', 'Clear tool diagnostics']);
    expect(nav().getAllByRole('button').map(item => item.textContent)).toEqual(['Credentials', 'Settings', 'Command usage', 'AI conversations', 'File index', 'Application logs', 'Tool diagnostics']);
    expect(nav().getByRole('button', { current: true }).textContent).toBe('Credentials');

    fireEvent.change(searchbox(), { target: { value: 'tool diagnostics' } });
    expect(sections()).toEqual(['category-tool-diagnostics']);
    expect(nav().getAllByRole('button').map(item => item.textContent)).toEqual(['Tool diagnostics']);
    expect(nav().getByRole('button', { current: true }).textContent).toBe('Tool diagnostics');

    fireEvent.change(searchbox(), { target: { value: 'OpenRouter' } });
    expect(sections()).toEqual(['category-credentials']);

    fireEvent.change(searchbox(), { target: { value: 'nothing public matches' } });
    expect(sections()).toEqual([]);
    expect(screen.getByRole('heading', { name: 'No matching categories' }).closest('[data-kind]')!.getAttribute('data-kind')).toBe('filtered');
    expect(nav().queryAllByRole('button')).toEqual([]);
    expect(nav().getByText('No categories match.')).toBeTruthy();
    expect(api.exportCategory).not.toHaveBeenCalled();
    expect(api.clearCategory).not.toHaveBeenCalled();
  });

  it('moves the rail with keyboard navigation, keeps one sidebar tab stop and never touches the URL', async () => {
    const { api } = fixture();
    mount(api);
    await ready();
    const url = window.location.href;
    const items = () => nav().getAllByRole('button');
    expect(items().map(item => item.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1]);
    act(() => items()[0]!.focus());
    fireEvent.keyDown(items()[0]!, { key: 'End' });
    expect(document.activeElement).toBe(items()[6]);
    fireEvent.keyDown(items()[6]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items()[5]);
    expect(items().map(item => item.tabIndex)).toEqual([-1, -1, -1, -1, -1, 0, -1]);
    fireEvent.keyDown(items()[5]!, { key: 'Enter' });
    expect(nav().getByRole('button', { current: true }).textContent).toBe('Application logs');
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Application logs' }));
    fireEvent.keyDown(items()[0]!, { key: 'Home' });
    fireEvent.click(items()[2]!);
    expect(nav().getByRole('button', { current: true }).textContent).toBe('Command usage');
    expect(window.location.href).toBe(url);
    expect(api.exportCategory).not.toHaveBeenCalled();
    expect(api.clearCategory).not.toHaveBeenCalled();
  });
});

describe('initialisation, theme and recovery', () => {
  it('keeps actions disabled while opening and recovers from an unclassified failure only on explicit retry', async () => {
    const pending = deferred<StateReply>();
    const { api } = fixture(pending.promise);
    mount(api);
    expect(status().getByText('Opening data controls…')).toBeTruthy();
    expect((button('Export application logs') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Manage credentials') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { pending.resolve({ ok: false, error: { code: 'internal', message: 'Local data controls are unavailable.', retryable: false } }); });
    const plate = await screen.findByRole('heading', { name: 'Local data controls are unavailable' });
    expect(plate.closest('[data-kind]')!.getAttribute('data-kind')).toBe('unavailable');
    expect((button('Export application logs') as HTMLButtonElement).disabled).toBe(true);
    const calls = api.getState.mock.calls.length;
    api.getState.mockResolvedValue({ ok: true, value: { appearance: 'light' } });
    fireEvent.click(button('Try again'));
    await ready();
    expect(api.getState).toHaveBeenCalledTimes(calls + 1);
    expect(screen.queryByRole('heading', { name: 'Local data controls are unavailable' })).toBeNull();
  });

  it('shows an unavailable state without a fake retry when the bridge is missing', () => {
    mount(undefined);
    expect(screen.getByRole('heading', { name: 'Local data controls are unavailable' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect((button('Close settings') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Export application logs') as HTMLButtonElement).disabled).toBe(true);
  });

  it('follows current theme events, never lets a stale snapshot overwrite them, and unsubscribes on close', async () => {
    const pending = deferred<StateReply>();
    const { api, emit, unsubscribe } = fixture(pending.promise);
    const { container, unmount } = mount(api);
    emit('light');
    expect(theme(container)).toBe('light');
    await act(async () => { pending.resolve({ ok: true, value: { appearance: 'dark' } }); });
    await ready();
    expect(theme(container)).toBe('light');
    emit('dark');
    expect(theme(container)).toBe('dark');
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('action outcomes', () => {
  it('only reports success after a confirmed reply and names the captured action across filtering and navigation', async () => {
    const { api } = fixture();
    const reply = deferred<DataSettingsActionReply>();
    api.exportCategory.mockReturnValueOnce(reply.promise);
    mount(api);
    await ready();
    fireEvent.click(button('Export application logs'));
    expect(api.exportCategory).toHaveBeenCalledWith('application-logs');
    expect(status().getByRole('heading').textContent).toBe('Exporting application logs…');
    expect(status().queryByText('Done')).toBeNull();
    fireEvent.change(searchbox(), { target: { value: 'file index' } });
    fireEvent.click(nav().getByRole('button', { name: 'File index' }));
    expect(screen.queryByRole('button', { name: 'Export application logs' })).toBeNull();
    expect(status().getByRole('heading').textContent).toBe('Exporting application logs…');
    expect(button('Clear file index').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button('Clear file index'));
    expect(api.clearCategory).not.toHaveBeenCalled();
    await act(async () => { reply.resolve(outcome('saved')); });
    expect(status().getByRole('heading').textContent).toBe('Export saved.');
    expect(status().getByText('Done')).toBeTruthy();
    expect(status().getByText('Application logs: written to the file you chose as unencrypted JSON.')).toBeTruthy();
    expect(button('Clear file index').getAttribute('aria-disabled')).toBeNull();
  });

  it.each([
    ['cleared', outcome('cleared'), 'success', 'Data cleared.', 'Tool diagnostics: cleared. Other categories are managed separately.'],
    ['cancelled', outcome('cancelled'), 'interrupted', 'Action cancelled.', 'Tool diagnostics: nothing was cleared.'],
    ['backend error', failure('internal', 'Diagnostics are unavailable. Clear only this diagnostic category to reset unreadable records, or quit and reopen Linuxcast after checking local storage.'), 'error', 'Clear tool diagnostics did not complete.', 'Diagnostics are unavailable. Clear only this diagnostic category to reset unreadable records, or quit and reopen Linuxcast after checking local storage.'],
    ['reported denial', failure('permission-denied', 'Local data request denied.'), 'denied', 'Clear tool diagnostics did not complete.', 'Local data request denied.'],
    ['generic unavailability', failure('internal', 'Local data controls are unavailable.'), 'unavailable', 'Clear tool diagnostics did not complete.', 'Local data controls are unavailable.'],
  ] as const)('presents a %s clear outcome truthfully', async (_name, reply, kind, title, description) => {
    const { api } = fixture();
    api.clearCategory.mockResolvedValueOnce(reply);
    mount(api);
    await ready();
    fireEvent.click(button('Clear tool diagnostics'));
    await waitFor(() => expect(status().getByRole('heading').textContent).toBe(title));
    expect(screen.getByRole('status').querySelector('[data-kind]')!.getAttribute('data-kind')).toBe(kind);
    expect(status().getByText(description)).toBeTruthy();
    if (kind !== 'success') expect(status().queryByText('Done')).toBeNull();
    expect(api.clearCategory).toHaveBeenCalledExactlyOnceWith('tool-diagnostics');
  });

  it('reports an unknown outcome when the bridge rejects and never replays it', async () => {
    const { api } = fixture();
    api.clearCategory.mockRejectedValueOnce(new Error('synthetic transport loss'));
    mount(api);
    await ready();
    fireEvent.click(button('Clear command usage'));
    await waitFor(() => expect(status().getByRole('heading').textContent).toBe('Outcome unknown.'));
    expect(screen.getByRole('status').querySelector('[data-kind]')!.getAttribute('data-kind')).toBe('unavailable');
    expect(screen.getByRole('status').textContent).not.toContain('synthetic transport loss');
    fireEvent.change(searchbox(), { target: { value: 'command' } });
    fireEvent.change(searchbox(), { target: { value: '' } });
    expect(api.clearCategory).toHaveBeenCalledTimes(1);
  });

  it('dispatches one request for repeated click/Enter and ignores a late reply after close without replaying on reopen', async () => {
    const { api } = fixture();
    const reply = deferred<DataSettingsActionReply>();
    api.clearCategory.mockReturnValueOnce(reply.promise);
    const first = mount(api);
    await ready();
    const clear = button('Clear application logs');
    // Same batch: React has not re-rendered `busy` yet, so only the synchronous guard can stop these.
    act(() => { clear.click(); clear.click(); button('Export tool diagnostics').click(); });
    fireEvent.click(clear);
    fireEvent.keyDown(clear, { key: 'Enter' });
    fireEvent.click(button('Export tool diagnostics'));
    expect(api.clearCategory).toHaveBeenCalledTimes(1);
    expect(api.exportCategory).not.toHaveBeenCalled();
    expect(clear.getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement === clear || clear.tabIndex === 0).toBe(true);
    first.unmount();
    await act(async () => { reply.resolve(outcome('cleared')); });
    mount(api);
    await ready();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(api.clearCategory).toHaveBeenCalledTimes(1);
  });

  it('opens credentials with exactly one narrow call and no key readback', async () => {
    const { api } = fixture();
    mount(api);
    await ready();
    fireEvent.click(button('Manage credentials'));
    fireEvent.click(button('Manage credentials'));
    await waitFor(() => expect(status().getByRole('heading').textContent).toBe('Credential settings opened.'));
    expect(api.openCredentials).toHaveBeenCalledExactlyOnceWith();
    expect(api.exportCategory).not.toHaveBeenCalled();
    expect(api.clearCategory).not.toHaveBeenCalled();
    api.openCredentials.mockResolvedValueOnce(failure('internal', 'Local data is still opening. Try again shortly.'));
    fireEvent.click(button('Manage credentials'));
    await waitFor(() => expect(status().getByRole('heading').textContent).toBe('Credential settings could not be opened.'));
    expect(screen.getByRole('status').querySelector('[data-kind]')!.getAttribute('data-kind')).toBe('error');
    expect(api.openCredentials).toHaveBeenCalledTimes(2);
  });
});

describe('window keyboard', () => {
  it('closes with Escape except during IME composition or with modifiers', async () => {
    const { api } = fixture();
    mount(api);
    await ready();
    fireEvent.keyDown(searchbox(), { key: 'Escape', isComposing: true });
    fireEvent.keyDown(searchbox(), { key: 'Escape', ctrlKey: true });
    expect(api.close).not.toHaveBeenCalled();
    fireEvent.keyDown(searchbox(), { key: 'Escape' });
    expect(api.close).toHaveBeenCalledTimes(1);
    expect(button('Close settings').getAttribute('aria-keyshortcuts')).toBe('Escape');
  });
});
