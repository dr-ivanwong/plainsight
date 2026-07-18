/**
 * POST /v1/proxy/{providerId} (backend spec §7): the BYOK pass-through for
 * registry providers without browser CORS. Narrow by construction: the
 * upstream URL and auth-header convention resolve from the registry entry,
 * so nothing about the destination comes from the request; the caller's key
 * arrives in X-Provider-Key, is injected upstream, and is never stored and
 * never logged (a unit test holds the log lines to that). Cognito gates the
 * route at the gateway; there is no quota, because the key and the spend are
 * the caller's own, and no kill-switch read, because that flag guards only
 * the canonical pipeline's keys.
 */
import { errorEnvelope } from '@plainsight/api-contract';
import { proxyTargetFor, REGISTRY } from '@plainsight/extraction-core';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2
} from 'aws-lambda';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';
import { userIdOf } from './syncPush.js';

export const PROVIDER_KEY_HEADER = 'x-provider-key';

/**
 * The Lambda sits on a 25-second timeout (backend spec §10); the upstream
 * budget leaves room to answer with the envelope rather than a gateway 504.
 */
export const UPSTREAM_TIMEOUT_MS = 22_000;

/**
 * Request headers that pass through to the provider. An allowlist, never a
 * blanket copy: the caller's Authorization (the Cognito token) and the key
 * header itself must not travel upstream.
 */
const FORWARDED_HEADERS = ['content-type', 'accept', 'anthropic-version'] as const;

export type UpstreamFetch = typeof fetch;

export function createByokProxyHandler(fetchImpl: UpstreamFetch = fetch) {
  return async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = requestIdOf(event);
    try {
      const userId = userIdOf(event);
      if (userId === undefined) {
        return jsonResponse(
          401,
          errorEnvelope(
            'unauthenticated',
            'A signed-in session is required to use the proxy.',
            requestId
          )
        );
      }

      const providerId = event.pathParameters?.['providerId'];
      const entry = REGISTRY.find((candidate) => candidate.id === providerId);
      if (entry === undefined) {
        return jsonResponse(
          404,
          errorEnvelope('not_found', 'No such provider rung in the registry.', requestId)
        );
      }

      const key = event.headers?.[PROVIDER_KEY_HEADER];
      if (key === undefined || key.length === 0) {
        return jsonResponse(
          400,
          errorEnvelope(
            'invalid_request',
            'The X-Provider-Key header is required: the proxy relays your key, it never holds one.',
            requestId
          )
        );
      }

      const body = event.isBase64Encoded
        ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
        : (event.body ?? '');

      const target = proxyTargetFor(entry);
      const headers: Record<string, string> = {
        [target.authHeaderName]: target.authHeaderValue(key)
      };
      for (const name of FORWARDED_HEADERS) {
        const value = event.headers?.[name];
        if (value !== undefined) headers[name] = value;
      }

      let upstream: Response;
      try {
        upstream = await fetchImpl(target.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
        });
      } catch {
        // Never rethrow here: a network error's message can carry request
        // detail, and the log discipline is provider id and outcome only.
        logOutcome({
          requestId,
          route: 'byokProxy',
          outcome: 'upstream_unreachable',
          detail: entry.id
        });
        return jsonResponse(
          500,
          errorEnvelope(
            'internal',
            'The provider did not answer inside the proxy budget.',
            requestId
          )
        );
      }

      const text = await upstream.text();
      logOutcome({
        requestId,
        route: 'byokProxy',
        outcome: 'proxied',
        detail: `${entry.id} answered ${upstream.status}`
      });
      return {
        statusCode: upstream.status,
        headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
        body: text
      };
    } catch (error) {
      logOutcome({
        requestId,
        route: 'byokProxy',
        outcome: 'internal_error',
        detail: error instanceof Error ? error.name : 'unknown'
      });
      return jsonResponse(
        500,
        errorEnvelope('internal', 'Something went wrong relaying this request.', requestId)
      );
    }
  };
}

/** Lambda entry point. */
export const handler = createByokProxyHandler();
