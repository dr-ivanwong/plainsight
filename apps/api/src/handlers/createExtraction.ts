/**
 * POST /v1/extractions (backend spec §6): starts a job for an uploaded
 * filing. The controls run in order: the caller owns the object, the kill
 * switch is up, the bytes look like a PDF inside the ceiling, and the
 * monthly server-key quota has room. Then the job lands queued and the
 * worker fires asynchronously; the response is the job, and a replay under
 * the same Idempotency-Key returns it verbatim.
 */
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  createExtractionRequestSchema,
  errorEnvelope,
  extractionJobSchema,
  UPLOAD_MAX_BYTES
} from '@plainsight/api-contract';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2
} from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { MONTHLY_JOB_QUOTA, TableJobStore, type JobStore, type StoredJob } from '../db/jobStore.js';
import { jsonResponse, logOutcome, requestIdOf } from '../http/respond.js';
import { idempotencyExpiry } from '../sync/core.js';
import { extractionEnabled } from './extractFiling.js';
import { userIdOf } from './syncPush.js';

export const JOB_TTL_SECONDS = 30 * 24 * 60 * 60;
const PDF_MAGIC = '%PDF-';

export interface CreateExtractionDeps {
  jobs: JobStore;
  /** Undefined when the object does not exist. */
  headObject(objectKey: string): Promise<{ sizeBytes: number } | undefined>;
  /** The first bytes, for the magic check. */
  readMagic(objectKey: string): Promise<Uint8Array>;
  /** Fires the worker asynchronously; absent wiring throws. */
  fireWorker(jobId: string): Promise<void>;
  extractionEnabled(): Promise<boolean>;
  now(): Date;
  newId(): string;
}

/** The wire view of a stored job: the internals stay behind the boundary. */
export function wireJobOf(job: StoredJob): unknown {
  const { userId, objectKey, ...wire } = job;
  void userId;
  void objectKey;
  return extractionJobSchema.parse(wire);
}

const firstOfNextMonth = (now: Date): string => {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
};

export function createExtractionHandler(deps: CreateExtractionDeps) {
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
            'A signed-in session is required to start an extraction.',
            requestId
          )
        );
      }

      const idempotencyKey = event.headers?.['idempotency-key'];
      if (idempotencyKey === undefined || idempotencyKey.length === 0) {
        return jsonResponse(
          400,
          errorEnvelope(
            'invalid_request',
            'The Idempotency-Key header is required when starting an extraction.',
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
          errorEnvelope('invalid_request', 'The extraction request must be JSON.', requestId)
        );
      }
      const request = createExtractionRequestSchema.safeParse(parsedBody);
      if (!request.success) {
        return jsonResponse(
          400,
          errorEnvelope('invalid_request', 'The extraction request failed validation.', requestId)
        );
      }

      const replay = await deps.jobs.getStoredResponse(idempotencyKey, userId);
      if (replay !== undefined) {
        logOutcome({ requestId, route: 'createExtraction', outcome: 'replayed' });
        return jsonResponse(200, JSON.parse(replay));
      }

      // The object must live under the caller's own prefix: the key is the
      // authorisation, and nobody extracts somebody else's upload.
      const { objectKey } = request.data;
      if (!objectKey.startsWith(`uploads/${userId}/`)) {
        return jsonResponse(
          403,
          errorEnvelope('permission_denied', 'That upload belongs to another prefix.', requestId)
        );
      }

      if (!(await deps.extractionEnabled())) {
        logOutcome({ requestId, route: 'createExtraction', outcome: 'feature_disabled' });
        return jsonResponse(
          503,
          errorEnvelope(
            'feature_disabled',
            'Extraction is temporarily disabled at the budget kill switch.',
            requestId
          )
        );
      }

      const head = await deps.headObject(objectKey);
      if (head === undefined) {
        return jsonResponse(
          404,
          errorEnvelope('not_found', 'No such upload; presign and PUT it first.', requestId)
        );
      }
      if (head.sizeBytes > UPLOAD_MAX_BYTES) {
        return jsonResponse(
          400,
          errorEnvelope('invalid_request', 'The upload is larger than the 50 MB ceiling.', requestId)
        );
      }
      const magic = await deps.readMagic(objectKey);
      const prefix = new TextDecoder().decode(magic.slice(0, PDF_MAGIC.length));
      if (prefix !== PDF_MAGIC) {
        return jsonResponse(
          400,
          errorEnvelope(
            'invalid_request',
            'Only PDF uploads extract for now; spreadsheets are on the roadmap.',
            requestId
          )
        );
      }

      const now = deps.now();
      const month = now.toISOString().slice(0, 7);
      const withinQuota = await deps.jobs.tryConsumeQuota(userId, month, MONTHLY_JOB_QUOTA);
      if (!withinQuota) {
        logOutcome({ requestId, route: 'createExtraction', outcome: 'quota_exhausted' });
        return jsonResponse(
          429,
          errorEnvelope('resource_exhausted', 'Monthly extraction quota reached.', requestId, [
            { reason: 'quota', limit: MONTHLY_JOB_QUOTA, resetsAt: firstOfNextMonth(now) }
          ])
        );
      }

      const job: StoredJob = {
        jobId: deps.newId(),
        state: 'queued',
        createdAt: now.toISOString(),
        confidential: request.data.confidential ?? false,
        attempts: [],
        userId,
        objectKey
      };
      await deps.jobs.createJob(job, Math.floor(now.getTime() / 1000) + JOB_TTL_SECONDS);
      try {
        await deps.fireWorker(job.jobId);
      } catch {
        // The job must not sit queued forever with nobody coming: name the
        // failure so the reviewer sees it instead of a spinner.
        await deps.jobs.patchJob(job.jobId, {
          state: 'failed',
          failure: { detail: 'The extraction worker did not start; try again.', nextRung: null }
        });
        job.state = 'failed';
        job.failure = { detail: 'The extraction worker did not start; try again.', nextRung: null };
      }

      const body = wireJobOf(job);
      await deps.jobs.storeResponse(
        idempotencyKey,
        userId,
        JSON.stringify(body),
        idempotencyExpiry(now)
      );
      logOutcome({ requestId, route: 'createExtraction', outcome: job.state });
      return jsonResponse(200, body);
    } catch (error) {
      logOutcome({
        requestId,
        route: 'createExtraction',
        outcome: 'internal_error',
        detail: error instanceof Error ? error.message : String(error)
      });
      return jsonResponse(
        500,
        errorEnvelope('internal', 'Something went wrong starting this extraction.', requestId)
      );
    }
  };
}

let deps: CreateExtractionDeps | undefined;

function buildDeps(): CreateExtractionDeps {
  const bucket = process.env['UPLOADS_BUCKET'];
  if (!bucket) throw new Error('UPLOADS_BUCKET is not set');
  const s3 = new S3Client({});
  const workerName = process.env['EXTRACT_FUNCTION_NAME'];
  const lambda = new LambdaClient({});
  return {
    jobs: TableJobStore.fromEnv(),
    headObject: async (objectKey) => {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
        return { sizeBytes: head.ContentLength ?? 0 };
      } catch {
        return undefined;
      }
    },
    readMagic: async (objectKey) => {
      const object = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey, Range: 'bytes=0-7' })
      );
      return object.Body === undefined
        ? new Uint8Array()
        : new Uint8Array(await object.Body.transformToByteArray());
    },
    fireWorker: async (jobId) => {
      if (workerName === undefined || workerName.length === 0) {
        throw new Error('no extraction worker is configured');
      }
      await lambda.send(
        new InvokeCommand({
          FunctionName: workerName,
          InvocationType: 'Event',
          Payload: JSON.stringify({ uploadJobId: jobId })
        })
      );
    },
    extractionEnabled: () => extractionEnabled(),
    now: () => new Date(),
    newId: randomUUID
  };
}

/** Lambda entry point. */
export const handler = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyStructuredResultV2> => {
  deps ??= buildDeps();
  return createExtractionHandler(deps)(event);
};
