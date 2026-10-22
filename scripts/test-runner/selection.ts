import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export const suites = ['unit', 'contracts', 'ui', 'integration', 'security', 'perf'] as const;
export type Suite = typeof suites[number];
export type TestMap = Record<Suite, Record<string, string[]>>;

export class SelectionError extends Error {
  exitCode: number;
  constructor(message: string, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function selectTests(root: string, taskIds: string[], manifest: TestMap, suite: string, args: string[]): string[] {
  if (!suites.includes(suite as Suite)) throw new SelectionError(`Unknown suite: ${suite}`);
  const selectors = args[0] === '--' ? args.slice(1) : args;
  if ((args[0] === '--' && selectors.length === 0) || selectors.length > 1 || selectors.some(x => !x.trim())) {
    throw new SelectionError('Supply one task ID, or omit the selector to run the entire suite. An empty selector is invalid.');
  }
  const taskId = selectors[0];
  if (taskId !== undefined && !taskIds.includes(taskId)) throw new SelectionError(`Unknown task selector: ${taskId}`);
  // Validate all mappings, even when a selected task does not use them. A typo
  // must not silently remove tests from the omitted-selector run.
  for (const [name, mapping] of Object.entries(manifest)) {
    if (!suites.includes(name as Suite)) throw new SelectionError(`Unknown mapped suite: ${name}`);
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new SelectionError(`Invalid mapping: ${name}`);
    for (const [id, files] of Object.entries(mapping)) {
      if (!taskIds.includes(id)) throw new SelectionError(`Unknown mapped task: ${id}`);
      if (!Array.isArray(files) || !files.length) throw new SelectionError(`Empty mapping: ${name}/${id}`);
      for (const file of files) {
        if (typeof file !== 'string' || !/\.test\.(ts|tsx|js|mjs)$/.test(file) || isAbsolute(file) || file.split('/').includes('..')) {
          throw new SelectionError(`Invalid test path for ${name}/${id}`);
        }
        const path = resolve(root, file);
        if (!existsSync(path)) throw new SelectionError(`Missing test file: ${file}`);
        const resolved = relative(realpathSync(root), realpathSync(path));
        if (resolved.startsWith('..') || isAbsolute(resolved)) throw new SelectionError(`Test path escapes workspace: ${file}`);
      }
    }
  }
  const mapping = manifest[suite as Suite];
  if (!mapping) throw new SelectionError(`Missing suite mapping: ${suite}`);
  const files = taskId === undefined ? Object.values(mapping).flat() : mapping[taskId] ?? [];
  if (!files.length) {
    throw new SelectionError(`UNAVAILABLE: no ${suite} checks implemented${taskId ? ` for ${taskId}` : ''}. Add real task-owned tests to scripts/test-runner/suites.json; no acceptance pass recorded.`, 3);
  }
  return [...new Set(files)].sort();
}
