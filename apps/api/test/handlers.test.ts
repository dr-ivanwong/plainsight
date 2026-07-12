/**
 * Behavioural tests for the read handlers over a faked store: every response
 * is envelope- or contract-conformant by parse, not by eyeball.
 */
import {
  companyProfileSchema,
  errorEnvelopeSchema,
  financialsResponseSchema,
  ingestingBodySchema,
  type CompanyProfile,
  type FinancialsStatement
} from '@plainsight/api-contract';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import type { FinancialsReadStore } from '../src/db/table.js';
import { createFinancialsHandler, serveWindow } from '../src/handlers/getFinancials.js';
import { createProfileHandler } from '../src/handlers/getProfile.js';

const PROFILE: CompanyProfile = {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  cik: 320193,
  exchange: 'Nasdaq',
  currency: 'USD'
};

function row(fy: `FY${number}`, statement: FinancialsStatement['statement']): FinancialsStatement {
  const year = Number(fy.slice(2));
  return {
    fy,
    statement,
    endDate: `${year}-09-30`,
    currency: 'USD',
    values: statement === 'income' ? { revenue: 1_000, netIncome: 100 } : { totalAssets: 5_000 },
    provenance: {
      source: 'edgar',
      recordedAt: '2026-07-12T00:00:00Z',
      filing: { system: 'EDGAR', documentId: `accn-${year}` },
      mappingVersion: 'edgar-us-gaap-1'
    }
  };
}

function fakeStore(profile: CompanyProfile | undefined, rows: FinancialsStatement[]): FinancialsReadStore {
  return {
    getProfile: async () => profile,
    listStatementRows: async () => rows
  };
}

function event(
  ticker: string,
  query?: Record<string, string>
): APIGatewayProxyEventV2 {
  return {
    pathParameters: { ticker },
    queryStringParameters: query,
    requestContext: { requestId: 'req_test' }
  } as unknown as APIGatewayProxyEventV2;
}

const bodyOf = (response: { body?: string | undefined }): unknown =>
  JSON.parse(response.body ?? 'null');

describe('the profile route', () => {
  it('serves the wire profile', async () => {
    const response = await createProfileHandler(fakeStore(PROFILE, []))(event('aapl'));
    expect(response.statusCode).toBe(200);
    expect(companyProfileSchema.parse(bodyOf(response))).toEqual(PROFILE);
  });

  it('answers not_found with the envelope when no profile exists', async () => {
    const response = await createProfileHandler(fakeStore(undefined, []))(event('AAPL'));
    expect(response.statusCode).toBe(404);
    const envelope = errorEnvelopeSchema.parse(bodyOf(response));
    expect(envelope.error.code).toBe('not_found');
    expect(envelope.error.requestId).toBe('req_test');
  });

  it('rejects a malformed ticker with invalid_request', async () => {
    const response = await createProfileHandler(fakeStore(PROFILE, []))(event('!!'));
    expect(response.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(bodyOf(response)).error.code).toBe('invalid_request');
  });

  it('turns a store failure into an internal envelope, never a leak', async () => {
    const store: FinancialsReadStore = {
      getProfile: async () => {
        throw new Error('socket closed');
      },
      listStatementRows: async () => []
    };
    const response = await createProfileHandler(store)(event('AAPL'));
    expect(response.statusCode).toBe(500);
    const envelope = errorEnvelopeSchema.parse(bodyOf(response));
    expect(envelope.error.code).toBe('internal');
    expect(envelope.error.message).not.toContain('socket');
  });
});

describe('the financials route', () => {
  it('answers 202 ingesting on a cold ticker', async () => {
    const response = await createFinancialsHandler(fakeStore(undefined, []))(event('AAPL'));
    expect(response.statusCode).toBe(202);
    const body = ingestingBodySchema.parse(bodyOf(response));
    expect(body.error.details[0].retryAfterSeconds).toBe(5);
  });

  it('serves the windowed years with gaps named, contract-valid', async () => {
    const rows = [
      row('FY2020', 'income'),
      row('FY2021', 'income'),
      row('FY2023', 'income'),
      row('FY2024', 'income'),
      row('FY2025', 'income'),
      row('FY2025', 'balance')
    ];
    const response = await createFinancialsHandler(fakeStore(PROFILE, rows))(
      event('aapl', { years: '4' })
    );
    expect(response.statusCode).toBe(200);
    const body = financialsResponseSchema.parse(bodyOf(response));
    expect(body.ticker).toBe('AAPL');
    // The four most recent labelled years present: FY2021, FY2023 to FY2025.
    expect([...new Set(body.statements.map((entry) => entry.fy))]).toEqual([
      'FY2021',
      'FY2023',
      'FY2024',
      'FY2025'
    ]);
    expect(body.gaps).toEqual(['FY2022']);
    // Ascending by year, income before balance within a year.
    expect(body.statements.at(-2)?.statement).toBe('income');
    expect(body.statements.at(-1)?.statement).toBe('balance');
  });

  it('filters to the requested statements', async () => {
    const rows = [row('FY2025', 'income'), row('FY2025', 'balance')];
    const response = await createFinancialsHandler(fakeStore(PROFILE, rows))(
      event('AAPL', { statements: 'balance' })
    );
    const body = financialsResponseSchema.parse(bodyOf(response));
    expect(body.statements.map((entry) => entry.statement)).toEqual(['balance']);
  });

  it('serves an empty, gap-free response when the profile exists but no rows match', async () => {
    const response = await createFinancialsHandler(fakeStore(PROFILE, []))(event('AAPL'));
    const body = financialsResponseSchema.parse(bodyOf(response));
    expect(body.statements).toEqual([]);
    expect(body.gaps).toEqual([]);
  });

  it('rejects out-of-range years and unknown statements', async () => {
    const handlerFn = createFinancialsHandler(fakeStore(PROFILE, []));
    for (const query of [{ years: '0' }, { years: '11' }, { years: 'ten' }, { statements: 'income,notes' }]) {
      const response = await handlerFn(event('AAPL', query));
      expect(response.statusCode).toBe(400);
      expect(errorEnvelopeSchema.parse(bodyOf(response)).error.code).toBe('invalid_request');
    }
  });
});

describe('the serve window', () => {
  it('names no gaps for a contiguous run and clamps to available years', () => {
    const rows = [row('FY2024', 'income'), row('FY2025', 'income')];
    const window = serveWindow(rows, 10);
    expect(window.statements).toHaveLength(2);
    expect(window.gaps).toEqual([]);
  });

  it('is empty for no rows', () => {
    expect(serveWindow([], 10)).toEqual({ statements: [], gaps: [] });
  });
});
