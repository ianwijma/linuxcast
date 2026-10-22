import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Exact official OSS route retrieved 2026-10-23. No browser or CLI credential discovery.
const AUTHORIZE = 'https://auth.openai.com/api/accounts/authorize';
export const TOKEN_ENDPOINT = 'https://auth.openai.com/api/accounts/oauth/token';
export const RESOURCE = 'https://api.openai.com/v1';
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const issued = (id: string) => /^oaiapp_[A-Za-z0-9_-]{1,200}$/.test(id);
const opaque = () => randomBytes(32).toString('base64url');
const equal = (a: string, b: string) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export interface Registration { clientId: string; subject: string }
export interface VerifiedIdentity { issuer: string; audience: string; subject: string; nonce: string; expiresAt: number }
export interface TokenResponse { id_token: string; access_token: string; refresh_token?: string; scope: string }
/** F0-01/A1 must bind this seam to signature/JWKS validation, never to a decoded unverified JWT. */
export type VerifyIdentity = (idToken: string) => Promise<VerifiedIdentity>;
/** Adapter feasibility only. Tokens remain host-memory values and never enter a file or journal. */
export class OAuthRegistrationSpike {
  private state = opaque();
  private nonce = opaque();
  private verifier = opaque();
  private consumed = false;
  private exchangeClient: string | undefined;
  private validated = false;
  private readonly redirect: string;
  private hostId: string;
  private previous: Registration | undefined;
  constructor(hostId: string, port: number, previous?: Registration) {
    if (!/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(hostId) ||
        !Number.isSafeInteger(port) || port < 1024 || port > 65535 || (previous && (!issued(previous.clientId) || !previous.subject))) throw new Error('invalid-registration');
    this.redirect = `http://127.0.0.1:${port}/auth/callback`;
    this.hostId = hostId; this.previous = previous;
  }
  /** Caller must bind this exact 127.0.0.1 listener before opening the system browser. */
  authorizationUrl(listener: { listening: boolean; address: string; port: number }): string {
    if (!listener.listening || listener.address !== '127.0.0.1' || listener.port !== Number(new URL(this.redirect).port) || this.consumed) throw new Error('listener-required');
    const url = new URL(AUTHORIZE);
    url.search = new URLSearchParams({ client_id: this.previous?.clientId ?? 'dynamic_agent_client',
      ...(this.previous ? {} : { agent_name_hint: 'Linuxcast' }), ext_agent_host_id: this.hostId,
      response_type: 'code', redirect_uri: this.redirect, scope: SCOPES, resource: RESOURCE,
      state: this.state, nonce: this.nonce, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(this.verifier).digest('base64url'),
    }).toString();
    return url.toString(); // Host secret: never log authorization URLs/state/nonce.
  }
  callback(callbackUrl: string): { endpoint: string; body: URLSearchParams } {
    if (this.consumed) throw new Error('attempt-consumed');
    const url = new URL(callbackUrl);
    const redirect = new URL(this.redirect);
    if (url.origin !== redirect.origin || url.pathname !== redirect.pathname || url.hash ||
        url.username || url.password || [...url.searchParams.keys()].some(k => url.searchParams.getAll(k).length !== 1) ||
        !equal(url.searchParams.get('state') ?? '', this.state)) throw new Error('invalid-callback');
    this.consumed = true;
    if (url.searchParams.has('error')) throw new Error('authorization-denied');
    const client = url.searchParams.get('client_id') ?? this.previous?.clientId;
    const code = url.searchParams.get('code');
    if (!code || !client || !issued(client) || (this.previous && client !== this.previous.clientId)) throw new Error('registration-incomplete');
    this.exchangeClient = client;
    return { endpoint: TOKEN_ENDPOINT, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client,
      code, code_verifier: this.verifier, redirect_uri: this.redirect, resource: RESOURCE }) };
  }
  /** A verified identity is separate from inferred account eligibility. No inference is implemented here. */
  async accept(tokens: TokenResponse, verify: VerifyIdentity) {
    if (!this.exchangeClient || this.validated) throw new Error('exchange-required');
    let identity: VerifiedIdentity;
    try { identity = await verify(tokens.id_token); } catch { throw new Error('identity-invalid'); }
    if (!identity || identity.issuer !== 'https://auth.openai.com' || identity.audience !== this.exchangeClient ||
        typeof identity.nonce !== 'string' || !equal(identity.nonce, this.nonce) ||
        !Number.isSafeInteger(identity.expiresAt) || identity.expiresAt <= Date.now() ||
        typeof identity.subject !== 'string' || !identity.subject ||
        (this.previous && identity.subject !== this.previous.subject)) throw new Error('identity-invalid');
    this.validated = true;
    return { registration: { clientId: this.exchangeClient, subject: identity.subject },
      status: tokens.scope.split(/\s+/).includes('chatgpt.tokens.use.direct') ? 'permission-granted-eligibility-unverified' as const : 'plan-permission-required' as const };
  }
}
