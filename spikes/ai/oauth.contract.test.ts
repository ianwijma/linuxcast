import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { OAuthRegistrationSpike, RESOURCE, SCOPES, TOKEN_ENDPOINT } from './oauth.ts';
import type { TokenResponse, VerifiedIdentity } from './oauth.ts';

const host = 'urn:uuid:baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const listener = { listening: true, address: '127.0.0.1', port: 1455 };
const tokens: TokenResponse = { id_token: 'synthetic-id-token', access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', scope: SCOPES };
const flow = (previous?: { clientId: string; subject: string }) => new OAuthRegistrationSpike(host, 1455, previous);
function callback(auth: URL, extras: Record<string, string> = {}) {
  const url = new URL(auth.searchParams.get('redirect_uri')!);
  url.search = new URLSearchParams({ state: auth.searchParams.get('state')!, code: 'synthetic-code', client_id: 'oaiapp_synthetic', ...extras }).toString();
  return url;
}
function proof(auth: URL): VerifiedIdentity {
  return { issuer: 'https://auth.openai.com', audience: 'oaiapp_synthetic', subject: 'synthetic-subject', nonce: auth.searchParams.get('nonce')!, expiresAt: Date.now() + 60_000 };
}
test('official dynamic bootstrap, stable host identity, exact scopes/resource and fresh PKCE', () => {
  const a = flow(), b = flow(); const url = new URL(a.authorizationUrl(listener));
  expect(url.origin + url.pathname).toBe('https://auth.openai.com/api/accounts/authorize');
  expect(url.searchParams.get('client_id')).toBe('dynamic_agent_client');
  expect(url.searchParams.get('agent_name_hint')).toBe('Linuxcast');
  expect(url.searchParams.get('ext_agent_host_id')).toBe(host);
  expect(url.searchParams.get('scope')).toBe(SCOPES); expect(url.searchParams.get('resource')).toBe(RESOURCE);
  expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:1455/auth/callback');
  const other = new URL(b.authorizationUrl(listener));
  for (const field of ['state', 'nonce', 'code_challenge']) expect(url.searchParams.get(field)).not.toBe(other.searchParams.get(field));
  const exchange = a.callback(callback(url).toString());
  expect(exchange.endpoint).toBe(TOKEN_ENDPOINT);
  expect(exchange.body.get('client_id')).toBe('oaiapp_synthetic');
  expect(exchange.body.get('redirect_uri')).toBe(url.searchParams.get('redirect_uri'));
  expect(exchange.body.get('resource')).toBe(RESOURCE);
  expect(createHash('sha256').update(exchange.body.get('code_verifier')!).digest('base64url')).toBe(url.searchParams.get('code_challenge'));
  expect(exchange.body.has('client_secret')).toBe(false);
});
test.each([
  { listening: false, address: '127.0.0.1', port: 1455 },
  { listening: true, address: 'localhost', port: 1455 },
  { listening: true, address: '0.0.0.0', port: 1455 },
  { listening: true, address: '127.0.0.1', port: 1456 },
])('reject absent or mismatched loopback listener %j', l => expect(() => flow().authorizationUrl(l)).toThrow('listener-required'));
test.each(['state', 'port', 'host', 'path', 'duplicate', 'unicode'])('invalid callback %s rejected before exchange', field => {
  const f = flow(), url = new URL(f.authorizationUrl(listener)), cb = callback(url);
  if (field === 'state') cb.searchParams.set('state', 'wrong');
  if (field === 'port') cb.port = '1456';
  if (field === 'host') cb.hostname = 'localhost';
  if (field === 'path') cb.pathname = '/callback';
  if (field === 'duplicate') cb.searchParams.append('code', 'second');
  if (field === 'unicode') cb.searchParams.set('state', '🌱'.repeat(43));
  expect(() => f.callback(cb.toString())).toThrow('invalid-callback');
});
test('denied consent stops exchange; callback is one-use', () => {
  const f = flow(), url = new URL(f.authorizationUrl(listener));
  expect(() => f.callback(callback(url, { error: 'access_denied' }).toString())).toThrow('authorization-denied');
  expect(() => f.callback(callback(url).toString())).toThrow('attempt-consumed');
});
test.each(['', 'dynamic_agent_client'])('missing issued registration %s never becomes exchange client', id => {
  const f = flow(), url = new URL(f.authorizationUrl(listener));
  expect(() => f.callback(callback(url, { client_id: id }).toString())).toThrow('registration-incomplete');
});
test('returning registration uses issued ID; mismatch cannot overwrite account', () => {
  const f = flow({ clientId: 'oaiapp_saved', subject: 'synthetic-subject' }), url = new URL(f.authorizationUrl(listener));
  expect(url.searchParams.get('client_id')).toBe('oaiapp_saved'); expect(url.searchParams.has('agent_name_hint')).toBe(false);
  expect(() => f.callback(callback(url).toString())).toThrow('registration-incomplete');
  const g = flow({ clientId: 'oaiapp_saved', subject: 'synthetic-subject' }), auth = new URL(g.authorizationUrl(listener));
  const cb = callback(auth); cb.searchParams.delete('client_id');
  expect(g.callback(cb.toString()).body.get('client_id')).toBe('oaiapp_saved');
});
test.each(['signature', 'issuer', 'audience', 'nonce', 'expiry', 'invalid-expiry', 'infinite-expiry', 'fractional-expiry', 'subject'])('identity validation %s remains mandatory', async field => {
  const f = flow({ clientId: 'oaiapp_synthetic', subject: 'synthetic-subject' }), url = new URL(f.authorizationUrl(listener));
  f.callback(callback(url).toString());
  const verify = async () => {
    if (field === 'signature') throw new Error('synthetic token secret');
    const p = proof(url);
    if (field === 'issuer') return { ...p, issuer: 'https://attacker.test' } as VerifiedIdentity;
    if (field === 'audience') p.audience = 'different';
    if (field === 'nonce') p.nonce = 'different';
    if (field === 'expiry') p.expiresAt = Date.now() - 1;
    if (field === 'invalid-expiry') p.expiresAt = NaN;
    if (field === 'infinite-expiry') p.expiresAt = Infinity;
    if (field === 'fractional-expiry') p.expiresAt = Date.now() + 60_000.5;
    if (field === 'subject') p.subject = 'different';
    return p;
  };
  await expect(f.accept(tokens, verify)).rejects.toThrow('identity-invalid');
});
test.each([true, false])('identity and plan permission distinct (%s); no tokens in result', async granted => {
  const f = flow(), url = new URL(f.authorizationUrl(listener)); f.callback(callback(url).toString());
  const result = await f.accept({ ...tokens, scope: granted ? SCOPES : 'openid profile email' }, async () => proof(url));
  expect(result.status).toBe(granted ? 'permission-granted-eligibility-unverified' : 'plan-permission-required');
  const encoded = JSON.stringify(result);
  for (const secret of [tokens.id_token, tokens.access_token, tokens.refresh_token!, 'synthetic-code']) expect(encoded).not.toContain(secret);
});
