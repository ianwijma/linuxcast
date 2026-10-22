import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { selectTests, SelectionError } from './selection.ts';
import type { TestMap } from './selection.ts';
import { completeReport } from './reports.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const [suite = '', ...args] = process.argv.slice(2);
try {
  const registry = JSON.parse(readFileSync(resolve(root, 'docs/implementation/tasks.json'), 'utf8')) as { tasks: { id: string }[] };
  const manifest = JSON.parse(readFileSync(resolve(root, 'scripts/test-runner/suites.json'), 'utf8')) as TestMap;
  const files = selectTests(root, registry.tasks.map(t => t.id), manifest, suite, args);
  const playwright = suite === 'ui' || suite === 'perf';
  const tool = playwright ? require.resolve('@playwright/test/cli') : resolve(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
  const config = `scripts/test-runner/${playwright ? 'playwright' : 'vitest'}.config.ts`;
  const reportDir = mkdtempSync(resolve(tmpdir(), 'linuxcast-test-report-'));
  const report = resolve(reportDir, 'results.json');
  const reporting = playwright ? ['--reporter=list,json'] : ['--reporter=default', '--reporter=json', `--outputFile=${report}`];
  const child = spawn(process.execPath, [tool, playwright ? 'test' : 'run', '--config', config, ...reporting], {
    cwd: root, stdio: 'inherit', detached: true,
    env: { ...process.env, LINUXCAST_TEST_FILES: JSON.stringify(files), PLAYWRIGHT_JSON_OUTPUT_FILE: report },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  const signalTree = (signal: NodeJS.Signals) => {
    try { if (child.pid) process.kill(-child.pid, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    signalTree('SIGTERM');
    timer = setTimeout(() => signalTree('SIGKILL'), 1000);
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  child.once('error', error => {
    console.error(`Runner could not start: ${error.message}`);
    rmSync(reportDir, { recursive: true, force: true });
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    if (timer) clearTimeout(timer);
    // Kill any descendants that survived the direct child, including cancellation.
    signalTree('SIGKILL');
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    process.exitCode = cancelled ? 130 : (code ?? (signal ? 1 : 0));
    if (process.exitCode === 0) {
      try {
        const result: unknown = JSON.parse(readFileSync(report, 'utf8'));
        if (!completeReport(result, playwright)) throw new Error('No executed tests, skipped/todo checks or flaky results cannot establish acceptance.');
      } catch (error) {
        console.error(`Incomplete test evidence: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    }
    rmSync(reportDir, { recursive: true, force: true });
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof SelectionError ? error.exitCode : 1;
}
