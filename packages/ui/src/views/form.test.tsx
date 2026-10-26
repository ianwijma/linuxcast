// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ViewModel } from '@linuxcast/contracts';
import { ViewForm } from './form.tsx';
import { form } from './fixtures/models.ts';
import type { ViewHost } from './types.ts';
afterEach(cleanup);
const model = form as Extract<ViewModel, { kind: 'form' }>;
const fields = [{ id: 'name', kind: 'text', title: 'Name', required: true, value: 'Public example' }, { id: 'secret', kind: 'secret', title: 'Credential', required: false }] as const;
const simple = { ...model, fields: [...fields] };
const submit = () => fireEvent.submit(screen.getByRole('form'));
describe('form lifecycle and trusted host boundary', () => {
  it('never includes raw credential values in ordinary action intents', async () => {
    const action = vi.fn(); const sealSecret = vi.fn(async () => ({ secretHandle: 'opaque-handle' }));
    render(<StrictMode><ViewForm view={simple} host={{ action, sealSecret, releaseSecret: vi.fn() }} active onDirty={() => {}} requestCancel={() => {}} /></StrictMode>);
    fireEvent.change(screen.getByLabelText('Credential'), { target: { value: 'synthetic-only' } }); submit();
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0]![0].values).toEqual({ name: 'Public example', secret: { secretHandle: 'opaque-handle' } });
    expect(JSON.stringify(action.mock.calls)).not.toContain('synthetic-only'); expect((screen.getByLabelText('Credential') as HTMLInputElement).value).toBe('');
  });
  it('a newer revision during secure storage suppresses the stale action and releases its handle', async () => {
    let resolve!: (value: { secretHandle: string }) => void;
    const action = vi.fn(); const releaseSecret = vi.fn();
    const host: ViewHost = { action, releaseSecret, sealSecret: () => new Promise(done => { resolve = done; }) };
    const result = render(<ViewForm view={simple} host={host} active onDirty={() => {}} requestCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Credential'), { target: { value: 'synthetic-only' } }); submit();
    result.rerender(<ViewForm view={{ ...simple, revision: 2 }} host={host} active onDirty={() => {}} requestCancel={() => {}} />);
    await act(async () => resolve({ secretHandle: 'stale-handle' }));
    expect(action).not.toHaveBeenCalled(); expect(releaseSecret).toHaveBeenCalledWith('stale-handle');
  });
  it('closing the form aborts picker/storage work and releases a late credential handle', async () => {
    let resolve!: (value: { secretHandle: string }) => void; let signal!: AbortSignal;
    const action = vi.fn(); const releaseSecret = vi.fn();
    const result = render(<ViewForm view={simple} host={{ action, releaseSecret, sealSecret: (_value, inputSignal) => { signal = inputSignal; return new Promise(done => { resolve = done; }); } }} active onDirty={() => {}} requestCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Credential'), { target: { value: 'synthetic-only' } }); submit(); result.unmount();
    expect(signal.aborted).toBe(true); await act(async () => resolve({ secretHandle: 'late-handle' })); expect(action).not.toHaveBeenCalled(); expect(releaseSecret).toHaveBeenCalledWith('late-handle');
  });
  it('new host validation errors are shown after draft edits and blocked until corrected', async () => {
    const action = vi.fn(); const result = render(<ViewForm view={simple} host={{ action }} active onDirty={() => {}} requestCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Draft' } });
    result.rerender(<ViewForm view={{ ...simple, revision: 2, fields: [{ ...fields[0], error: 'This name is already used.' }] }} host={{ action }} active onDirty={() => {}} requestCancel={() => {}} />);
    expect(screen.getByText('This name is already used.')).toBeTruthy(); submit(); expect(action).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Another name' } }); submit(); await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });
  it('does not revive a corrected host error on an unrelated appearance/status revision', async () => {
    const action=vi.fn(),host={action},errored={...simple,revision:2,fields:[{...fields[0],value:'Rejected',error:'This name is already used.'}]};
    const result=render(<ViewForm view={errored} host={host} active onDirty={()=>{}} requestCancel={()=>{}} />);
    fireEvent.change(screen.getByLabelText(/Name/),{target:{value:'Corrected'}});
    result.rerender(<ViewForm view={{...errored,revision:3,status:{kind:'info',message:'Updated appearance.'}}} host={host} active onDirty={()=>{}} requestCancel={()=>{}} />);
    expect(screen.queryByText('This name is already used.')).toBeNull();submit();await waitFor(()=>expect(action).toHaveBeenCalledTimes(1));
    result.rerender(<ViewForm view={{...errored,revision:4,fields:[{...errored.fields[0]!,value:'Corrected',error:'This corrected name is also used.'}]}} host={host} active onDirty={()=>{}} requestCancel={()=>{}} />);
    expect(screen.getByText('This corrected name is also used.')).toBeTruthy();submit();expect(action).toHaveBeenCalledTimes(1);
  });
  it('missing secure storage refuses nonempty secrets without emitting an action', () => {
    const action = vi.fn(); render(<ViewForm view={simple} host={{ action }} active onDirty={() => {}} requestCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Credential'), { target: { value: 'synthetic-only' } }); submit(); expect(action).not.toHaveBeenCalled(); expect(screen.getByText(/Secure credential entry is unavailable/)).toBeTruthy();
  });
  it('preserves prototype-like field IDs as ordinary own submitted data', async () => {
    const action = vi.fn(); render(<ViewForm view={{ ...simple, fields: [{ id: '__proto__', kind: 'text', title: 'Special ID', required: true, value: 'Public data' }, { id: 'constructor', kind: 'text', title: 'Another ID', required: false, value: 'Other data' }] }} host={{ action }} active onDirty={() => {}} requestCancel={() => {}} />);
    submit(); await waitFor(() => expect(action).toHaveBeenCalledTimes(1)); const values = action.mock.calls[0]![0].values; expect(Object.hasOwn(values, '__proto__')).toBe(true); expect(values.__proto__).toBe('Public data'); expect(values.constructor).toBe('Other data');
  });
  it('refuses oversized UTF-8 text rather than sending an invalid field', () => {
    const action = vi.fn(); render(<ViewForm view={simple} host={{ action }} active onDirty={() => {}} requestCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: '界'.repeat(30000) } }); submit(); expect(action).not.toHaveBeenCalled(); expect(screen.getByText(/field limits/)).toBeTruthy();
  });
  it('invalid picker results remain unavailable rather than becoming path authority', async () => {
    const action = vi.fn(); render(<ViewForm view={{ ...simple, fields: [{ id: 'folder', kind: 'directory', title: 'Folder', required: true, value: null }] }} host={{ action, pickReference: async () => ({ kind: 'file', grantId: '', entryId: '', displayName: '/arbitrary' }) }} active onDirty={() => {}} requestCancel={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Folder/)); await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy()); submit(); expect(action).not.toHaveBeenCalled();
  });
  it('maps whitespace model IDs to safe DOM IDs while preserving submitted keys', async () => {
    const action = vi.fn(); render(<ViewForm view={{ ...simple, fields: [{ id: 'full name\twith whitespace', kind: 'text', title: 'Display name', description: 'Public hint.', required: true, value: '' }] }} host={{ action }} active onDirty={() => {}} requestCancel={() => {}} />);
    const input = screen.getByLabelText(/Display name/) as HTMLInputElement; submit();
    expect(input.id).not.toMatch(/\s/); expect(document.activeElement).toBe(input);
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    expect(ids.map(id => document.getElementById(id)?.textContent)).toEqual(['Public hint.', 'Complete this required field.']);
    fireEvent.change(input, { target: { value: 'Public name' } }); submit(); await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0]![0].values['full name\twith whitespace']).toBe('Public name');
  });
  it('disabled cancellation cannot invoke the close callback', () => {
    const requestCancel = vi.fn(); render(<ViewForm view={{ ...simple, actions: simple.actions!.map(action => action.id === simple.cancelActionId ? { ...action, disabledReason: 'Finishing a request.' } : action) }} host={{ action: vi.fn() }} active onDirty={() => {}} requestCancel={requestCancel} />);
    const button = screen.getByRole('button', { name: 'Cancel' }); expect((button as HTMLButtonElement).disabled).toBe(true); fireEvent.click(button); expect(requestCancel).not.toHaveBeenCalled();
  });

});
