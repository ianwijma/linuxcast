import { expect, test } from 'vitest';
import { completeReport } from './reports.ts';

const vitest = { numPassedTests: 3, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0 };
const playwright = { expected: 3, skipped: 0, unexpected: 0, flaky: 0 };

test('only executed checks with no missing outcomes establish acceptance', () => {
  expect(completeReport(vitest, false)).toBe(true);
  expect(completeReport({ stats: playwright }, true)).toBe(true);
  for (const value of [null, [], {}, { stats: {} }, { stats: null }]) {
    expect(completeReport(value, false)).toBe(false);
    expect(completeReport(value, true)).toBe(false);
  }
  for (const field of ['numFailedTests', 'numPendingTests', 'numTodoTests']) {
    expect(completeReport({ ...vitest, [field]: 1 }, false)).toBe(false);
    expect(completeReport({ ...vitest, [field]: undefined }, false)).toBe(false);
  }
  for (const field of ['skipped', 'unexpected', 'flaky']) {
    expect(completeReport({ stats: { ...playwright, [field]: 1 } }, true)).toBe(false);
    expect(completeReport({ stats: { ...playwright, [field]: undefined } }, true)).toBe(false);
  }
  expect(completeReport({ ...vitest, numPassedTests: 0 }, false)).toBe(false);
  expect(completeReport({ stats: { ...playwright, expected: 0 } }, true)).toBe(false);
});
