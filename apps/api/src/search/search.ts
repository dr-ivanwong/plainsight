/**
 * Ticker search over the in-memory index (backend spec §8): exact-ticker
 * boost, then prefix matches on ticker, then substring matches on name,
 * paginated by an opaque token. Pure functions; the loader owns freshness.
 */
import type { SearchResponse, SearchResult } from '@plainsight/api-contract';
import { z } from 'zod';

/**
 * One searchable listing from either market: EDGAR's TickerListing satisfies
 * it (with a CIK), the ASX directory rows satisfy it without one.
 */
export interface SearchListing {
  ticker: string;
  name: string;
  cik?: number | undefined;
  exchange?: string | undefined;
}

export const SEARCH_PAGE_SIZE = 20;

/**
 * The token is opaque to clients (the contract's pagination rule); inside it
 * carries the query it belongs to and a position in that query's ranking.
 * The ranking is stable for a day (the index refresh cadence), which is far
 * longer than anyone pages through search results.
 */
const tokenSchema = z.object({ q: z.string(), offset: z.number().int().nonnegative() });

export function encodePageToken(q: string, offset: number): string {
  return Buffer.from(JSON.stringify({ q, offset }), 'utf8').toString('base64url');
}

/** Returns the offset, or undefined for a token that is malformed or belongs to a different query. */
export function decodePageToken(token: string, q: string): number | undefined {
  try {
    const parsed = tokenSchema.parse(JSON.parse(Buffer.from(token, 'base64url').toString('utf8')));
    return parsed.q === q ? parsed.offset : undefined;
  } catch {
    return undefined;
  }
}

const toResult = (listing: SearchListing): SearchResult => ({
  ticker: listing.ticker,
  name: listing.name,
  ...(listing.cik === undefined ? {} : { cik: listing.cik }),
  ...(listing.exchange === undefined ? {} : { exchange: listing.exchange })
});

/**
 * Ranks the whole index for a query. Categories never interleave: an exact
 * ticker match outranks every prefix match, which outranks every name match;
 * within a category the ordering is deterministic (shorter ticker first,
 * then alphabetical) so pagination is stable. A bare code is an exact match
 * for its .AX listing too: WOW must surface Woolworths beside WideOpenWest,
 * with the exchange badges doing the disambiguation.
 */
export function rankListings(listings: readonly SearchListing[], q: string): SearchResult[] {
  const upper = q.toUpperCase();
  const lower = q.toLowerCase();
  const exact: SearchListing[] = [];
  const prefix: SearchListing[] = [];
  const byName: SearchListing[] = [];
  for (const listing of listings) {
    if (listing.ticker === upper || listing.ticker === `${upper}.AX`) {
      exact.push(listing);
    } else if (listing.ticker.startsWith(upper)) {
      prefix.push(listing);
    } else if (listing.name.toLowerCase().includes(lower)) {
      byName.push(listing);
    }
  }
  prefix.sort((a, b) => a.ticker.length - b.ticker.length || a.ticker.localeCompare(b.ticker));
  byName.sort((a, b) => a.name.localeCompare(b.name) || a.ticker.localeCompare(b.ticker));
  return [...exact, ...prefix, ...byName].map(toResult);
}

/** One page of results with the continuation token when more remain. */
export function searchListings(
  listings: readonly SearchListing[],
  q: string,
  offset: number
): SearchResponse {
  const ranked = rankListings(listings, q);
  const page = ranked.slice(offset, offset + SEARCH_PAGE_SIZE);
  const nextOffset = offset + SEARCH_PAGE_SIZE;
  return {
    results: page,
    ...(nextOffset < ranked.length ? { nextPageToken: encodePageToken(q, nextOffset) } : {})
  };
}
