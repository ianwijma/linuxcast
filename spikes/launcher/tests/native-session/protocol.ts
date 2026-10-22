/** Private, task-owned observation format. Not an F0 or production contract. */
export const BACKENDS = ['gnome-wayland', 'gnome-x11', 'kwin-wayland', 'kwin-x11'] as const;
export type Backend = typeof BACKENDS[number];
export type Rect = { x: number; y: number; width: number; height: number };
export type NativeWindow = { count: number; identityMatches: boolean; nativeBackend: 'wayland' | 'x11' | 'unsupported'; focused: boolean; hidden: boolean; geometry: Rect | null; workArea: Rect | null };
export type Observation = { request: number; launcher: NativeWindow; decoy: NativeWindow; decoyActivationIssued: boolean };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('NATIVE_SCHEMA');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).length !== allowed.length || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('NATIVE_SCHEMA');
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
    || !['wayland', 'x11', 'unsupported'].includes(String(row.nativeBackend))) throw new Error('NATIVE_SCHEMA');
  if ((row.count !== 1 || !row.identityMatches) && (row.identityMatches || row.focused || row.geometry !== null || row.workArea !== null || row.hidden !== true || row.nativeBackend !== 'unsupported')) throw new Error('NATIVE_IDENTITY_SCHEMA');
  return { count: Number(row.count), identityMatches: row.identityMatches, nativeBackend: row.nativeBackend as NativeWindow['nativeBackend'],
    focused: row.focused, hidden: row.hidden, geometry: rect(row.geometry), workArea: rect(row.workArea) };
}
export function parseObservation(value: unknown, request: number): Observation {
  const row = object(value); keys(row, ['request', 'launcher', 'decoy', 'decoyActivationIssued']);
  if (row.request !== request || typeof row.decoyActivationIssued !== 'boolean') throw new Error('NATIVE_REQUEST');
  return { request, launcher: window(row.launcher), decoy: window(row.decoy), decoyActivationIssued: row.decoyActivationIssued };
}
export function requireNativeTarget(window: NativeWindow, backend: Backend) {
  if (window.count !== 1 || !window.identityMatches || !window.geometry || !window.workArea) throw new Error('OWN_NATIVE_IDENTITY_REQUIRED');
  if (window.nativeBackend !== (backend.endsWith('wayland') ? 'wayland' : 'x11')) throw new Error('NATIVE_BACKEND_MISMATCH');
}
export function contained(window: NativeWindow): boolean {
  const r = window.geometry, a = window.workArea;
  return !!r && !!a && r.x >= a.x && r.y >= a.y && r.x + r.width <= a.x + a.width + 1 && r.y + r.height <= a.y + a.height + 1;
}
