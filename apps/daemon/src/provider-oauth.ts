import { createHash, randomBytes } from 'node:crypto';

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface PendingAuthState {
  providerId: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  codeVerifier: string;
  scope?: string;
  createdAt: number;
}

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function generateCodeVerifier(): string {
  return base64url(randomBytes(64));
}

export function deriveCodeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

export function generateState(): string {
  return base64url(randomBytes(32));
}

export interface AuthorizeUrlInput {
  authServer: AuthorizationServerMetadata;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
}

export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const url = new URL(input.authServer.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (input.scope) url.searchParams.set('scope', input.scope);
  return url.toString();
}

export interface ExchangeCodeInput {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export async function exchangeCodeForToken(
  input: ExchangeCodeInput,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const form = new URLSearchParams();
  form.set('grant_type', 'authorization_code');
  form.set('code', input.code);
  form.set('redirect_uri', input.redirectUri);
  form.set('client_id', input.clientId);
  form.set('code_verifier', input.codeVerifier);
  return tokenRequest(input.tokenEndpoint, form, input.clientSecret, fetchImpl);
}

export interface RefreshTokenInput {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  scope?: string;
}

export async function refreshAccessToken(
  input: RefreshTokenInput,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const form = new URLSearchParams();
  form.set('grant_type', 'refresh_token');
  form.set('refresh_token', input.refreshToken);
  form.set('client_id', input.clientId);
  if (input.scope) form.set('scope', input.scope);
  return tokenRequest(input.tokenEndpoint, form, input.clientSecret, fetchImpl);
}

async function tokenRequest(
  tokenEndpoint: string,
  form: URLSearchParams,
  clientSecret: string | undefined,
  fetchImpl: typeof fetch,
): Promise<OAuthTokenResponse> {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (clientSecret) {
    const basic = Buffer.from(`${form.get('client_id')}:${clientSecret}`).toString('base64');
    headers.authorization = `Basic ${basic}`;
  }
  const response = await fetchImpl(tokenEndpoint, {
    method: 'POST',
    headers,
    body: form.toString(),
  });
  if (!response.ok) {
    const details = await safeText(response);
    throw new Error(
      `token endpoint rejected request: HTTP ${response.status} ${response.statusText} ${details}`,
    );
  }
  const token = (await response.json()) as OAuthTokenResponse;
  if (!token.access_token) throw new Error('token endpoint response missing access_token');
  return token;
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

export class PendingAuthCache {
  private store = new Map<string, PendingAuthState>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ttlMs: number = 10 * 60 * 1000) {}

  put(state: string, value: PendingAuthState): void {
    this.store.set(state, value);
    this.startSweeper();
  }

  consume(state: string): PendingAuthState | null {
    const value = this.store.get(state);
    if (!value) return null;
    this.store.delete(state);
    if (Date.now() - value.createdAt > this.ttlMs) return null;
    return value;
  }

  size(): number {
    return this.store.size;
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private startSweeper(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweep(), Math.min(this.ttlMs, 60_000));
    if (typeof this.timer === 'object' && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [state, value] of this.store) {
      if (now - value.createdAt > this.ttlMs) this.store.delete(state);
    }
    if (this.store.size === 0) this.stop();
  }
}
