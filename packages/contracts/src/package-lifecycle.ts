import * as z from 'zod';
import { packagePathSchema } from './extension-manifest.ts';
import { packageIdentitySchema, semanticVersionSchema } from './workflow-graph.ts';
import { jsonValueSchema } from './json-value.ts';
import { ContractError, parseContract, rpcFailureSchema } from './protocol.ts';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const MAX_PACKAGE_EXPANDED_BYTES = 200 * 1024 * 1024;
export const packageVersionSchema = z.strictObject({ kind: z.enum(['extension', 'workflow']),
  id: packageIdentitySchema, version: semanticVersionSchema, integrity: digest });
export type PackageVersion = z.infer<typeof packageVersionSchema>;
const file = z.strictObject({ path: packagePathSchema, bytes: z.number().int().nonnegative().max(MAX_PACKAGE_EXPANDED_BYTES), sha256: digest });
const integrityShape = z.strictObject({ schemaVersion: z.literal(1), algorithm: z.literal('sha256'), files: z.array(file).min(1).max(9999) })
  .refine(value => new Set(value.files.map(item => item.path)).size === value.files.length &&
    value.files.every(item => item.path !== 'integrity.json') &&
    value.files.reduce((total, item) => total + item.bytes, 0) <= MAX_PACKAGE_EXPANDED_BYTES);
/** integrity.json excludes itself. The archive validator counts that additional
 * regular file and its bytes in the total 10,000-file / 200MiB package limit.
 */
export const packageIntegritySchema = z.preprocess((value, context) => {
  const parsed = jsonValueSchema.safeParse(value);
  if (!parsed.success || new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength > MAX_PACKAGE_EXPANDED_BYTES) {
    context.addIssue({ code: 'custom', message: 'Invalid package integrity record.' }); return z.NEVER;
  }
  return parsed.data;
}, integrityShape);
/** Inventory is computed by the trusted bounded archive validator, not supplied
 * by the package. Matching digests establish content identity, never authorship.
 */
export function parsePackageIntegrity(value: unknown, inventory: ReadonlyMap<string, { bytes: number; sha256: string }>) {
  const record = parseContract(packageIntegritySchema, value);
  if (inventory.size !== record.files.length || record.files.some(item => {
    const actual = inventory.get(item.path);
    return !actual || actual.bytes !== item.bytes || actual.sha256 !== item.sha256;
  })) throw new ContractError('Package integrity does not match staged files.');
  return record;
}
const operationBase = { protocolVersion: z.literal(1), operationId: id, packageId: packageIdentitySchema };
export const packageLifecycleRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ ...operationBase, operation: z.literal('install'), stagedPackageRef: id, expectedActive: z.null() }),
  z.strictObject({ ...operationBase, operation: z.literal('update'), stagedPackageRef: id, expectedActive: packageVersionSchema,
    localDraftDecisionRef: id.optional() }),
  z.strictObject({ ...operationBase, operation: z.literal('rollback'), targetVersion: packageVersionSchema, expectedActive: packageVersionSchema }),
  z.strictObject({ ...operationBase, operation: z.literal('disable'), expectedActive: packageVersionSchema }),
  z.strictObject({ ...operationBase, operation: z.literal('uninstall'), expectedActive: packageVersionSchema,
    deleteData: z.boolean().default(false), credentialHandling: z.enum(['revoke', 'remove']) }),
]);
export type PackageLifecycleRequest = z.infer<typeof packageLifecycleRequestSchema>;
export type PackageLifecycleRegistry = {
  active: ReadonlyMap<string, PackageVersion>;
  staged: ReadonlyMap<string, PackageVersion>;
  retained: readonly PackageVersion[];
};
export function samePackageVersion(a: PackageVersion | null, b: PackageVersion | null): boolean {
  return a === null || b === null ? a === b : a.kind === b.kind && a.id === b.id && a.version === b.version && a.integrity === b.integrity;
}
/** Resolves routing/version references only. The package manager must recheck
 * active identity inside its atomic transaction, validate settings, review local
 * edits and collect new identity/version/integrity-bound grants before activation.
 */
export function parsePackageLifecycleRequest(value: unknown, registry: PackageLifecycleRegistry): PackageLifecycleRequest {
  const request = parseContract(packageLifecycleRequestSchema, value);
  const current = registry.active.get(request.packageId) ?? null;
  if (!samePackageVersion(request.expectedActive, current)) throw new ContractError('Package active version changed.');
  if (current && current.id !== request.packageId) throw new ContractError('Invalid package lifecycle reference.');
  if (request.operation === 'install' || request.operation === 'update' || request.operation === 'rollback') {
    const candidate = request.operation === 'rollback' ? request.targetVersion : registry.staged.get(request.stagedPackageRef);
    if (!candidate || candidate.id !== request.packageId || (current && candidate.kind !== current.kind) ||
      (request.operation === 'rollback' && !registry.retained.some(item => samePackageVersion(item, candidate)))) {
      throw new ContractError('Invalid package lifecycle reference.');
    }
  }
  return request;
}
const resultBase = { protocolVersion: z.literal(1), operationId: id, packageId: packageIdentitySchema, terminal: z.literal(true) };
export const packageLifecycleResultSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ ...resultBase, outcome: z.literal('activated'), activeVersion: packageVersionSchema,
    previousVersion: packageVersionSchema.nullable(), automaticTriggersEnabled: z.boolean(), newAutomaticTriggersEnabled: z.literal(false) }),
  z.strictObject({ ...resultBase, outcome: z.literal('uninstalled'), activeVersion: z.null(),
    dataDisposition: z.enum(['retained', 'deleted']), credentialHandling: z.enum(['revoke', 'remove']),
    processes: z.literal('exited'), registrations: z.literal('removed'), capabilities: z.literal('revoked') }),
  z.strictObject({ ...resultBase, outcome: z.literal('disabled'), activeVersion: packageVersionSchema,
    processes: z.literal('exited'), registrations: z.literal('removed'), capabilities: z.literal('revoked'),
    automaticTriggersEnabled: z.literal(false), dataDisposition: z.literal('retained') }),
  z.strictObject({ ...resultBase, outcome: z.literal('failed'), error: rpcFailureSchema.refine(value => value.code !== 'cancelled'),
    activeVersion: packageVersionSchema.nullable(), recovery: z.enum(['unchanged', 'restored', 'review-required']), automaticRetry: z.literal(false) }),
  z.strictObject({ ...resultBase, outcome: z.literal('cancelled'), error: rpcFailureSchema.refine(value => value.code === 'cancelled' && !value.retryable),
    activeVersion: packageVersionSchema.nullable(), recovery: z.enum(['unchanged', 'restored', 'review-required']), automaticRetry: z.literal(false) }),
]);
export type PackageLifecycleResult = z.infer<typeof packageLifecycleResultSchema>;
/** Consume only authenticated package-manager observations. Literal success
 * fields are evidence assertions by that producer, not effects performed here.
 * Capture candidate from the validated staging/retained registry at operation
 * start; a result cannot select its own successful target.
 */
export function parsePackageLifecycleResult(value: unknown, request: PackageLifecycleRequest, candidate: PackageVersion | null): PackageLifecycleResult {
  const result = parseContract(packageLifecycleResultSchema, value);
  const reject = () => { throw new ContractError('Invalid package lifecycle result.'); };
  if (result.operationId !== request.operationId || result.packageId !== request.packageId ||
    (result.activeVersion && result.activeVersion.id !== request.packageId)) reject();
  if (result.outcome === 'activated') {
    if (request.operation === 'uninstall' || request.operation === 'disable' || !candidate || candidate.id !== request.packageId ||
      (request.operation === 'install' && result.automaticTriggersEnabled) ||
      !samePackageVersion(result.activeVersion, candidate) || !samePackageVersion(result.previousVersion, request.expectedActive) ||
      (request.operation === 'rollback' && !samePackageVersion(candidate, request.targetVersion))) reject();
  } else if (result.outcome === 'uninstalled') {
    if (request.operation !== 'uninstall' || result.dataDisposition !== (request.deleteData ? 'deleted' : 'retained') ||
      result.credentialHandling !== request.credentialHandling) reject();
  } else if (result.outcome === 'disabled') {
    if (request.operation !== 'disable' || !samePackageVersion(result.activeVersion, request.expectedActive)) reject();
  } else if (result.recovery !== 'review-required' && !samePackageVersion(result.activeVersion, request.expectedActive)) reject();
  return result;
}
