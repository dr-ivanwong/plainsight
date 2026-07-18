/**
 * GET /v1/extractions/{jobId} (backend spec §6): the job as it stands, in
 * the wire shape the review screen mirrors. Somebody else's job answers
 * permission_denied; a vanished one (30-day TTL) answers not_found.
 */
import { errorEnvelope } from '@plainsight/api-contract';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2
} from 'aws-lambda';
import { TableJobStore, type JobStore } from '../db/jobStore.js';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';
import { wireJobOf } from './createExtraction.js';
import { userIdOf } from './syncPush.js';

export function createGetExtractionHandler(jobs: JobStore) {
  return async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = requestIdOf(event);
    try {
      const userId = userIdOf(event);
      if (userId === undefined) {
        return jsonResponse(
          401,
          errorEnvelope('unauthenticated', 'A signed-in session is required.', requestId)
        );
      }
      const jobId = event.pathParameters?.['jobId'];
      if (jobId === undefined || jobId.length === 0) {
        return jsonResponse(
          400,
          errorEnvelope('invalid_request', 'A job id is required.', requestId)
        );
      }
      const job = await jobs.getJob(jobId);
      if (job === undefined) {
        return jsonResponse(404, errorEnvelope('not_found', 'No such job.', requestId));
      }
      if (job.userId !== userId) {
        return jsonResponse(
          403,
          errorEnvelope('permission_denied', 'That job belongs to another user.', requestId)
        );
      }
      logOutcome({ requestId, route: 'getExtraction', outcome: job.state });
      return jsonResponse(200, wireJobOf(job));
    } catch (error) {
      logOutcome({
        requestId,
        route: 'getExtraction',
        outcome: 'internal_error',
        detail: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse(
        500,
        errorEnvelope('internal', 'Something went wrong serving this job.', requestId)
      );
    }
  };
}

let store: JobStore | undefined;

/** Lambda entry point. */
export const handler = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyStructuredResultV2> => {
  store ??= TableJobStore.fromEnv();
  return createGetExtractionHandler(store)(event);
};
