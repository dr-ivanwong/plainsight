/**
 * The EDGAR HTTP client, etiquette first (backend spec §9): a declared
 * User-Agent carrying a contact address sourced from configuration, requests
 * paced under 2 per second, conditional GETs on the ticker index, exponential
 * backoff with jitter and a retry budget on 429/403/5xx, and no crawling:
 * one companyfacts call per on-demand ingest.
 */
import { z } from 'zod';

/** ~1.7 requests/second, under the 2 rps etiquette ceiling. */
const PACE_MS = 600;
const RETRY_BUDGET = 3;
const TICKER_INDEX_URL = 'https://www.sec.gov/files/company_tickers_exchange.json';
const TICKER_INDEX_TTL_MS = 24 * 60 * 60 * 1000;

export const companyfactsUrl = (cik: number): string =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`;

/** company_tickers_exchange.json: columnar rows of [cik, name, ticker, exchange]. */
const tickerIndexSchema = z.object({
  fields: z.tuple([z.literal('cik'), z.literal('name'), z.literal('ticker'), z.literal('exchange')]),
  data: z.array(z.tuple([z.number(), z.string(), z.string(), z.string().nullable()]))
});

export interface TickerListing {
  cik: number;
  name: string;
  ticker: string;
  exchange?: string | undefined;
}

/**
 * Parses the SEC index document into listings, first listing per ticker
 * winning (the file lists primary listings first). Shared by the client's
 * own fetch and by the search loader, which reads the same document verbatim
 * from S3 (backend spec §8).
 */
export function parseTickerListings(document: unknown): TickerListing[] {
  const parsed = tickerIndexSchema.parse(document);
  const byTicker = new Map<string, TickerListing>();
  for (const [cik, name, symbol, exchange] of parsed.data) {
    if (!byTicker.has(symbol)) {
      byTicker.set(symbol, { cik, name, ticker: symbol, exchange: exchange ?? undefined });
    }
  }
  return [...byTicker.values()];
}

export interface EdgarClientDeps {
  contact: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class EdgarClient {
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  /** Warm-container cache of the ticker index, revalidated daily with a conditional GET. */
  private indexCache:
    | { byTicker: Map<string, TickerListing>; etag: string | undefined; fetchedAt: number }
    | undefined;

  constructor(deps: EdgarClientDeps) {
    this.userAgent = `Plainsight ingest (${deps.contact})`;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = deps.now ?? Date.now;
  }

  private async request(url: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
    for (let attempt = 1; ; attempt += 1) {
      const response = await this.fetchImpl(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Encoding': 'gzip, deflate',
          ...extraHeaders
        },
        signal: AbortSignal.timeout(60_000)
      });
      if (response.status < 400 || response.status === 304) return response;
      const retryable = response.status === 429 || response.status === 403 || response.status >= 500;
      if (!retryable || attempt >= RETRY_BUDGET) {
        throw new Error(`${url}: HTTP ${response.status} after ${attempt} attempt(s)`);
      }
      // Exponential backoff with full jitter, on top of the base pace.
      await this.sleep(PACE_MS * 2 ** attempt * (0.5 + Math.random() / 2));
    }
  }

  async fetchCompanyfacts(cik: number): Promise<unknown> {
    const response = await this.request(companyfactsUrl(cik));
    return response.json();
  }

  private async ensureIndex(): Promise<Map<string, TickerListing>> {
    if (this.indexCache === undefined || this.now() - this.indexCache.fetchedAt > TICKER_INDEX_TTL_MS) {
      const headers: Record<string, string> = {};
      if (this.indexCache?.etag !== undefined) headers['If-None-Match'] = this.indexCache.etag;
      const response = await this.request(TICKER_INDEX_URL, headers);
      if (response.status === 304 && this.indexCache !== undefined) {
        this.indexCache = { ...this.indexCache, fetchedAt: this.now() };
      } else {
        const listings = parseTickerListings(await response.json());
        this.indexCache = {
          byTicker: new Map(listings.map((listing) => [listing.ticker, listing])),
          etag: response.headers.get('etag') ?? undefined,
          fetchedAt: this.now()
        };
      }
      // Pace before any follow-up request (companyfacts comes next).
      await this.sleep(PACE_MS);
    }
    return this.indexCache.byTicker;
  }

  /** Ticker to listing (CIK, name, exchange), from the daily-revalidated index. */
  async lookupTicker(ticker: string): Promise<TickerListing | undefined> {
    return (await this.ensureIndex()).get(ticker);
  }

  /** Every listing, for the search index's SEC fallback (backend spec §8). */
  async fetchTickerListings(): Promise<TickerListing[]> {
    return [...(await this.ensureIndex()).values()];
  }
}
