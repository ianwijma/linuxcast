import type { LineIconName } from '@linuxcast/ui';
import type { WorkflowRunErrorCode, WorkflowRunState } from '@linuxcast/contracts';

/**
 * Presentation-only, shape-coded classification of actual typed host run state (docs/design/DESIGN.md
 * "States and motion"). Glyph shape plus a word always accompany tone. It never derives success from a
 * declaration or from local intent: only a host `succeeded` snapshot uses the success shape, and an
 * unconfirmed transport or unknown effect is never classified as success.
 */
export type RunTone = 'muted' | 'danger' | 'warning' | 'focus' | 'success';
export type RunClass = { glyph: LineIconName; tone: RunTone };

const errorClass: Record<WorkflowRunErrorCode, RunClass> = {
  'invalid-workflow': { glyph: 'stateError', tone: 'danger' },
  'unsupported-configuration': { glyph: 'stateError', tone: 'danger' },
  'invalid-input': { glyph: 'stateError', tone: 'danger' },
  'invalid-binding': { glyph: 'stateError', tone: 'danger' },
  'limit-exceeded': { glyph: 'stateError', tone: 'danger' },
  // The effect may or may not have happened: inspect the clipboard; nothing is retried or replayed.
  'deadline-exceeded': { glyph: 'stateInterrupted', tone: 'warning' },
  'permission-denied': { glyph: 'stateDenied', tone: 'warning' },
  // Typed but unclassified: the host does not say why the clipboard/runner is unavailable.
  unavailable: { glyph: 'info', tone: 'warning' },
  'storage-unavailable': { glyph: 'info', tone: 'warning' },
  'unknown-outcome': { glyph: 'stateInterrupted', tone: 'warning' },
  cancelled: { glyph: 'stateInterrupted', tone: 'muted' },
};

export function classifyRun(snapshot: WorkflowRunState, unconfirmed: boolean): RunClass {
  if (unconfirmed) return { glyph: 'info', tone: 'warning' };
  if (snapshot.effectOutcome === 'unknown' || snapshot.requiresReview) return { glyph: 'stateInterrupted', tone: 'warning' };
  switch (snapshot.state) {
    case 'queued': case 'running': case 'cancelling': return { glyph: 'stateLoading', tone: 'muted' };
    case 'waiting-ui': return { glyph: 'statePending', tone: 'focus' };
    case 'succeeded': return { glyph: 'stateSuccess', tone: 'success' };
    case 'interrupted': return { glyph: 'stateInterrupted', tone: 'warning' };
    case 'cancelled': return { glyph: 'stateInterrupted', tone: 'muted' };
    case 'failed': return snapshot.errorCode ? errorClass[snapshot.errorCode] : { glyph: 'stateError', tone: 'danger' };
  }
}

export function classifyStep(state: WorkflowRunState['steps'][number]['state']): RunClass {
  if (state === 'running') return { glyph: 'stateLoading', tone: 'muted' };
  if (state === 'succeeded') return { glyph: 'stateSuccess', tone: 'success' };
  if (state === 'failed') return { glyph: 'stateError', tone: 'danger' };
  return { glyph: 'stateInterrupted', tone: 'muted' };
}

export const stepWords: Record<WorkflowRunState['steps'][number]['state'], string> = { running: 'Running', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled' };
