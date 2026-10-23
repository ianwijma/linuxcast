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
  'actual-x11-shortcut-native-focus', 'fresh-lifecycle-native-launch', 'after-ui-quit-native-window-absent', 'fresh-resident-native-hidden', 'after-hidden-cli-quit-native-window-absent', 'decoy-activation-request'] as const;
export type NativePhase = typeof NATIVE_PHASES[number];
export const HOOK_FAILURE_STAGES = ['enumerate', 'launcher', 'decoy', 'activation', 'publish'] as const;
export type HookFailureReply = { request: number; hookFailure: { stage: typeof HOOK_FAILURE_STAGES[number]; outcome: 'native-read-failed' } };
const PROGRESS = ['request-written', 'reply-rejected', 'parsed', 'predicate-met', 'predicate-unmet', 'hook-failed'] as const;
export type NativeDiagnostic = { phase: NativePhase; state: typeof PROGRESS[number]; lastObservation?: { phase: NativePhase; native: Observation }; hookFailure?: HookFailureReply };
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
export function parseHookFailureReply(value: unknown, request: number): HookFailureReply {
  const row = object(value); keys(row, ['request', 'hookFailure']);
  if (!Number.isSafeInteger(request) || request < 1 || request > 1000 || row.request !== request) throw new Error('NATIVE_REQUEST');
  const failure = object(row.hookFailure); keys(failure, ['stage', 'outcome']);
  if (typeof failure.stage !== 'string' || !HOOK_FAILURE_STAGES.includes(failure.stage as HookFailureReply['hookFailure']['stage'])
    || failure.outcome !== 'native-read-failed') throw new Error('NATIVE_HOOK_FAILURE');
  return { request, hookFailure: { stage: failure.stage as HookFailureReply['hookFailure']['stage'], outcome: 'native-read-failed' } };
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
  const row = object(value); keys(row, ['phase', 'state'], ['lastObservation', 'hookFailure']);
  if (!NATIVE_PHASES.includes(row.phase as NativePhase) || !PROGRESS.includes(row.state as NativeDiagnostic['state'])) throw new Error('NATIVE_DIAGNOSTIC');
  const result: NativeDiagnostic = { phase: row.phase as NativePhase, state: row.state as NativeDiagnostic['state'] };
  if ('lastObservation' in row) {
    const last = object(row.lastObservation); keys(last, ['phase', 'native']);
    if (!NATIVE_PHASES.includes(last.phase as NativePhase)) throw new Error('NATIVE_DIAGNOSTIC');
    result.lastObservation = { phase: last.phase as NativePhase, native: parseObservation(last.native, Number(object(last.native).request)) };
  }
  if ((row.state === 'hook-failed') !== Object.hasOwn(row, 'hookFailure')) throw new Error('NATIVE_HOOK_FAILURE');
  if ('hookFailure' in row) {
    result.hookFailure = parseHookFailureReply(row.hookFailure, Number(object(row.hookFailure).request));
    if (result.lastObservation && result.hookFailure.request <= result.lastObservation.native.request) throw new Error('NATIVE_REQUEST');
  }
  return result;
}
/** Stores only reconstructed allowlisted data, never rejected input/error text. */
export class NativeTrace {
  private current: NativeDiagnostic | undefined;
  begin(phase: NativePhase) { this.current = { phase, state: 'request-written', ...(this.current?.lastObservation ? { lastObservation: this.current.lastObservation } : {}) }; }
  reject() { if (this.current) { this.current.state = 'reply-rejected'; delete this.current.hookFailure; } }
  reply(value: unknown, request: number): Observation | undefined {
    if (!this.current) throw new Error('NATIVE_REQUEST_REQUIRED');
    try {
      if (Object.hasOwn(object(value), 'hookFailure')) {
        const failure = parseHookFailureReply(value, request);
        if (this.current.lastObservation && failure.request <= this.current.lastObservation.native.request) throw new Error('NATIVE_REQUEST');
        this.current.hookFailure = failure;
        this.current.state = 'hook-failed'; return undefined;
      }
      const native = parseObservation(value, request);
      delete this.current.hookFailure;
      this.current.lastObservation = { phase: this.current.phase, native };
      this.current.state = 'parsed'; return native;
    } catch { this.reject(); return undefined; }
  }
  predicate(met: boolean) { if (this.current && this.current.state !== 'hook-failed') this.current.state = met ? 'predicate-met' : 'predicate-unmet'; }
  snapshot(): NativeDiagnostic | undefined { return this.current ? parseNativeDiagnostic(this.current) : undefined; }
}

export const CONSUMER_OUTCOMES = ['missing', 'other-serial', 'matching', 'parse-rejected', 'poll-error'] as const;
export type ConsumerOutcome = typeof CONSUMER_OUTCOMES[number];
export type ConsumerRead = { request: number; pollCount: number; outcomes: Record<ConsumerOutcome, number>;
  pollsCapped: boolean; elapsedMs: number; elapsedCapped: boolean };
export function parseConsumerRead(value: unknown): ConsumerRead {
  const row = object(value); keys(row, ['request', 'pollCount', 'outcomes', 'pollsCapped', 'elapsedMs', 'elapsedCapped']);
  if (!Number.isSafeInteger(row.request) || Number(row.request) < 1 || Number(row.request) > 1000
    || !Number.isSafeInteger(row.pollCount) || Number(row.pollCount) < 0 || Number(row.pollCount) > 255
    || typeof row.pollsCapped !== 'boolean' || typeof row.elapsedCapped !== 'boolean'
    || !Number.isSafeInteger(row.elapsedMs) || Number(row.elapsedMs) < 0 || Number(row.elapsedMs) > 180_000) throw new Error('CONSUMER_SCHEMA');
  const counts = object(row.outcomes); keys(counts, [...CONSUMER_OUTCOMES]);
  const outcomes = {} as ConsumerRead['outcomes'];
  for (const name of CONSUMER_OUTCOMES) {
    if (!Number.isSafeInteger(counts[name]) || Number(counts[name]) < 0 || Number(counts[name]) > 255) throw new Error('CONSUMER_COUNT');
    outcomes[name] = Number(counts[name]);
  }
  if (Object.values(outcomes).reduce((sum, count) => sum + count, 0) !== row.pollCount
    || row.pollsCapped && row.pollCount !== 255 || row.elapsedCapped && row.elapsedMs !== 180_000) throw new Error('CONSUMER_RELATION');
  return { request: Number(row.request), pollCount: Number(row.pollCount), outcomes, pollsCapped: row.pollsCapped,
    elapsedMs: Number(row.elapsedMs), elapsedCapped: row.elapsedCapped };
}
/** Only the last own request survives; clocks stay private and are never correlated. */
export class ConsumerTrace {
  private current: ConsumerRead | undefined;
  private started = 0n;
  private readonly now: () => bigint;
  constructor(now: () => bigint) { this.now = now; }
  begin(request: number) {
    this.current = parseConsumerRead({ request, pollCount: 0, outcomes: Object.fromEntries(CONSUMER_OUTCOMES.map(name => [name, 0])),
      pollsCapped: false, elapsedMs: 0, elapsedCapped: false });
    this.started = this.now();
    if (typeof this.started !== 'bigint') throw new Error('CONSUMER_CLOCK');
  }
  record(outcome: ConsumerOutcome) {
    if (!this.current || !CONSUMER_OUTCOMES.includes(outcome)) throw new Error('CONSUMER_REQUEST');
    // Saturate all counts together: the sum always equals recorded callbacks.
    if (this.current.pollCount === 255) { this.current.pollsCapped = true; return; }
    this.current.pollCount++; this.current.outcomes[outcome]++;
  }
  finish() {
    if (!this.current) throw new Error('CONSUMER_REQUEST');
    const finished = this.now();
    if (typeof finished !== 'bigint' || finished < this.started) throw new Error('CONSUMER_CLOCK');
    const delta = finished - this.started, limit = 180_000_000_000n;
    this.current.elapsedCapped = delta > limit;
    this.current.elapsedMs = Number((delta > limit ? limit : delta) / 1_000_000n);
  }
  snapshot(): ConsumerRead | undefined { return this.current ? parseConsumerRead(this.current) : undefined; }
}
export function requireNativeTarget(window: NativeWindow, backend: Backend) {
  if (window.count !== 1 || !window.identityMatches || !window.geometry || !window.workArea) throw new Error('OWN_NATIVE_IDENTITY_REQUIRED');
  if (window.nativeBackend !== (backend.endsWith('wayland') ? 'wayland' : 'x11')) throw new Error('NATIVE_BACKEND_MISMATCH');
}
/** AC02's private exact-owned lifecycle route makes no placement claim. */
export function requireOwnedLifecycleTarget(window: NativeWindow) {
  if (window.count !== 1 || !window.identityMatches || window.hidden) throw new Error('OWN_NATIVE_IDENTITY_REQUIRED');
  if (window.nativeBackend !== 'x11') throw new Error('NATIVE_BACKEND_MISMATCH');
}
export type GeometryCapabilities = { frame: 'available' | 'unavailable'; workArea: 'available' | 'unavailable' };
export function ownedGeometryCapabilities(windows: NativeWindow[]): GeometryCapabilities | undefined {
  const own = windows.filter(window => window.count === 1 && window.identityMatches && window.nativeBackend === 'x11');
  if (!own.length) return undefined;
  return { frame: own.some(window => window.geometry === null) ? 'unavailable' : 'available',
    workArea: own.some(window => window.workArea === null) ? 'unavailable' : 'available' };
}
export function contained(window: NativeWindow): boolean {
  const r = window.geometry, a = window.workArea;
  return !!r && !!a && r.x >= a.x && r.y >= a.y && r.x + r.width <= a.x + a.width + 1 && r.y + r.height <= a.y + a.height + 1;
}

export const OBSERVER_CHECKPOINTS = ['MODULE_ENTERED', 'ENABLE_ENTERED', 'PRIVATE_CONTEXT_REJECTED', 'PRIVATE_CONTEXT_ACCEPTED', 'POLL_INSTALLED', 'FIRST_POLL_TICK', 'DISABLED',
  'CONTEXT_NOT_OBSERVED', 'READ_FAILED', 'SIZE_REJECTED', 'DECODE_FAILED', 'JSON_REJECTED', 'SCHEMA_REJECTED', 'STALE_REQUEST', 'PREVALIDATION_FAILED'] as const;
export const OBSERVER_EVENTS = ['REQUEST_VALIDATED', 'REPLY_PUBLISHED', 'HOOK_FAILURE_PUBLISHED'] as const;
export type ObserverSnapshot = { checkpoints: typeof OBSERVER_CHECKPOINTS[number][];
  requests: { event: typeof OBSERVER_EVENTS[number]; request: number }[];
  extensionInfo: { status: 'INFO_UNAVAILABLE' | 'NOT_FOUND' } | { status: 'INFO_AVAILABLE'; state: number; enabled: boolean } };
export type ObserverLifecycleSample = {
  compositor: { state: 'running'; exitCode: null } | { state: 'exited'; exitCode: number };
  drain: { eofObserved: boolean; readerAlive: boolean; stopRequested: boolean };
};
export type ObserverLifecycle = { beforeChecker?: ObserverLifecycleSample; afterChecker?: ObserverLifecycleSample; finally: ObserverLifecycleSample };
export type ObserverStartup = { latest: ObserverSnapshot; beforeChecker?: ObserverSnapshot; lifecycle?: ObserverLifecycle };
function observerLifecycleSample(value: unknown): ObserverLifecycleSample {
  const row = object(value); keys(row, ['compositor', 'drain']);
  const process = object(row.compositor); keys(process, ['state', 'exitCode']);
  let compositor: ObserverLifecycleSample['compositor'];
  if (process.state === 'running' && process.exitCode === null) compositor = { state: 'running', exitCode: null };
  else if (process.state === 'exited' && Number.isSafeInteger(process.exitCode) && Number(process.exitCode) >= -64 && Number(process.exitCode) <= 255) {
    compositor = { state: 'exited', exitCode: Number(process.exitCode) };
  } else throw new Error('OBSERVER_PROCESS_SCHEMA');
  const drain = object(row.drain); keys(drain, ['eofObserved', 'readerAlive', 'stopRequested']);
  if (typeof drain.eofObserved !== 'boolean' || typeof drain.readerAlive !== 'boolean' || typeof drain.stopRequested !== 'boolean') throw new Error('OBSERVER_DRAIN_SCHEMA');
  return { compositor, drain: { eofObserved: drain.eofObserved, readerAlive: drain.readerAlive, stopRequested: drain.stopRequested } };
}
function observerSnapshot(value: unknown): ObserverSnapshot {
  const row = object(value); keys(row, ['checkpoints', 'requests', 'extensionInfo']);
  if (!Array.isArray(row.checkpoints) || row.checkpoints.length > OBSERVER_CHECKPOINTS.length
    || row.checkpoints.some(v => typeof v !== 'string' || !OBSERVER_CHECKPOINTS.includes(v as typeof OBSERVER_CHECKPOINTS[number]))
    || new Set(row.checkpoints).size !== row.checkpoints.length || !Array.isArray(row.requests) || row.requests.length > 16) throw new Error('OBSERVER_STARTUP_SCHEMA');
  const requests = row.requests.map(value => {
    const event = object(value); keys(event, ['event', 'request']);
    if (typeof event.event !== 'string' || !OBSERVER_EVENTS.includes(event.event as typeof OBSERVER_EVENTS[number])
      || !Number.isSafeInteger(event.request) || Number(event.request) < 1 || Number(event.request) > 1000) throw new Error('OBSERVER_REQUEST_SCHEMA');
    return { event: event.event as typeof OBSERVER_EVENTS[number], request: Number(event.request) };
  });
  const extension = object(row.extensionInfo);
  let extensionInfo: ObserverSnapshot['extensionInfo'];
  if (extension.status === 'INFO_UNAVAILABLE' || extension.status === 'NOT_FOUND') {
    keys(extension, ['status']); extensionInfo = { status: extension.status };
  } else {
    keys(extension, ['status', 'state', 'enabled']);
    if (extension.status !== 'INFO_AVAILABLE' || !Number.isSafeInteger(extension.state) || ![1, 2, 3, 4, 5, 6, 7, 8, 99].includes(Number(extension.state))
      || typeof extension.enabled !== 'boolean') throw new Error('OBSERVER_INFO_SCHEMA');
    extensionInfo = { status: 'INFO_AVAILABLE', state: Number(extension.state), enabled: extension.enabled };
  }
  return { checkpoints: [...row.checkpoints] as ObserverSnapshot['checkpoints'], requests, extensionInfo };
}
export function parseObserverStartup(value: unknown): ObserverStartup {
  const row = object(value); keys(row, ['latest'], ['beforeChecker', 'lifecycle']);
  const result: ObserverStartup = { latest: observerSnapshot(row.latest) };
  if ('beforeChecker' in row) result.beforeChecker = observerSnapshot(row.beforeChecker);
  if ('lifecycle' in row) {
    const states = object(row.lifecycle); keys(states, ['finally'], ['beforeChecker', 'afterChecker']);
    result.lifecycle = { finally: observerLifecycleSample(states.finally) };
    if ('beforeChecker' in states) result.lifecycle.beforeChecker = observerLifecycleSample(states.beforeChecker);
    if ('afterChecker' in states) result.lifecycle.afterChecker = observerLifecycleSample(states.afterChecker);
  }
  return result;
}

/** Diagnostic selection is independent of native focus acceptance. */
export type ProbeMode = 'full' | 'lifecycle-only';
export const LIFECYCLE_SKIPPED = ['ordinary-show-native-focus', 'actual-x11-global-shortcut'] as const;
export function parseProbeMode(value: unknown, backend: Backend): ProbeMode {
  if (value === undefined || value === 'full') return 'full';
  if (value === 'lifecycle-only' && backend.endsWith('x11')) return value;
  throw new Error('PROBE_MODE_REQUIRED');
}
export type LifecycleDiagnostic = { probeMode: 'lifecycle-only'; skippedChecks: typeof LIFECYCLE_SKIPPED[number][];
  diagnosticOutcome: 'complete' | 'failed'; lifecycleProof?: { launches: 2; darkSearchCaptured: true; lightCapabilitiesCaptured: true;
    uiQuitExitCode: 0; hiddenCliQuitExitCode: 0; closeProcessAlive: true } };
export function parseLifecycleDiagnostic(value: unknown, backend: Backend): LifecycleDiagnostic {
  const row = object(value); keys(row, ['probeMode', 'skippedChecks', 'diagnosticOutcome'], ['lifecycleProof']);
  if (parseProbeMode(row.probeMode, backend) !== 'lifecycle-only' || !Array.isArray(row.skippedChecks)
    || row.skippedChecks.length !== LIFECYCLE_SKIPPED.length || row.skippedChecks.some((v, i) => v !== LIFECYCLE_SKIPPED[i])
    || typeof row.diagnosticOutcome !== 'string' || !['complete', 'failed'].includes(row.diagnosticOutcome)) throw new Error('LIFECYCLE_SCHEMA');
  const result: LifecycleDiagnostic = { probeMode: 'lifecycle-only', skippedChecks: [...LIFECYCLE_SKIPPED], diagnosticOutcome: row.diagnosticOutcome as 'complete' | 'failed' };
  if ('lifecycleProof' in row) {
    const proof = object(row.lifecycleProof); keys(proof, ['launches', 'darkSearchCaptured', 'lightCapabilitiesCaptured', 'uiQuitExitCode', 'hiddenCliQuitExitCode', 'closeProcessAlive']);
    if (proof.launches !== 2 || proof.darkSearchCaptured !== true || proof.lightCapabilitiesCaptured !== true
      || proof.uiQuitExitCode !== 0 || proof.hiddenCliQuitExitCode !== 0 || proof.closeProcessAlive !== true) throw new Error('LIFECYCLE_PROOF');
    result.lifecycleProof = { launches: 2, darkSearchCaptured: true, lightCapabilitiesCaptured: true, uiQuitExitCode: 0, hiddenCliQuitExitCode: 0, closeProcessAlive: true };
  }
  if (result.diagnosticOutcome === 'complete' && !result.lifecycleProof) throw new Error('LIFECYCLE_PROOF_REQUIRED');
  return result;
}

export const OWNED_X11_FAILURES = ['binding', 'abi', 'identity', 'lifetime', 'native-query', 'overflow', 'guard', 'protocol', 'deadline'] as const;
export type OwnedX11Failure = typeof OWNED_X11_FAILURES[number];
export const OWNED_X11_KIND = { kind: 'private-x11-ewmh-exact-owned-target', targetScope: 'page-associated-browser-window',
  countScope: 'exact-target', geometryKind: 'ewmh-frame', decoy: 'not-created' } as const;
export function parseOwnedX11Provenance(value: unknown) {
  const row = object(value); keys(row, [...Object.keys(OWNED_X11_KIND), 'bindingObserved'], ['geometryCapabilities']);
  for (const [key, expected] of Object.entries(OWNED_X11_KIND)) if (row[key] !== expected) throw new Error('OWNED_X11_SCHEMA');
  if (typeof row.bindingObserved !== 'boolean') throw new Error('OWNED_X11_SCHEMA');
  let geometryCapabilities: GeometryCapabilities | undefined;
  if ('geometryCapabilities' in row) {
    const capabilities = object(row.geometryCapabilities); keys(capabilities, ['frame', 'workArea']);
    if (!row.bindingObserved || typeof capabilities.frame !== 'string' || !['available', 'unavailable'].includes(capabilities.frame)
      || typeof capabilities.workArea !== 'string' || !['available', 'unavailable'].includes(capabilities.workArea)) throw new Error('OWNED_X11_SCHEMA');
    geometryCapabilities = { frame: capabilities.frame as GeometryCapabilities['frame'], workArea: capabilities.workArea as GeometryCapabilities['workArea'] };
  }
  return { ...OWNED_X11_KIND, bindingObserved: row.bindingObserved, ...(geometryCapabilities ? { geometryCapabilities } : {}) };
}
export function parseOwnedX11Handle(value: unknown, platform: unknown, architecture: unknown, endian: unknown): number {
  if (platform !== 'linux' || architecture !== 'x64' || endian !== 'LE' || typeof value !== 'string' || !/^[0-9a-f]{8}$/.test(value)) throw new Error('OWNED_X11_ABI');
  const raw = Buffer.from(value, 'hex').readUInt32LE();
  if (raw < 1 || raw > 0x1fffffff) throw new Error('OWNED_X11_ABI');
  return raw;
}
