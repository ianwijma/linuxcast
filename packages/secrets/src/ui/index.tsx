import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Button, EmptyState, ErrorState, GlyphTile, LineIcon, LoadingState, StatePlate, TextField, ThemeProvider,
  UnavailableState, useFocusRestore,
} from '@linuxcast/ui';
import {
  credentialSettingsActionReplySchema, credentialSettingsStateReplySchema,
} from '@linuxcast/platform-contracts';
import type {
  CredentialSettingsActionReply, CredentialSettingsApi, CredentialSettingsState,
} from '@linuxcast/platform-contracts';
import { note, outcomeNotice, persistentReason, sessionOnlyReason, statusRows, unknownNotice } from './presentation.ts';
import type { Notice, Operation } from './presentation.ts';
import './credentials.css';

type Persistence = '' | 'persistent' | 'session-only';
interface Connection {
  api: CredentialSettingsApi;
  active: boolean;
  request: number;
  state: CredentialSettingsState | null;
  ready: boolean;
  mutating: boolean;
}
const localError = 'Credential settings could not be read. Retry to check the current local state.';

/** First-party fixed OpenRouter credential setup. The only key value is newly
 * typed input consumed once by saveKey. No stored-value/readback API is used.
 * Clearing the field releases editable input; JS strings are not zeroizable. */
export function CredentialSettings({ api }: { api?: CredentialSettingsApi }) {
  const [snapshot, setSnapshot] = useState<CredentialSettingsState | null>(null);
  const [reading, setReading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<Operation | null>(null);
  const [persistence, setPersistence] = useState<Persistence>('');
  const [hasInput, setHasInput] = useState(false);
  const [inputError, setInputError] = useState('');
  const [retry, setRetry] = useState(0);
  const connection = useRef<Connection | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const descriptionId = useId();
  const modeId = useId();
  const policyId = useId();
  useFocusRestore(true, surface);
  useLayoutEffect(() => { heading.current?.focus(); }, []);

  const clearInput = useCallback(() => {
    if (field.current) field.current.value = '';
    setHasInput(false);
    setInputError('');
  }, []);

  const refresh = useCallback(async (current: Connection): Promise<void> => {
    if (!current.active) return;
    const request = ++current.request;
    current.ready = false;
    setReading(true);
    try {
      const parsed = credentialSettingsStateReplySchema.safeParse(await current.api.getState());
      if (!current.active || request !== current.request) return;
      if (!parsed.success || !parsed.data.ok) throw new Error('local-state-unavailable');
      const next = parsed.data.value;
      if (current.state && next.revision < current.state.revision) throw new Error('local-state-stale');
      current.state = next;
      current.ready = true;
      setSnapshot(next);
      setReadError(false);
      if (next.session !== 'observed-unlocked') clearInput();
    } catch {
      if (!current.active || request !== current.request) return;
      current.ready = false;
      setReadError(true);
      clearInput();
    } finally {
      if (current.active && request === current.request) setReading(false);
    }
  }, [clearInput]);

  useEffect(() => {
    setSnapshot(null);
    setReadError(false);
    setNotice(null);
    setPending(null);
    setPersistence('');
    clearInput();
    composing.current = false;
    // The form remains mounted through loading/error states as well.
    const input = field.current;
    if (!api) {
      setReading(false);
      setReadError(true);
      return () => { if (input) input.value = ''; };
    }
    const current: Connection = { api, active: true, request: 0, state: null, ready: false, mutating: false };
    connection.current = current;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = api.onChanged(() => { void refresh(current); });
      void refresh(current);
    } catch {
      current.ready = false;
      current.request++;
      setReadError(true);
      setReading(false);
    }
    // Retain only the DOM node for teardown, never a copy of its value.
    return () => {
      current.active = false;
      current.ready = false;
      if (connection.current === current) connection.current = null;
      if (input) input.value = '';
      try { unsubscribe?.(); } catch { /* No raw errors or teardown diagnostics. */ }
    };
  }, [api, retry, clearInput, refresh]);

  useEffect(() => {
    if (readError) retryButton.current?.focus();
  }, [readError]);

  // Take the lock before calling the bridge, including synchronous throws. Never
  // hold a key in React state, a request queue, or a retry callback.
  const run = (current: Connection, operation: Operation, invoke: () => Promise<CredentialSettingsActionReply>) => {
    if (!current.active || current.mutating) return;
    current.mutating = true;
    setPending(operation);
    setNotice(null);
    let result: Promise<CredentialSettingsActionReply>;
    try { result = invoke(); } catch { result = Promise.reject(new Error('local-operation-unavailable')); }
    void (async () => {
      try {
        const parsed = credentialSettingsActionReplySchema.safeParse(await result);
        if (!current.active) return;
        if (!parsed.success) throw new Error('local-operation-unknown');
        const reply = parsed.data;
        setNotice(outcomeNotice(reply, operation));
        if (!reply.ok || reply.value.outcome === 'cancelled' || reply.value.outcome === 'unavailable') clearInput();
      } catch {
        if (!current.active) return;
        clearInput();
        setNotice(unknownNotice);
      } finally {
        if (current.active) {
          await refresh(current);
          if (current.active) {
            current.mutating = false;
            setPending(null);
            // Disabled controls can drop focus to body during native dialogs.
            if (document.activeElement === document.body) heading.current?.focus();
          }
        }
      }
    })();
  };

  const available = (current: Connection | null): current is Connection =>
    !!current?.active && current.ready && !current.mutating && !current.state?.busy;
  const close = () => {
    clearInput();
    const current = connection.current;
    if (!current?.active) {
      setNotice(note('The local window connection is unavailable. Use your window manager to close this window.'));
      return;
    }
    if (current.mutating || current.state?.busy) {
      setNotice(note('An operation is in progress. Wait for its outcome before closing.'));
      return;
    }
    run(current, 'close', () => current.api.close());
  };
  const busy = pending !== null || snapshot?.busy === true;
  const disabled = busy || reading || readError || !snapshot;
  const eligibleSession = snapshot?.session === 'observed-unlocked';
  const eligibleMode = persistence === 'persistent' ? snapshot?.storage === 'available'
    : persistence === 'session-only' ? snapshot?.sessionOnlyAvailable === true : false;
  const canSave = !disabled && eligibleSession && eligibleMode && snapshot?.stored !== 'needs-review' && hasInput;

  const rows = snapshot ? statusRows(snapshot) : [];
  const persistentHint = persistentReason(snapshot);
  const sessionOnlyHint = sessionOnlyReason(snapshot);
  const choose = (value: Persistence) => { setPersistence(value); };

  return <ThemeProvider appearance={snapshot?.appearance ?? 'system'} className="credential-settings-theme">
    <div ref={surface} className="credential-settings" onKeyDown={event => {
      if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
      if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); close();
      }
    }}>
      <header className="cs-header">
        <GlyphTile category="system" icon="gear" />
        <p className="cs-header-title">Credentials</p>
        {/* Escape is bound on this window (see onKeyDown above); the keycap is display only. */}
        <Button className="cs-close" variant="ghost" shortcut={['Escape']} disabled={busy} onClick={close}>Close</Button>
      </header>
      <main className="cs-page" aria-labelledby={`${descriptionId}-title`}>
        <h1 ref={heading} tabIndex={-1} className="lc-focus" id={`${descriptionId}-title`}>OpenRouter API key</h1>
        <div className="cs-lede">
          <p className="lc-muted">Set up the default OpenRouter credential for Linuxcast.</p>
          <p id={descriptionId} className="lc-muted">This screen saves a local credential. It does not contact OpenRouter or check authentication. Provider and model selection are configured separately.</p>
        </div>
        <div className="cs-notice" data-active={notice ? true : undefined}>
          {notice && (notice.kind === 'note'
            ? <p className="cs-note" role="status"><LineIcon name="info" /><span>{notice.text}</span></p>
            : <StatePlate layout="band" announce headingLevel={2} kind={notice.kind} eyebrow={notice.eyebrow} title={notice.title} description={notice.text} />)}
        </div>
        {reading && <LoadingState label={snapshot ? 'Refreshing credential status…' : 'Loading credential settings…'} />}
        {readError && <ErrorState layout="band" title="Credential settings unavailable" description={localError} announce action={
          <Button ref={retryButton} disabled={busy || reading} onClick={() => { setRetry(value => value + 1); }}>Retry</Button>
        } />}
        {snapshot && <section className="cs-card cs-status" aria-label="Local credential status">
          <div className="cs-card-body">
            {readError && <p className="lc-muted">The status below is from the last successful read. Retry before making changes.</p>}
            {snapshot.stored === 'none' ? <EmptyState layout="band" title="No key saved" description="Enter a new key and choose how to keep it." />
              : snapshot.stored === 'needs-review' ? <UnavailableState layout="band" title="Saved credential needs review" description="Saving is blocked. Recheck the current state or remove this credential before entering a replacement." />
                : <StatePlate layout="band" kind="success" eyebrow="Saved locally" title="Key saved locally"
                  description={snapshot.stored === 'secure-persistent' ? 'Kept in secure persistent storage.' : 'Kept for this Linuxcast session only; removed when Linuxcast quits.'}
                  detail="Saved status does not establish provider authentication or current usability." />}
            {snapshot.busy && <p className="cs-note" role="status"><LineIcon name="stateLoading" /><span>Another credential operation is in progress. Wait, then recheck status.</span></p>}
          </div>
          <ul className="cs-rows" aria-label="Session and storage">
            {rows.map(row => <li key={row.id} className="cs-row">
              <span className="cs-row-name">{row.name}</span>
              <span className="cs-row-status" data-tone={row.tone}><LineIcon name={row.glyph} />{row.word}</span>
              <span className="cs-row-detail">{row.detail}</span>
              <p className="cs-row-text">{row.text}</p>
            </li>)}
          </ul>
          <div className="cs-card-foot">
            <p className="lc-muted">Session reports arrive asynchronously. They cannot prove that the desktop is physically unlocked at this instant. Each operation checks session eligibility again.</p>
            <div className="cs-actions">
              <Button busy={pending === 'recheck'} disabled={busy} onClick={() => {
                const current = connection.current;
                if (current?.active && !current.mutating && !current.state?.busy) run(current, 'recheck', () => current.api.recheck());
              }}><LineIcon name="retry" />Recheck status</Button>
              <Button variant="danger" busy={pending === 'remove'} disabled={disabled || snapshot.stored === 'none'} onClick={() => {
                clearInput();
                const current = connection.current;
                if (available(current) && current.state && current.state.stored !== 'none') {
                  run(current, 'remove', () => current.api.removeKey({ expectedRevision: current.state!.revision }));
                }
              }}>Remove key…</Button>
            </div>
          </div>
        </section>}
        <form className="cs-card cs-form" aria-label="Save OpenRouter key" aria-describedby={descriptionId} noValidate onSubmit={event => {
          event.preventDefault();
          if (composing.current) return;
          const value = field.current?.value ?? '';
          clearInput();
          const current = connection.current;
          if (current?.mutating) return;
          if (!available(current) || !current.state || current.state.session !== 'observed-unlocked'
            || current.state.stored === 'needs-review' || !value || !persistence
            || (persistence === 'persistent' ? current.state.storage !== 'available' : !current.state.sessionOnlyAvailable)) {
            setInputError('Enter a new key, choose an available storage mode, and check that the current session is eligible.');
            return;
          }
          const encoded = new TextEncoder().encode(value);
          if (value.length > 65536 || encoded.length > 65536 || new TextDecoder().decode(encoded) !== value) {
            setInputError('The new key must be valid text of at most 65,536 bytes. Enter a new key.');
            return;
          }
          run(current, 'save', () => current.api.saveKey({ expectedRevision: current.state!.revision, value, persistence }));
        }} onKeyDown={event => {
          if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
        }}>
          <div className="cs-card-head">
            <h2>{snapshot && snapshot.stored !== 'none' ? 'Replace the saved key' : 'Add a key'}</h2>
            <p className="lc-muted">Replacing or removing a saved credential requires confirmation in a native Linuxcast dialog.</p>
          </div>
          <div className="cs-card-body">
            <TextField ref={field} label="New API key" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false}
              readOnly={disabled || !eligibleSession || snapshot?.stored === 'needs-review'} maxLength={65536}
              hint="Only a newly entered key can be saved. Stored keys cannot be displayed or copied."
              {...(inputError ? { error: inputError } : {})} onChange={event => { setHasInput(event.currentTarget.value.length > 0); setInputError(''); }}
              onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} />
            <fieldset className="cs-choices" disabled={disabled} aria-describedby={`${modeId}-hint`}>
              <legend className="lc-field-label">Keep this key</legend>
              <p id={`${modeId}-hint`} className="lc-field-hint">Choose explicitly. An unavailable mode is never replaced automatically.</p>
              <label className="cs-choice" data-checked={persistence === 'persistent' || undefined}>
                <input type="radio" name={modeId} value="persistent" className="lc-focus" checked={persistence === 'persistent'}
                  disabled={snapshot?.storage !== 'available'} aria-labelledby={`${modeId}-persistent-label`} aria-describedby={`${modeId}-persistent`} onChange={() => { choose('persistent'); }} />
                <span className="cs-choice-text">
                  <span id={`${modeId}-persistent-label`} className="cs-choice-label">Persistent — secure system keyring</span>
                  <span id={`${modeId}-persistent`} className="cs-choice-hint">{persistentHint ?? 'Encrypted with the OS keyring and kept across restarts.'}</span>
                </span>
              </label>
              <label className="cs-choice" data-checked={persistence === 'session-only' || undefined}>
                <input type="radio" name={modeId} value="session-only" className="lc-focus" checked={persistence === 'session-only'}
                  disabled={!snapshot?.sessionOnlyAvailable} aria-labelledby={`${modeId}-session-only-label`} aria-describedby={`${modeId}-session-only`} onChange={() => { choose('session-only'); }} />
                <span className="cs-choice-text">
                  <span id={`${modeId}-session-only-label`} className="cs-choice-label">Session only — until Linuxcast quits</span>
                  <span id={`${modeId}-session-only`} className="cs-choice-hint">{sessionOnlyHint ?? 'Held in memory only; nothing is written to disk.'}</span>
                </span>
              </label>
            </fieldset>
          </div>
          <div className="cs-card-foot cs-actions cs-actions-end">
            <Button onClick={() => { clearInput(); setPersistence(''); setNotice(note('Editable input and storage choice cleared.')); field.current?.focus(); }}>Cancel entry</Button>
            <Button type="submit" variant="primary" busy={pending === 'save'} disabled={!canSave}>{snapshot && snapshot.stored !== 'none' ? 'Replace key…' : 'Save key'}</Button>
          </div>
        </form>
        {snapshot && <section className="cs-card cs-policy" aria-labelledby={`${policyId}-title`}>
          <div className="cs-card-head"><h2 id={`${policyId}-title`}>Session-only retention</h2></div>
          <div className="cs-card-body">
            <label className="cs-check" htmlFor={policyId}>
              <input id={policyId} type="checkbox" className="lc-focus" checked={snapshot.clearSessionOnLock} disabled={disabled || !eligibleSession}
                aria-describedby={`${policyId}-hint`} onChange={event => {
                  const clearSessionOnLock = event.currentTarget.checked;
                  const current = connection.current;
                  if (available(current) && current.state?.session === 'observed-unlocked') {
                    run(current, 'policy', () => current.api.setPolicy({ expectedRevision: current.state!.revision, clearSessionOnLock }));
                  }
                }} />Clear session-only keys on lock or session loss
            </label>
            <p id={`${policyId}-hint`} className="lc-muted">When off, session-only keys are retained until Quit, but use is denied while locked, inactive, or unavailable. Changes appear here only after the local service confirms the current policy.</p>
          </div>
        </section>}
      </main>
    </div>
  </ThemeProvider>;
}
