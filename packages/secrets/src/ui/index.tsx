import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Button, EmptyState, ErrorState, LoadingState, TextField, ThemeProvider,
  UnavailableState, useFocusRestore,
} from '@linuxcast/ui';
import {
  credentialSettingsActionReplySchema, credentialSettingsStateReplySchema,
} from '@linuxcast/platform-contracts';
import type {
  CredentialSettingsActionReply, CredentialSettingsApi, CredentialSettingsState,
} from '@linuxcast/platform-contracts';
import './credentials.css';

type Persistence = '' | 'persistent' | 'session-only';
type Operation = 'save' | 'remove' | 'policy' | 'recheck' | 'close';
interface Connection {
  api: CredentialSettingsApi;
  active: boolean;
  request: number;
  state: CredentialSettingsState | null;
  ready: boolean;
  mutating: boolean;
}
const localError = 'Credential settings could not be read. Retry to check the current local state.';
const sessionLabels: Record<CredentialSettingsState['session'], string> = {
  'observed-unlocked': 'Session last reported active and unlocked.',
  locked: 'Session reported locked. Unlock your desktop, then recheck.',
  inactive: 'Session reported inactive. Return to your active local desktop, then recheck.',
  unavailable: 'Session status is unavailable. Restore your local desktop session, then recheck.',
};
const storageLabels: Record<CredentialSettingsState['storage'], string> = {
  available: 'Secure keyring storage is available.',
  'insecure-backend': 'Persistent storage refused: the keyring is using insecure basic_text storage. Configure a secure system keyring, then recheck.',
  unavailable: 'Secure keyring storage is unavailable. Unlock or configure your system keyring, then recheck.',
  'encryption-failed': 'Keyring encryption failed. Check your system keyring, then recheck.',
  'storage-failed': 'Local credential storage failed. Check local storage availability, then recheck.',
};
function outcomeMessage(reply: CredentialSettingsActionReply, operation: Operation): string {
  if (!reply.ok) {
    switch (reply.error.code) {
      case 'permission-denied': return 'The operation was denied. Editable input was cleared. Recheck your session before trying again.';
      case 'conflict': return 'Settings changed before this operation. Refreshing status; no operation will be replayed.';
      case 'invalid-request': return 'The operation was refused. Check the current status and enter a new key if needed.';
      case 'unavailable': return 'The operation is unavailable. Recheck your session and storage before trying again.';
    }
  }
  switch (reply.value.outcome) {
    case 'saved': return 'The local key save was confirmed. Provider authentication has not been checked.';
    case 'removed': return 'Key removal was confirmed.';
    case 'policy-updated': return 'The session policy update was confirmed.';
    case 'cancelled': return 'The operation was cancelled. Editable input was cleared.';
    case 'stale': return 'Settings changed before this operation. Refreshing status; no operation will be replayed.';
    case 'unknown': return 'The operation outcome is unknown. Refreshing status only; no operation will be replayed. Review the current status before acting again.';
    case 'unavailable': return 'The operation is unavailable. Recheck your session and storage before trying again.';
    case 'refreshing': return operation === 'close' ? 'Close requested.' : 'Rechecking local credential status…';
  }
}

/** First-party fixed OpenRouter credential setup. The only key value is newly
 * typed input consumed once by saveKey. No stored-value/readback API is used.
 * Clearing the field releases editable input; JS strings are not zeroizable. */
export function CredentialSettings({ api }: { api?: CredentialSettingsApi }) {
  const [snapshot, setSnapshot] = useState<CredentialSettingsState | null>(null);
  const [reading, setReading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<Operation | null>(null);
  const [persistence, setPersistence] = useState<Persistence>('');
  const [hasInput, setHasInput] = useState(false);
  const [inputError, setInputError] = useState('');
  const [retry, setRetry] = useState(0);
  const connection = useRef<Connection | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const surface = useRef<HTMLElement>(null);
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
    setMessage('');
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
    setMessage('');
    let result: Promise<CredentialSettingsActionReply>;
    try { result = invoke(); } catch { result = Promise.reject(new Error('local-operation-unavailable')); }
    void (async () => {
      try {
        const parsed = credentialSettingsActionReplySchema.safeParse(await result);
        if (!current.active) return;
        if (!parsed.success) throw new Error('local-operation-unknown');
        const reply = parsed.data;
        setMessage(outcomeMessage(reply, operation));
        if (!reply.ok || reply.value.outcome === 'cancelled' || reply.value.outcome === 'unavailable') clearInput();
      } catch {
        if (!current.active) return;
        clearInput();
        setMessage('The operation outcome is unknown. Refreshing status only; no operation will be replayed. Review the current status before acting again.');
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
      setMessage('The local window connection is unavailable. Use your window manager to close this window.');
      return;
    }
    if (current.mutating || current.state?.busy) {
      setMessage('An operation is in progress. Wait for its outcome before closing.');
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

  return <ThemeProvider appearance={snapshot?.appearance ?? 'system'} className="credential-settings-theme">
    <main ref={surface} className="credential-settings" aria-labelledby={`${descriptionId}-title`} onKeyDown={event => {
      if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
      if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); close();
      }
    }}>
      <header className="credential-settings-heading">
        <div><h1 ref={heading} tabIndex={-1} className="lc-focus" id={`${descriptionId}-title`}>OpenRouter API key</h1>
          <p className="lc-muted">Set up the default OpenRouter credential for Linuxcast.</p></div>
        <Button disabled={busy} onClick={close}>Close</Button>
      </header>
      <p id={descriptionId} className="lc-muted">This screen saves a local credential. It does not contact OpenRouter or check authentication. Provider and model selection are configured separately.</p>
      {message && <p className="credential-settings-message" role="status">{message}</p>}
      {reading && <LoadingState label={snapshot ? 'Refreshing credential status…' : 'Loading credential settings…'} />}
      {readError && <ErrorState title="Credential settings unavailable" description={localError} announce action={
        <Button ref={retryButton} disabled={busy || reading} onClick={() => { setRetry(value => value + 1); }}>Retry</Button>
      } />}
      {snapshot && <>
        <section className="credential-settings-status" aria-label="Local credential status">
          {readError && <p className="lc-muted">The status below is from the last successful read. Retry before making changes.</p>}
          {snapshot.stored === 'none' ? <EmptyState title="No key saved" description="Enter a new key and choose how to keep it." />
            : snapshot.stored === 'needs-review' ? <UnavailableState title="Saved credential needs review" description="Saving is blocked. Recheck the current state or remove this credential before entering a replacement." />
              : <div><h2>Key saved locally</h2><p>{snapshot.stored === 'secure-persistent' ? 'Kept in secure persistent storage.' : 'Kept for this Linuxcast session only; removed when Linuxcast quits.'}</p><p className="lc-muted">Saved status does not establish provider authentication or current usability.</p></div>}
          <p>{sessionLabels[snapshot.session]}</p>
          <p className="lc-muted">Session reports arrive asynchronously. They cannot prove that the desktop is physically unlocked at this instant. Each operation checks session eligibility again.</p>
          <p>{storageLabels[snapshot.storage]}</p>
          <p>{snapshot.sessionOnlyAvailable ? 'Session-only storage is available if explicitly selected.' : 'Session-only storage is currently unavailable.'}</p>
          {snapshot.busy && <p role="status">Another credential operation is in progress. Wait, then recheck status.</p>}
          <div className="credential-settings-actions">
            <Button busy={pending === 'recheck'} disabled={busy} onClick={() => {
              const current = connection.current;
              if (current?.active && !current.mutating && !current.state?.busy) run(current, 'recheck', () => current.api.recheck());
            }}>Recheck status</Button>
            <Button variant="danger" busy={pending === 'remove'} disabled={disabled || snapshot.stored === 'none'} onClick={() => {
              clearInput();
              const current = connection.current;
              if (available(current) && current.state && current.state.stored !== 'none') {
                run(current, 'remove', () => current.api.removeKey({ expectedRevision: current.state!.revision }));
              }
            }}>Remove key…</Button>
          </div>
        </section>
      </>}
      <form className="credential-settings-form" aria-label="Save OpenRouter key" aria-describedby={descriptionId} noValidate onSubmit={event => {
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
        <TextField ref={field} label="New API key" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false}
          readOnly={disabled || !eligibleSession || snapshot?.stored === 'needs-review'} maxLength={65536}
          hint="Only a newly entered key can be saved. Stored keys cannot be displayed or copied."
          {...(inputError ? { error: inputError } : {})} onChange={event => { setHasInput(event.currentTarget.value.length > 0); setInputError(''); }}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} />
        <div className="lc-field"><label className="lc-field-label" htmlFor={modeId}>Keep this key</label>
          <select id={modeId} className="lc-input lc-focus" value={persistence} disabled={disabled} aria-describedby={`${modeId}-hint`} onChange={event => {
            const value = event.currentTarget.value;
            if (value === '' || value === 'persistent' || value === 'session-only') setPersistence(value);
          }}>
            <option value="">Choose a storage mode…</option>
            <option value="persistent" disabled={snapshot?.storage !== 'available'}>Persistent — secure system keyring</option>
            <option value="session-only" disabled={!snapshot?.sessionOnlyAvailable}>Session only — until Linuxcast quits</option>
          </select>
          <p id={`${modeId}-hint`} className="lc-field-hint">Choose explicitly. An unavailable mode is never replaced automatically.</p>
        </div>
        <div className="credential-settings-actions">
          <Button type="submit" variant="primary" busy={pending === 'save'} disabled={!canSave}>{snapshot && snapshot.stored !== 'none' ? 'Replace key…' : 'Save key'}</Button>
          <Button onClick={() => { clearInput(); setPersistence(''); setMessage('Editable input and storage choice cleared.'); field.current?.focus(); }}>Cancel entry</Button>
        </div>
        <p className="lc-muted">Replacing or removing a saved credential requires confirmation in a native Linuxcast dialog.</p>
      </form>
      {snapshot && <section className="credential-settings-policy" aria-labelledby={`${policyId}-title`}>
        <h2 id={`${policyId}-title`}>Session-only retention</h2>
        <label className="credential-settings-check" htmlFor={policyId}>
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
      </section>}
    </main>
  </ThemeProvider>;
}
