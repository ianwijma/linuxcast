import type { LineIconName, StatePlateKind } from '@linuxcast/ui';
import type { CredentialSettingsActionReply, CredentialSettingsState } from '@linuxcast/platform-contracts';

/**
 * Pure presentation mapping for the Credentials window (Instrument settings composition).
 * Fixed copy only: nothing here receives, stores or echoes a key value, raw error or
 * bridge content. The mapping never decides authority; main-owned replies and the latest
 * confirmed snapshot do.
 */
export type Operation = 'save' | 'remove' | 'policy' | 'recheck' | 'close';

/** Either a shape-coded state plate band or a quiet status note (requests and local hints). */
export type Notice =
  | { readonly kind: StatePlateKind; readonly eyebrow?: string; readonly title: string; readonly text: string }
  | { readonly kind: 'note'; readonly text: string };

export const UNKNOWN_TEXT = 'The operation outcome is unknown. Refreshing status only; no operation will be replayed. Review the current status before acting again.';
const STALE_TEXT = 'Settings changed before this operation. Refreshing status; no operation will be replayed.';
const UNAVAILABLE_TEXT = 'The operation is unavailable. Recheck your session and storage before trying again.';

export const unknownNotice: Notice = { kind: 'unavailable', title: 'Outcome unknown', text: UNKNOWN_TEXT };
export const note = (text: string): Notice => ({ kind: 'note', text });

export function outcomeNotice(reply: CredentialSettingsActionReply, operation: Operation): Notice {
  if (!reply.ok) {
    switch (reply.error.code) {
      case 'permission-denied': return { kind: 'denied', title: 'Operation denied', text: 'The operation was denied. Editable input was cleared. Recheck your session before trying again.' };
      case 'conflict': return { kind: 'interrupted', eyebrow: 'Not applied', title: 'Settings changed', text: STALE_TEXT };
      case 'invalid-request': return { kind: 'error', title: 'Operation refused', text: 'The operation was refused. Check the current status and enter a new key if needed.' };
      case 'unavailable': return { kind: 'unavailable', title: 'Operation unavailable', text: UNAVAILABLE_TEXT };
    }
  }
  switch (reply.value.outcome) {
    // Saved means local storage only. No provider-authentication or usability claim.
    case 'saved': return { kind: 'success', title: 'Local save confirmed', text: 'The local key save was confirmed. Provider authentication has not been checked.' };
    case 'removed': return { kind: 'success', title: 'Removal confirmed', text: 'Key removal was confirmed.' };
    case 'policy-updated': return { kind: 'success', title: 'Policy update confirmed', text: 'The session policy update was confirmed.' };
    case 'cancelled': return { kind: 'interrupted', eyebrow: 'Cancelled', title: 'Nothing was changed', text: 'The operation was cancelled. Editable input was cleared.' };
    case 'stale': return { kind: 'interrupted', eyebrow: 'Not applied', title: 'Settings changed', text: STALE_TEXT };
    case 'unknown': return unknownNotice;
    case 'unavailable': return { kind: 'unavailable', title: 'Operation unavailable', text: UNAVAILABLE_TEXT };
    // A request acknowledgement, not an effect: shown as a quiet note, never as success.
    case 'refreshing': return note(operation === 'close' ? 'Close requested.' : 'Rechecking local credential status…');
  }
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'muted';
export interface StatusRow {
  readonly id: 'session' | 'keyring' | 'session-only';
  readonly name: string;
  /** Short status word shown with a shape glyph; colour is never the only signal. */
  readonly word: string;
  readonly glyph: LineIconName;
  readonly tone: StatusTone;
  /** Full explanation and remediation sentence. */
  readonly text: string;
  /** Monospace backend detail. Fixed vocabulary; never secrets, paths or content. */
  readonly detail: string;
}

const sessionRows: Record<CredentialSettingsState['session'], Omit<StatusRow, 'id' | 'name' | 'detail'>> = {
  'observed-unlocked': { word: 'Unlocked', glyph: 'stateSuccess', tone: 'success', text: 'Session last reported active and unlocked.' },
  locked: { word: 'Locked', glyph: 'stateDenied', tone: 'warning', text: 'Session reported locked. Unlock your desktop, then recheck.' },
  inactive: { word: 'Inactive', glyph: 'stateInterrupted', tone: 'warning', text: 'Session reported inactive. Return to your active local desktop, then recheck.' },
  unavailable: { word: 'Unavailable', glyph: 'info', tone: 'warning', text: 'Session status is unavailable. Restore your local desktop session, then recheck.' },
};
const storageRows: Record<CredentialSettingsState['storage'], Omit<StatusRow, 'id' | 'name'>> = {
  available: { word: 'Available', glyph: 'stateSuccess', tone: 'success', detail: 'OS keyring', text: 'Secure keyring storage is available.' },
  'insecure-backend': { word: 'Refused', glyph: 'stateDenied', tone: 'warning', detail: 'basic_text', text: 'Persistent storage refused: the keyring is using insecure basic_text storage. Configure a secure system keyring, then recheck.' },
  unavailable: { word: 'Unavailable', glyph: 'info', tone: 'warning', detail: 'OS keyring', text: 'Secure keyring storage is unavailable. Unlock or configure your system keyring, then recheck.' },
  'encryption-failed': { word: 'Failed', glyph: 'stateError', tone: 'danger', detail: 'encryption', text: 'Keyring encryption failed. Check your system keyring, then recheck.' },
  'storage-failed': { word: 'Failed', glyph: 'stateError', tone: 'danger', detail: 'local storage', text: 'Local credential storage failed. Check local storage availability, then recheck.' },
};

/** Capability-style rows (name | glyph + word | backend) for the latest confirmed snapshot. */
export function statusRows(state: CredentialSettingsState): readonly StatusRow[] {
  return [
    { id: 'session', name: 'Desktop session', detail: 'session observer · last report', ...sessionRows[state.session] },
    { id: 'keyring', name: 'Persistent storage', ...storageRows[state.storage] },
    state.sessionOnlyAvailable
      ? { id: 'session-only', name: 'Session-only storage', word: 'Available', glyph: 'stateSuccess', tone: 'success', detail: 'memory · until Quit', text: 'Session-only storage is available if explicitly selected.' }
      : { id: 'session-only', name: 'Session-only storage', word: 'Unavailable', glyph: 'info', tone: 'warning', detail: 'memory · until Quit', text: 'Session-only storage is currently unavailable.' },
  ];
}

/** Why a storage choice cannot be selected right now (shown next to the disabled radio). */
export function persistentReason(state: CredentialSettingsState | null): string | undefined {
  if (!state) return 'Waiting for the current storage status.';
  return state.storage === 'available' ? undefined : 'Unavailable now. See Persistent storage above.';
}
export function sessionOnlyReason(state: CredentialSettingsState | null): string | undefined {
  if (!state) return 'Waiting for the current storage status.';
  return state.sessionOnlyAvailable ? undefined : 'Unavailable now. See Session-only storage above.';
}
