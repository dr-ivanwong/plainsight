/**
 * The upload and extraction-job path over fakes (backend spec §6): presign
 * shape, the ordered controls on job creation, idempotent replays, the
 * worker's stage walk, and the wire boundary on serves.
 */
import { errorEnvelopeSchema, extractionJobSchema } from '@plainsight/api-contract';
import type { LadderOutcome } from '@plainsight/extraction-core';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import type { JobPatch, JobStore, StoredJob } from '../src/db/jobStore.js';
import {
  createExtractionHandler,
  type CreateExtractionDeps
} from '../src/handlers/createExtraction.js';
import { createUploadHandler, safeFileName } from '../src/handlers/createUpload.js';
import { createGetExtractionHandler } from '../src/handlers/getExtraction.js';
import { runUploadJob, type UploadJobDeps } from '../src/ingest/uploadJob.js';

const T0 = new Date('2026-07-18T08:00:00Z');
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7 rest of file');

class FakeJobStore implements JobStore {
  jobs = new Map<string, StoredJob>();
  quota = new Map<string, number>();
  responses = new Map<string, { userId: string; body: string }>();
  patches: Array<{ jobId: string; patch: JobPatch }> = [];

  async createJob(job: StoredJob): Promise<void> {
    if (this.jobs.has(job.jobId)) throw new Error('exists');
    this.jobs.set(job.jobId, { ...job });
  }

  async getJob(jobId: string): Promise<StoredJob | undefined> {
    const job = this.jobs.get(jobId);
    return job === undefined ? undefined : { ...job };
  }

  async patchJob(jobId: string, patch: JobPatch): Promise<void> {
    this.patches.push({ jobId, patch });
    const job = this.jobs.get(jobId);
    if (job !== undefined) Object.assign(job, patch);
  }

  async tryConsumeQuota(userId: string, month: string, limit: number): Promise<boolean> {
    const key = `${userId}#${month}`;
    const used = this.quota.get(key) ?? 0;
    if (used >= limit) return false;
    this.quota.set(key, used + 1);
    return true;
  }

  async getStoredResponse(idempotencyKey: string, userId: string): Promise<string | undefined> {
    const stored = this.responses.get(idempotencyKey);
    return stored !== undefined && stored.userId === userId ? stored.body : undefined;
  }

  async storeResponse(idempotencyKey: string, userId: string, body: string): Promise<void> {
    this.responses.set(idempotencyKey, { userId, body });
  }
}

function authedEvent(overrides: {
  body?: unknown;
  headers?: Record<string, string>;
  pathParameters?: Record<string, string>;
  sub?: string | null;
}): APIGatewayProxyEventV2WithJWTAuthorizer {
  const sub = overrides.sub === undefined ? 'user-1' : overrides.sub;
  return {
    body:
      typeof overrides.body === 'string' ? overrides.body : JSON.stringify(overrides.body ?? {}),
    headers: overrides.headers ?? { 'idempotency-key': 'key-1' },
    pathParameters: overrides.pathParameters ?? {},
    requestContext: {
      requestId: 'req_test',
      ...(sub === null ? {} : { authorizer: { jwt: { claims: { sub } } } })
    }
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('the upload presign (backend spec §6)', () => {
  it('signs a caller-prefixed key with the pinned expiry shape', async () => {
    const inputs: Array<{ objectKey: string; contentType: string; contentLength: number }> = [];
    const handler = createUploadHandler(
      async (input) => {
        inputs.push(input);
        return 'https://bucket.example/presigned';
      },
      () => T0,
      () => 'fixed-uuid'
    );
    const response = await handler(
      authedEvent({ body: { fileName: 'FY25 annual report.pdf', contentType: 'application/pdf', sizeBytes: 1024 } })
    );
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body ?? '');
    expect(body.objectKey).toBe('uploads/user-1/fixed-uuid/FY25-annual-report.pdf');
    expect(body.expiresAt).toBe('2026-07-18T08:15:00.000Z');
    expect(inputs[0]?.contentLength).toBe(1024);
  });

  it('scrubs hostile file names', () => {
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFileName('///')).toBe('document.pdf');
  });

  it('refuses non-PDF content types and missing auth', async () => {
    const handler = createUploadHandler(async () => 'unused');
    const badType = await handler(
      authedEvent({ body: { fileName: 'a.xlsx', contentType: 'text/html', sizeBytes: 10 } })
    );
    expect(badType.statusCode).toBe(400);
    const noAuth = await handler(
      authedEvent({ body: { fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 }, sub: null })
    );
    expect(noAuth.statusCode).toBe(401);
  });
});

function extractionDeps(store: FakeJobStore, overrides: Partial<CreateExtractionDeps> = {}): CreateExtractionDeps {
  return {
    jobs: store,
    headObject: async () => ({ sizeBytes: 1024 }),
    readMagic: async () => PDF_BYTES.slice(0, 8),
    fireWorker: async () => undefined,
    extractionEnabled: async () => true,
    now: () => T0,
    newId: () => 'job-1',
    ...overrides
  };
}

describe('starting a job (backend spec §6 controls, in order)', () => {
  it('creates a queued job, fires the worker, and replays under the same key', async () => {
    const store = new FakeJobStore();
    const fired: string[] = [];
    const handler = createExtractionHandler(
      extractionDeps(store, { fireWorker: async (jobId) => void fired.push(jobId) })
    );
    const request = { body: { objectKey: 'uploads/user-1/abc/report.pdf' } };

    const first = await handler(authedEvent(request));
    expect(first.statusCode).toBe(200);
    const job = extractionJobSchema.parse(JSON.parse(first.body ?? ''));
    expect(job.state).toBe('queued');
    expect(fired).toEqual(['job-1']);

    const replay = await handler(authedEvent(request));
    expect(replay.body).toBe(first.body);
    expect(store.jobs.size).toBe(1);
  });

  it("refuses another user's prefix before spending anything", async () => {
    const store = new FakeJobStore();
    const handler = createExtractionHandler(extractionDeps(store));
    const response = await handler(
      authedEvent({ body: { objectKey: 'uploads/user-2/abc/report.pdf' } })
    );
    expect(response.statusCode).toBe(403);
    expect(store.quota.size).toBe(0);
  });

  it('answers feature_disabled when the kill switch is down', async () => {
    const handler = createExtractionHandler(
      extractionDeps(new FakeJobStore(), { extractionEnabled: async () => false })
    );
    const response = await handler(
      authedEvent({ body: { objectKey: 'uploads/user-1/abc/report.pdf' } })
    );
    expect(response.statusCode).toBe(503);
    const body = errorEnvelopeSchema.parse(JSON.parse(response.body ?? ''));
    expect(body.error.code).toBe('feature_disabled');
  });

  it('refuses a missing object, an oversize object, and non-PDF magic', async () => {
    const store = new FakeJobStore();
    const missing = await createExtractionHandler(
      extractionDeps(store, { headObject: async () => undefined })
    )(authedEvent({ body: { objectKey: 'uploads/user-1/a/r.pdf' } }));
    expect(missing.statusCode).toBe(404);

    const oversize = await createExtractionHandler(
      extractionDeps(store, { headObject: async () => ({ sizeBytes: 51 * 1024 * 1024 }) })
    )(authedEvent({ body: { objectKey: 'uploads/user-1/a/r.pdf' } }));
    expect(oversize.statusCode).toBe(400);

    const notPdf = await createExtractionHandler(
      extractionDeps(store, { readMagic: async () => new TextEncoder().encode('PKxxxx') })
    )(authedEvent({ body: { objectKey: 'uploads/user-1/a/r.pdf' } }));
    expect(notPdf.statusCode).toBe(400);
  });

  it('answers the quota envelope with the reset date once ten jobs exist', async () => {
    const store = new FakeJobStore();
    store.quota.set('user-1#2026-07', 10);
    const handler = createExtractionHandler(extractionDeps(store));
    const response = await handler(
      authedEvent({ body: { objectKey: 'uploads/user-1/abc/report.pdf' } })
    );
    expect(response.statusCode).toBe(429);
    const body = errorEnvelopeSchema.parse(JSON.parse(response.body ?? ''));
    expect(body.error.details[0]).toMatchObject({ reason: 'quota', limit: 10, resetsAt: '2026-08-01' });
  });

  it('a worker that will not start fails the job visibly', async () => {
    const store = new FakeJobStore();
    const handler = createExtractionHandler(
      extractionDeps(store, {
        fireWorker: async () => {
          throw new Error('no function');
        }
      })
    );
    const response = await handler(
      authedEvent({ body: { objectKey: 'uploads/user-1/abc/report.pdf' } })
    );
    const job = extractionJobSchema.parse(JSON.parse(response.body ?? ''));
    expect(job.state).toBe('failed');
    expect(job.failure?.detail).toContain('did not start');
  });

  it('requires the Idempotency-Key header', async () => {
    const handler = createExtractionHandler(extractionDeps(new FakeJobStore()));
    const response = await handler(
      authedEvent({ body: { objectKey: 'uploads/user-1/a/r.pdf' }, headers: {} })
    );
    expect(response.statusCode).toBe(400);
  });
});

describe('serving a job', () => {
  const stored: StoredJob = {
    jobId: 'job-9',
    state: 'queued',
    createdAt: T0.toISOString(),
    confidential: false,
    attempts: [],
    userId: 'user-1',
    objectKey: 'uploads/user-1/a/r.pdf'
  };

  it('serves the wire shape without the internals', async () => {
    const store = new FakeJobStore();
    store.jobs.set('job-9', { ...stored });
    const handler = createGetExtractionHandler(store);
    const response = await handler(authedEvent({ pathParameters: { jobId: 'job-9' } }));
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body ?? '');
    expect(body.jobId).toBe('job-9');
    expect(body.userId).toBeUndefined();
    expect(body.objectKey).toBeUndefined();
  });

  it("hides another user's job behind permission_denied, and a vanished one behind not_found", async () => {
    const store = new FakeJobStore();
    store.jobs.set('job-9', { ...stored, userId: 'user-2' });
    const handler = createGetExtractionHandler(store);
    const denied = await handler(authedEvent({ pathParameters: { jobId: 'job-9' } }));
    expect(denied.statusCode).toBe(403);
    const gone = await handler(authedEvent({ pathParameters: { jobId: 'job-0' } }));
    expect(gone.statusCode).toBe(404);
  });
});

const REVIEW_RESULT = {
  years: [
    {
      fy: 'FY2025',
      endDate: '2025-06-30',
      currency: 'AUD',
      scale: 'millions',
      fields: { revenue: { value: 100, confidence: 0.95, page: 3 } }
    }
  ]
};

function workerDeps(store: FakeJobStore, overrides: Partial<UploadJobDeps> = {}): UploadJobDeps {
  return {
    jobs: store,
    getObject: async () => PDF_BYTES,
    preprocess: async () =>
      ({ ok: true, document: { kind: 'text', sections: [] } }) as never,
    extract: async () =>
      ({
        ok: true,
        result: REVIEW_RESULT,
        provenance: { provider: 'anthropic-haiku-4.5', model: 'claude-haiku-4-5-20251001', promptVersion: 'v1' },
        attempts: [{ rungId: 'anthropic-haiku-4.5', model: 'claude-haiku-4-5-20251001' }]
      }) as unknown as LadderOutcome,
    extractionEnabled: async () => true,
    ...overrides
  };
}

function seedQueued(store: FakeJobStore): void {
  store.jobs.set('job-1', {
    jobId: 'job-1',
    state: 'queued',
    createdAt: T0.toISOString(),
    confidential: false,
    attempts: [],
    userId: 'user-1',
    objectKey: 'uploads/user-1/a/r.pdf'
  });
}

describe('the worker walk (backend spec §6 stages)', () => {
  it('walks preprocessing, extracting, validating, review_required with attempts appended', async () => {
    const store = new FakeJobStore();
    seedQueued(store);
    const outcome = await runUploadJob(workerDeps(store), 'job-1');
    expect(outcome.outcome).toBe('review_required');
    expect(store.patches.map((patch) => patch.patch.state)).toEqual([
      'preprocessing',
      'extracting',
      'validating',
      'review_required'
    ]);
    const job = store.jobs.get('job-1');
    expect(job?.review?.result).toEqual(REVIEW_RESULT);
    expect(job?.attempts[0]).toMatchObject({
      provider: 'anthropic-haiku-4.5',
      outcome: 'extracted'
    });
  });

  it('a refused preprocess fails plainly', async () => {
    const store = new FakeJobStore();
    seedQueued(store);
    const outcome = await runUploadJob(
      workerDeps(store, { preprocess: async () => ({ ok: false, reason: 'scanned_document' }) as never }),
      'job-1'
    );
    expect(outcome.outcome).toBe('failed');
    expect(store.jobs.get('job-1')?.failure?.detail).toContain('scanned_document');
  });

  it('an exhausted ladder fails with the attempts named', async () => {
    const store = new FakeJobStore();
    seedQueued(store);
    const outcome = await runUploadJob(
      workerDeps(store, {
        extract: async () =>
          ({
            ok: false,
            attempts: [
              { rungId: 'groq-llama-3.3-70b', model: 'llama-3.3-70b-versatile', failure: { kind: 'provider_error', detail: 'x' } }
            ]
          }) as unknown as LadderOutcome
      }),
      'job-1'
    );
    expect(outcome.outcome).toBe('failed');
    const job = store.jobs.get('job-1');
    expect(job?.attempts[0]?.outcome).toBe('provider_error');
  });

  it('the kill switch fails a job visibly, and non-queued jobs never re-run', async () => {
    const store = new FakeJobStore();
    seedQueued(store);
    const disabled = await runUploadJob(
      workerDeps(store, { extractionEnabled: async () => false }),
      'job-1'
    );
    expect(disabled.outcome).toBe('disabled');
    expect(store.jobs.get('job-1')?.state).toBe('failed');

    const rerun = await runUploadJob(workerDeps(store), 'job-1');
    expect(rerun.outcome).toBe('already_started');
    const missing = await runUploadJob(workerDeps(store), 'job-0');
    expect(missing.outcome).toBe('job_missing');
  });

  it('a result outside the schema fails validating', async () => {
    const store = new FakeJobStore();
    seedQueued(store);
    const outcome = await runUploadJob(
      workerDeps(store, {
        extract: async () =>
          ({
            ok: true,
            result: { years: [] },
            provenance: { provider: 'p', model: 'm', promptVersion: 'v' },
            attempts: []
          }) as unknown as LadderOutcome
      }),
      'job-1'
    );
    expect(outcome.outcome).toBe('failed');
    expect(store.jobs.get('job-1')?.failure?.detail).toContain('schema');
  });
});
