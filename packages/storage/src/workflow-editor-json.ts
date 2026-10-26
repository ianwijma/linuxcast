/** Deterministic native JSON: object member order is not graph semantics. */
export function stableWorkflowJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableWorkflowJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableWorkflowJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
