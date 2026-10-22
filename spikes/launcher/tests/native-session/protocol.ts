/** Private, task-owned observation format. Not an F0 or production contract. */
export const BACKENDS = ['gnome-wayland', 'gnome-x11', 'kwin-wayland', 'kwin-x11'] as const;
export type Backend = typeof BACKENDS[number];
export type Rect = { x: number; y: number; width: number; height: number };
export type NativeWindow = { count: number; identityMatches: boolean; nativeBackend: 'wayland' | 'x11' | 'unsupported'; focused: boolean; hidden: boolean; geometry: Rect | null; workArea: Rect | null };
export type WindowDiagnostic = {
  pidMatch: 'none' | 'single' | 'multiple';
  primaryIdentity: 'not-inspected' | 'non-string' | 'empty' | 'mismatch' | 'match';
  secondaryIdentity: WindowDiagnostic['primaryIdentity'];
  geometry: 'not-inspected' | 'not-ready' | 'ready';
  workArea: WindowDiagnostic['geometry'];
};
export type Observation = { request: number; launcher: NativeWindow; decoy: NativeWindow; decoyActivationIssued: boolean;
  diagnostics?: { launcher: WindowDiagnostic; decoy: WindowDiagnostic } };
export const NATIVE_PHASES = ['decoy-native-ready', 'decoy-focused-before-ordinary-show', 'initial-native-launch', 'after-close-native-hidden',
  'ordinary-singleton-cli-show', 'wayland-singleton-toggle-hidden', 'wayland-singleton-reopened', 'ordinary-show-native-focus',
  'actual-x11-shortcut-native-focus', 'after-ui-quit-native-window-absent', 'fresh-resident-native-hidden', 'after-hidden-cli-quit-native-window-absent', 'decoy-activation-request'] as const;
export type NativePhase = typeof NATIVE_PHASES[number];
const PROGRESS = ['request-written', 'reply-rejected', 'parsed', 'predicate-met', 'predicate-unmet'] as const;
export type NativeDiagnostic = { phase: NativePhase; state: typeof PROGRESS[number]; lastObservation?: { phase: NativePhase; native: Observation } };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('NATIVE_SCHEMA');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) throw new Error('NATIVE_SCHEMA');
}
function rect(value: unknown): Rect | null {
  if (value === null) return null;
  const row = object(value); keys(row, ['x', 'y', 'width', 'height']);
  for (const key of ['x', 'y', 'width', 'height']) if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || Math.abs(row[key]) > 65536) throw new Error('NATIVE_RECT');
  if (Number(row.width) <= 0 || Number(row.height) <= 0) throw new Error('NATIVE_RECT');
  return { x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height) };
}
function window(value: unknown): NativeWindow {
  const row = object(value); keys(row, ['count', 'identityMatches', 'nativeBackend', 'focused', 'hidden', 'geometry', 'workArea']);
  if (!Number.isSafeInteger(row.count) || Number(row.count) < 0 || Number(row.count) > 8
    || typeof row.identityMatches !== 'boolean' || typeof row.focused !== 'boolean' || typeof row.hidden !== 'boolean'
    || typeof row.nativeBackend !== 'string' || !['wayland', 'x11', 'unsupported'].includes(row.nativeBackend)) throw new Error('NATIVE_SCHEMA');
  if ((row.count !== 1 || !row.identityMatches) && (row.identityMatches || row.focused || row.geometry !== null || row.workArea !== null || row.hidden !== true || row.nativeBackend !== 'unsupported')) throw new Error('NATIVE_IDENTITY_SCHEMA');
  return { count: Number(row.count), identityMatches: row.identityMatches, nativeBackend: row.nativeBackend as NativeWindow['nativeBackend'],
    focused: row.focused, hidden: row.hidden, geometry: rect(row.geometry), workArea: rect(row.workArea) };
}
export function parseObservation(value: unknown, request: number): Observation {
  const row = object(value); keys(row, ['request', 'launcher', 'decoy', 'decoyActivationIssued'], ['diagnostics']);
  if (!Number.isSafeInteger(request) || request < 1 || request > 1000 || row.request !== request || typeof row.decoyActivationIssued !== 'boolean') throw new Error('NATIVE_REQUEST');
  const result: Observation = { request, launcher: window(row.launcher), decoy: window(row.decoy), decoyActivationIssued: row.decoyActivationIssued };
  if ('diagnostics' in row) {
    const diagnostics = object(row.diagnostics); keys(diagnostics, ['launcher', 'decoy']);
    result.diagnostics = { launcher: diagnostic(diagnostics.launcher, result.launcher), decoy: diagnostic(diagnostics.decoy, result.decoy) };
  }
  return result;
}
function diagnostic(value: unknown, native: NativeWindow): WindowDiagnostic {
  const row = object(value); keys(row, ['pidMatch', 'primaryIdentity', 'secondaryIdentity', 'geometry', 'workArea']);
  const identities = ['not-inspected', 'non-string', 'empty', 'mismatch', 'match'];
  const rectangles = ['not-inspected', 'not-ready', 'ready'];
  if (typeof row.pidMatch !== 'string' || !['none', 'single', 'multiple'].includes(row.pidMatch)
    || typeof row.primaryIdentity !== 'string' || !identities.includes(row.primaryIdentity)
    || typeof row.secondaryIdentity !== 'string' || !identities.includes(row.secondaryIdentity)
    || typeof row.geometry !== 'string' || !rectangles.includes(row.geometry) || typeof row.workArea !== 'string' || !rectangles.includes(row.workArea)) throw new Error('NATIVE_DIAGNOSTIC');
  if (row.pidMatch !== (native.count === 0 ? 'none' : native.count === 1 ? 'single' : 'multiple')) throw new Error('NATIVE_DIAGNOSTIC');
  if (native.count !== 1) {
    if (row.primaryIdentity !== 'not-inspected' || row.secondaryIdentity !== 'not-inspected' || row.geometry !== 'not-inspected' || row.workArea !== 'not-inspected') throw new Error('NATIVE_DIAGNOSTIC');
  } else {
    if (row.primaryIdentity === 'not-inspected' || row.secondaryIdentity === 'not-inspected'
      || native.identityMatches !== (row.primaryIdentity === 'match' || row.secondaryIdentity === 'match')) throw new Error('NATIVE_DIAGNOSTIC');
    if (!native.identityMatches) {
      if (row.geometry !== 'not-inspected' || row.workArea !== 'not-inspected') throw new Error('NATIVE_DIAGNOSTIC');
    } else if (row.geometry !== (native.geometry === null ? 'not-ready' : 'ready') || row.workArea !== (native.workArea === null ? 'not-ready' : 'ready')) throw new Error('NATIVE_DIAGNOSTIC');
  }
  return { pidMatch: row.pidMatch as WindowDiagnostic['pidMatch'], primaryIdentity: row.primaryIdentity as WindowDiagnostic['primaryIdentity'],
    secondaryIdentity: row.secondaryIdentity as WindowDiagnostic['secondaryIdentity'], geometry: row.geometry as WindowDiagnostic['geometry'], workArea: row.workArea as WindowDiagnostic['workArea'] };
}
export function parseNativeDiagnostic(value: unknown): NativeDiagnostic {
  const row = object(value); keys(row, ['phase', 'state'], ['lastObservation']);
  if (!NATIVE_PHASES.includes(row.phase as NativePhase) || !PROGRESS.includes(row.state as NativeDiagnostic['state'])) throw new Error('NATIVE_DIAGNOSTIC');
  const result: NativeDiagnostic = { phase: row.phase as NativePhase, state: row.state as NativeDiagnostic['state'] };
  if ('lastObservation' in row) {
    const last = object(row.lastObservation); keys(last, ['phase', 'native']);
    if (!NATIVE_PHASES.includes(last.phase as NativePhase)) throw new Error('NATIVE_DIAGNOSTIC');
    result.lastObservation = { phase: last.phase as NativePhase, native: parseObservation(last.native, Number(object(last.native).request)) };
  }
  return result;
}
/** Stores only reconstructed allowlisted data, never rejected input/error text. */
export class NativeTrace {
  private current: NativeDiagnostic | undefined;
  begin(phase: NativePhase) { this.current = { phase, state: 'request-written', ...(this.current?.lastObservation ? { lastObservation: this.current.lastObservation } : {}) }; }
  reject() { if (this.current) this.current.state = 'reply-rejected'; }
  reply(value: unknown, request: number): Observation | undefined {
    if (!this.current) throw new Error('NATIVE_REQUEST_REQUIRED');
    try {
      const native = parseObservation(value, request);
      this.current.lastObservation = { phase: this.current.phase, native };
      this.current.state = 'parsed'; return native;
    } catch { this.reject(); return undefined; }
  }
  predicate(met: boolean) { if (this.current) this.current.state = met ? 'predicate-met' : 'predicate-unmet'; }
  snapshot(): NativeDiagnostic | undefined { return this.current ? parseNativeDiagnostic(this.current) : undefined; }
}
export function requireNativeTarget(window: NativeWindow, backend: Backend) {
  if (window.count !== 1 || !window.identityMatches || !window.geometry || !window.workArea) throw new Error('OWN_NATIVE_IDENTITY_REQUIRED');
  if (window.nativeBackend !== (backend.endsWith('wayland') ? 'wayland' : 'x11')) throw new Error('NATIVE_BACKEND_MISMATCH');
}
export function contained(window: NativeWindow): boolean {
  const r = window.geometry, a = window.workArea;
  return !!r && !!a && r.x >= a.x && r.y >= a.y && r.x + r.width <= a.x + a.width + 1 && r.y + r.height <= a.y + a.height + 1;
}
