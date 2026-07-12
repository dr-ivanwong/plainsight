/**
 * Ticker search: the ranking and pagination rules (backend spec §8), the
 * loader's S3-then-SEC fallback, and the route behaviour over fakes.
 */
import { errorEnvelopeSchema, searchResponseSchema } from '@plainsight/api-contract';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import type { TickerListing } from '../src/edgar/client.js';
import { createSearchHandler } from '../src/handlers/searchTickers.js';
import { IndexLoader, type IndexObjectStore } from '../src/search/load.js';
import {
  decodePageToken,
  encodePageToken,
  rankListings,
  SEARCH_PAGE_SIZE,
  searchListings
} from '../src/search/search.js';

const listing = (ticker: string, name: string, cik = 1, exchange?: string): TickerListing => ({
  ticker,
  name,
  cik,
  exchange
});

const LISTINGS: TickerListing[] = [
  listing('AAPL', 'Apple Inc.', 320193, 'Nasdaq'),
  listing('A', 'Agilent Technologies Inc.', 1090872, 'NYSE'),
  listing('AA', 'Alcoa Corp', 1675149, 'NYSE'),
  listing('MSFT', 'Microsoft Corp', 789019, 'Nasdaq'),
  listing('APLE', 'Apple Hospitality REIT Inc', 1418121, 'NYSE'),
  listing('KO', 'Coca-Cola Co', 21344, 'NYSE')
];

describe('ranking', () => {
  it('boosts the exact ticker above prefixes above name matches, deterministically', () => {
    const ranked = rankListings(LISTINGS, 'a');
    expect(ranked[0]?.ticker).toBe('A'); // exact
    expect(ranked.slice(1, 4).map((entry) => entry.ticker)).toEqual(['AA', 'AAPL', 'APLE']); // prefixes, shortest first
    // Name matches follow: Coca-Cola and Agilent both contain 'a', but
    // Agilent already ranked as exact; no duplicates.
    expect(ranked.filter((entry) => entry.ticker === 'A')).toHaveLength(1);
    expect(ranked.map((entry) => entry.ticker)).toContain('KO');
  });

  it('matches names case-insensitively when no ticker matches', () => {
    const ranked = rankListings(LISTINGS, 'microsoft');
    expect(ranked.map((entry) => entry.ticker)).toEqual(['MSFT']);
  });

  it('serves exchange badges through to results', () => {
    const ranked = rankListings(LISTINGS, 'AAPL');
    expect(ranked[0]).toEqual({ ticker: 'AAPL', name: 'Apple Inc.', cik: 320193, exchange: 'Nasdaq' });
  });
});

describe('pagination', () => {
  const many = Array.from({ length: 45 }, (_, index) =>
    listing(`T${String(index).padStart(3, '0')}`, `Test Company ${index}`, index + 1)
  );

  it('pages by the pinned size with an opaque continuation token', () => {
    const first = searchListings(many, 't', 0);
    expect(first.results).toHaveLength(SEARCH_PAGE_SIZE);
    expect(first.nextPageToken).toBeDefined();
    const offset = decodePageToken(first.nextPageToken as string, 't');
    expect(offset).toBe(SEARCH_PAGE_SIZE);
    const second = searchListings(many, 't', offset as number);
    expect(second.results[0]?.ticker).toBe(many[SEARCH_PAGE_SIZE]?.ticker);
    const third = searchListings(many, 't', 40);
    expect(third.results).toHaveLength(5);
    expect(third.nextPageToken).toBeUndefined();
  });

  it('rejects a token replayed against a different query', () => {
    const token = encodePageToken('apple', 20);
    expect(decodePageToken(token, 'apple')).toBe(20);
    expect(decodePageToken(token, 'micro')).toBeUndefined();
    expect(decodePageToken('not-base64-json', 'apple')).toBeUndefined();
  });
});

describe('the index loader', () => {
  const secDocument = {
    fields: ['cik', 'name', 'ticker', 'exchange'],
    data: [[320193, 'Apple Inc.', 'AAPL', 'Nasdaq']]
  };

  function store(initial?: string): IndexObjectStore & { puts: string[] } {
    let body = initial;
    const puts: string[] = [];
    return {
      puts,
      get: async () => body,
      put: async (next) => {
        puts.push(next);
        body = next;
      }
    };
  }

  it('prefers the S3 copy and never calls the SEC when it exists', async () => {
    let secCalls = 0;
    const loader = new IndexLoader({
      objectStore: store(JSON.stringify(secDocument)),
      fetchFromSec: async () => {
        secCalls += 1;
        return [];
      },
      now: () => 0,
      log: () => {}
    });
    const listings = await loader.load();
    expect(listings[0]?.ticker).toBe('AAPL');
    expect(secCalls).toBe(0);
  });

  it('falls back to the SEC when the object is missing, and writes the copy back', async () => {
    const objectStore = store(undefined);
    const loader = new IndexLoader({
      objectStore,
      fetchFromSec: async () => [listing('KO', 'Coca-Cola Co', 21344, 'NYSE')],
      now: () => 0,
      log: () => {}
    });
    const listings = await loader.load();
    expect(listings[0]?.ticker).toBe('KO');
    expect(objectStore.puts).toHaveLength(1);
    expect(JSON.parse(objectStore.puts[0] as string).data[0]).toEqual([
      21344,
      'Coca-Cola Co',
      'KO',
      'NYSE'
    ]);
  });

  it('serves the warm cache inside a day and reloads after it', async () => {
    let clock = 0;
    let gets = 0;
    const objectStore: IndexObjectStore = {
      get: async () => {
        gets += 1;
        return JSON.stringify(secDocument);
      },
      put: async () => {}
    };
    const loader = new IndexLoader({
      objectStore,
      fetchFromSec: async () => [],
      now: () => clock,
      log: () => {}
    });
    await loader.load();
    await loader.load();
    expect(gets).toBe(1);
    clock = 25 * 60 * 60 * 1000;
    await loader.load();
    expect(gets).toBe(2);
  });

  it('survives an unreadable object by falling back to the SEC', async () => {
    const logged: string[] = [];
    const loader = new IndexLoader({
      objectStore: {
        get: async () => {
          throw new Error('access denied');
        },
        put: async () => {
          throw new Error('access denied');
        }
      },
      fetchFromSec: async () => [listing('AAPL', 'Apple Inc.', 320193)],
      now: () => 0,
      log: (entry) => {
        logged.push(entry['outcome'] as string);
      }
    });
    const listings = await loader.load();
    expect(listings).toHaveLength(1);
    expect(logged).toEqual(['index_object_unreadable', 'index_object_write_failed']);
  });

  it('runs SEC-only when no bucket is configured', async () => {
    const loader = new IndexLoader({
      objectStore: undefined,
      fetchFromSec: async () => [listing('AAPL', 'Apple Inc.', 320193)],
      now: () => 0,
      log: () => {}
    });
    expect(await loader.load()).toHaveLength(1);
  });
});

describe('the search route', () => {
  const loaderOf = (listings: TickerListing[]): IndexLoader =>
    new IndexLoader({
      objectStore: undefined,
      fetchFromSec: async () => listings,
      now: () => 0,
      log: () => {}
    });

  const event = (query?: Record<string, string>): APIGatewayProxyEventV2 =>
    ({
      queryStringParameters: query,
      requestContext: { requestId: 'req_test' }
    }) as unknown as APIGatewayProxyEventV2;

  const bodyOf = (response: { body?: string | undefined }): unknown =>
    JSON.parse(response.body ?? 'null');

  it('serves a contract-valid page', async () => {
    const response = await createSearchHandler(loaderOf(LISTINGS))(event({ q: 'aapl' }));
    expect(response.statusCode).toBe(200);
    const body = searchResponseSchema.parse(bodyOf(response));
    expect(body.results[0]?.ticker).toBe('AAPL');
  });

  it('rejects an absent, empty, or oversized query', async () => {
    const handlerFn = createSearchHandler(loaderOf(LISTINGS));
    for (const query of [undefined, { q: '' }, { q: '   ' }, { q: 'x'.repeat(41) }]) {
      const response = await handlerFn(event(query));
      expect(response.statusCode).toBe(400);
      expect(errorEnvelopeSchema.parse(bodyOf(response)).error.code).toBe('invalid_request');
    }
  });

  it('rejects a token that belongs to another query', async () => {
    const response = await createSearchHandler(loaderOf(LISTINGS))(
      event({ q: 'apple', pageToken: encodePageToken('other', 20) })
    );
    expect(response.statusCode).toBe(400);
  });

  it('answers internal on a loader failure, envelope-true', async () => {
    const failing = new IndexLoader({
      objectStore: undefined,
      fetchFromSec: async () => {
        throw new Error('sec is down');
      },
      now: () => 0,
      log: () => {}
    });
    const response = await createSearchHandler(failing)(event({ q: 'apple' }));
    expect(response.statusCode).toBe(500);
    const envelope = errorEnvelopeSchema.parse(bodyOf(response));
    expect(envelope.error.code).toBe('internal');
    expect(envelope.error.message).not.toContain('sec is down');
  });
});
