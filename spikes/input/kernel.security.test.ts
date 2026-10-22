import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { expect, test } from 'vitest';

test('actual reviewed Debian synthetic input recovery; missing runner fails this gate', () => {
  // Fixed root-owned lab executable, never a caller-selected device/program.
  const executable = '/opt/linuxcast-input-spike/linuxcast-input-spike-synthetic-lab';
  for (const path of ['/opt', '/opt/linuxcast-input-spike', executable]) {
    const metadata = lstatSync(path);
    expect(metadata.uid).toBe(0);
    expect(metadata.mode & 0o022).toBe(0);
    expect(metadata.isSymbolicLink()).toBe(false);
  }
  const output = execFileSync(executable, ['--reviewed-disposable-guest'], {
    encoding: 'utf8', timeout: 170_000, maxBuffer: 64 * 1024,
    env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' },
  });
  const report = JSON.parse(output) as {
    task: string; physicalHardwareProof: boolean;
    results: Array<Record<string, unknown>>;
  };
  expect(report.task).toBe('S0-03');
  expect(report.physicalHardwareProof).toBe(false);
  expect(report.results.map(value => value.scenario)).toEqual([
    'worker-sigkill', 'supervisor-sigkill', 'worker-watchdog', 'app-lease', 'emergency',
    'locked', 'unknown-lock', 'inactive', 'tty', 'remote', 'stale-context', 'stale-generation',
    'peer-credentials-and-context-revoke',
  ]);
  for (const result of report.results.slice(0, 5)) {
    expect(result.syntheticModifiersObserved).toBe(true);
    expect(result.otherClientRegrabbed).toBe(true);
    expect(result.virtualDeviceRemoved).toBe(true);
    expect(result.noAutomaticRearm).toBe(true);
    expect(result.recoveryMs).toBeTypeOf('number');
    expect(result.recoveryMs).toBeLessThanOrEqual(1500);
  }
  for (const result of report.results.slice(5, 12)) {
    expect(result.armDenied).toBe(true);
    expect(result.otherClientCanGrab).toBe(true);
  }
  expect(report.results[12]?.wrongUidDenied).toBe(true);
  expect(report.results[12]?.contextRevocationDisarms).toBe(true);
}, 180_000);
