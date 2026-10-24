import * as z from 'zod';
import { modelCapabilitiesSchema } from './ai.ts';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
const reason = { reasonCode: id, remediationAction: id };
export const providerAuthModeSchema = z.enum(['api-key', 'oauth', 'chatgpt-sign-in', 'cloud-identity', 'none']);
/** These statuses are emitted by trusted adapters after actual checks. A parsed
 * record is not authentication evidence or authority to issue an inference call.
 */
export const credentialPersistenceSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('secure-persistent'), secretRef: id }),
  z.strictObject({ mode: z.literal('session-only'), reason: z.enum(['user-choice', 'locked', 'unavailable', 'insecure-backend', 'encryption-failed']) }),
  z.strictObject({ mode: z.literal('not-required') }),
]);
const base = { schemaVersion: z.literal(1), providerProfileId: id };
export const providerStatusSchema = z.discriminatedUnion('state', [
  z.strictObject({ ...base, state: z.literal('unconfigured'), ...reason }),
  z.strictObject({ ...base, state: z.literal('invalid-configuration'), ...reason }),
  z.strictObject({ ...base, state: z.literal('authentication-required'), ...reason }),
  z.strictObject({ ...base, state: z.literal('inference-permission-required'), ...reason }),
  z.strictObject({ ...base, state: z.literal('ineligible'), ...reason }),
  z.strictObject({ ...base, state: z.literal('quota-limited'), ...reason }),
  z.strictObject({ ...base, state: z.literal('rate-limited'), ...reason, retryAfterMs: z.number().int().nonnegative().optional() }),
  z.strictObject({ ...base, state: z.literal('unavailable'), ...reason }),
  z.strictObject({ ...base, state: z.literal('ready'), authMode: providerAuthModeSchema,
    inferenceAuthorized: z.literal(true), accountEligible: z.literal(true),
    credentials: credentialPersistenceSchema }),
]);
const model = z.strictObject({ id, displayName: text, capabilities: modelCapabilitiesSchema });
const entries = z.array(model).refine(values => new Set(values.map(value => value.id)).size === values.length);
const catalog = { ...base, fetchedAt: z.iso.datetime(), provenance: z.strictObject({
  adapterId: id, adapterVersion: id, source: z.enum(['provider-metadata', 'adapter-conformance', 'combined']),
}) };
export const modelCatalogSchema = z.discriminatedUnion('state', [
  z.strictObject({ ...catalog, state: z.literal('available'), models: entries }),
  z.strictObject({ ...catalog, state: z.literal('stale'), models: entries, ...reason }),
  z.strictObject({ ...base, state: z.literal('unavailable'), ...reason }),
]);
export type ProviderStatus = z.infer<typeof providerStatusSchema>;
export type ModelCatalog = z.infer<typeof modelCatalogSchema>;
