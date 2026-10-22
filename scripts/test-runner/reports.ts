/** A tool exiting zero does not prove that its intended checks ran. */
export function completeReport(value: unknown, playwright: boolean): boolean {
  if (!value || typeof value !== 'object') return false;
  const report = value as Record<string, unknown>;
  if (playwright) {
    if (!report.stats || typeof report.stats !== 'object') return false;
    const stats = report.stats as Record<string, unknown>;
    return typeof stats.expected === 'number' && stats.expected > 0
      && stats.skipped === 0 && stats.unexpected === 0 && stats.flaky === 0;
  }
  return typeof report.numPassedTests === 'number' && report.numPassedTests > 0
    && report.numFailedTests === 0 && report.numPendingTests === 0 && report.numTodoTests === 0;
}
