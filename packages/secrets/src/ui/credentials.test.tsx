// @vitest-environment jsdom
// Synthetic bridge fixtures only. No Electron/keyring/session/native AT proof.
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CredentialSettingsActionReply, CredentialSettingsApi, CredentialSettingsState } from '@linuxcast/platform-contracts';
import { CredentialSettings } from './index.tsx';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const confirmed = (outcome: Extract<CredentialSettingsActionReply, { ok: true }>['value']['outcome']): CredentialSettingsActionReply => ({ ok: true, value: { outcome } });
const base: CredentialSettingsState = {
  revision: 4, appearance: 'dark', provider: 'openrouter', session: 'observed-unlocked',
  storage: 'available', sessionOnlyAvailable: true, stored: 'none', clearSessionOnLock: false, busy: false,
};
const stateReply = (value: CredentialSettingsState) => ({ ok: true as const, value });
function fixture(overrides: Partial<CredentialSettingsState> = {}) {
  let state = { ...base, ...overrides };
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn();
  const api = {
    getState: vi.fn<CredentialSettingsApi['getState']>().mockImplementation(async () => stateReply({ ...state })),
    saveKey: vi.fn<CredentialSettingsApi['saveKey']>().mockResolvedValue(confirmed('saved')),
    removeKey: vi.fn<CredentialSettingsApi['removeKey']>().mockResolvedValue(confirmed('removed')),
    setPolicy: vi.fn<CredentialSettingsApi['setPolicy']>().mockResolvedValue(confirmed('policy-updated')),
    recheck: vi.fn<CredentialSettingsApi['recheck']>().mockResolvedValue(confirmed('refreshing')),
    close: vi.fn<CredentialSettingsApi['close']>().mockResolvedValue(confirmed('refreshing')),
    onChanged: vi.fn<CredentialSettingsApi['onChanged']>().mockImplementation(listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); unsubscribe(); };
    }),
  };
  return {
    api, unsubscribe,
    async change(patch: Partial<CredentialSettingsState>) {
      state = { ...state, ...patch };
      await act(async () => { listeners.forEach(listener => listener()); });
    },
    async notify() { await act(async () => { listeners.forEach(listener => listener()); }); },
  };
}
function input() { return screen.getByLabelText('New API key') as HTMLInputElement; }
// Explicit storage choice is a native radio group (Instrument refresh; formerly a <select>).
const choiceNames = { persistent: 'Persistent — secure system keyring', 'session-only': 'Session only — until Linuxcast quits' } as const;
function choice(persistence: keyof typeof choiceNames) { return screen.getByRole('radio', { name: choiceNames[persistence] }) as HTMLInputElement; }
function mode() {
  const group = screen.getByRole('group', { name: 'Keep this key' });
  return { value: (group.querySelector('input[type="radio"]:checked') as HTMLInputElement | null)?.value ?? '' };
}
function choose(persistence: keyof typeof choiceNames) { fireEvent.click(choice(persistence)); }
function enter(value = 'synthetic-new-key', persistence: keyof typeof choiceNames | '' = 'persistent') {
  fireEvent.change(input(), { target: { value } });
  if (persistence) choose(persistence);
}
function submit() { fireEvent.submit(screen.getByRole('form', { name: 'Save OpenRouter key' })); }
async function ready(api: CredentialSettingsApi) {
  const view = render(<CredentialSettings api={api} />);
  await screen.findByRole('region', { name: 'Local credential status' });
  await waitFor(() => expect(input().readOnly).toBe(false));
  return view;
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('credential settings synthetic metadata and privacy', () => {
  it('shows loading without allowing writes, then an empty ready form', async () => {
    const f = fixture(); const first = deferred<Awaited<ReturnType<CredentialSettingsApi['getState']>>>();
    f.api.getState.mockReturnValueOnce(first.promise);
    render(<CredentialSettings api={f.api} />);
    expect(screen.getByText('Loading credential settings…')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save key' }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    await act(async () => first.resolve(stateReply(base)));
    expect(screen.getByRole('heading', { name: 'No key saved' })).toBeTruthy();
    expect(mode().value).toBe('');
  });

  it('has a fixed no-API error and retry path, and recovers when an API arrives', async () => {
    const view = render(<CredentialSettings />);
    expect(await screen.findByRole('heading', { name: 'Credential settings unavailable' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText(/could not be read/)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Retry' }));
    const f = fixture(); view.rerender(<CredentialSettings api={f.api} />);
    await screen.findByRole('heading', { name: 'No key saved' });
  });

  it.each(['reject', 'throw', 'denied', 'malformed', 'subscribe'] as const)('uses fixed local errors for %s and retries', async kind => {
    const f = fixture();
    if (kind === 'reject') f.api.getState.mockRejectedValueOnce(new Error('private-error-content'));
    if (kind === 'throw') f.api.getState.mockImplementationOnce(() => { throw new Error('private-error-content'); });
    if (kind === 'denied') f.api.getState.mockResolvedValueOnce({ ok: false, error: { code: 'permission-denied' } });
    if (kind === 'malformed') f.api.getState.mockResolvedValueOnce({ ...stateReply(base), extra: 'private-error-content' } as Awaited<ReturnType<CredentialSettingsApi['getState']>>);
    if (kind === 'subscribe') f.api.onChanged.mockImplementationOnce(() => { throw new Error('private-error-content'); });
    render(<CredentialSettings api={f.api} />);
    await screen.findByRole('heading', { name: 'Credential settings unavailable' });
    expect(document.body.textContent).not.toContain('private-error-content');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('heading', { name: 'No key saved' });
    expect(input().readOnly).toBe(false);
  });

  it.each(['secure-persistent', 'session-only'] as const)('shows %s metadata without a readback control', async stored => {
    const f = fixture({ stored }); await ready(f.api);
    expect(screen.getByRole('heading', { name: 'Key saved locally' })).toBeTruthy();
    expect(input().value).toBe('');
    expect(screen.getByRole('button', { name: 'Replace key…' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /reveal|copy|show key/i })).toBeNull();
    // Only the masked field and the two explicit storage radios accept input: no readback/copy control.
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]), textarea, select')).toHaveLength(1);
  });

  it('uses the shared password input and never echoes new input into markup, messages or other methods', async () => {
    const f = fixture(); await ready(f.api);
    enter('synthetic-private-value');
    expect(input().type).toBe('password');
    expect(input().autocomplete).toBe('off');
    expect(document.body.innerHTML).not.toContain('synthetic-private-value');
    submit();
    expect(input().value).toBe('');
    expect(f.api.saveKey).toHaveBeenCalledExactlyOnceWith({ expectedRevision: 4, persistence: 'persistent', value: 'synthetic-private-value' });
    await screen.findByText(/local key save was confirmed/);
    expect(document.body.innerHTML).not.toContain('synthetic-private-value');
    for (const method of [f.api.getState, f.api.setPolicy, f.api.removeKey, f.api.recheck, f.api.close]) {
      expect(JSON.stringify(method.mock.calls)).not.toContain('synthetic-private-value');
    }
  });

  it('requires a newly entered value and explicit storage choice', async () => {
    const f = fixture(); await ready(f.api);
    fireEvent.change(input(), { target: { value: 'synthetic-new-key' } });
    expect(mode().value).toBe('');
    expect((screen.getByRole('button', { name: 'Save key' }) as HTMLButtonElement).disabled).toBe(true);
    submit();
    expect(f.api.saveKey).not.toHaveBeenCalled(); expect(input().value).toBe('');
    expect(screen.getByText(/Enter a new key, choose/)).toBeTruthy();
    choose('persistent'); submit();
    expect(f.api.saveKey).not.toHaveBeenCalled();
  });

  it.each(['🗝'.repeat(20000), '\ud800', '\ufeffsynthetic-key'])('refuses invalid or oversized text without transporting or echoing it (%#)', async value => {
    const f = fixture(); await ready(f.api); enter(value); submit();
    expect(f.api.saveKey).not.toHaveBeenCalled(); expect(input().value).toBe('');
    expect(screen.getByText(/valid text of at most 65,536 bytes/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(value);
  });

  it('does not switch modes on persistence loss; session-only must be chosen explicitly', async () => {
    const f = fixture(); await ready(f.api); enter();
    await f.change({ storage: 'insecure-backend', revision: 5 });
    expect(mode().value).toBe('persistent'); expect(input().value).toBe('synthetic-new-key');
    expect(choice('persistent').disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Save key' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/insecure basic_text/)).toBeTruthy();
    choose('session-only'); submit();
    expect(f.api.saveKey).toHaveBeenCalledWith({ expectedRevision: 5, persistence: 'session-only', value: 'synthetic-new-key' });
    await screen.findByText(/local key save was confirmed/);
  });

  it('disables unavailable session-only storage without choosing persistence', async () => {
    const f = fixture({ sessionOnlyAvailable: false }); await ready(f.api);
    expect(choice('session-only').disabled).toBe(true);
    expect(mode().value).toBe('');
    enter('synthetic-key', 'session-only'); submit();
    expect(f.api.saveKey).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'encryption-failed', 'storage-failed'] as const)('explains %s storage and keeps persistence disabled', async storage => {
    const f = fixture({ storage }); await ready(f.api);
    expect(choice('persistent').disabled).toBe(true);
    enter(); submit(); expect(f.api.saveKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recheck status' }));
    await waitFor(() => expect(f.api.recheck).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(f.api.getState).toHaveBeenCalledTimes(2));
  });

  it.each(['locked', 'inactive', 'unavailable'] as const)('clears input on %s session report and denies save', async session => {
    const f = fixture(); await ready(f.api); enter();
    await f.change({ session, storage: 'unavailable', sessionOnlyAvailable: false, revision: 5 });
    expect(input().value).toBe(''); expect(input().readOnly).toBe(true);
    submit(); expect(f.api.saveKey).not.toHaveBeenCalled();
    expect(screen.getByText(/reports arrive asynchronously/)).toBeTruthy();
  });

  it('blocks replacement for needs-review and offers main-owned removal/recheck', async () => {
    const f = fixture({ stored: 'needs-review' }); render(<CredentialSettings api={f.api} />);
    const review = await screen.findByRole('heading', { name: 'Saved credential needs review' });
    // Review uncertainty is not an unsupported session capability, a denial or an approval request.
    const plate = review.closest('section')!;
    expect(plate.getAttribute('data-kind')).toBe('unavailable');
    expect(plate.textContent).toContain('Unavailable');
    expect(plate.textContent).not.toMatch(/Unsupported in this session|Permission denied|Approval needed/);
    expect(input().readOnly).toBe(true);
    enter(); submit(); expect(f.api.saveKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove key…' }));
    expect(f.api.removeKey).toHaveBeenCalledExactlyOnceWith({ expectedRevision: 4 });
    await screen.findByText('Key removal was confirmed.');
    // Action replies never fabricate the confirmed snapshot.
    expect(screen.getByRole('heading', { name: 'Saved credential needs review' })).toBeTruthy();
  });

  it('preserves input and explicit choice across harmless appearance and status refreshes', async () => {
    const f = fixture(); await ready(f.api); enter();
    await f.change({ appearance: 'light', revision: 5 });
    expect(input().value).toBe('synthetic-new-key'); expect(mode().value).toBe('persistent');
    expect(document.querySelector('[data-lc-theme="light"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Recheck status' }));
    await waitFor(() => expect(f.api.getState).toHaveBeenCalledTimes(3));
    expect(input().value).toBe('synthetic-new-key');
  });
});

describe('credential settings synthetic mutation and lifecycle boundaries', () => {
  it('consumes input once, serializes pending writes and prevents double submit', async () => {
    const f = fixture({ stored: 'secure-persistent' }); const save = deferred<CredentialSettingsActionReply>();
    f.api.saveKey.mockReturnValue(save.promise); await ready(f.api); enter(); submit(); submit();
    fireEvent.click(screen.getByRole('button', { name: 'Remove key…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recheck status' }));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(f.api.saveKey).toHaveBeenCalledTimes(1); expect(input().value).toBe('');
    expect(f.api.removeKey).not.toHaveBeenCalled(); expect(f.api.recheck).not.toHaveBeenCalled(); expect(f.api.setPolicy).not.toHaveBeenCalled();
    expect(input().readOnly).toBe(true);
    await act(async () => save.resolve(confirmed('saved')));
    submit(); expect(f.api.saveKey).toHaveBeenCalledTimes(1);
  });

  it.each(['unknown', 'stale'] as const)('refreshes %s outcomes and never automatically replays writes', async outcome => {
    const f = fixture(); f.api.saveKey.mockResolvedValue(confirmed(outcome));
    await ready(f.api); enter(); submit();
    await screen.findByText(/no operation will be replayed/);
    expect(f.api.getState).toHaveBeenCalledTimes(2);
    await f.notify(); await f.notify();
    expect(f.api.saveKey).toHaveBeenCalledTimes(1); expect(input().value).toBe('');
  });

  it.each(['reject', 'throw', 'malformed'] as const)('treats %s write replies as unknown without exposing thrown content', async kind => {
    const f = fixture();
    if (kind === 'reject') f.api.saveKey.mockRejectedValueOnce(new Error('synthetic-private-error'));
    if (kind === 'throw') f.api.saveKey.mockImplementationOnce(() => { throw new Error('synthetic-private-error'); });
    if (kind === 'malformed') f.api.saveKey.mockResolvedValueOnce({ ok: true, value: { outcome: 'saved', value: 'synthetic-private-error' } } as CredentialSettingsActionReply);
    await ready(f.api); enter(); submit();
    await screen.findByText(/outcome is unknown/);
    expect(document.body.innerHTML).not.toContain('synthetic-private-error');
    expect(f.api.saveKey).toHaveBeenCalledTimes(1); expect(f.api.getState).toHaveBeenCalledTimes(2);
  });

  it.each(['permission-denied', 'unavailable', 'invalid-request', 'conflict'] as const)('handles fixed %s action errors without replay', async code => {
    const f = fixture(); f.api.saveKey.mockResolvedValue({ ok: false, error: { code } });
    await ready(f.api); enter(); submit();
    await waitFor(() => expect(f.api.getState).toHaveBeenCalledTimes(2));
    expect(input().value).toBe(''); expect(f.api.saveKey).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('status').some(node => !!node.textContent)).toBe(true);
  });

  it('keeps policy at confirmed server state while pending and after a refused/stale change', async () => {
    const f = fixture(); const policy = deferred<CredentialSettingsActionReply>();
    f.api.setPolicy.mockReturnValueOnce(policy.promise); await ready(f.api); enter();
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(f.api.setPolicy).toHaveBeenCalledExactlyOnceWith({ expectedRevision: 4, clearSessionOnLock: true });
    expect(checkbox.checked).toBe(false); expect(checkbox.disabled).toBe(true);
    expect(input().value).toBe('synthetic-new-key');
    await act(async () => policy.resolve(confirmed('stale')));
    expect(checkbox.checked).toBe(false);
    await f.change({ clearSessionOnLock: true, revision: 5 });
    expect(checkbox.checked).toBe(true);
    expect(f.api.setPolicy).toHaveBeenCalledTimes(1);
  });

  it('shows changed policy only after server metadata confirms it', async () => {
    const f = fixture(); await ready(f.api);
    fireEvent.click(screen.getByRole('checkbox'));
    await screen.findByText('The session policy update was confirmed.');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    await f.change({ clearSessionOnLock: true, revision: 5 });
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('clears typed input on policy denial and preserves the confirmed policy', async () => {
    const f = fixture(); f.api.setPolicy.mockResolvedValue({ ok: false, error: { code: 'permission-denied' } });
    await ready(f.api); enter(); fireEvent.click(screen.getByRole('checkbox'));
    await screen.findByText(/operation was denied/);
    expect(input().value).toBe(''); expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(f.api.saveKey).not.toHaveBeenCalled();
  });

  it('removal clears input and delegates native confirmation; cancellation leaves saved metadata', async () => {
    const f = fixture({ stored: 'session-only' }); f.api.removeKey.mockResolvedValue(confirmed('cancelled'));
    await ready(f.api); enter(); fireEvent.click(screen.getByRole('button', { name: 'Remove key…' }));
    expect(input().value).toBe(''); expect(f.api.removeKey).toHaveBeenCalledExactlyOnceWith({ expectedRevision: 4 });
    await screen.findByText(/operation was cancelled/);
    expect(screen.getByRole('heading', { name: 'Key saved locally' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancel entry clears input and choice without calling the bridge', async () => {
    const f = fixture(); await ready(f.api); enter();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel entry' }));
    expect(input().value).toBe(''); expect(mode().value).toBe(''); expect(document.activeElement).toBe(input());
    expect(f.api.saveKey).not.toHaveBeenCalled(); expect(f.api.close).not.toHaveBeenCalled();
  });

  it.each(['button', 'escape'] as const)('%s close clears editable input and calls only close', async way => {
    const f = fixture(); await ready(f.api); enter();
    if (way === 'button') fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    else fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input().value).toBe(''); expect(f.api.close).toHaveBeenCalledTimes(1); expect(f.api.saveKey).not.toHaveBeenCalled();
    await screen.findByText('Close requested.');
  });

  it('does not close during a pending operation and never double-dispatches close', async () => {
    const f = fixture(); const save = deferred<CredentialSettingsActionReply>();
    f.api.saveKey.mockReturnValueOnce(save.promise); await ready(f.api); enter(); submit();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(f.api.close).not.toHaveBeenCalled(); expect(screen.getByText(/Wait for its outcome/)).toBeTruthy();
    await act(async () => save.resolve(confirmed('saved')));
    const close = deferred<CredentialSettingsActionReply>(); f.api.close.mockReturnValueOnce(close.promise);
    fireEvent.keyDown(input(), { key: 'Escape' }); fireEvent.keyDown(input(), { key: 'Escape' });
    expect(f.api.close).toHaveBeenCalledTimes(1);
    await act(async () => close.resolve(confirmed('refreshing')));
  });

  it('ignores Enter and Escape during composition, then allows an explicit submit', async () => {
    const f = fixture(); await ready(f.api); enter();
    fireEvent.compositionStart(input());
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true, keyCode: 229 }); submit();
    fireEvent.keyDown(input(), { key: 'Escape', isComposing: true });
    expect(f.api.saveKey).not.toHaveBeenCalled(); expect(f.api.close).not.toHaveBeenCalled(); expect(input().value).toBe('synthetic-new-key');
    fireEvent.compositionEnd(input()); submit();
    expect(f.api.saveKey).toHaveBeenCalledTimes(1);
    await screen.findByText(/local key save was confirmed/);
  });

  it('reports server busy, blocks all competing mutations and clears on Escape', async () => {
    const f = fixture({ busy: true }); render(<CredentialSettings api={f.api} />);
    await screen.findByText(/Another credential operation/);
    enter(); submit(); fireEvent.keyDown(input(), { key: 'Escape' });
    expect(f.api.saveKey).not.toHaveBeenCalled(); expect(f.api.close).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Recheck status' }) as HTMLButtonElement).disabled).toBe(true);
    await f.change({ busy: false });
    expect(input().value).toBe(''); expect(input().readOnly).toBe(false);
  });

  it('ignores older requests arriving after a newer session denial', async () => {
    const f = fixture(); await ready(f.api); enter();
    const old = deferred<Awaited<ReturnType<CredentialSettingsApi['getState']>>>();
    f.api.getState.mockReturnValueOnce(old.promise);
    await f.notify();
    await f.change({ revision: 6, session: 'locked', storage: 'unavailable', sessionOnlyAvailable: false });
    await act(async () => old.resolve(stateReply({ ...base, revision: 5 })));
    expect(input().value).toBe(''); expect(input().readOnly).toBe(true);
    expect(screen.getByText(/Session reported locked/)).toBeTruthy();
  });

  it('ignores late denial/error reads after a newer harmless refresh', async () => {
    const f = fixture(); await ready(f.api); enter();
    const old = deferred<Awaited<ReturnType<CredentialSettingsApi['getState']>>>();
    f.api.getState.mockReturnValueOnce(old.promise); await f.notify();
    await f.change({ revision: 6, appearance: 'light' });
    await act(async () => old.reject(new Error('synthetic-private-error')));
    expect(input().value).toBe('synthetic-new-key'); expect(input().readOnly).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Credential settings unavailable' })).toBeNull();
  });

  it('clears input on failed refresh and disables mutation until retry succeeds', async () => {
    const f = fixture(); await ready(f.api); enter();
    f.api.getState.mockRejectedValueOnce(new Error('synthetic-private-error')); await f.notify();
    expect(input().value).toBe(''); expect(input().readOnly).toBe(true);
    expect(screen.getByText(/last successful read/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('synthetic-private-error');
    submit(); expect(f.api.saveKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(input().readOnly).toBe(false));
  });

  it('rejects a regressing revision and retries current metadata without a write', async () => {
    const f = fixture(); await ready(f.api); enter();
    f.api.getState.mockResolvedValueOnce(stateReply({ ...base, revision: 3 })); await f.notify();
    expect(screen.getByRole('heading', { name: 'Credential settings unavailable' })).toBeTruthy();
    expect(input().value).toBe(''); expect(input().readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(input().readOnly).toBe(false));
    expect(f.api.saveKey).not.toHaveBeenCalled();
  });

  it('clears detached input, unsubscribes and ignores unmounted replies without additional work', async () => {
    const f = fixture(); const save = deferred<CredentialSettingsActionReply>();
    f.api.saveKey.mockReturnValueOnce(save.promise); const view = await ready(f.api); enter();
    const detached = input(); view.unmount(); expect(detached.value).toBe(''); expect(f.unsubscribe).toHaveBeenCalledTimes(1);
    const view2 = await ready(f.api); enter(); submit(); const reads = f.api.getState.mock.calls.length;
    view2.unmount(); await act(async () => save.resolve(confirmed('saved'))); await f.notify();
    expect(f.api.getState).toHaveBeenCalledTimes(reads);
  });

  it('ignores late initial reads and action results from a replaced API', async () => {
    const first = fixture(); const old = deferred<Awaited<ReturnType<CredentialSettingsApi['getState']>>>();
    first.api.getState.mockReturnValueOnce(old.promise);
    const view = render(<CredentialSettings api={first.api} />); const second = fixture({ stored: 'session-only' });
    view.rerender(<CredentialSettings api={second.api} />); await screen.findByRole('heading', { name: 'Key saved locally' });
    await act(async () => old.resolve(stateReply(base)));
    expect(screen.getByRole('heading', { name: 'Key saved locally' })).toBeTruthy();
    const pending = deferred<CredentialSettingsActionReply>(); second.api.saveKey.mockReturnValueOnce(pending.promise); enter(); submit();
    const third = fixture(); view.rerender(<CredentialSettings api={third.api} />); await screen.findByRole('heading', { name: 'No key saved' });
    await act(async () => pending.resolve(confirmed('saved')));
    expect(screen.queryByText(/local key save was confirmed/)).toBeNull(); expect(third.api.getState).toHaveBeenCalledTimes(1);
  });

  it('tolerates StrictMode setup/cleanup without retaining listeners or editable values', async () => {
    const f = fixture(); const view = render(<StrictMode><CredentialSettings api={f.api} /></StrictMode>);
    await screen.findByRole('heading', { name: 'No key saved' }); enter();
    await f.change({ appearance: 'light', revision: 5 }); expect(input().value).toBe('synthetic-new-key');
    const detached = input(); view.unmount(); expect(detached.value).toBe('');
    expect(f.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('restores focus to the connected opener when the owned surface unmounts', async () => {
    const opener = document.createElement('button'); opener.textContent = 'Synthetic opener'; document.body.append(opener); opener.focus();
    const f = fixture(); const view = await ready(f.api); input().focus(); view.unmount();
    expect(document.activeElement).toBe(opener); opener.remove();
  });
});

describe('credential settings Instrument presentation (synthetic bridge)', () => {
  const plateFor = (text: RegExp | string) => screen.getByText(text).closest('section.lc-plate')!;

  it('renders the workspace header with a genuinely bound Escape keycap and a page title', async () => {
    const f = fixture(); await ready(f.api);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.getAttribute('aria-keyshortcuts')).toBe('Escape');
    expect(close.closest('header')?.textContent).toContain('Credentials');
    expect(screen.getByRole('heading', { level: 1, name: 'OpenRouter API key' })).toBeTruthy();
    // The keycap is display only: Escape is handled by the window and dispatches close exactly once.
    fireEvent.keyDown(screen.getByRole('heading', { level: 1 }), { key: 'Escape' });
    expect(f.api.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['observed-unlocked', 'available', true, ['Unlocked', 'Available', 'Available']],
    ['observed-unlocked', 'insecure-backend', true, ['Unlocked', 'Refused', 'Available']],
    ['observed-unlocked', 'encryption-failed', false, ['Unlocked', 'Failed', 'Unavailable']],
    ['locked', 'unavailable', false, ['Locked', 'Unavailable', 'Unavailable']],
    ['inactive', 'unavailable', false, ['Inactive', 'Unavailable', 'Unavailable']],
  ] as const)('shows %s session / %s storage as glyph-plus-word rows from the confirmed snapshot', async (session, storage, sessionOnlyAvailable, words) => {
    const f = fixture({ session, storage, sessionOnlyAvailable });
    render(<CredentialSettings api={f.api} />);
    const list = await screen.findByRole('list', { name: 'Session and storage' });
    const rows = Array.from(list.querySelectorAll('li'));
    expect(rows.map(row => row.querySelector('.cs-row-name')!.textContent)).toEqual(['Desktop session', 'Persistent storage', 'Session-only storage']);
    expect(rows.map(row => row.querySelector('.cs-row-status')!.textContent)).toEqual(words);
    // Shape glyph accompanies every word; colour is never the only signal.
    for (const row of rows) expect(row.querySelector('.cs-row-status svg')).toBeTruthy();
    if (storage === 'insecure-backend') expect(rows[1]!.querySelector('.cs-row-detail')!.textContent).toBe('basic_text');
  });

  it('offers explicit storage radios with no default and visible reasons for unavailable modes', async () => {
    const f = fixture({ storage: 'insecure-backend', sessionOnlyAvailable: true }); await ready(f.api);
    expect(choice('persistent').checked).toBe(false); expect(choice('session-only').checked).toBe(false);
    expect(choice('persistent').disabled).toBe(true);
    expect(choice('persistent').getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(choice('persistent').getAttribute('aria-describedby')!)!.textContent).toMatch(/Unavailable now/);
    choose('session-only');
    expect(choice('session-only').checked).toBe(true);
    // Choosing a mode is local presentation: nothing is sent until an explicit submit.
    for (const method of [f.api.saveKey, f.api.setPolicy, f.api.removeKey, f.api.recheck, f.api.close]) expect(method).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel entry' }));
    expect(choice('session-only').checked).toBe(false);
  });

  it.each([
    ['saved', 'success', 'Done', /local key save was confirmed/],
    ['removed', 'success', 'Done', 'Key removal was confirmed.'],
    ['cancelled', 'interrupted', 'Cancelled', /operation was cancelled/],
    ['stale', 'interrupted', 'Not applied', /no operation will be replayed/],
    ['unknown', 'unavailable', 'Unavailable', /outcome is unknown/],
    ['unavailable', 'unavailable', 'Unavailable', /operation is unavailable/],
  ] as const)('shows a %s reply as a truthful %s plate', async (outcome, kind, eyebrow, text) => {
    const f = fixture({ stored: 'session-only' });
    if (outcome === 'removed') f.api.removeKey.mockResolvedValue(confirmed('removed')); else f.api.saveKey.mockResolvedValue(confirmed(outcome));
    await ready(f.api);
    if (outcome === 'removed') fireEvent.click(screen.getByRole('button', { name: 'Remove key…' })); else { enter(); submit(); }
    await screen.findByText(text);
    const plate = plateFor(text);
    expect(plate.getAttribute('data-kind')).toBe(kind);
    expect(plate.querySelector('.lc-plate-eyebrow')!.textContent).toBe(eyebrow);
    expect(plate.textContent).not.toMatch(/authenticated|verified|works/i);
    if (outcome === 'saved') expect(plate.textContent).toContain('Provider authentication has not been checked.');
  });

  it.each([
    ['permission-denied', 'denied'], ['invalid-request', 'error'], ['unavailable', 'unavailable'], ['conflict', 'interrupted'],
  ] as const)('shows fixed %s errors as %s plates, never success', async (code, kind) => {
    const f = fixture(); f.api.saveKey.mockResolvedValue({ ok: false, error: { code } });
    await ready(f.api); enter(); submit();
    await waitFor(() => expect(document.querySelector('.cs-notice section.lc-plate')).toBeTruthy());
    expect(document.querySelector('.cs-notice section.lc-plate')!.getAttribute('data-kind')).toBe(kind);
  });

  it('shows request acknowledgements as quiet notes, not success plates', async () => {
    const f = fixture(); await ready(f.api);
    fireEvent.click(screen.getByRole('button', { name: 'Recheck status' }));
    const ack = await screen.findByText('Rechecking local credential status…');
    expect(ack.closest('section.lc-plate')).toBeNull();
    expect(ack.closest('[role="status"]')).toBeTruthy();
  });
});
