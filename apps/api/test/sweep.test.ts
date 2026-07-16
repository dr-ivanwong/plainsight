/**
 * The weekly sweep dispatcher and the submissions change detector's client
 * side, over fakes; the per-ticker behaviour lives in ingest.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { MapClient, parseListedCompaniesCsv } from '../src/index.js';
import { EdgarClient } from '../src/edgar/client.js';
import { runSweepDispatch, type SweepDispatcherDeps } from '../src/handlers/sweepDispatcher.js';

const TICKER_INDEX_BODY = {
  fields: ['cik', 'name', 'ticker', 'exchange'],
  data: [[320193, 'Apple Inc.', 'AAPL', 'Nasdaq']]
};

const jsonResponse = (body: unknown): Response => new Response(JSON.stringify(body));

function client(routes: Record<string, unknown>): EdgarClient {
  const fetchImpl = async (input: string | URL) => {
    const url = String(input);
    for (const [needle, body] of Object.entries(routes)) {
      if (url.includes(needle)) return jsonResponse(body);
    }
    return jsonResponse(TICKER_INDEX_BODY);
  };
  return new EdgarClient({
    contact: 'owner@example.com',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => {}
  });
}

describe('the submissions change detector', () => {
  it('returns the newest annual accession, skipping quarterlies', async () => {
    const edgar = client({
      submissions: {
        filings: {
          recent: {
            accessionNumber: ['acc-8k', 'acc-q1', 'acc-annual', 'acc-older'],
            form: ['8-K', '10-Q', '10-K/A', '10-K']
          }
        }
      }
    });
    expect(await edgar.latestAnnualAccession(320193)).toBe('acc-annual');
  });

  it('returns undefined when no annual filing exists in the recent window', async () => {
    const edgar = client({
      submissions: { filings: { recent: { accessionNumber: ['acc-q1'], form: ['10-Q'] } } }
    });
    expect(await edgar.latestAnnualAccession(320193)).toBeUndefined();
  });
});

describe('the sweep dispatcher', () => {
  function deps(overrides: Partial<SweepDispatcherDeps> = {}): {
    deps: SweepDispatcherDeps;
    started: string[][];
    puts: string[];
  } {
    const started: string[][] = [];
    const puts: string[] = [];
    return {
      started,
      puts,
      deps: {
        client: client({}),
        store: { listWatchedTickers: async () => ['AAPL', 'KO'] },
        putIndexObject: async (body) => {
          puts.push(body);
        },
        startSweep: async (tickers) => {
          started.push(tickers);
        },
        log: () => {},
        ...overrides
      }
    };
  }

  it('refreshes the index copy and starts the sweep over every watched ticker', async () => {
    const { deps: dispatchDeps, started, puts } = deps();
    const outcome = await runSweepDispatch(dispatchDeps);
    expect(outcome).toEqual({ outcome: 'dispatched', tickers: 2, indexRefreshed: true, asxDirectoryRefreshed: false });
    expect(started).toEqual([['AAPL', 'KO']]);
    expect(puts).toHaveLength(1);
    expect(JSON.parse(puts[0] as string).data[0]).toEqual([320193, 'Apple Inc.', 'AAPL', 'Nasdaq']);
  });

  it('does not start an execution when nothing is watched', async () => {
    const { deps: dispatchDeps, started } = deps({
      store: { listWatchedTickers: async () => [] }
    });
    const outcome = await runSweepDispatch(dispatchDeps);
    expect(outcome).toEqual({ outcome: 'nothing_watched', tickers: 0, indexRefreshed: true, asxDirectoryRefreshed: false });
    expect(started).toEqual([]);
  });

  it('sweeps even when the index refresh fails', async () => {
    const logged: unknown[] = [];
    const { deps: dispatchDeps, started } = deps({
      putIndexObject: async () => {
        throw new Error('bucket denied');
      },
      log: (entry) => {
        logged.push(entry['outcome']);
      }
    });
    const outcome = await runSweepDispatch(dispatchDeps);
    expect(outcome.indexRefreshed).toBe(false);
    expect(outcome.outcome).toBe('dispatched');
    expect(started).toHaveLength(1);
    expect(logged).toContain('index_refresh_failed');
  });

  it('runs without an index bucket at all', async () => {
    const { deps: dispatchDeps, puts } = deps({ putIndexObject: undefined });
    const outcome = await runSweepDispatch(dispatchDeps);
    expect(outcome).toEqual({ outcome: 'dispatched', tickers: 2, indexRefreshed: false, asxDirectoryRefreshed: false });
    expect(puts).toEqual([]);
  });
});

describe('the ASX directory refresh (backend spec §8, Phase 2.5)', () => {
  const CSV = [
    'ASX listed companies as at Thu Jul 16 20:36:08 AEST 2026',
    '',
    'Company name,ASX code,GICS industry group',
    '"CSL LIMITED","CSL","Pharmaceuticals, Biotechnology & Life Sciences"',
    '"JB HI-FI LIMITED","JBH","Retailing"'
  ].join('\r\n');

  it('parses the directory into .AX-qualified listings', () => {
    const listings = parseListedCompaniesCsv(CSV);
    expect(listings).toEqual([
      { ticker: 'CSL.AX', name: 'CSL LIMITED', exchange: 'ASX' },
      { ticker: 'JBH.AX', name: 'JB HI-FI LIMITED', exchange: 'ASX' }
    ]);
  });

  it('refreshes the directory object beside the index, each failure independent', async () => {
    const asxPuts: string[] = [];
    const mapClient = new MapClient({
      contact: 'owner@example.com',
      fetchImpl: (async () => new Response(CSV)) as typeof fetch,
      sleep: () => Promise.resolve(),
      now: () => 0
    });
    const started: string[][] = [];
    const outcome = await runSweepDispatch({
      client: client({}),
      mapClient,
      store: { listWatchedTickers: async () => ['CSL.AX'] },
      putIndexObject: async () => {
        throw new Error('edgar bucket denied');
      },
      putAsxDirectoryObject: async (body) => {
        asxPuts.push(body);
      },
      startSweep: async (tickers) => {
        started.push(tickers);
      },
      log: () => {}
    });
    expect(outcome).toEqual({
      outcome: 'dispatched',
      tickers: 1,
      indexRefreshed: false,
      asxDirectoryRefreshed: true
    });
    expect(JSON.parse(asxPuts[0] as string).data).toEqual([
      ['CSL.AX', 'CSL LIMITED'],
      ['JBH.AX', 'JB HI-FI LIMITED']
    ]);
    expect(started).toEqual([['CSL.AX']]);
  });
});
