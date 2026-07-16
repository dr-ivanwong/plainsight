/**
 * The search index loaders (backend spec §8): each market's list lives as an
 * S3 object the weekly sweep keeps fresh, loaded into module scope and
 * re-checked daily. When an object is missing or unreadable, the loader
 * falls back to fetching from the origin directly (on-demand first, main
 * plan §6) and writes the copy back, best-effort, so the next cold start
 * reads S3. One loader class, two instances: the SEC index and the ASX
 * listed-companies directory.
 */
import { parseTickerListings } from '../edgar/client.js';
import type { SearchListing } from './search.js';

export const TICKER_INDEX_KEY = 'edgar/company_tickers_exchange.json';
export const ASX_DIRECTORY_KEY = 'asx/listed-companies.json';
const RELOAD_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * The SEC index shape, verbatim, so the weekly sweep's refresh and the
 * loader's bootstrap write produce byte-compatible objects.
 */
export function serialiseTickerIndex(listings: readonly SearchListing[]): string {
  return JSON.stringify({
    fields: ['cik', 'name', 'ticker', 'exchange'],
    data: listings.map((listing) => [
      listing.cik ?? null,
      listing.name,
      listing.ticker,
      listing.exchange ?? null
    ])
  });
}

/** The ASX directory's stored shape: already .AX-qualified, no CIK exists. */
export function serialiseAsxDirectory(listings: readonly SearchListing[]): string {
  return JSON.stringify({
    fields: ['ticker', 'name'],
    data: listings.map((listing) => [listing.ticker, listing.name])
  });
}

export function parseAsxDirectoryObject(body: string): SearchListing[] {
  const parsed = JSON.parse(body) as { data: [string, string][] };
  return parsed.data.map(([ticker, name]) => ({ ticker, name, exchange: 'ASX' }));
}

export const parseTickerIndexObject = (body: string): SearchListing[] =>
  parseTickerListings(JSON.parse(body));

/** The S3 seam, narrow so tests fake it: verbatim document bytes in and out. */
export interface IndexObjectStore {
  get(): Promise<string | undefined>;
  put(body: string): Promise<void>;
}

export interface IndexLoaderDeps {
  objectStore: IndexObjectStore | undefined;
  fetchFromOrigin: () => Promise<SearchListing[]>;
  parse: (body: string) => SearchListing[];
  serialise: (listings: readonly SearchListing[]) => string;
  now: () => number;
  log: (entry: Record<string, string>) => void;
}

export class IndexLoader {
  private cache: { listings: SearchListing[]; loadedAt: number } | undefined;

  constructor(private readonly deps: IndexLoaderDeps) {}

  async load(): Promise<SearchListing[]> {
    if (this.cache !== undefined && this.deps.now() - this.cache.loadedAt < RELOAD_AFTER_MS) {
      return this.cache.listings;
    }

    if (this.deps.objectStore !== undefined) {
      try {
        const body = await this.deps.objectStore.get();
        if (body !== undefined) {
          const listings = this.deps.parse(body);
          this.cache = { listings, loadedAt: this.deps.now() };
          return listings;
        }
      } catch (error) {
        this.deps.log({
          route: 'searchTickers',
          outcome: 'index_object_unreadable',
          detail: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const listings = await this.deps.fetchFromOrigin();
    this.cache = { listings, loadedAt: this.deps.now() };
    if (this.deps.objectStore !== undefined) {
      try {
        await this.deps.objectStore.put(this.deps.serialise(listings));
      } catch (error) {
        this.deps.log({
          route: 'searchTickers',
          outcome: 'index_object_write_failed',
          detail: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return listings;
  }
}
