import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const native = join(dirname(fileURLToPath(import.meta.url)), 'native');

test('real private D-Bus fixture enforces poll/ack and fresh-generation no-replay', () => {
  const result = spawnSync('/usr/bin/dbus-run-session', ['--', '/usr/bin/python3', join(native, 'transport-wire.py')], { encoding: 'utf8', timeout: 5000, maxBuffer: 65536 });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'passed', kind: 'private-Gio-DBus-fixture-not-KWin',
    singlePending: true, acknowledged: true, freshGeneration: true, noReplay: true });
});

test('actual own GTK/X11 window and private selection canary, not companion proof', () => {
  const result = spawnSync('/usr/bin/python3', [join(native, 'own-canary.py')], { encoding: 'utf8', timeout: 5000, maxBuffer: 65536 });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'passed', clipboardTouched: false,
    liveGeometryChanged: true, privateSelectionTextMatches: true, privateSelectionReleased: true });
}, 10000);
