// @vitest-environment jsdom
// Synthetic typed PermissionSettingsApi fixtures only. Actual owner storage, main-owned snapshots,
// compare-delete and broker cancellation are covered by the F3-01 security and Electron integration
// suites; this is no Electron, assistive-technology or desktop-session proof.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PermissionSettingsApi, PermissionSettingsRow, PermissionSettingsState } from '../../../platform-contracts/src/permission-settings.ts';
import { SavedPermissions } from './index.tsx';

type StateReply = Awaited<ReturnType<PermissionSettingsApi['getState']>>;
type ActionReply = Awaited<ReturnType<PermissionSettingsApi['revoke']>>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const longSource = `Public synthetic workflow ${'with a deliberately long bounded label '.repeat(4)}end`;
const longScope = `Selected public resource ${'segment/'.repeat(60)}final`;
const row = (change: Partial<PermissionSettingsRow> = {}): PermissionSettingsRow => ({
  selectionId: randomUUID(), sourceKind: 'workflow', sourceLabel: 'Public workflow', version: '1.0.0',
  permissionId: 'clipboard.write', scopeLabel: 'Replace the current clipboard', decision: 'allow', updatedAt: '2026-01-01T00:00:00.000Z', ...change,
});
const page = (records: PermissionSettingsRow[], nextCursor: string | null = null): PermissionSettingsState => ({ snapshotId: randomUUID(), appearance: 'dark', records, nextCursor });
function fixture(first: PermissionSettingsState | Promise<StateReply> = page([row({ sourceLabel: longSource, scopeLabel: longScope }), row({ sourceKind: 'builtin', sourceLabel: 'public.saved-source', version: null, permissionId: 'files.read', scopeLabel: 'Selected resource: public-selected-resource', decision: 'deny' })])) {
  const getState = vi.fn<PermissionSettingsApi['getState']>();
  if (first instanceof Promise) getState.mockReturnValue(first); else getState.mockResolvedValue({ ok: true, value: first });
  const api = {
    getState,
    revoke: vi.fn<PermissionSettingsApi['revoke']>().mockResolvedValue({ ok: true, value: 'removed' }),
    close: vi.fn<PermissionSettingsApi['close']>().mockResolvedValue({ ok: true, value: 'requested' }),
    onAppearance: vi.fn<PermissionSettingsApi['onAppearance']>().mockReturnValue(() => {}),
  };
  return { api, first: first instanceof Promise ? undefined : first };
}
// The production entry mounts without StrictMode; the existing controller lifecycle is created once per window.
const mount = (api: PermissionSettingsApi) => render(<SavedPermissions api={api} />);
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const reviewButtons = () => screen.getAllByRole('button', { name: /^Review removal: / }) as HTMLButtonElement[];
const rows = () => screen.getAllByRole('listitem');
const ready = () => waitFor(() => expect(rows()).toHaveLength(2));
const escape = (target: Element = document.activeElement ?? document.body) => fireEvent.keyDown(target, { key: 'Escape' });

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Saved permissions presentation', () => {
  it('focuses Refresh while the first read is still pending and shows a neutral loading row', async () => {
    const pending = deferred<StateReply>();
    const { api } = fixture(pending.promise);
    mount(api);
    expect(document.activeElement).toBe(button('Refresh'));
    expect(button('Refresh').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Reading saved permissions…')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Saved permission decisions' })).toBeNull();
    await act(async () => { pending.resolve({ ok: true, value: page([]) }); });
    expect(screen.getByRole('heading', { name: 'No saved decisions on this page' })).toBeTruthy();
    expect(document.activeElement).toBe(button('Refresh'));
  });

  it('renders the fixed header, source/version/operation/scope facts and decision words without losing full text', async () => {
    const { api } = fixture();
    const href = location.href;
    mount(api);
    await ready();
    expect(screen.getByText('Linuxcast settings')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Saved permissions' })).toBeTruthy();
    expect(button('Close').getAttribute('aria-keyshortcuts')).toBe('Escape');
    const [workflow, builtin] = rows();
    const first = within(workflow!);
    expect(first.getByRole('heading', { level: 2, name: 'Replace the clipboard' })).toBeTruthy();
    expect(workflow!.textContent).toContain('Remembered: allow');
    expect(first.getByTitle(longSource).textContent).toBe(longSource);
    expect(first.getByTitle(longScope).textContent).toBe(longScope);
    expect(first.getByText('Workflow')).toBeTruthy();
    expect(reviewButtons()[0]!.getAttribute('aria-label')).toBe(`Review removal: ${longSource} · Replace the clipboard`);
    expect(builtin!.textContent).toContain('Remembered: deny');
    expect(within(builtin!).getByText('Not versioned')).toBeTruthy();
    expect(within(builtin!).getByText('Linuxcast')).toBeTruthy();
    // No invented totals or cross-page search: only the current page number is shown.
    expect(screen.getByRole('navigation', { name: 'Saved decision pages' }).textContent).toBe('Previous pagePage 1Next page');
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(location.href).toBe(href);
  });

  it('opens a complete keyboard-readable review, keeps it on Escape and restores the opener before closing the window', async () => {
    const { api } = fixture();
    mount(api);
    await ready();
    const opener = reviewButtons()[0]!;
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(button('Keep decision'));
    expect(rows()[0]!.getAttribute('aria-current')).toBe('true');
    const details = screen.getByRole('region', { name: 'Complete saved decision' });
    expect(details.tabIndex).toBe(0);
    for (const text of [longSource, '1.0.0', 'Replace the clipboard', 'clipboard.write', longScope, 'Remembered: allow']) expect(details.textContent).toContain(text);
    expect(screen.getByText('Future operations will need a new approval. Pending requests for this source will be cancelled; an action already sent cannot be undone.')).toBeTruthy();
    expect(reviewButtons().every(element => element.disabled)).toBe(true);
    escape();
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(screen.queryByRole('region', { name: 'Complete saved decision' })).toBeNull();
    expect(api.close).not.toHaveBeenCalled();
    expect(api.revoke).not.toHaveBeenCalled();
    escape();
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it('describes deny removal as permitting a new request only', async () => {
    const { api } = fixture();
    mount(api);
    await ready();
    fireEvent.click(reviewButtons()[1]!);
    expect(screen.getByRole('heading', { name: 'Remove this saved deny choice?' })).toBeTruthy();
    expect(screen.getByText('Removing a denial permits a new request. It does not approve or rerun anything.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Complete saved decision' }).textContent).toContain('Not versioned');
  });

  it('removes through the opaque snapshot selection once, ignores Escape while pending and reports a neutral receipt', async () => {
    const { api, first } = fixture();
    const reply = deferred<ActionReply>();
    api.revoke.mockReturnValue(reply.promise);
    mount(api);
    await ready();
    fireEvent.click(reviewButtons()[0]!);
    fireEvent.click(button('Remove decision'));
    fireEvent.click(button('Remove decision'));
    expect(api.revoke).toHaveBeenCalledTimes(1);
    expect(api.revoke).toHaveBeenCalledWith({ snapshotId: first!.snapshotId, selectionId: first!.records[0]!.selectionId });
    escape();
    expect(api.close).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Complete saved decision' })).toBeTruthy();
    api.getState.mockResolvedValue({ ok: true, value: page([first!.records[1]!]) });
    await act(async () => { reply.resolve({ ok: true, value: 'removed' }); });
    await waitFor(() => expect(rows()).toHaveLength(1));
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Saved decision removed.');
    expect(status.textContent).not.toMatch(/Done|Granted/u);
    await waitFor(() => expect(document.activeElement).toBe(button('Refresh')));
    expect(api.revoke).toHaveBeenCalledTimes(1);
  });

  it('keeps a changed choice, returns focus to Refresh and never retries', async () => {
    const { api, first } = fixture();
    api.revoke.mockResolvedValue({ ok: true, value: 'changed' });
    mount(api);
    await ready();
    fireEvent.click(reviewButtons()[0]!);
    fireEvent.click(button('Remove decision'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('newer choice was kept'));
    await waitFor(() => expect(document.activeElement).toBe(button('Refresh')));
    expect(screen.queryByRole('region', { name: 'Complete saved decision' })).toBeNull();
    expect(api.revoke).toHaveBeenCalledTimes(1);
    expect(api.getState).toHaveBeenLastCalledWith({});
    expect(first).toBeTruthy();
  });

  it('shows an unclassified unavailable band for read failures and blocks review until a confirmed refresh', async () => {
    const { api, first } = fixture();
    mount(api);
    await ready();
    api.getState.mockResolvedValueOnce({ ok: false, error: { code: 'unavailable', message: 'Saved permissions are unavailable. Refresh after local data opens.' } });
    fireEvent.click(button('Refresh'));
    const heading = await screen.findByRole('heading', { name: 'Review current permissions' });
    const band = heading.closest('section')!;
    expect(band.dataset.kind).toBe('unavailable');
    expect(band.textContent).toContain('Unavailable');
    expect(band.textContent).not.toMatch(/Done|Permission denied|Unsupported/u);
    expect(reviewButtons().every(element => element.disabled)).toBe(true);
    expect(button('Next page').disabled).toBe(true);
    api.getState.mockResolvedValueOnce({ ok: true, value: first! });
    fireEvent.click(button('Refresh'));
    await waitFor(() => expect(reviewButtons().every(element => !element.disabled)).toBe(true));
    expect(screen.queryByRole('heading', { name: 'Review current permissions' })).toBeNull();
  });

  it('pages with the opaque cursor, closes any open review and never concatenates pages', async () => {
    const cursor = randomUUID();
    const { api, first } = fixture();
    first!.nextCursor = cursor;
    mount(api);
    await ready();
    fireEvent.click(reviewButtons()[0]!);
    escape();
    api.getState.mockResolvedValueOnce({ ok: true, value: page([row({ sourceLabel: 'Public second page' })]) });
    fireEvent.click(button('Next page'));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(api.getState).toHaveBeenLastCalledWith({ afterId: cursor });
    expect(screen.getByRole('navigation', { name: 'Saved decision pages' }).textContent).toContain('Page 2');
    expect(button('Next page').disabled).toBe(true);
    expect(button('Previous page').disabled).toBe(false);
  });
});
