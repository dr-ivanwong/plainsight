/**
 * Behavioural tests for the ingest path: the EDGAR client's etiquette, the
 * validation gates, and the core's lock/write/quarantine choreography, all
 * over fakes. The mapping itself is covered by its golden corpus.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IngestStore, ProfileWrite, QuarantineEntry } from '../src/db/table.js';
import { EdgarClient, companyfactsUrl } from '../src/edgar/client.js';
import type { MappedYear } from '../src/edgar/mapping.js';
import { runGates } from '../src/ingest/gates.js';
import { runIngest, type IngestDeps } from '../src/ingest/core.js';

// ---------------------------------------------------------------------------
// EDGAR client etiquette
// ---------------------------------------------------------------------------

const TICKER_INDEX_BODY = {
  fields: ['cik', 'name', 'ticker', 'exchange'],
  data: [
    [320193, 'Apple Inc.', 'AAPL', 'Nasdaq'],
    [1067983, 'Berkshire Hathaway Inc.', 'BRK-B', 'NYSE'],
    [99999, 'Delisted Co', 'DLST', null]
  ]
};

function jsonResponse(body: unknown, init: { status?: number; etag?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: init.etag === undefined ? {} : { etag: init.etag }
  });
}

describe('the EDGAR client', () => {
  it('declares the contact in its User-Agent and paces requests', async () => {
    const calls: { url: string; userAgent: string | null }[] = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        userAgent: new Headers(init?.headers).get('user-agent')
      });
      return jsonResponse(TICKER_INDEX_BODY);
    });
    const sleeps: number[] = [];
    const client = new EdgarClient({
      contact: 'owner@example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      }
    });
    const listing = await client.lookupTicker('AAPL');
    expect(listing).toEqual({ cik: 320193, name: 'Apple Inc.', ticker: 'AAPL', exchange: 'Nasdaq' });
    expect(calls[0]?.userAgent).toContain('owner@example.com');
    // The pace delay ran before any follow-up request could happen.
    expect(sleeps.length).toBeGreaterThan(0);
  });

  it('serves repeat lookups from the warm cache without refetching', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(TICKER_INDEX_BODY));
    const client = new EdgarClient({
      contact: 'owner@example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {}
    });
    await client.lookupTicker('AAPL');
    const second = await client.lookupTicker('BRK-B');
    expect(second?.cik).toBe(1067983);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('revalidates a stale index with a conditional GET and honours 304', async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const conditional = new Headers(init?.headers).get('if-none-match');
      if (conditional === 'v1') return new Response(null, { status: 304 });
      return jsonResponse(TICKER_INDEX_BODY, { etag: 'v1' });
    });
    const client = new EdgarClient({
      contact: 'owner@example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
      now: () => clock
    });
    await client.lookupTicker('AAPL');
    clock = 25 * 60 * 60 * 1000; // past the daily TTL
    const listing = await client.lookupTicker('AAPL');
    expect(listing?.cik).toBe(320193);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries retryable statuses with backoff and gives up inside the budget', async () => {
    const fetchImpl = vi.fn(async () => new Response('slow down', { status: 429 }));
    const sleeps: number[] = [];
    const client = new EdgarClient({
      contact: 'owner@example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      }
    });
    await expect(client.fetchCompanyfacts(320193)).rejects.toThrow('HTTP 429 after 3');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0] as number);
  });

  it('does not retry a plain 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('no such company', { status: 404 }));
    const client = new EdgarClient({
      contact: 'owner@example.com',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {}
    });
    await expect(client.fetchCompanyfacts(1)).rejects.toThrow('HTTP 404 after 1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('pads the CIK into the companyfacts URL', () => {
    expect(companyfactsUrl(320193)).toBe(
      'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json'
    );
  });
});

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

const year = (
  fy: `FY${number}`,
  items: Partial<Record<string, number>>
): MappedYear => ({
  fy,
  endDate: `${Number(fy.slice(2))}-12-31`,
  currency: 'USD',
  items: Object.fromEntries(
    Object.entries(items).map(([id, amountMinor]) => [
      id,
      { amountMinor: amountMinor as number, concepts: ['Synthetic'], accession: `acc-${fy}` }
    ])
  ) as MappedYear['items']
});

describe('the validation gates', () => {
  it('passes a balanced year and abstains when a total is missing', () => {
    const balanced = year('FY2024', {
      totalAssets: 1_000_000_000_000,
      totalLiabilities: 600_000_000_000,
      totalEquity: 400_000_000_000
    });
    const noTotals = year('FY2025', { revenue: 5_000 });
    const outcome = runGates([balanced, noTotals]);
    expect(outcome.served).toHaveLength(2);
    expect(outcome.quarantined).toEqual([]);
  });

  it('quarantines a year whose balance sheet does not cross-foot', () => {
    const broken = year('FY2024', {
      totalAssets: 1_000_000_000_000,
      totalLiabilities: 600_000_000_000,
      totalEquity: 300_000_000_000 // off by 100 billion minor units
    });
    const outcome = runGates([broken]);
    expect(outcome.served).toEqual([]);
    expect(outcome.quarantined[0]?.reasons[0]).toContain('cross-foot');
  });

  it('quarantines an order-of-magnitude jump but lets real growth through', () => {
    const base = year('FY2023', { revenue: 1_000_000 });
    const tripled = year('FY2024', { revenue: 3_000_000 });
    const thousandFold = year('FY2025', { revenue: 3_000_000_000 });
    const outcome = runGates([base, tripled, thousandFold]);
    expect(outcome.served.map((entry) => entry.fy)).toEqual(['FY2023', 'FY2024']);
    expect(outcome.quarantined[0]?.reasons[0]).toContain('unit error');
  });
});

// ---------------------------------------------------------------------------
// Ingest core
// ---------------------------------------------------------------------------

/** A minimal companyfacts document at mega-cap magnitudes, so the millions-scale tolerance floor bites. */
function syntheticCompanyfacts(): unknown {
  const annual = (val: number) => [
    { start: '2024-01-01', end: '2024-12-31', val, accn: 'acc-1', form: '10-K', filed: '2025-02-01' }
  ];
  const instant = (val: number) => [
    { end: '2024-12-31', val, accn: 'acc-1', form: '10-K', filed: '2025-02-01' }
  ];
  return {
    cik: 320193,
    entityName: 'Apple Inc.',
    facts: {
      'us-gaap': {
        NetIncomeLoss: { units: { USD: annual(93_000_000_000) } },
        Revenues: { units: { USD: annual(391_000_000_000) } },
        Assets: { units: { USD: instant(365_000_000_000) } },
        Liabilities: { units: { USD: instant(308_000_000_000) } },
        StockholdersEquity: { units: { USD: instant(57_000_000_000) } }
      }
    }
  };
}

interface FakeStoreState {
  lockHeld?: boolean;
  meta?: { lastFilingSeen?: string };
  rows: unknown[];
  quarantine: QuarantineEntry[];
  profile: ProfileWrite | undefined;
  lockAcquired: number;
  lockReleased: number;
}

function fakeIngestStore(state: FakeStoreState): IngestStore {
  return {
    getProfileMeta: async () => state.meta,
    acquireIngestLock: async () => {
      if (state.lockHeld) return false;
      state.lockAcquired += 1;
      return true;
    },
    releaseIngestLock: async () => {
      state.lockReleased += 1;
    },
    putStatementRows: async (_ticker, rows) => {
      state.rows.push(...rows);
    },
    putQuarantine: async (_ticker, entry) => {
      state.quarantine.push(entry);
    },
    completeProfile: async (profile) => {
      state.profile = profile;
    }
  };
}

const SUBMISSIONS_BODY = {
  filings: {
    recent: {
      accessionNumber: ['acc-q3', 'acc-new-annual', 'acc-old-annual'],
      form: ['10-Q', '10-K', '10-K']
    }
  }
};

function fakeClient(document: unknown, requestLog?: string[]): EdgarClient {
  const fetchImpl = async (input: string | URL) => {
    const url = String(input);
    requestLog?.push(url);
    if (url.includes('companyfacts')) return jsonResponse(document);
    if (url.includes('submissions')) return jsonResponse(SUBMISSIONS_BODY);
    return jsonResponse(TICKER_INDEX_BODY);
  };
  return new EdgarClient({
    contact: 'owner@example.com',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => {}
  });
}

const depsWith = (state: FakeStoreState, document: unknown, requestLog?: string[]): IngestDeps => ({
  client: fakeClient(document, requestLog),
  store: fakeIngestStore(state),
  now: () => new Date('2026-07-12T10:00:00Z')
});

describe('the ingest core', () => {
  it('ingests a ticker end to end: rows written, profile completed, lock released', async () => {
    const state: FakeStoreState = {
      rows: [],
      quarantine: [],
      profile: undefined,
      lockAcquired: 0,
      lockReleased: 0
    };
    const outcome = await runIngest(depsWith(state, syntheticCompanyfacts()), 'AAPL');
    expect(outcome).toEqual({
      outcome: 'ingested',
      ticker: 'AAPL',
      servedYears: 1,
      quarantinedYears: 0
    });
    expect(state.rows).toHaveLength(2); // income + balance for the one year
    expect(state.profile).toMatchObject({
      ticker: 'AAPL',
      name: 'Apple Inc.',
      cik: 320193,
      exchange: 'Nasdaq',
      lastFilingSeen: 'acc-1',
      latestFyEndDate: '2024-12-31'
    });
    expect(state.lockAcquired).toBe(1);
    expect(state.lockReleased).toBe(1);
  });

  it('quarantines a gate-failed year and leaves the profile incomplete when nothing serves', async () => {
    const document = syntheticCompanyfacts() as {
      facts: { 'us-gaap': Record<string, { units: { USD: { val: number }[] } }> };
    };
    (document.facts['us-gaap']['StockholdersEquity'] as { units: { USD: { val: number }[] } }).units.USD[0]!.val = 30_000_000_000; // 27 billion dollars off: breaks the balance identity
    const state: FakeStoreState = {
      rows: [],
      quarantine: [],
      profile: undefined,
      lockAcquired: 0,
      lockReleased: 0
    };
    const outcome = await runIngest(depsWith(state, document), 'AAPL');
    expect(outcome).toMatchObject({ outcome: 'ingested', servedYears: 0, quarantinedYears: 1 });
    expect(state.rows).toEqual([]);
    expect(state.quarantine[0]?.reasons[0]).toContain('cross-foot');
    expect(state.quarantine[0]?.rows.length).toBeGreaterThan(0);
    expect(state.profile).toBeUndefined();
    expect(state.lockReleased).toBe(1);
  });

  it('exits quietly when the lock is held', async () => {
    const state: FakeStoreState = {
      lockHeld: true,
      rows: [],
      quarantine: [],
      profile: undefined,
      lockAcquired: 0,
      lockReleased: 0
    };
    const outcome = await runIngest(depsWith(state, syntheticCompanyfacts()), 'AAPL');
    expect(outcome).toEqual({ outcome: 'lock_held', ticker: 'AAPL' });
    expect(state.rows).toEqual([]);
    expect(state.lockReleased).toBe(0);
  });

  it('writes nothing for a ticker the SEC index does not know, and releases the lock', async () => {
    const state: FakeStoreState = {
      rows: [],
      quarantine: [],
      profile: undefined,
      lockAcquired: 0,
      lockReleased: 0
    };
    const outcome = await runIngest(depsWith(state, syntheticCompanyfacts()), 'ZZZZ');
    expect(outcome).toEqual({ outcome: 'unknown_ticker', ticker: 'ZZZZ' });
    expect(state.rows).toEqual([]);
    expect(state.profile).toBeUndefined();
    expect(state.lockReleased).toBe(1);
  });

  it('sweep mode: an unchanged ticker does no ingest work at all', async () => {
    const state: FakeStoreState = {
      meta: { lastFilingSeen: 'acc-new-annual' },
      rows: [],
      quarantine: [],
      profile: undefined,
      lockAcquired: 0,
      lockReleased: 0
    };
    const requestLog: string[] = [];
    const outcome = await runIngest(
      depsWith(state, syntheticCompanyfacts(), requestLog),
      'AAPL',
      'sweep'
    );
    expect(outcome).toEqual({ outcome: 'unchanged', ticker: 'AAPL' });
    expect(requestLog.some((url) => url.includes('companyfacts'))).toBe(false);
    expect(state.rows).toEqual([]);
    expect(state.lockReleased).toBe(1);
  });

  it('sweep mode: a new annual filing triggers the full ingest and settles the marker', async () => {
    const state: FakeStoreState = {
      meta: { lastFilingSeen: 'acc-old-annual' },
      rows: [],
      quarantine: [],
      profile: undefined,
      lockAcquired: 0,
      lockReleased: 0
    };
    const outcome = await runIngest(depsWith(state, syntheticCompanyfacts()), 'AAPL', 'sweep');
    expect(outcome).toMatchObject({ outcome: 'ingested', servedYears: 1 });
    // The stored marker becomes what next week's detector will compare
    // against: the submissions feed's newest annual accession.
    expect(state.profile?.lastFilingSeen).toBe('acc-new-annual');
  });

  it('sweep mode: a watched ticker without a completed profile ingests without a submissions check', async () => {
    const state: FakeStoreState = {
      rows: [],
      quarantine: [],
      profile: undefined,
      lockAcquired: 0,
      lockReleased: 0
    };
    const requestLog: string[] = [];
    const outcome = await runIngest(
      depsWith(state, syntheticCompanyfacts(), requestLog),
      'AAPL',
      'sweep'
    );
    expect(outcome).toMatchObject({ outcome: 'ingested' });
    expect(requestLog.some((url) => url.includes('submissions'))).toBe(false);
    expect(state.profile?.lastFilingSeen).toBe('acc-1');
  });

  it('releases the lock when the fetch fails, and lets the error surface', async () => {
    const state: FakeStoreState = {
      rows: [],
      quarantine: [],
      profile: undefined,
      lockAcquired: 0,
      lockReleased: 0
    };
    const failingClient = new EdgarClient({
      contact: 'owner@example.com',
      fetchImpl: (async (input: string | URL) =>
        String(input).includes('companyfacts')
          ? new Response('down', { status: 500 })
          : jsonResponse(TICKER_INDEX_BODY)) as unknown as typeof fetch,
      sleep: async () => {}
    });
    const deps: IngestDeps = {
      client: failingClient,
      store: fakeIngestStore(state),
      now: () => new Date('2026-07-12T10:00:00Z')
    };
    await expect(runIngest(deps, 'AAPL')).rejects.toThrow('HTTP 500');
    expect(state.lockReleased).toBe(1);
  });
});
