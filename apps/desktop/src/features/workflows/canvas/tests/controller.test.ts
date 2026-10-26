import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowEditorApi, WorkflowEditorWrite } from '@linuxcast/contracts';
import { createWorkflowDraft } from '@linuxcast/workflows/registry';
import { WorkflowEditorController } from '../controller.ts';
import { createFixtureOwner } from '../fixtures/owner.ts';
const controllers: WorkflowEditorController[] = [];
async function setup(mode = '', apiOverride?: Partial<WorkflowEditorApi>) {
  const owner = createFixtureOwner(mode), controller = new WorkflowEditorController({ ...owner.api, ...apiOverride }); controllers.push(controller); await controller.load(); return { owner, controller };
}
afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()); vi.useRealTimers(); });
describe('real workflow draft editing', () => {
  it('loads absent without writing; New creates an inert draft and all three registry nodes', async () => {
    const { owner, controller: c } = await setup(); expect(c.getSnapshot().draft).toBeNull(); expect(owner.requests).toEqual([]); c.create(); c.add('input.keyword'); c.add('utility.transform'); c.add('output.clipboard');
    expect(c.getSnapshot().draft?.nodes.map(node => node.type)).toEqual(['input.keyword', 'utility.transform', 'output.clipboard']); expect(c.getSnapshot().draft?.permissions).toEqual([{ id: 'clipboard.write', reason: 'Copy the text you submit' }]); expect(owner.requests).toEqual([]);
  });
  it('configures using registry schemas; invalid keyword drafts remain editable but cannot Save', async () => {
    const { owner, controller: c } = await setup(); c.create(); c.add('input.keyword'); c.configure('node-1', 'Public keyword', { keyword: 'bad keyword', argument: 'required', trimQuery: false }); expect(c.getSnapshot().validation).not.toBe(''); expect(await c.write('save')).toBe(false); expect(owner.requests).toEqual([]); expect(await c.write('draft')).toBe(true); expect(owner.record?.saved).toBeNull(); c.configure('node-1', 'Public keyword', { keyword: 'public', argument: 'optional', trimQuery: true }); expect(c.getSnapshot().validation).toBe(''); expect(await c.write('save')).toBe(true);
  });
  it('connects through named ports and rejects raw cycles, unknown ports and trigger input', async () => {
    const { controller: c } = await setup(); c.create(); c.add('input.keyword'); c.add('utility.transform'); c.add('output.clipboard'); expect(c.connect('node-1', 'out', 'node-2')).toBe(true); expect(c.connect('node-2', 'out', 'node-3')).toBe(true); expect(c.connect('node-3', 'out', 'node-2')).toBe(false); expect(c.connect('node-2', 'out', 'node-1')).toBe(false); expect(c.connect('node-1', 'wrong', 'node-3')).toBe(false); expect(c.getSnapshot().draft?.edges).toHaveLength(2); expect(await c.write('draft')).toBe(true); expect(c.getSnapshot().connectionError).toContain('Connection rejected');
  });
  it('deletes attached connections/positions and only removes clipboard declaration with the last Copy', async () => {
    const { controller: c } = await setup(); c.create(); c.add('input.keyword'); c.add('output.clipboard'); c.add('output.clipboard'); c.connect('node-1', 'out', 'node-2'); c.remove('node-2'); expect(c.getSnapshot().draft?.permissions).toHaveLength(1); expect(c.getSnapshot().draft?.edges).toEqual([]); expect(c.getSnapshot().draft?.editor.positions['node-2']).toBeUndefined(); c.remove('node-3'); expect(c.getSnapshot().draft?.permissions).toEqual([]);
  });
  it('layout and viewport never alter graph semantics; undo/redo restores both graph and layout', async () => {
    const { controller: c } = await setup(); c.create(); c.add('input.keyword'); const before = structuredClone(c.getSnapshot().draft!); c.positions({ 'node-1': { x: 90, y: 120 } }); expect(c.getSnapshot().draft?.nodes).toEqual(before.nodes); expect(c.getSnapshot().draft?.edges).toEqual(before.edges); c.undo(); expect(c.getSnapshot().draft).toEqual(before); c.redo(); expect(c.getSnapshot().draft?.editor.positions['node-1']).toEqual({ x: 90, y: 120 }); c.viewport({ x: 20, y: 30, zoom: 1.5 }); expect(c.getSnapshot().draft?.nodes).toEqual(before.nodes); c.remove('node-1'); c.undo(); expect(c.getSnapshot().draft?.nodes).toHaveLength(1); expect(c.getSnapshot().draft?.editor.viewport).toEqual({ x: 20, y: 30, zoom: 1.5 });
  });
  it('debounces edits for 500ms without run/input/clipboard requests', async () => {
    vi.useFakeTimers(); const { owner, controller: c } = await setup(); c.create(); await vi.advanceTimersByTimeAsync(400); c.rename('Public latest'); await vi.advanceTimersByTimeAsync(499); expect(owner.requests).toEqual([]); await vi.advanceTimersByTimeAsync(1); expect(owner.requests).toHaveLength(1); expect(owner.record?.draft.name).toBe('Public latest'); expect(c.getSnapshot().dirty).toBe(false);
  });
  it('serializes writes and preserves newer edits after exact acknowledgement', async () => {
    vi.useFakeTimers(); const { owner, controller: c } = await setup('pending'); c.create(); c.rename('First'); const pending = c.write('draft'); await vi.advanceTimersByTimeAsync(1); c.rename('Newer'); c.add('input.keyword'); await vi.advanceTimersByTimeAsync(600); expect(owner.requests).toHaveLength(1); await vi.advanceTimersByTimeAsync(199); expect(await pending).toBe(true); expect(c.getSnapshot().draft?.name).toBe('Newer'); expect(c.getSnapshot().dirty).toBe(true); await vi.advanceTimersByTimeAsync(500); expect(owner.requests).toHaveLength(2); expect(owner.requests[1]?.expectedRevision).toBe(1); expect(owner.requests[1]?.draft.name).toBe('Newer');
  });
  it('accepts authoritative receipt object member reordering but preserves arrays and values', async () => {
    const owner = createFixtureOwner(); const { controller: c } = await setup('', { write: async input => { const reply = await owner.api.write(input); return JSON.parse(JSON.stringify(reply, (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value)); } }); c.create(); c.add('input.keyword'); expect(await c.write('save')).toBe(true); expect(c.getSnapshot().blocked).toBe(false);
  });
  for (const mismatch of ['revision', 'draft', 'saved', 'extra'] as const) it(`rejects ${mismatch} receipt with no saved claim or replay`, async () => {
    vi.useFakeTimers(); const owner = createFixtureOwner(); const { controller: c } = await setup('', { write: async input => { const reply = await owner.api.write(input); if (!reply.ok) return reply; if (mismatch === 'revision') reply.value.revision++; if (mismatch === 'draft') reply.value.draft.name = 'Different'; if (mismatch === 'saved') reply.value.saved = null; if (mismatch === 'extra') Object.assign(reply.value, { extra: true }); return reply; } }); c.create(); expect(await c.write('save')).toBe(false); expect(c.getSnapshot().blocked).toBe(true); expect(c.getSnapshot().dirty).toBe(true); c.rename('Later'); await vi.advanceTimersByTimeAsync(6000); expect(owner.requests).toHaveLength(1); expect(await c.write('save')).toBe(false);
  });
  for (const code of ['conflict', 'unknown-outcome'] as const) it(`${code} blocks autosave until explicit authoritative Reload`, async () => {
    vi.useFakeTimers(); const { owner, controller: c } = await setup('', { write: async () => ({ ok: false, error: { code, message: 'Synthetic content must not display' } }) }); c.create(); expect(await c.write('draft')).toBe(false); expect(c.getSnapshot().blocked).toBe(true); expect(c.getSnapshot().message).not.toContain('Synthetic'); c.rename('Keep local'); await vi.advanceTimersByTimeAsync(6000); expect(owner.requests).toEqual([]); await c.load(); expect(c.getSnapshot().blocked).toBe(false); expect(c.getSnapshot().draft).toBeNull();
  });
  it('known prewrite failure retains draft and allows deliberate Retry draft', async () => {
    const { controller: c } = await setup('unavailable'); c.create(); c.rename('Retained'); expect(await c.write('draft')).toBe(false); expect(c.getSnapshot().blocked).toBe(false); expect(c.getSnapshot().draft?.name).toBe('Retained'); expect(c.getSnapshot().message).toContain('Retry draft'); expect(await c.write('draft')).toBe(false);
  });
  it('deadline/malformed failure requires Reload and ignores a late acknowledgement', async () => {
    vi.useFakeTimers(); let finish!: (value: Awaited<ReturnType<WorkflowEditorApi['write']>>) => void; let captured!: WorkflowEditorWrite;
    const { controller: c } = await setup('', { write: input => { captured = input; return new Promise(resolve => { finish = resolve; }); } }); c.create(); const pending = c.write('draft'); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toBe(false); expect(c.getSnapshot().blocked).toBe(true); finish({ ok: true, value: { revision: 1, draft: captured.draft, saved: null, updatedAt: '2026-10-27T00:00:00Z' } }); await vi.advanceTimersByTimeAsync(10); expect(c.getSnapshot().record).toBeNull(); expect(c.getSnapshot().blocked).toBe(true);
  });
  it('Save and Revert use exact CAS revisions and never run anything', async () => {
    const { owner, controller: c } = await setup(); c.create(); c.rename('Saved public'); expect(await c.write('save')).toBe(true); c.rename('Later draft'); await c.write('draft'); expect(owner.record?.saved?.name).toBe('Saved public'); expect(await c.write('revert')).toBe(true); expect(c.getSnapshot().draft?.name).toBe('Saved public'); expect(owner.requests.map(item => [item.action, item.expectedRevision])).toEqual([['save', 0], ['draft', 1], ['revert', 2]]); expect(c.getSnapshot().dirty).toBe(false);
  });
  it('Revert before first Save returns a new empty draft', async () => {
    const { controller: c } = await setup(); c.create(); c.add('input.keyword'); await c.write('draft'); expect(await c.write('revert')).toBe(true); expect(c.getSnapshot().draft).toEqual(createWorkflowDraft());
  });
  it('Close flushes the last pending/newer draft exactly once before navigation', async () => {
    vi.useFakeTimers(); const { owner, controller: c } = await setup('pending'); c.create(); const first = c.write('draft'); await vi.advanceTimersByTimeAsync(1); c.rename('Final public'); const close = c.requestClose(); c.rename('Ignored while closing'); expect(owner.closed).toBe(0); await vi.advanceTimersByTimeAsync(1600); await first; expect(await close).toBe(true); expect(owner.requests).toHaveLength(2); expect(owner.record?.draft.name).toBe('Final public'); expect(owner.closed).toBe(1);
  });
  it('Close failure retains graph and offers recovery; discard navigation does not write again', async () => {
    const { owner, controller: c } = await setup('unknown'); c.create(); c.rename('Unsaved'); expect(await c.requestClose()).toBe(false); expect(owner.closed).toBe(0); expect(c.getSnapshot().closeFailed).toBe(true); expect(c.getSnapshot().draft?.name).toBe('Unsaved'); expect(await c.closeWithoutFlush()).toBe(true); expect(owner.requests).toHaveLength(1); expect(owner.closed).toBe(1);
  });
  it('read failure cannot create/overwrite an unknown existing record', async () => {
    const { owner, controller: c } = await setup('load-error'); c.create(); expect(c.getSnapshot().draft).toBeNull(); expect(c.getSnapshot().blocked).toBe(true); expect(owner.requests).toEqual([]);
  });
  it('dispose fences pending writes and listeners; no late successful presentation', async () => {
    vi.useFakeTimers(); const { owner, controller: c } = await setup('pending'); const listener = vi.fn(); c.subscribe(listener); c.create(); const pending = c.write('save'); const before = c.getSnapshot(); c.dispose(); listener.mockClear(); await vi.advanceTimersByTimeAsync(800); expect(await pending).toBe(false); expect(owner.record).not.toBeNull(); expect(c.getSnapshot()).toBe(before); expect(listener).not.toHaveBeenCalled();
  });
});
