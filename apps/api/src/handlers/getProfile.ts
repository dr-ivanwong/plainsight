/**
 * GET /v1/companies/{ticker} (backend spec §2): the company profile, or a
 * not_found envelope. The cold-ticker 202 belongs to the financials route
 * alone (spec §5); a profile appears once ingestion has completed.
 */
import { errorEnvelope } from '@plainsight/api-contract';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { TableReadStore, type FinancialsReadStore } from '../db/table.js';
import { parseTicker } from '../http/params.js';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';

export function createProfileHandler(store: FinancialsReadStore) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = requestIdOf(event);
    try {
      const ticker = parseTicker(event.pathParameters?.['ticker']);
      if (!ticker.ok) {
        return jsonResponse(400, errorEnvelope('invalid_request', ticker.message, requestId));
      }
      const profile = await store.getProfile(ticker.value);
      if (profile === undefined) {
        return jsonResponse(
          404,
          errorEnvelope(
            'not_found',
            'No profile for this ticker yet; requesting its financials starts ingestion.',
            requestId
          )
        );
      }
      logOutcome({ requestId, route: 'getProfile', outcome: 'ok' });
      return jsonResponse(200, profile);
    } catch (error) {
      logOutcome({
        requestId,
        route: 'getProfile',
        outcome: 'internal_error',
        detail: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse(
        500,
        errorEnvelope('internal', 'Something went wrong serving this profile.', requestId)
      );
    }
  };
}

let store: FinancialsReadStore | undefined;

/** Lambda entry point; the store is built lazily so tests can import this module without a table. */
export const handler = (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  store ??= TableReadStore.fromEnv();
  return createProfileHandler(store)(event);
};
