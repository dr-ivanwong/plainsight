/**
 * GET /v1/sync/pull (backend spec §2, §4): the per-user feed above a
 * checkpoint, one page at a time; the returned checkpoint is the cursor, and
 * the server keeps a per-device copy. A positive checkpoint that predates the
 * tombstone purge watermark answers full_resync_required instead.
 */
import { errorEnvelope, syncPullResponseSchema } from '@plainsight/api-contract';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2
} from 'aws-lambda';
import { z } from 'zod';
import { TableSyncStore, type SyncStore } from '../db/syncStore.js';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';
import { runPull, type SyncDeps } from '../sync/core.js';
import { userIdOf } from './syncPush.js';

const querySchema = z.object({
  deviceId: z.string().min(1).max(64),
  checkpoint: z.coerce.number().int().nonnegative().default(0)
});

export function createSyncPullHandler(store: SyncStore, now: () => Date = () => new Date()) {
  const deps: SyncDeps = { store, now };
  return async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = requestIdOf(event);
    try {
      const userId = userIdOf(event);
      if (userId === undefined) {
        return jsonResponse(
          401,
          errorEnvelope('unauthenticated', 'A signed-in session is required to sync.', requestId)
        );
      }

      const query = querySchema.safeParse(event.queryStringParameters ?? {});
      if (!query.success) {
        return jsonResponse(
          400,
          errorEnvelope(
            'invalid_request',
            'A pull needs its deviceId and an optional non-negative checkpoint.',
            requestId
          )
        );
      }

      const result = await runPull(deps, userId, query.data.deviceId, query.data.checkpoint);
      const body = syncPullResponseSchema.parse(result);
      logOutcome({ requestId, route: 'syncPull', outcome: body.status });
      return jsonResponse(200, body);
    } catch (error) {
      logOutcome({
        requestId,
        route: 'syncPull',
        outcome: 'internal_error',
        detail: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse(
        500,
        errorEnvelope('internal', 'Something went wrong serving this pull.', requestId)
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
  return createSyncPullHandler(store)(event);
};
