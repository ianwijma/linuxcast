import { expect, it } from 'vitest';
import { ContractError, parseContract, parseProviderProfile, providerEndpointSchema, type ProviderProfileRegistry } from '../src/index.ts';
const registry: ProviderProfileRegistry = new Map([['synthetic', { authModes: new Set(['api-key', 'none']), endpointKinds: new Set(['https', 'loopback-http', 'insecure-development-http']) }]]);
const profile = { schemaVersion: 1, id: 'synthetic-profile', displayName: 'Synthetic', adapterId: 'synthetic', authMode: 'api-key',
  endpoint: { kind: 'https', url: 'HTTPS://SYNTHETIC.EXAMPLE:443/v1' }, dataDestination: 'Synthetic remote service', credentialRef: 'synthetic-opaque-secret', networkPolicyRef: 'synthetic-proxy-ca-policy' };
it('normalizes the endpoint and keeps credentials opaque without selecting a model', () => {
  expect(parseProviderProfile(profile, registry).endpoint.url).toBe('https://synthetic.example/v1');
  expect(parseProviderProfile(profile, registry).networkPolicyRef).toBe('synthetic-proxy-ca-policy');
  expect(() => parseProviderProfile({ ...profile, modelId: 'hidden-selection' }, registry)).toThrow(ContractError);
});
it.each(['https://user:synthetic-private-canary@synthetic.example', 'https://synthetic.example/?key=synthetic-private-canary',
  'https://synthetic.example/#synthetic-private-canary', 'file:///synthetic', 'javascript:synthetic'])('rejects credential-bearing/non-endpoint URL %#', url => {
  try { parseProviderProfile({ ...profile, endpoint: { kind: 'https', url } }, registry); expect.fail('Expected rejection.'); }
  catch (error) { expect(error).toBeInstanceOf(ContractError); expect(String(error)).not.toContain('synthetic-private-canary'); }
});
it.each(['http://localhost:11434', 'http://127.0.0.1:11434', 'http://[::1]:11434'])('accepts explicit loopback endpoint reference %s', url => {
  expect(parseContract(providerEndpointSchema, { kind: 'loopback-http', url, localEndpointGrantRef: 'synthetic-local-grant' })).toHaveProperty('kind', 'loopback-http');
});
it('requires explicit per-endpoint insecure opt-in and never labels remote HTTP as loopback', () => {
  const url = 'http://synthetic.example/v1';
  expect(() => parseContract(providerEndpointSchema, { kind: 'loopback-http', url, localEndpointGrantRef: 'synthetic' })).toThrow(ContractError);
  expect(() => parseContract(providerEndpointSchema, { kind: 'insecure-development-http', url })).toThrow(ContractError);
  expect(parseContract(providerEndpointSchema, { kind: 'insecure-development-http', url, endpointOptInRef: 'synthetic-opt-in' })).toHaveProperty('url', url);
  expect(() => parseContract(providerEndpointSchema, { kind: 'https', url })).toThrow(ContractError);
});
it('requires registered adapter/auth/endpoint compatibility and rejects raw key fields', () => {
  for (const patch of [{ adapterId: 'unknown' }, { authMode: 'chatgpt-sign-in' }, { apiKey: 'synthetic-private-canary' }, { schemaVersion: 2 }, { authMode: 'none' }]) {
    expect(() => parseProviderProfile({ ...profile, ...patch }, registry)).toThrow(ContractError);
  }
  expect(parseProviderProfile({ ...profile, authMode: 'none', credentialRef: null }, registry)).toHaveProperty('credentialRef', null);
});
