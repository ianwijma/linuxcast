import { useEffect, useId, useMemo, useRef, useSyncExternalStore } from 'react';
import { Button, EmptyState, ErrorState, LoadingState, UnavailableState } from '@linuxcast/ui';
import '@linuxcast/ui/styles.css';
import { workflowDisplayName } from '@linuxcast/contracts';
import type { WorkflowDefinition, WorkflowRunApi, WorkflowRunErrorCode } from '@linuxcast/contracts';
import { isActiveRun, WorkflowRunController } from './controller.ts';
import './run-panel.css';
const errorText: Record<WorkflowRunErrorCode, string> = {
  'invalid-workflow': 'This saved workflow cannot run. Return to the editor and save a valid supported graph.',
  'unsupported-configuration': 'This saved version uses configuration that the text runner does not support yet. Review the graph in the editor.',
  'invalid-input': 'The selected Keyword does not accept this input. Check its required, optional or no-argument setting and start a new run.',
  'invalid-binding': 'The text runner supports only input#/0 source and clipboard text bindings. Review the saved configuration.',
  'limit-exceeded': 'The run reached its activation or text-size limit. Review the workflow before starting a new run.',
  'deadline-exceeded': 'The run reached its deadline. Check the clipboard before considering a new invocation.',
  'permission-denied': 'Clipboard access was denied. Review clipboard access to clear this saved version’s decision, then start a new run if wanted.',
  unavailable: 'The clipboard or runner is unavailable. Check the local capability before starting a new run.',
  'storage-unavailable': 'Run checkpoints could not be stored. Check local storage before starting a new run.',
  'unknown-outcome': 'The clipboard outcome is unknown. Inspect your clipboard. This run will not be replayed.',
  cancelled: 'The run was cancelled. Cancellation does not undo a copy that already occurred.',
};
const names = { queued: 'Queued', running: 'Running', 'waiting-ui': 'Waiting for clipboard approval', cancelling: 'Cancelling', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted' };
export type WorkflowRunPanelProps = { api: WorkflowRunApi; editorRevision: number; savedDefinition: WorkflowDefinition; initialEntry?: string; onClose: () => void };
export function WorkflowRunPanel({ api, editorRevision, savedDefinition, initialEntry, onClose }: WorkflowRunPanelProps) {
  // Definition props are display metadata. Main re-loads the exact revision before starting.
  const definitionKey = JSON.stringify(savedDefinition);
  const controller = useMemo(() => new WorkflowRunController(api, editorRevision, JSON.parse(definitionKey) as WorkflowDefinition, initialEntry), [api, editorRevision, definitionKey, initialEntry]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const id = useId(), entryId = useId(), inputId = useId(), inputHint = useId(), inputError = useId();
  const cancelRef = useRef<HTMLButtonElement>(null), headingRef = useRef<HTMLHeadingElement>(null), statusRef = useRef<HTMLElement>(null);
  const snapshot = state.snapshot, prompt = snapshot?.prompt, active = isActiveRun(snapshot), pending = state.pending !== null;
  const entry = controller.entries.find(node => node.id === state.entry), disabled = state.loading || pending || active;
  useEffect(() => { void controller.attach(); headingRef.current?.focus(); return () => controller.dispose(); }, [controller]);
  useEffect(() => { if (prompt && !state.loading && !pending) cancelRef.current?.focus(); }, [snapshot?.runId, prompt?.id, state.loading, pending]);
  useEffect(() => { if (snapshot && !isActiveRun(snapshot)) statusRef.current?.focus({ preventScroll: true }); }, [snapshot?.runId, snapshot?.state]);
  return <section className="wr-panel" aria-labelledby={id} onKeyDownCapture={event => {
    if (event.nativeEvent.isComposing) return;
    const target = event.target;
    const editable = target instanceof HTMLElement && (target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (event.key === 'Enter' && event.repeat && !editable) { event.preventDefault(); event.stopPropagation(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <header className="wr-header"><div><p className="wr-caption">SAVED TEXT WORKFLOW</p><h2 className="lc-focus" ref={headingRef} tabIndex={-1} id={id}>Run saved workflow</h2><p>{workflowDisplayName(controller.definition?.name || 'Saved workflow')} · version {controller.definition?.version || 'unavailable'} · editor revision {editorRevision}</p></div><Button onClick={onClose}>Back to editor</Button></header>
    <p className="wr-caption">Returning to the editor keeps the host run and pending approval. Reopen Run to inspect them. Input and result are transient; the journal stores metadata only.</p>
    {state.loading && <LoadingState label="Connecting to workflow run…" />}
    {state.error && <ErrorState title="Run action needs review" description={state.error} />}
    {state.notice && <p role="status" className="wr-notice">{state.notice}</p>}
    {state.requiresReview && <ErrorState title="Inspect your clipboard" description="A clipboard effect may have occurred. Check its contents before starting a deliberate new run. The previous effect will not be retried or replayed." />}
    {controller.requestedEntryUnavailable || !controller.definition || !controller.entries.length ? <UnavailableState title={controller.requestedEntryUnavailable ? 'Selected Keyword unavailable' : 'No enabled Keyword entry'} description={controller.requestedEntryUnavailable ? 'The selected saved Keyword is missing, disabled or no longer a Keyword. Return to the launcher or editor, save a valid version and reopen Run. Any attached run below remains available for inspection and cancellation.' : 'Return to the editor, add an enabled Keyword and save a valid supported version.'} action={<Button disabled={state.loading || pending} onClick={() => { void controller.refresh(); }}>Refresh run</Button>} /> : <form aria-label="New text run" onSubmit={event => { event.preventDefault(); void controller.start(); }}>
      <div className="wr-fields"><div className="lc-field"><label htmlFor={entryId} className="lc-field-label">Keyword entry</label><select id={entryId} className="lc-input lc-focus" disabled={disabled} value={state.entry} onChange={event => controller.entry(event.target.value)}>{controller.entries.map(node => <option key={node.id} value={node.id}>{node.label || String(node.config.keyword || node.id)} · {node.id}</option>)}</select></div>
        <div className="lc-field"><label htmlFor={inputId} className="lc-field-label">Text to run</label><textarea id={inputId} className="lc-input lc-focus wr-input" rows={4} value={state.input} disabled={disabled || entry?.config.argument === 'none'} maxLength={16384} aria-invalid={!!state.inputError} aria-describedby={`${inputHint}${state.inputError ? ` ${inputError}` : ''}`} onChange={event => controller.input(event.target.value)} /><p id={inputHint} className="lc-field-hint">{entry?.config.argument === 'none' ? 'This Keyword takes no argument.' : entry?.config.argument === 'required' ? 'This Keyword requires text.' : 'Text is optional for this Keyword.'} Up to 16 KiB; this is an explicit saved-version invocation.</p>{state.inputError && <p id={inputError} className="lc-field-error">{state.inputError}</p>}</div></div>
      <div className="wr-actions"><Button type="submit" variant="primary" busy={state.pending === 'start'} disabled={state.loading || active || state.unconfirmed || (pending && state.pending !== 'start')}>{snapshot && !active ? 'Start new run' : 'Run saved version'}</Button><Button disabled={state.loading || pending} onClick={() => { void controller.refresh(); }}>Refresh run</Button><Button busy={state.pending === 'reset'} disabled={state.loading || (pending && state.pending !== 'reset')} aria-describedby="wr-reset-hint" onClick={() => { void controller.resetPermission(); }}>Review clipboard access</Button></div>
      <p id="wr-reset-hint" className="wr-caption">Review clears only this saved version’s clipboard decision and cancels its active work. It never starts or repeats a run.</p>
    </form>}
    {snapshot ? <>
      <section className="wr-status" ref={statusRef} tabIndex={-1} aria-label="Run status"><h3>{state.unconfirmed ? 'Run state unconfirmed' : names[snapshot.state]}</h3><dl><div><dt>Workflow</dt><dd>{snapshot.workflowName}</dd></div><div><dt>Saved revision</dt><dd>{snapshot.editorRevision}</dd></div><div><dt>Run ID</dt><dd>{snapshot.runId}</dd></div><div><dt>Clipboard effect</dt><dd>{state.unconfirmed ? 'Unconfirmed — inspect clipboard if a copy was underway' : snapshot.effectOutcome === 'completed' ? 'Completed with host receipt' : snapshot.effectOutcome === 'unknown' ? 'Unknown — inspect clipboard' : 'Not dispatched'}</dd></div></dl>{snapshot.errorCode && <p role="status">{errorText[snapshot.errorCode]}</p>}{active && <p role="status">{names[snapshot.state]}. No action will be approved automatically.</p>}</section>
      {prompt && <section className="wr-approval" aria-label="Clipboard approval"><h3>Clipboard access</h3><p><strong>{snapshot.workflowName}</strong> · saved revision {snapshot.editorRevision}</p><p>Replace the current clipboard with the following text. This does not paste text or collect clipboard history.</p><pre role="region" className="wr-text" tabIndex={0} aria-label="Text proposed for clipboard">{prompt.text}</pre><div className="wr-actions"><Button ref={cancelRef} busy={state.pending === 'cancel'} disabled={state.loading || (pending && state.pending !== 'cancel')} onClick={() => { void controller.cancel(); }}>Cancel run</Button>{prompt.choices.includes('deny') && <Button busy={state.pending === 'decide'} disabled={state.loading || state.unconfirmed || (pending && state.pending !== 'decide')} onClick={() => { void controller.decide('deny'); }}>Don’t allow</Button>}{prompt.choices.includes('once') && <Button busy={state.pending === 'decide'} disabled={state.loading || state.unconfirmed || (pending && state.pending !== 'decide')} onClick={() => { void controller.decide('once'); }}>Allow once</Button>}{prompt.choices.includes('persistent') && <Button busy={state.pending === 'decide'} disabled={state.loading || state.unconfirmed || (pending && state.pending !== 'decide')} onClick={() => { void controller.decide('persistent'); }}>Always allow for this saved version</Button>}</div><p className="wr-caption">No choice is preselected. Persistent permission belongs only to this saved version.</p></section>}
      {active && !prompt && <div className="wr-actions"><Button busy={state.pending === 'cancel'} disabled={state.loading || (pending && state.pending !== 'cancel')} onClick={() => { void controller.cancel(); }}>Cancel run</Button></div>}
      <section className="wr-steps" aria-label="Recent run steps"><h3>Recent steps</h3><p className="wr-caption">Last {snapshot.steps.length} of up to 50 metadata updates. Values are not captured per step.</p>{snapshot.steps.length ? <ol tabIndex={0} className="lc-focus" aria-label="Recent step updates">{snapshot.steps.map((step, index) => <li key={`${step.activationId}:${index}`}><span>{step.nodeId} · {step.nodeType}</span><span>{step.state}{step.durationMs !== undefined ? ` · ${step.durationMs} ms` : ''}</span></li>)}</ol> : <p className="lc-muted">Waiting for the first node update.</p>}</section>
      {snapshot.output !== undefined && <section aria-label="Workflow result"><h3>Result</h3><p className="wr-caption">Transient plain text · bounded to 64 KiB. This result is not an extra clipboard action.</p><pre role="region" className="wr-text" tabIndex={0} aria-label="Workflow result text">{snapshot.output}</pre></section>}
    </> : !state.loading && !controller.requestedEntryUnavailable && <EmptyState title="No attached run" description="Choose a Keyword entry, enter text and explicitly Run the saved version. Opening this panel does not execute it." />}
  </section>;
}
export default WorkflowRunPanel;
