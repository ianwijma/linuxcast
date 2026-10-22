import { spawnSync } from 'node:child_process';
import { lstatSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const scenarios = [
  'worker-sigkill', 'supervisor-sigkill', 'worker-watchdog', 'app-lease', 'emergency',
  'locked', 'unknown-lock', 'inactive', 'tty', 'remote', 'stale-context', 'stale-generation',
  'peer-credentials-and-context-revoke', 'prearm-completed-input-backlog',
];
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
function timing(value: unknown, fields: string[]): Record<string, number> | null {
  const input = object(value); const result: Record<string, number> = {};
  for (const field of fields) { const parsed = number(input[field]); if (parsed === null) return null; result[field] = parsed; }
  return result;
}
function sanitizedReport(value: unknown) {
  const input = object(value);
  const results: Array<Record<string, unknown>> = [];
  for (const raw of Array.isArray(input.results) ? input.results.slice(0, 14) : []) {
    const row = object(raw); const saved: Record<string, unknown> = {
      scenario: typeof row.scenario === 'string' && scenarios.includes(row.scenario) ? row.scenario : 'UNKNOWN_SCENARIO',
    };
    for (const field of ['syntheticModifiersObserved', 'otherClientRegrabbed', 'virtualDeviceRemoved', 'noAutomaticRearm',
      'armDenied', 'otherClientCanGrab', 'wrongUidDenied', 'rootPeerPassedDAC', 'rootPeerUidDeniedBeforeAuthorizedClient',
      'contextRevocationDisarms', 'preArmCompletedInputNotForwarded', 'freshPostArmInputObserved', 'withinLimit', 'grabReleased']) {
      if (typeof row[field] === 'boolean') saved[field] = row[field];
    }
    for (const field of ['recoveryMs', 'observedMs', 'mechanismDeadlineMs', 'observerToleranceMs', 'kernelTeardownBudgetMs']) {
      if (number(row[field]) !== null) saved[field] = number(row[field]);
    }
    saved.watchdogKill = timing(row.watchdogKill, ['lastHeartbeatMs', 'detectedMs', 'killIssuedMs']);
    saved.leaseDisarm = timing(row.leaseDisarm, ['leaseUntilMs', 'requestedMs']);
    if (row.status === 'FAILED') saved.status = 'FAILED';
    if (typeof row.failureCode === 'string' && ['KERNEL_RECOVERY_TIMEOUT', 'ACTION_OR_KERNEL_TEARDOWN_BOUND'].includes(row.failureCode)) saved.failureCode = row.failureCode;
    results.push(saved);
  }
  return { task: input.task === 'S0-03' ? 'S0-03' : null,
    physicalHardwareProof: input.physicalHardwareProof === false ? false : null,
    status: input.status === 'PASSED' ? 'PASSED' : input.status === 'FAILED' ? 'FAILED' : 'INVALID_REPORT', results };
}

test('actual reviewed Debian synthetic input recovery; missing runner fails this gate', () => {
  // Fixed root-owned lab executable, never a caller-selected device/program.
  const executable = '/opt/linuxcast-input-spike/linuxcast-input-spike-synthetic-lab';
  for (const path of ['/opt', '/opt/linuxcast-input-spike', executable]) {
    const metadata = lstatSync(path);
    expect(metadata.uid).toBe(0);
    expect(metadata.mode & 0o022).toBe(0);
    expect(metadata.isSymbolicLink()).toBe(false);
  }
  const child = spawnSync(executable, ['--reviewed-disposable-guest'], {
    encoding: 'utf8', timeout: 170_000, maxBuffer: 64 * 1024,
    env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' },
  });
  let parsed: unknown;
  try { parsed = JSON.parse(child.stdout ?? ''); } catch { parsed = null; }
  const report = sanitizedReport(parsed);
  // Persist allowlisted fixed labels/booleans/timestamps BEFORE assertions,
  // including a partial report from a nonzero native recovery deadline.
  // No raw stdout, stderr, Error strings, device data or arbitrary keys persist.
  writeFileSync(new URL('./evidence/kernel-debian.json', import.meta.url), JSON.stringify({
    exitCode: number(child.status), report,
  }, null, 2) + '\n', { mode: 0o600 });
  expect(child.error === undefined).toBe(true);
  expect(child.status).toBe(0);
  expect(report.status).toBe('PASSED');
  expect(report.task).toBe('S0-03');
  expect(report.physicalHardwareProof).toBe(false);
  expect(report.results.map(value => value.scenario)).toEqual(scenarios);
  for (const [index, result] of report.results.slice(0, 5).entries()) {
    expect(result.syntheticModifiersObserved).toBe(true);
    expect(result.otherClientRegrabbed).toBe(true);
    expect(result.virtualDeviceRemoved).toBe(true);
    expect(result.noAutomaticRearm).toBe(true);
    expect(result.recoveryMs).toBeTypeOf('number');
    const mechanismDeadlineMs = [250, 250, 500, 1000, 100][index]!;
    expect(result.mechanismDeadlineMs).toBe(mechanismDeadlineMs);
    expect(result.observerToleranceMs).toBe(75);
    if (index === 2) {
      const t = result.watchdogKill as Record<string, number> | null;
      expect(t).not.toBeNull();
      expect(t!.detectedMs!).toBeGreaterThanOrEqual(t!.lastHeartbeatMs!);
      expect(t!.detectedMs! - t!.lastHeartbeatMs!).toBeGreaterThanOrEqual(500);
      expect(t!.killIssuedMs!).toBeGreaterThanOrEqual(t!.detectedMs!);
      expect(t!.killIssuedMs! - t!.lastHeartbeatMs!).toBeLessThanOrEqual(500 + 75);
      expect(result.kernelTeardownBudgetMs).toBe(250);
      expect(Number(result.observedMs) - t!.killIssuedMs!).toBeGreaterThanOrEqual(0);
      expect(Number(result.observedMs) - t!.killIssuedMs!).toBeLessThanOrEqual(250);
    } else if (index === 3) {
      const t = result.leaseDisarm as Record<string, number> | null;
      expect(t).not.toBeNull();
      expect(t!.requestedMs!).toBeGreaterThanOrEqual(t!.leaseUntilMs!);
      expect(t!.requestedMs! - t!.leaseUntilMs!).toBeLessThanOrEqual(75);
      expect(result.kernelTeardownBudgetMs).toBe(250);
      expect(Number(result.observedMs) - t!.requestedMs!).toBeGreaterThanOrEqual(0);
      expect(Number(result.observedMs) - t!.requestedMs!).toBeLessThanOrEqual(250);
    } else {
      expect(result.recoveryMs).toBeLessThanOrEqual(mechanismDeadlineMs + 75);
    }
  }
  for (const result of report.results.slice(5, 12)) {
    expect(result.armDenied).toBe(true);
    expect(result.otherClientCanGrab).toBe(true);
  }
  expect(report.results[12]?.wrongUidDenied).toBe(true);
  expect(report.results[12]?.rootPeerPassedDAC).toBe(true);
  expect(report.results[12]?.rootPeerUidDeniedBeforeAuthorizedClient).toBe(true);
  expect(report.results[12]?.contextRevocationDisarms).toBe(true);
  expect(report.results[13]?.preArmCompletedInputNotForwarded).toBe(true);
  expect(report.results[13]?.freshPostArmInputObserved).toBe(true);
}, 180_000);
