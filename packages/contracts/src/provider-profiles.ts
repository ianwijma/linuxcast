import * as z from 'zod';
import { providerAuthModeSchema } from './providers.ts';
import { ContractError, parseContract } from './protocol.ts';
import { uiTextSchema as text } from './scalars.ts';
const id = text.min(1);
const baseUrl = text.refine(value => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}).transform(value => new URL(value).href);
function loopback(url: string) {
  const hostname = new URL(url).hostname;
  if (['localhost', 'localhost.', '[::1]'].includes(hostname)) return true;
  const parts = hostname.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every(part => /^[0-9]+$/u.test(part) && Number(part) <= 255);
}
export const providerEndpointSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('https'), url: baseUrl }).refine(value => new URL(value.url).protocol === 'https:'),
  z.strictObject({ kind: z.literal('loopback-http'), url: baseUrl, localEndpointGrantRef: id })
    .refine(value => new URL(value.url).protocol === 'http:' && loopback(value.url)),
  z.strictObject({ kind: z.literal('insecure-development-http'), url: baseUrl, endpointOptInRef: id })
    .refine(value => new URL(value.url).protocol === 'http:' && !loopback(value.url)),
]);
export const providerProfileSchema = z.strictObject({ schemaVersion: z.literal(1), id, displayName: text,
  adapterId: id, authMode: providerAuthModeSchema, endpoint: providerEndpointSchema,
  dataDestination: text, credentialRef: id.nullable(), networkPolicyRef: id.optional(),
}).refine(value => value.authMode !== 'none' || value.credentialRef === null);
export type ProviderProfile = z.infer<typeof providerProfileSchema>;
export type ProviderProfileRegistry = ReadonlyMap<string, {
  authModes: ReadonlySet<z.infer<typeof providerAuthModeSchema>>;
  endpointKinds: ReadonlySet<ProviderProfile['endpoint']['kind']>;
}>;
/** Profiles contain opaque credential and explicit opt-in references, never keys.
 * Parsing does not validate reference ownership, DNS/destination, TLS trust,
 * account eligibility or inference permission. The broker resolves/rechecks them
 * before use, binds opt-ins to this endpoint and never forwards credentials
 * across origins. A saved profile neither selects a model nor authorizes traffic.
 */
export function parseProviderProfile(value: unknown, registry: ProviderProfileRegistry): ProviderProfile {
  const profile = parseContract(providerProfileSchema, value);
  const adapter = registry.get(profile.adapterId);
  if (!adapter || !adapter.authModes.has(profile.authMode) || !adapter.endpointKinds.has(profile.endpoint.kind)) {
    throw new ContractError('Unsupported provider profile configuration.');
  }
  return profile;
}
