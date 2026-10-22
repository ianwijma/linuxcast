import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { selectTests, SelectionError } from './selection.ts';
import type { TestMap } from './selection.ts';

let root: string;
let manifest: TestMap;
const taskIds = ['F1-01', 'S0-01'];
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'linuxcast-selector-'));
  mkdirSync(resolve(root, 'tests'));
  writeFileSync(resolve(root, 'tests/first.test.ts'), '');
  writeFileSync(resolve(root, 'tests/second.test.ts'), '');
  manifest = { unit: { 'F1-01': ['tests/first.test.ts'], 'S0-01': ['tests/second.test.ts'] }, contracts: {}, ui: {}, integration: {}, security: {}, perf: {} };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('task selection', () => {
  test('omission selects the complete suite, a task selects only its mapped tests', () => {
    expect(selectTests(root, taskIds, manifest, 'unit', [])).toEqual(['tests/first.test.ts', 'tests/second.test.ts']);
    expect(selectTests(root, taskIds, manifest, 'unit', ['--', 'F1-01'])).toEqual(['tests/first.test.ts']);
    expect(selectTests(root, taskIds, manifest, 'unit', ['S0-01'])).toEqual(['tests/second.test.ts']);
  });
  test.each([[''], [' '], ['--'], ['F1-01', 'S0-01'], ['--', ''], ['--help'], ['F1-99']])('rejects invalid selector %j', (...args) => {
    expect(() => selectTests(root, taskIds, manifest, 'unit', args)).toThrow(SelectionError);
  });
  test('a known task without checks is unavailable rather than passed', () => {
    expect(() => selectTests(root, taskIds, manifest, 'integration', ['F1-01'])).toThrow(/UNAVAILABLE/);
    expect(() => selectTests(root, taskIds, manifest, 'perf', [])).toThrow(/UNAVAILABLE/);
  });
  test('rejects stale paths, unknown mapped tasks and empty mappings', () => {
    manifest.unit['F1-01'] = ['tests/missing.test.ts'];
    expect(() => selectTests(root, taskIds, manifest, 'unit', [])).toThrow(/Missing test file/);
    manifest.unit['F1-01'] = [];
    expect(() => selectTests(root, taskIds, manifest, 'unit', [])).toThrow(/Empty mapping/);
    manifest.unit = { typo: ['tests/first.test.ts'] };
    expect(() => selectTests(root, taskIds, manifest, 'unit', [])).toThrow(/Unknown mapped task/);
  });
  test('rejects paths outside the checkout including symlinks', () => {
    manifest.unit['F1-01'] = ['../outside.test.ts'];
    expect(() => selectTests(root, taskIds, manifest, 'unit', [])).toThrow(/Invalid test path/);
    symlinkSync(resolve(process.cwd(), 'scripts/test-runner/selection.test.ts'), resolve(root, 'tests/escape.test.ts'));
    manifest.unit['F1-01'] = ['tests/escape.test.ts'];
    expect(() => selectTests(root, taskIds, manifest, 'unit', [])).toThrow(/escapes workspace/);
  });
});

function prepareCli() {
  const scripts = resolve(root, 'scripts/test-runner');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(resolve(root, 'docs/implementation'), { recursive: true });
  for (const file of ['run.ts', 'selection.ts', 'reports.ts', 'vitest.config.ts']) cpSync(resolve(process.cwd(), 'scripts/test-runner', file), resolve(scripts, file));
  writeFileSync(resolve(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { 'test:unit': 'node scripts/test-runner/run.ts unit' } }));
  writeFileSync(resolve(root, 'docs/implementation/tasks.json'), JSON.stringify({ tasks: taskIds.map(id => ({ id })) }));
  writeFileSync(resolve(scripts, 'suites.json'), JSON.stringify(manifest));
  symlinkSync(resolve(process.cwd(), 'node_modules'), resolve(root, 'node_modules'), 'dir');
}

test('CLI executes only selected files, omission executes all, and tool failure propagates', () => {
  prepareCli();
  const marker = resolve(root, 'executed.txt');
  for (const [file, text] of [['first', 'first'], ['second', 'second']]) {
    writeFileSync(resolve(root, `tests/${file}.test.ts`), `import {test} from 'vitest'; import {appendFileSync} from 'node:fs'; test('${text}', () => appendFileSync(${JSON.stringify(marker)}, '${text}\\n'));`);
  }
  const run = (...args: string[]) => spawnSync(process.execPath, [resolve(root, 'scripts/test-runner/run.ts'), 'unit', ...args], { encoding: 'utf8', timeout: 15000 });
  let result = run('--', 'F1-01');
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(readFileSync(marker, 'utf8')).toBe('first\n');
  rmSync(marker);
  result = run();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(readFileSync(marker, 'utf8').trim().split('\n').sort()).toEqual(['first', 'second']);
  writeFileSync(resolve(root, 'tests/first.test.ts'), "import {test} from 'vitest'; test('fails', () => { throw new Error('synthetic failure'); });");
  expect(run('F1-01').status).toBe(1);
  expect(run('--', '').status).toBe(2);
  expect(run('--', 'NO-SUCH-TASK').status).toBe(2);
}, 30000);

test.each(['skip', 'todo', 'only'])('CLI refuses an unexecuted %s check as acceptance', (mode) => {
  prepareCli();
  writeFileSync(resolve(root, 'tests/first.test.ts'), `import {test} from 'vitest'; test.${mode}('unavailable desktop', () => {});`);
  const result = spawnSync(process.execPath, [resolve(root, 'scripts/test-runner/run.ts'), 'unit', 'F1-01'], { encoding: 'utf8', timeout: 15000 });
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.error).toBeUndefined();
  expect(result.stdout + result.stderr).toMatch(/Incomplete test evidence|\.only|allowOnly/);
}, 20000);


test('cancelling a running suite terminates its process group and returns interruption', async () => {
  prepareCli();
  const ready = resolve(root, 'ready.json');
  writeFileSync(resolve(root, 'tests/first.test.ts'), `
    import {test} from 'vitest';
    import {spawn} from 'node:child_process';
    import {writeFileSync} from 'node:fs';
    test('waiting fixture', async () => {
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});
      writeFileSync(${JSON.stringify(ready)}, JSON.stringify({pid: child.pid}));
      await new Promise(() => {});
    }, 20000);
  `);
  const runner = spawn(process.execPath, [resolve(root, 'scripts/test-runner/run.ts'), 'unit', 'F1-01'], {stdio: 'ignore'});
  const terminal = new Promise<number | null>((done, reject) => {
    runner.once('error', reject);
    runner.once('close', code => done(code));
  });
  let descendant: number | undefined;
  try {
    const deadline = Date.now() + 10000;
    while (!existsSync(ready) && Date.now() < deadline) await new Promise(done => setTimeout(done, 20));
    expect(existsSync(ready), 'test fixture must start before sending cancellation').toBe(true);
    descendant = (JSON.parse(readFileSync(ready, 'utf8')) as {pid: number}).pid;
    runner.kill('SIGTERM');
    expect(await terminal).toBe(130);
    const stopped = () => {
      try {
        // A reparented zombie has exited and cannot retain live resources.
        return readFileSync(`/proc/${descendant}/stat`, 'utf8').split(') ')[1]?.startsWith('Z') ?? false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
        throw error;
      }
    };
    const recoveryDeadline = Date.now() + 2000;
    while (!stopped() && Date.now() < recoveryDeadline) await new Promise(done => setTimeout(done, 20));
    expect(stopped(), 'suite descendants must terminate after cancellation').toBe(true);
  } finally {
    runner.kill('SIGTERM');
    if (descendant) {
      try { process.kill(descendant, 'SIGKILL'); }
      catch (error) { expect((error as NodeJS.ErrnoException).code).toBe('ESRCH'); }
    }
  }
}, 15000);


test('public Bun script preserves empty selectors, rejects unknown IDs and runs omitted selectors', () => {
  prepareCli();
  for (const name of ['first', 'second']) {
    writeFileSync(resolve(root, `tests/${name}.test.ts`), "import {test} from 'vitest'; test('public fixture', () => {});");
  }
  const run = (...args: string[]) => spawnSync('bun', ['run', 'test:unit', ...args], {
    cwd: root, encoding: 'utf8', timeout: 15000,
  });
  for (const selector of ['', 'NO-SUCH-TASK']) {
    const result = run('--', selector);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(2);
  }
  const result = run();
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain('2 passed');
}, 20000);
