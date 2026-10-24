// Source-only control protocol. No display, process or filesystem operations.
import { Buffer } from 'node:buffer';
export const STEPS = ['primary-bound', 'auxiliary-created', 'two-native-targets', 'primary-selected', 'swapped-rejected', 'quit-confirmed'];
export const SCOPE = { kind: 'S0-01-private-owned-X11-auxiliary-control', backend: 'kwin-x11',
  probeMode: 'exact-owned-target-control', status: 'incomplete', physicalDesktopMatrixEstablished: false,
  countScope: 'exact-target', fullAcceptanceEstablished: false, selectedLifecycleEstablished: false,
  focusOrShortcutEstablished: false };
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CONTROL_SCHEMA');
  const actual=Object.keys(value).sort(),expected=[...keys].sort();
  if(actual.length!==expected.length || actual.some((key,index)=>key!==expected[index]))throw new Error('CONTROL_SCHEMA');
};
const same = (a, b) => a?.pid === b?.pid && a?.xid === b?.xid && a?.handle === b?.handle;
const identity = value => {
  const { pid, xid, handle } = value;
  if (!Number.isSafeInteger(pid) || pid<2 || pid>4194304 || !Number.isSafeInteger(xid) || xid<1 || xid>0x1fffffff ||
    typeof handle!=='string' || !/^[0-9a-f]{8}$/.test(handle) || Buffer.from(handle,'hex').readUInt32LE()!==xid) throw new Error('CONTROL_IDENTITY');
  return Object.freeze({pid,xid,handle});
};
export function pairProof(value) {
  exact(value, ['sameProcess', 'twoManagedTargets', 'distinctResources']);
  if (Object.values(value).some(item => item !== true)) throw new Error('CONTROL_PAIR_REQUIRED');
  return value;
}
export function negativeProof(value) {
  exact(value, ['rejected', 'helperCommands', 'newReplies', 'traceState', 'originalBindingPreserved']);
  if (value.rejected !== true || value.helperCommands !== 0 || value.newReplies !== 0 || value.traceState !== 'request-written' || value.originalBindingPreserved !== true) throw new Error('CONTROL_SWAP_REQUIRED');
  return value;
}
export function publicResult(value) {
  exact(value, [...Object.keys(SCOPE), 'diagnosticOutcome', 'completedSteps', 'failedStage']);
  for (const [key, expected] of Object.entries(SCOPE)) if (value[key] !== expected) throw new Error('CONTROL_SCOPE');
  if (!Array.isArray(value.completedSteps) || value.completedSteps.length > STEPS.length || value.completedSteps.some((item, index) => item !== STEPS[index])) throw new Error('CONTROL_STEPS');
  if (value.diagnosticOutcome === 'complete') {
    if (value.completedSteps.length !== STEPS.length || value.failedStage !== null) throw new Error('CONTROL_PROOF_REQUIRED');
  } else if (value.diagnosticOutcome !== 'failed' || value.failedStage !== (STEPS[value.completedSteps.length] ?? 'cleanup')) throw new Error('CONTROL_FAILED_STAGE');
  return globalThis.structuredClone(value);
}
export async function runControl(io) {
  const result = { ...SCOPE, diagnosticOutcome: 'failed', completedSteps: [], failedStage: STEPS[0] };
  try {
    const primary = identity(await io.capturePrimary());
    result.completedSteps.push(STEPS[0]); result.failedStage = STEPS[1];
    const auxiliary = identity(await io.createAuxiliary());
    if (!same(primary, await io.capturePrimary()) || auxiliary.pid !== primary.pid || auxiliary.xid === primary.xid || auxiliary.handle === primary.handle) throw new Error('CONTROL_BINDING');
    result.completedSteps.push(STEPS[1]); result.failedStage = STEPS[2];
    pairProof(await io.verifyPair(primary, auxiliary));
    result.completedSteps.push(STEPS[2]); result.failedStage = STEPS[3];
    await io.positive(primary);
    result.completedSteps.push(STEPS[3]); result.failedStage = STEPS[4];
    negativeProof(await io.negative(primary, auxiliary));
    result.completedSteps.push(STEPS[4]); result.failedStage = STEPS[5];
    if (await io.quit() !== 0) throw new Error('CONTROL_QUIT');
    result.completedSteps.push(STEPS[5]); result.failedStage = null; result.diagnosticOutcome = 'complete';
  } catch { /* Fixed phase only; no exception or private identity is retained. */ }
  finally {
    try { await io.cleanup(); }
    catch { result.diagnosticOutcome = 'failed'; result.failedStage = STEPS[result.completedSteps.length] ?? 'cleanup'; }
  }
  return publicResult(result);
}
