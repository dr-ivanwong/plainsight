/**
 * GET /v1/pairs/artefacts/pair-scan (integration plan §4; backend spec §2
 * route table as amended 2026-07-22): the latest report in full plus the
 * run history, for the Pairs surfaces. Read-only over what the engine
 * published; an empty sleeve is a 200 with a null latest, never an error.
 */
import {
  errorEnvelope,
  pairsArtefactCollectionSchema,
  pairScanReportSchema,
  type PairScanReport
} from '@plainsight/api-contract';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2
} from 'aws-lambda';
import { TablePairsStore, type PairsArtefactStore } from '../db/pairsStore.js';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';
import { userIdOf } from './syncPush.js';

export function createGetPairsArtefactHandler(store: PairsArtefactStore) {
  return async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = requestIdOf(event);
    try {
      if (userIdOf(event) === undefined) {
        return jsonResponse(
          401,
          errorEnvelope('unauthenticated', 'A signed-in session is required to read the sleeve.', requestId)
        );
      }
      const history = await store.listRuns();
      const latestRun = history[0];
      let latest: PairScanReport | null = null;
      if (latestRun !== undefined) {
        const raw = await store.getReport(latestRun.runDate);
        const parsed = pairScanReportSchema.safeParse(raw);
        if (!parsed.success) {
          // A stored object that no longer parses is server state gone
          // wrong, not a client mistake: surface it as internal so the
          // operator re-publishes rather than the app rendering a hole.
          logOutcome({ requestId, route: 'getPairsArtefact', outcome: 'corrupt', detail: latestRun.runDate });
          return jsonResponse(
            500,
            errorEnvelope('internal', 'The stored artefact failed validation; re-publish the run.', requestId)
          );
        }
        latest = parsed.data;
      }
      logOutcome({ requestId, route: 'getPairsArtefact', outcome: 'served', detail: latest?.runDate ?? 'empty' });
      return jsonResponse(200, pairsArtefactCollectionSchema.parse({ latest, history }));
    } catch (error) {
      logOutcome({
        requestId,
        route: 'getPairsArtefact',
        outcome: 'error',
        detail: error instanceof Error ? error.message : 'unknown'
      });
      return jsonResponse(
        500,
        errorEnvelope('internal', 'The sleeve could not be read.', requestId)
      );
    }
  };
}

let store: PairsArtefactStore | undefined;

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyStructuredResultV2> {
  store ??= TablePairsStore.fromEnv();
  return createGetPairsArtefactHandler(store)(event);
}
