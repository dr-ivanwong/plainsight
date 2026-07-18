/**
 * The BYOK proxy over a faked upstream (backend spec §7): registry-resolved
 * destinations, per-provider auth conventions, the header allowlist, and the
 * spec-mandated assertion that the proxy's log lines cannot contain the key.
 */
import { errorEnvelopeSchema } from '@plainsight/api-contract';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createByokProxyHandler,
  type UpstreamFetch
} from '../src/handlers/byokProxy.js';

const SECRET_KEY = 'sk-super-secret-do-not-log-9f2c';

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeUpstream(
  status = 200,
  responseBody = '{"ok":true}',
  contentType = 'application/json'
): { fetchImpl: UpstreamFetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: unknown, init: unknown) => {
    const request = init as { headers: Record<string, string>; body: unknown };
    calls.push({ url: String(url), headers: request.headers, body: request.body });
    return new Response(responseBody, {
      status,
      headers: { 'content-type': contentType }
    });
  }) as UpstreamFetch;
  return { fetchImpl, calls };
}

function proxyEvent(
  providerId: string | undefined,
  overrides: {
    headers?: Record<string, string>;
    body?: string;
    isBase64Encoded?: boolean;
    sub?: string | null;
  } = {}
): APIGatewayProxyEventV2WithJWTAuthorizer {
  const sub = overrides.sub === undefined ? 'user-1' : overrides.sub;
  return {
    pathParameters: providerId === undefined ? {} : { providerId },
    headers: overrides.headers ?? { 'x-provider-key': SECRET_KEY, 'content-type': 'application/json' },
    body: overrides.body ?? '{"model":"m","messages":[]}',
    isBase64Encoded: overrides.isBase64Encoded ?? false,
    requestContext: {
      requestId: 'req_test',
      ...(sub === null ? {} : { authorizer: { jwt: { claims: { sub } } } })
    }
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the proxy resolves destinations from the registry alone', () => {
  it('relays an anthropic call with the key in x-api-key', async () => {
    const { fetchImpl, calls } = fakeUpstream();
    const handler = createByokProxyHandler(fetchImpl);
    const response = await handler(proxyEvent('anthropic-haiku-4.5'));
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"ok":true}');
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]?.headers['x-api-key']).toBe(SECRET_KEY);
  });

  it('relays an openai-compatible call as a bearer', async () => {
    const { fetchImpl, calls } = fakeUpstream();
    const handler = createByokProxyHandler(fetchImpl);
    await handler(proxyEvent('groq-llama-3.3-70b'));
    expect(calls[0]?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(calls[0]?.headers['authorization']).toBe(`Bearer ${SECRET_KEY}`);
  });

  it('relays a gemini call to the model URL with x-goog-api-key', async () => {
    const { fetchImpl, calls } = fakeUpstream();
    const handler = createByokProxyHandler(fetchImpl);
    await handler(proxyEvent('gemini-2.5-flash'));
    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    );
    expect(calls[0]?.headers['x-goog-api-key']).toBe(SECRET_KEY);
  });

  it('forwards only the allowlisted headers, never the token or the key header', async () => {
    const { fetchImpl, calls } = fakeUpstream();
    const handler = createByokProxyHandler(fetchImpl);
    await handler(
      proxyEvent('anthropic-haiku-4.5', {
        headers: {
          'x-provider-key': SECRET_KEY,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          authorization: 'Bearer cognito-token',
          cookie: 'session=abc'
        }
      })
    );
    const headers = calls[0]?.headers ?? {};
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['content-type']).toBe('application/json');
    expect(Object.keys(headers)).not.toContain('authorization');
    expect(Object.keys(headers)).not.toContain('cookie');
    expect(Object.keys(headers)).not.toContain('x-provider-key');
  });

  it('decodes a base64 body before relaying', async () => {
    const { fetchImpl, calls } = fakeUpstream();
    const handler = createByokProxyHandler(fetchImpl);
    const raw = '{"model":"m"}';
    await handler(
      proxyEvent('groq-llama-3.3-70b', {
        body: Buffer.from(raw, 'utf8').toString('base64'),
        isBase64Encoded: true
      })
    );
    expect(calls[0]?.body).toBe(raw);
  });

  it('passes the upstream status and content type back verbatim', async () => {
    const { fetchImpl } = fakeUpstream(429, '{"error":"rate"}', 'application/json; charset=utf-8');
    const handler = createByokProxyHandler(fetchImpl);
    const response = await handler(proxyEvent('groq-llama-3.3-70b'));
    expect(response.statusCode).toBe(429);
    expect(response.headers?.['content-type']).toBe('application/json; charset=utf-8');
    expect(response.body).toBe('{"error":"rate"}');
  });
});

describe('the proxy refuses what the contract refuses', () => {
  it('unknown provider answers not_found: the registry is the allowlist', async () => {
    const handler = createByokProxyHandler(fakeUpstream().fetchImpl);
    const response = await handler(proxyEvent('evil-endpoint'));
    expect(response.statusCode).toBe(404);
    expect(errorEnvelopeSchema.parse(JSON.parse(response.body ?? '')).error.code).toBe('not_found');
  });

  it('a missing key answers invalid_request', async () => {
    const handler = createByokProxyHandler(fakeUpstream().fetchImpl);
    const response = await handler(
      proxyEvent('groq-llama-3.3-70b', { headers: { 'content-type': 'application/json' } })
    );
    expect(response.statusCode).toBe(400);
  });

  it('no claims answers unauthenticated', async () => {
    const handler = createByokProxyHandler(fakeUpstream().fetchImpl);
    const response = await handler(proxyEvent('groq-llama-3.3-70b', { sub: null }));
    expect(response.statusCode).toBe(401);
  });

  it('an unreachable provider answers the internal envelope, not a stack trace', async () => {
    const failing = (async () => {
      throw new Error(`connect ECONNREFUSED with ${SECRET_KEY} somewhere in the message`);
    }) as unknown as UpstreamFetch;
    const handler = createByokProxyHandler(failing);
    const response = await handler(proxyEvent('groq-llama-3.3-70b'));
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(SECRET_KEY);
  });
});

describe('the log discipline (backend spec §7: the key is never logged)', () => {
  it('no log line from any path contains the key', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { fetchImpl } = fakeUpstream(500, '{"error":"upstream"}');
    const handler = createByokProxyHandler(fetchImpl);
    await handler(proxyEvent('anthropic-haiku-4.5'));
    await handler(proxyEvent('evil-endpoint'));
    const failing = (async () => {
      throw new Error(`boom ${SECRET_KEY}`);
    }) as unknown as UpstreamFetch;
    await createByokProxyHandler(failing)(proxyEvent('groq-llama-3.3-70b'));
    for (const call of spy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(SECRET_KEY);
    }
    expect(spy.mock.calls.length).toBeGreaterThan(0);
  });
});
