/**
 * The API boundary: every response shape maps to a typed result, and nothing
 * malformed can pass as data (main plan §5: Zod at the API boundary).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchFinancials, searchTickers } from './client';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const FINANCIALS_BODY = {
  ticker: 'AAPL',
  statements: [
    {
      fy: 'FY2025',
      statement: 'income',
      endDate: '2025-09-27',
      currency: 'USD',
      values: { revenue: 100, netIncome: 10 },
      provenance: {
        source: 'edgar',
        recordedAt: '2026-07-12T00:00:00Z',
        filing: { system: 'EDGAR', documentId: 'accn-1' },
        mappingVersion: 'edgar-us-gaap-1'
      }
    }
  ],
  gaps: []
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchTickers', () => {
  it('parses a page and passes the query through encoded', async () => {
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) =>
      jsonResponse({ results: [{ ticker: 'AAPL', name: 'Apple Inc.', cik: 320193, exchange: 'Nasdaq' }] })
    );
    vi.stubGlobal('fetch', fetchMock);
    const page = await searchTickers('apple & co');
    expect(page.results[0]?.ticker).toBe('AAPL');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/search?q=apple%20%26%20co');
  });

  it('throws on a failed response and on a malformed body', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }));
    await expect(searchTickers('apple')).rejects.toThrow('HTTP 500');
    vi.stubGlobal('fetch', async () => jsonResponse({ results: [{ bad: true }] }));
    await expect(searchTickers('apple')).rejects.toThrow();
  });
});

describe('fetchFinancials', () => {
  it('maps 200 to ok with a contract-parsed payload', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(FINANCIALS_BODY));
    const result = await fetchFinancials('AAPL');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.data.statements).toHaveLength(1);
  });

  it('maps 202 to ingesting with the server retry hint', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse(
        {
          error: {
            code: 'ingesting',
            message: 'First request for this ticker.',
            details: [{ reason: 'ingesting', retryAfterSeconds: 7 }],
            requestId: 'req_1'
          }
        },
        202
      )
    );
    expect(await fetchFinancials('AAPL')).toEqual({ kind: 'ingesting', retryAfterSeconds: 7 });
  });

  it('falls back to five seconds when the 202 body is unreadable', async () => {
    vi.stubGlobal('fetch', async () => new Response('not json', { status: 202 }));
    expect(await fetchFinancials('AAPL')).toEqual({ kind: 'ingesting', retryAfterSeconds: 5 });
  });

  it('maps an envelope error to unavailable with its message', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse(
        { error: { code: 'internal', message: 'Something went wrong.', details: [], requestId: 'r' } },
        500
      )
    );
    const result = await fetchFinancials('AAPL');
    expect(result).toEqual({ kind: 'unavailable', message: 'Something went wrong.' });
  });

  it('maps network failure and malformed 200 bodies to the same degraded state', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('network down');
    });
    expect((await fetchFinancials('AAPL')).kind).toBe('unavailable');
    vi.stubGlobal('fetch', async () => jsonResponse({ ticker: 'AAPL', statements: 'oops' }));
    expect((await fetchFinancials('AAPL')).kind).toBe('unavailable');
  });
});
