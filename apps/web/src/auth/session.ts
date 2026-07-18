/**
 * The hosted-UI session (main plan §5: sync is an optional overlay; backend
 * spec §2: the Cognito token is what the authenticated routes check). Cognito
 * hosts the sign-in page, so no form of ours ever sees a credential; this
 * module only walks the code-and-PKCE handshake, keeps the tokens in the
 * device-local meta row the export allowlist can never reach, and refreshes
 * quietly. Signed out, nothing changes anywhere: the app's whole offline core
 * neither knows nor cares.
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

async function tokenCall(
  deps: AuthDeps,
  body: Record<string, string>
): Promise<TokenAnswer | undefined> {
  try {
    const response = await deps.fetchImpl(`${AUTH_CONFIG.hostedUiBase}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString()
    });
    if (!response.ok) return undefined;
    return (await response.json()) as TokenAnswer;
  } catch {
    return undefined;
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

  const answer = await tokenCall(deps, {
    grant_type: 'authorization_code',
    client_id: AUTH_CONFIG.clientId,
    code,
    code_verifier: handshake.verifier,
    redirect_uri: window.location.origin
  });
  if (
    answer?.id_token === undefined ||
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
 * The access token for an authenticated call, refreshed when it is about to
 * die. A failed refresh signs the device out quietly: sync is silent and
 * retried by design (main plan §5), and the settings row shows the state.
 */
export async function getAccessToken(deps: AuthDeps = defaultDeps()): Promise<string | null> {
  const session = await getMeta(db, 'authSession');
  if (session === undefined) return null;
  if (session.expiresAt - deps.now() > REFRESH_MARGIN_MS) return session.accessToken;

  const answer = await tokenCall(deps, {
    grant_type: 'refresh_token',
    client_id: AUTH_CONFIG.clientId,
    refresh_token: session.refreshToken
  });
  if (
    answer?.id_token === undefined ||
    answer.access_token === undefined ||
    answer.expires_in === undefined
  ) {
    await db.meta.delete('authSession');
    return null;
  }
  const refreshed: AuthSession = {
    ...session,
    idToken: answer.id_token,
    accessToken: answer.access_token,
    expiresAt: deps.now() + answer.expires_in * 1000,
    email: emailOfIdToken(answer.id_token)
  };
  await setMeta(db, 'authSession', refreshed);
  return refreshed.accessToken;
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
