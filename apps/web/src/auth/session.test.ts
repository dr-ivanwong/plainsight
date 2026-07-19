// @vitest-environment jsdom

// The hosted-UI session walk (backend spec section 2: the token the
// authenticated routes check), against a faked token endpoint: the PKCE
// handshake, the state check, quiet refresh, and sign-out.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

import { db, getMeta, setMeta } from '../db';
import { challengeOf, randomUrlSafe } from './pkce';
import {
  AUTH_CONFIG,
  beginSignIn,
  completeSignIn,
  emailOfIdToken,
  getAccessToken,
  signOut,
  type AuthDeps
} from './session';

const T0 = 1_752_800_000_000;

/** An unsigned token whose payload carries the given claims; display only. */
const tokenWith = (claims: Record<string, unknown>): string =>
  `x.${btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.y`;

function fakeTokenEndpoint(
  answer: Record<string, unknown> | 'refuse' | 'unreachable' | 'server_error'
): { deps: AuthDeps; calls: Array<Record<string, string>> } {
  const calls: Array<Record<string, string>> = [];
  const deps: AuthDeps = {
    fetchImpl: (async (url: unknown, init: unknown) => {
      expect(String(url)).toBe(`${AUTH_CONFIG.hostedUiBase}/oauth2/token`);
      const body = (init as { body: string }).body;
      calls.push(Object.fromEntries(new URLSearchParams(body).entries()));
      if (answer === 'unreachable') throw new TypeError('Failed to fetch');
      if (answer === 'server_error') return new Response('a bad moment', { status: 500 });
      if (answer === 'refuse') {
        return new Response('{"error":"invalid_grant"}', { status: 400 });
      }
      return new Response(JSON.stringify(answer), { status: 200 });
    }) as unknown as typeof fetch,
    navigate: () => undefined,
    now: () => T0
  };
  return { deps, calls };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  sessionStorage.clear();
});

describe('pkce', () => {
  it("matches the RFC's own S256 vector", async () => {
    await expect(challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    );
  });

  it('mints URL-safe randomness of the asked size', () => {
    const value = randomUrlSafe(32);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(value.length).toBeGreaterThanOrEqual(43);
  });
});

describe('the handshake', () => {
  it('leaves for the hosted UI carrying the challenge, then finishes and stores the session', async () => {
    let sentTo = '';
    await beginSignIn({
      fetchImpl: fetch,
      navigate: (url) => {
        sentTo = url;
      },
      now: () => T0
    });
    const authorize = new URL(sentTo);
    expect(authorize.origin).toBe(AUTH_CONFIG.hostedUiBase);
    expect(authorize.searchParams.get('client_id')).toBe(AUTH_CONFIG.clientId);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const state = authorize.searchParams.get('state');
    expect(state).not.toBeNull();

    const { deps, calls } = fakeTokenEndpoint({
      id_token: tokenWith({ email: 'owner@example.com' }),
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_in: 3600
    });
    const outcome = await completeSignIn(`?code=abc&state=${state}`, deps);
    expect(outcome).toBe('signed_in');
    expect(calls[0]).toMatchObject({ grant_type: 'authorization_code', code: 'abc' });
    expect(calls[0]?.['code_verifier']).toBeDefined();

    const session = await getMeta(db, 'authSession');
    expect(session).toMatchObject({
      accessToken: 'access-1',
      email: 'owner@example.com',
      expiresAt: T0 + 3600 * 1000
    });
  });

  it('is not a callback without the params, and fails on a foreign state', async () => {
    const { deps, calls } = fakeTokenEndpoint('refuse');
    await expect(completeSignIn('?upload=1', deps)).resolves.toBe('not_a_callback');

    sessionStorage.setItem(
      'plainsight-auth-handshake',
      JSON.stringify({ verifier: 'v', state: 'expected' })
    );
    await expect(completeSignIn('?code=abc&state=forged', deps)).resolves.toBe('failed');
    expect(calls).toHaveLength(0);
    expect(await getMeta(db, 'authSession')).toBeUndefined();
  });

  it('an unreachable exchange fails the callback without minting a session', async () => {
    sessionStorage.setItem(
      'plainsight-auth-handshake',
      JSON.stringify({ verifier: 'v', state: 's' })
    );
    const { deps } = fakeTokenEndpoint('unreachable');
    await expect(completeSignIn('?code=abc&state=s', deps)).resolves.toBe('failed');
    expect(await getMeta(db, 'authSession')).toBeUndefined();
  });

  it('reads the email claim tolerantly', () => {
    expect(emailOfIdToken(tokenWith({ email: 'a@b.c' }))).toBe('a@b.c');
    expect(emailOfIdToken('garbage')).toBe('');
  });
});

describe('the access token', () => {
  const seeded = {
    idToken: tokenWith({ email: 'owner@example.com' }),
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: T0 + 30 * 60 * 1000,
    email: 'owner@example.com'
  };

  it('serves a live token without a network call', async () => {
    await setMeta(db, 'authSession', seeded);
    const { deps, calls } = fakeTokenEndpoint('refuse');
    await expect(getAccessToken(deps)).resolves.toEqual({
      status: 'token',
      accessToken: 'access-1'
    });
    expect(calls).toHaveLength(0);
  });

  it('refreshes a dying token quietly', async () => {
    await setMeta(db, 'authSession', { ...seeded, expiresAt: T0 + 30_000 });
    const { deps, calls } = fakeTokenEndpoint({
      id_token: tokenWith({ email: 'owner@example.com' }),
      access_token: 'access-2',
      expires_in: 3600
    });
    await expect(getAccessToken(deps)).resolves.toEqual({
      status: 'token',
      accessToken: 'access-2'
    });
    expect(calls[0]).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'refresh-1' });
    const session = await getMeta(db, 'authSession');
    expect(session?.expiresAt).toBe(T0 + 3600 * 1000);
    // The refresh token itself carries forward.
    expect(session?.refreshToken).toBe('refresh-1');
  });

  it('a refused refresh signs the device out quietly', async () => {
    await setMeta(db, 'authSession', { ...seeded, expiresAt: T0 - 1 });
    const { deps } = fakeTokenEndpoint('refuse');
    await expect(getAccessToken(deps)).resolves.toEqual({ status: 'signed_out' });
    expect(await getMeta(db, 'authSession')).toBeUndefined();
  });

  it('an unreachable endpoint keeps the session and reports unavailable', async () => {
    await setMeta(db, 'authSession', { ...seeded, expiresAt: T0 - 1 });
    const { deps } = fakeTokenEndpoint('unreachable');
    await expect(getAccessToken(deps)).resolves.toEqual({ status: 'unavailable' });
    // The grant was never judged; a captive portal must not sign the device out.
    expect(await getMeta(db, 'authSession')).toMatchObject({ refreshToken: 'refresh-1' });
  });

  it('a token-endpoint outage is a moment, not a verdict', async () => {
    await setMeta(db, 'authSession', { ...seeded, expiresAt: T0 - 1 });
    const { deps } = fakeTokenEndpoint('server_error');
    await expect(getAccessToken(deps)).resolves.toEqual({ status: 'unavailable' });
    expect(await getMeta(db, 'authSession')).toMatchObject({ refreshToken: 'refresh-1' });
  });

  it('answers signed out when nobody is signed in', async () => {
    const { deps, calls } = fakeTokenEndpoint('refuse');
    await expect(getAccessToken(deps)).resolves.toEqual({ status: 'signed_out' });
    expect(calls).toHaveLength(0);
  });
});

describe('sign out', () => {
  it('drops the session and leaves for the hosted logout', async () => {
    await setMeta(db, 'authSession', {
      idToken: tokenWith({ email: 'owner@example.com' }),
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: T0 + 1000,
      email: 'owner@example.com'
    });
    let sentTo = '';
    await signOut({
      fetchImpl: fetch,
      navigate: (url) => {
        sentTo = url;
      },
      now: () => T0
    });
    expect(await getMeta(db, 'authSession')).toBeUndefined();
    expect(sentTo).toContain(`${AUTH_CONFIG.hostedUiBase}/logout`);
    expect(sentTo).toContain('logout_uri=');
  });
});
