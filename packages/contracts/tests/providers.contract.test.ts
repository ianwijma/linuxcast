import { expect, it } from 'vitest';
import { ContractError, parseContract, providerStatusSchema, modelCatalogSchema, credentialPersistenceSchema } from '../src/index.ts';
const base = { schemaVersion: 1, providerProfileId: 'synthetic-profile' };
const reason = { reasonCode: 'synthetic-reason', remediationAction: 'provider.settings' };
const ready = { ...base, state: 'ready', authMode: 'chatgpt-sign-in', inferenceAuthorized: true, accountEligible: true,
  credentials: { mode: 'session-only', reason: 'user-choice' } };
const catalog = { ...base, fetchedAt: '2026-10-23T00:00:00Z', provenance: { adapterId: 'synthetic', adapterVersion: '1.0.0', source: 'provider-metadata' },
  state: 'available', models: [{ id: 'synthetic-model', displayName: 'Synthetic model', capabilities: {
    text: true, imageInput: false, fileInputMimeTypes: [], toolCalls: false, structuredOutput: 'none', reasoningControls: [],
    contextTokens: null, outputTokens: null, tokenUsage: 'unavailable', cancellation: 'local-only' } }] };
it.each(['unconfigured', 'invalid-configuration', 'authentication-required', 'inference-permission-required', 'ineligible',
  'quota-limited', 'rate-limited', 'unavailable'])('preserves distinct actionable %s status', state => {
  expect(parseContract(providerStatusSchema, { ...base, state, ...reason })).toHaveProperty('state', state);
});
it('requires explicit inference permission and account eligibility for ready', () => {
  expect(parseContract(providerStatusSchema, ready)).toEqual(ready);
  for (const patch of [{ inferenceAuthorized: false }, { accountEligible: false }, { identityOnly: true }, { schemaVersion: 2 },
    { credentials: { mode: 'secure-persistent', secret: 'synthetic-private-canary' } }]) {
    try { parseContract(providerStatusSchema, { ...ready, ...patch }); expect.fail('Expected rejection.'); }
    catch (error) { expect(error).toBeInstanceOf(ContractError); expect(String(error)).not.toContain('synthetic-private-canary'); }
  }
});
it('keeps insecure/unavailable credential storage explicitly session-only', () => {
  for (const reason of ['locked', 'unavailable', 'insecure-backend', 'encryption-failed']) {
    expect(parseContract(credentialPersistenceSchema, { mode: 'session-only', reason })).toHaveProperty('reason', reason);
    expect(() => parseContract(credentialPersistenceSchema, { mode: 'secure-persistent', reason })).toThrow(ContractError);
  }
  expect(parseContract(credentialPersistenceSchema, { mode: 'secure-persistent', secretRef: 'synthetic-opaque-secret' })).toHaveProperty('secretRef');
});
it('preserves unknown model limits and records catalog provenance/time', () => {
  expect(parseContract(modelCatalogSchema, catalog)).toEqual(catalog);
  expect(() => parseContract(modelCatalogSchema, { ...catalog, models: [catalog.models[0], catalog.models[0]] })).toThrow(ContractError);
  expect(() => parseContract(modelCatalogSchema, { ...catalog, fetchedAt: 'yesterday' })).toThrow(ContractError);
});
it('distinguishes an empty successful catalog, stale results and no available catalog', () => {
  expect(parseContract(modelCatalogSchema, { ...catalog, models: [] })).toHaveProperty('state', 'available');
  expect(parseContract(modelCatalogSchema, { ...catalog, state: 'stale', ...reason })).toHaveProperty('state', 'stale');
  expect(() => parseContract(modelCatalogSchema, { ...catalog, state: 'stale' })).toThrow(ContractError);
  expect(parseContract(modelCatalogSchema, { ...base, state: 'unavailable', ...reason })).toHaveProperty('state', 'unavailable');
  expect(() => parseContract(modelCatalogSchema, { ...catalog, state: 'unavailable', ...reason })).toThrow(ContractError);
});
