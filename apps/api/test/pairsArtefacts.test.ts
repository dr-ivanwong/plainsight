/**
 * The pairs transport handlers against an in-memory store: publish lands
 * a run and is idempotent by run date; the read serves latest plus
 * history; and every failure mode answers with the error envelope.
 */
import { readFileSync } from 'node:fs';
import {
  errorEnvelopeSchema,
  pairsArtefactCollectionSchema,
  pairsArtefactRunSchema,
  type PairScanReport,
  type PairsArtefactRun
} from '@plainsight/api-contract';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { createGetPairsArtefactHandler } from '../src/handlers/getPairsArtefact.js';
import { createPutPairsArtefactHandler } from '../src/handlers/putPairsArtefact.js';
import type { PairsArtefactStore } from '../src/db/pairsStore.js';

const goldenBody = readFileSync(
  new URL('../../../packages/api-contract/fixtures/pair-scan.golden.json', import.meta.url),
  'utf8'
);

class FakePairsStore implements PairsArtefactStore {
  readonly reports = new Map<string, unknown>();
  readonly rows = new Map<string, PairsArtefactRun>();

  async putRun(report: PairScanReport, receivedAt: string): Promise<PairsArtefactRun> {
    const row: PairsArtefactRun = {
      runDate: report.runDate,
      engineVersion: report.engineVersion,
      schemaVersion: report.schemaVersion,
      generatedAt: report.generatedAt,
      receivedAt,
      sizeBytes: Buffer.byteLength(JSON.stringify(report))
    };
    this.reports.set(report.runDate, JSON.parse(JSON.stringify(report)) as unknown);
    this.rows.set(report.runDate, row);
    return row;
  }

  async listRuns(): Promise<PairsArtefactRun[]> {
    return [...this.rows.values()].sort((a, b) => b.runDate.localeCompare(a.runDate));
  }

  async getReport(runDate: string): Promise<unknown> {
    const report = this.reports.get(runDate);
    if (report === undefined) throw new Error(`no report for ${runDate}`);
    return report;
  }
}

function authedEvent(body?: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    body,
    requestContext: {
      requestId: 'req_test',
      authorizer: { jwt: { claims: { sub: 'owner-1' } } }
    }
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function anonymousEvent(): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: { requestId: 'req_test' }
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const bodyOf = (result: { body?: string | undefined }): unknown => JSON.parse(result.body ?? '');

describe('PUT /v1/pairs/artefacts/pair-scan', () => {
  it('stores a valid artefact and answers with the run row', async () => {
    const store = new FakePairsStore();
    const put = createPutPairsArtefactHandler(store, () => new Date('2026-07-22T10:00:00Z'));
    const result = await put(authedEvent(goldenBody));
    expect(result.statusCode).toBe(200);
    const row = pairsArtefactRunSchema.parse(bodyOf(result));
    expect(row.runDate).toBe('2024-01-26');
    expect(row.receivedAt).toBe('2026-07-22T10:00:00.000Z');
    expect(store.rows.size).toBe(1);
  });

  it('is idempotent by run date: a re-publish overwrites the same run', async () => {
    const store = new FakePairsStore();
    const put = createPutPairsArtefactHandler(store);
    await put(authedEvent(goldenBody));
    await put(authedEvent(goldenBody));
    expect(store.rows.size).toBe(1);
  });

  it('refuses an unauthenticated call, the belt to the authoriser braces', async () => {
    const result = await createPutPairsArtefactHandler(new FakePairsStore())(anonymousEvent());
    expect(result.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(bodyOf(result)).error.code).toBe('unauthenticated');
  });

  it('refuses a body that is not JSON', async () => {
    const result = await createPutPairsArtefactHandler(new FakePairsStore())(authedEvent('not json'));
    expect(result.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(bodyOf(result)).error.code).toBe('invalid_request');
  });

  it('refuses an artefact that fails the schema, naming the first issue', async () => {
    const broken = JSON.stringify({ ...(JSON.parse(goldenBody) as object), schemaVersion: 9 });
    const result = await createPutPairsArtefactHandler(new FakePairsStore())(authedEvent(broken));
    expect(result.statusCode).toBe(400);
    const envelope = errorEnvelopeSchema.parse(bodyOf(result));
    expect(envelope.error.code).toBe('invalid_request');
    expect(envelope.error.details.length).toBeGreaterThan(0);
  });

  it('answers internal when the store fails', async () => {
    const store = new FakePairsStore();
    store.putRun = async () => {
      throw new Error('table unavailable');
    };
    const result = await createPutPairsArtefactHandler(store)(authedEvent(goldenBody));
    expect(result.statusCode).toBe(500);
    expect(errorEnvelopeSchema.parse(bodyOf(result)).error.code).toBe('internal');
  });
});

describe('GET /v1/pairs/artefacts/pair-scan', () => {
  it('serves the empty sleeve as a 200 with a null latest', async () => {
    const result = await createGetPairsArtefactHandler(new FakePairsStore())(authedEvent());
    expect(result.statusCode).toBe(200);
    expect(pairsArtefactCollectionSchema.parse(bodyOf(result))).toEqual({ latest: null, history: [] });
  });

  it('serves the published report as latest with its run history', async () => {
    const store = new FakePairsStore();
    await createPutPairsArtefactHandler(store)(authedEvent(goldenBody));
    const result = await createGetPairsArtefactHandler(store)(authedEvent());
    expect(result.statusCode).toBe(200);
    const collection = pairsArtefactCollectionSchema.parse(bodyOf(result));
    expect(collection.latest?.runDate).toBe('2024-01-26');
    expect(collection.latest?.pairsTested).toBeGreaterThan(0);
    expect(collection.history).toHaveLength(1);
    expect(collection.history[0]?.runDate).toBe('2024-01-26');
  });

  it('refuses an unauthenticated read', async () => {
    const result = await createGetPairsArtefactHandler(new FakePairsStore())(anonymousEvent());
    expect(result.statusCode).toBe(401);
  });

  it('surfaces a stored artefact that no longer parses as internal', async () => {
    const store = new FakePairsStore();
    await createPutPairsArtefactHandler(store)(authedEvent(goldenBody));
    store.reports.set('2024-01-26', { artefact: 'corrupted' });
    const result = await createGetPairsArtefactHandler(store)(authedEvent());
    expect(result.statusCode).toBe(500);
    expect(errorEnvelopeSchema.parse(bodyOf(result)).error.code).toBe('internal');
  });

  it('answers internal when the store fails', async () => {
    const store = new FakePairsStore();
    store.listRuns = async () => {
      throw new Error('table unavailable');
    };
    const result = await createGetPairsArtefactHandler(store)(authedEvent());
    expect(result.statusCode).toBe(500);
  });
});
