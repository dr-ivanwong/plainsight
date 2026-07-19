/**
 * The hosted-UI session (main plan §12.9: the backend is the source of truth,
 * so the session is what durable use rides on; backend spec §2: the Cognito
 * token is what the authenticated routes check). Cognito hosts the sign-in
 * page, so no form of ours ever sees a credential; this module only walks the
 * code-and-PKCE handshake, keeps the tokens in the device-local meta row the
 * export allowlist can never reach, and refreshes quietly. Only the endpoint
 * itself refusing a grant ends the session: an unreachable endpoint is a
 * moment, not a verdict, and must never sign the device out.
 */
import { db, getMeta, setMeta, type MetaValue } from '../db';
import { challengeOf, randomUrlSafe } from './pkce';

/**
 * Public facts of the deployed pool (the Auth stack's outputs, recorded
 * 2026-07-18); a client id is not a secret. The redirect is the running
 * origin, which is how one build serves prod and the dev server: both are
 * registered callbacks on the web client.
 */
export const AUTH_CONFIG = {
  hostedUiBase: 'https://plainsight-prod-679345828813.auth.ap-southeast-2.amazoncognito.com',
  clientId: 'hds150ljmm87319s3507cdarg'
} as const;

export type AuthSession = MetaValue<'authSession'>;

const HANDSHAKE_STORAGE_KEY = 'plainsight-auth-handshake';
/** Refresh when this close to expiry, so a request never rides a dying token. */
const REFRESH_MARGIN_MS = 60 * 1000;

export interface AuthDeps {
  fetchImpl: typeof fetch;
  /** Full-page navigation; the hosted UI is a different origin. */
  navigate(url: string): void;
  now(): number;
}

const defaultDeps = (): AuthDeps => ({
  fetchImpl: (input, init) => fetch(input, init),
  navigate: (url) => window.location.assign(url),
  now: () => Date.now()
});

/** The email claim, read for display only; the server verifies signatures. */
export function emailOfIdToken(idToken: string): string {
  const payload = idToken.split('.')[1];
  if (payload === undefined) return '';
  try {
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    ) as Record<string, unknown>;
    return typeof decoded['email'] === 'string' ? decoded['email'] : '';
  } catch {
    return '';
  }
}

/** Starts the handshake: remembers the verifier and state, leaves for the hosted UI. */
export async function beginSignIn(deps: AuthDeps = defaultDeps()): Promise<void> {
  const verifier = randomUrlSafe(32);
  const state = randomUrlSafe(16);
  sessionStorage.setItem(HANDSHAKE_STORAGE_KEY, JSON.stringify({ verifier, state }));
  const query = new URLSearchParams({
    client_id: AUTH_CONFIG.clientId,
    response_type: 'code',
    scope: 'openid email',
    redirect_uri: window.location.origin,
    state,
    code_challenge: await challengeOf(verifier),
    code_challenge_method: 'S256'
  });
  deps.navigate(`${AUTH_CONFIG.hostedUiBase}/oauth2/authorize?${query.toString()}`);
}

interface TokenAnswer {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

type TokenCallResult =
  | { kind: 'answered'; answer: TokenAnswer }
  | { kind: 'refused' }
  | { kind: 'unreachable' };

/**
 * One POST to the token endpoint, its failures told apart because they mean
 * different things: a 4xx answer is the endpoint judging the grant dead
 * (retrying cannot revive it), while a thrown fetch, a 5xx, or a 429 says
 * nothing about the grant at all. A captive portal at refresh time therefore
 * reads as 'unreachable', never as a refusal.
 */
async function tokenCall(deps: AuthDeps, body: Record<string, string>): Promise<TokenCallResult> {
  let response: Response;
  try {
    response = await deps.fetchImpl(`${AUTH_CONFIG.hostedUiBase}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString()
    });
  } catch {
    return { kind: 'unreachable' };
  }
  if (response.status >= 500 || response.status === 429) return { kind: 'unreachable' };
  if (!response.ok) return { kind: 'refused' };
  try {
    return { kind: 'answered', answer: (await response.json()) as TokenAnswer };
  } catch {
    // A success status with an unreadable body is a mangled response (a
    // proxy, a portal), not a judgement on the grant.
    return { kind: 'unreachable' };
  }
}

export type CallbackOutcome = 'signed_in' | 'not_a_callback' | 'failed';

/**
 * Finishes the handshake when the URL carries the hosted UI's answer. The
 * state must match the one this device minted; the verifier proves the code
 * exchange belongs to the same start.
 */
export async function completeSignIn(
  search: string,
  deps: AuthDeps = defaultDeps()
): Promise<CallbackOutcome> {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const state = params.get('state');
  if (code === null || state === null) return 'not_a_callback';

  const rawHandshake = sessionStorage.getItem(HANDSHAKE_STORAGE_KEY);
  sessionStorage.removeItem(HANDSHAKE_STORAGE_KEY);
  if (rawHandshake === null) return 'failed';
  let handshake: { verifier: string; state: string };
  try {
    handshake = JSON.parse(rawHandshake) as { verifier: string; state: string };
  } catch {
    return 'failed';
  }
  if (handshake.state !== state) return 'failed';

  const result = await tokenCall(deps, {
    grant_type: 'authorization_code',
    client_id: AUTH_CONFIG.clientId,
    code,
    code_verifier: handshake.verifier,
    redirect_uri: window.location.origin
  });
  if (result.kind !== 'answered') return 'failed';
  const answer = result.answer;
  if (
    answer.id_token === undefined ||
    answer.access_token === undefined ||
    answer.refresh_token === undefined ||
    answer.expires_in === undefined
  ) {
    return 'failed';
  }

  await setMeta(db, 'authSession', {
    idToken: answer.id_token,
    accessToken: answer.access_token,
    refreshToken: answer.refresh_token,
    expiresAt: deps.now() + answer.expires_in * 1000,
    email: emailOfIdToken(answer.id_token)
  });
  return 'signed_in';
}

/**
 * The three-way answer of a token ask. 'unavailable' keeps the session: the
 * endpoint could not be reached (or had a server-side moment), so nothing was
 * learnt about the grant and the caller's retry cadence owns the wait. Only a
 * definitive refusal, or no session at all, answers signed_out.
 */
export type AccessTokenAnswer =
  | { status: 'token'; accessToken: string }
  | { status: 'signed_out' }
  | { status: 'unavailable' };

/**
 * The access token for an authenticated call, refreshed when it is about to
 * die. Only the endpoint refusing the refresh signs the device out; an
 * unreachable endpoint keeps the session and answers 'unavailable', so the
 * sync run fails into the scheduler's backoff and the retry-until-accepted
 * obligation (main plan §12.9) survives a network blip at refresh time. The
 * settings row shows whichever state results.
 */
export async function getAccessToken(deps: AuthDeps = defaultDeps()): Promise<AccessTokenAnswer> {
  const session = await getMeta(db, 'authSession');
  if (session === undefined) return { status: 'signed_out' };
  if (session.expiresAt - deps.now() > REFRESH_MARGIN_MS) {
    return { status: 'token', accessToken: session.accessToken };
  }

  const result = await tokenCall(deps, {
    grant_type: 'refresh_token',
    client_id: AUTH_CONFIG.clientId,
    refresh_token: session.refreshToken
  });
  if (result.kind === 'unreachable') return { status: 'unavailable' };
  if (
    result.kind === 'refused' ||
    result.answer.id_token === undefined ||
    result.answer.access_token === undefined ||
    result.answer.expires_in === undefined
  ) {
    await db.meta.delete('authSession');
    return { status: 'signed_out' };
  }
  const refreshed: AuthSession = {
    ...session,
    idToken: result.answer.id_token,
    accessToken: result.answer.access_token,
    expiresAt: deps.now() + result.answer.expires_in * 1000,
    email: emailOfIdToken(result.answer.id_token)
  };
  await setMeta(db, 'authSession', refreshed);
  return { status: 'token', accessToken: refreshed.accessToken };
}

/** Drops the local session and lets the hosted UI end its own. */
export async function signOut(deps: AuthDeps = defaultDeps()): Promise<void> {
  await db.meta.delete('authSession');
  const query = new URLSearchParams({
    client_id: AUTH_CONFIG.clientId,
    logout_uri: window.location.origin
  });
  deps.navigate(`${AUTH_CONFIG.hostedUiBase}/logout?${query.toString()}`);
}
