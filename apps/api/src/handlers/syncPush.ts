/**
 * POST /v1/sync/push (backend spec §2, §4): a batch of record envelopes under
 * a mandatory Idempotency-Key. The Cognito authoriser has already verified
 * the token at the gateway; the sub claim is the user partition. Replays
 * return the originally stored response, and the conditional writes make the
 * record effects no-ops twice over.
 */
import {
  errorEnvelope,
  syncPushRequestSchema,
  syncPushResponseSchema
} from '@plainsight/api-contract';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2
} from 'aws-lambda';
import { TableSyncStore, type SyncStore } from '../db/syncStore.js';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';
import { idempotencyExpiry, runPush, type SyncDeps } from '../sync/core.js';

export function userIdOf(event: APIGatewayProxyEventV2WithJWTAuthorizer): string | undefined {
  const sub = event.requestContext.authorizer?.jwt?.claims?.['sub'];
  return typeof sub === 'string' && sub.length > 0 ? sub : undefined;
}

export function createSyncPushHandler(store: SyncStore, now: () => Date = () => new Date()) {
  const deps: SyncDeps = { store, now };
  return async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = requestIdOf(event);
    try {
      const userId = userIdOf(event);
      if (userId === undefined) {
        // The gateway rejects unauthenticated calls before they reach here;
        // this is the belt to that braces.
        return jsonResponse(
          401,
          errorEnvelope('unauthenticated', 'A signed-in session is required to sync.', requestId)
        );
      }

      const idempotencyKey = event.headers?.['idempotency-key'];
      if (idempotencyKey === undefined || idempotencyKey.length === 0) {
        return jsonResponse(
          400,
          errorEnvelope(
            'invalid_request',
            'The Idempotency-Key header is required on every push.',
            requestId
          )
        );
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(event.body ?? '');
      } catch {
        return jsonResponse(
          400,
          errorEnvelope('invalid_request', 'The push body must be JSON.', requestId)
        );
      }
      const request = syncPushRequestSchema.safeParse(parsedBody);
      if (!request.success) {
        return jsonResponse(
          400,
          errorEnvelope('invalid_request', 'The push body failed validation.', requestId, [
            { reason: 'schema', message: request.error.issues[0]?.message ?? 'invalid' }
          ])
        );
      }

      const replay = await store.getStoredResponse(idempotencyKey, userId);
      if (replay !== undefined) {
        logOutcome({ requestId, route: 'syncPush', outcome: 'replayed' });
        return jsonResponse(200, JSON.parse(replay));
      }

      const result = await runPush(deps, userId, request.data.records);
      // Self-check at the boundary: a response violating the contract is a
      // server defect and must fail here, not in a client.
      const body = syncPushResponseSchema.parse(result);
      await store.storeResponse(idempotencyKey, userId, JSON.stringify(body), idempotencyExpiry(now()));
      logOutcome({
        requestId,
        route: 'syncPush',
        outcome: 'ok',
        detail: `accepted ${body.accepted.length}, superseded ${body.superseded.length}`
      });
      return jsonResponse(200, body);
    } catch (error) {
      logOutcome({
        requestId,
        route: 'syncPush',
        outcome: 'internal_error',
        detail: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse(
        500,
        errorEnvelope('internal', 'Something went wrong applying this push.', requestId)
      );
    }
  };
}

let store: SyncStore | undefined;

/** Lambda entry point; the store is built lazily so tests can import this module without a table. */
export const handler = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyStructuredResultV2> => {
  store ??= TableSyncStore.fromEnv();
  return createSyncPushHandler(store)(event);
};
