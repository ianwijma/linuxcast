import type { WorkflowEditorApi, WorkflowEditorRecord, WorkflowEditorWrite } from '@linuxcast/contracts';
import { createWorkflowDraft } from '@linuxcast/workflows/registry';
/** Public synthetic in-memory owner. Observations are not SQLite/native evidence. */
export function createFixtureOwner(mode = '') {
  let record: WorkflowEditorRecord | null = null, closed = 0;
  let listener: Parameters<WorkflowEditorApi['onCloseRequested']>[0] = () => false;
  const requests: WorkflowEditorWrite[] = [];
  const api: WorkflowEditorApi = {
    async load() { if (mode === 'load-error') return { ok: false, error: { code: 'unavailable', message: 'Synthetic unavailable' } }; return { ok: true, value: structuredClone(record) }; },
    async write(input) {
      requests.push(structuredClone(input));
      if (mode === 'pending') await new Promise(resolve => setTimeout(resolve, 800));
      if (mode === 'unknown') return { ok: false, error: { code: 'unknown-outcome', message: 'Synthetic unknown' } };
      if (mode === 'unavailable') return { ok: false, error: { code: 'unavailable', message: 'Synthetic unavailable' } };
      if ((record?.revision ?? 0) !== input.expectedRevision) return { ok: false, error: { code: 'conflict', message: 'Synthetic conflict' } };
      const saved = input.action === 'save' ? structuredClone(input.draft) : structuredClone(record?.saved ?? null);
      record = { revision: input.expectedRevision + 1, draft: input.action === 'revert' ? structuredClone(saved ?? createWorkflowDraft()) : structuredClone(input.draft), saved, updatedAt: '2026-10-27T00:00:00.000Z' };
      return { ok: true, value: structuredClone(record) };
    },
    async close() { closed++; },
    onCloseRequested(next) { listener = next; return () => { listener = () => false; }; },
  };
  return { api, requests, get record() { return record; }, set record(value) { record = value; }, get closed() { return closed; }, requestClose() { return listener(); } };
}
