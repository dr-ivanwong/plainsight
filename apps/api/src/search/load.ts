/**
 * The search index loader (backend spec §8): the S3 copy is the source (the
 * weekly sweep keeps it fresh), loaded into module scope and re-checked
 * daily. When the object is missing or unreadable, the loader falls back to
 * fetching the index from the SEC directly (on-demand first, main plan §6)
 * and writes the copy back, best-effort, so the next cold start reads S3.
 */
import type { TickerListing } from '../edgar/client.js';
import { parseTickerListings } from '../edgar/client.js';

export const TICKER_INDEX_KEY = 'edgar/company_tickers_exchange.json';
const RELOAD_AFTER_MS = 24 * 60 * 60 * 1000;

/** The S3 seam, narrow so tests fake it: verbatim document bytes in and out. */
export interface IndexObjectStore {
  get(): Promise<string | undefined>;
  put(body: string): Promise<void>;
}

export interface IndexLoaderDeps {
  objectStore: IndexObjectStore | undefined;
  fetchFromSec: () => Promise<TickerListing[]>;
  now: () => number;
  log: (entry: Record<string, string>) => void;
}

export class IndexLoader {
  private cache: { listings: TickerListing[]; loadedAt: number } | undefined;

  constructor(private readonly deps: IndexLoaderDeps) {}

  async load(): Promise<TickerListing[]> {
    if (this.cache !== undefined && this.deps.now() - this.cache.loadedAt < RELOAD_AFTER_MS) {
      return this.cache.listings;
    }

    if (this.deps.objectStore !== undefined) {
      try {
        const body = await this.deps.objectStore.get();
        if (body !== undefined) {
          const listings = parseTickerListings(JSON.parse(body));
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

    const listings = await this.deps.fetchFromSec();
    this.cache = { listings, loadedAt: this.deps.now() };
    if (this.deps.objectStore !== undefined) {
      try {
        // Verbatim SEC shape, so the sweep's weekly refresh and this
        // bootstrap write produce byte-compatible objects.
        await this.deps.objectStore.put(
          JSON.stringify({
            fields: ['cik', 'name', 'ticker', 'exchange'],
            data: listings.map((listing) => [
              listing.cik,
              listing.name,
              listing.ticker,
              listing.exchange ?? null
            ])
          })
        );
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
