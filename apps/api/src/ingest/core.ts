/**
 * The on-demand ingest (backend spec §5): resolve the ticker, take the
 * per-ticker lock, fetch companyfacts, map, gate, write rows, quarantine
 * failures, then complete the profile, whose appearance is what flips the
 * financials route from 202 to 200. Journey B's ten-second budget holds
 * because this is one index lookup, one companyfacts fetch, and one
 * normalisation pass.
 */
import type { EdgarClient } from '../edgar/client.js';
import { mapCompanyfacts, toStatementRows } from '../edgar/mapping.js';
import type { IngestStore } from '../db/table.js';
import { runGates } from './gates.js';

export const INGEST_LOCK_LEASE_MS = 10 * 60 * 1000;

export interface IngestDeps {
  client: EdgarClient;
  store: IngestStore;
  now: () => Date;
  /**
   * Drops the ticker's financials path from the edge cache after accepted
   * writes (backend spec §5); absent when no distribution fronts the API.
   * Best-effort: the 6-hour TTL is the backstop, so a failed invalidation
   * costs staleness, never correctness.
   */
  invalidateEdge?: ((ticker: string) => Promise<void>) | undefined;
}

export type IngestOutcome =
  | { outcome: 'ingested'; ticker: string; servedYears: number; quarantinedYears: number }
  | { outcome: 'unchanged'; ticker: string }
  | { outcome: 'lock_held'; ticker: string }
  | { outcome: 'unknown_ticker'; ticker: string };

export async function runIngest(
  deps: IngestDeps,
  ticker: string,
  mode: 'on_demand' | 'sweep' = 'on_demand'
): Promise<IngestOutcome> {
  const nowIso = deps.now().toISOString();
  const untilIso = new Date(deps.now().getTime() + INGEST_LOCK_LEASE_MS).toISOString();

  const locked = await deps.store.acquireIngestLock(ticker, nowIso, untilIso);
  if (!locked) return { outcome: 'lock_held', ticker };

  try {
    const listing = await deps.client.lookupTicker(ticker);
    if (listing === undefined) {
      // Not in the SEC index: nothing to ingest and nothing to write. The
      // client's retry loop caps out against a persistent 202; search-first
      // flows make this a typo path, not a product path.
      return { outcome: 'unknown_ticker', ticker };
    }

    let submissionsLatest: string | undefined;
    if (mode === 'sweep') {
      // Only tickers whose newest annual filing changed do any work (backend
      // spec §5): one small submissions request against the stored marker.
      const meta = await deps.store.getProfileMeta(ticker);
      if (meta?.lastFilingSeen !== undefined) {
        submissionsLatest = await deps.client.latestAnnualAccession(listing.cik);
        if (submissionsLatest !== undefined && submissionsLatest === meta.lastFilingSeen) {
          return { outcome: 'unchanged', ticker };
        }
      }
    }

    const document = await deps.client.fetchCompanyfacts(listing.cik);
    const mapped = mapCompanyfacts(document);
    const { served, quarantined } = runGates(mapped.years);

    const recordedAt = deps.now().toISOString();
    const rows = served.flatMap((year) =>
      toStatementRows(year, { cik: listing.cik, recordedAt })
    );
    await deps.store.putStatementRows(ticker, rows);

    for (const verdict of quarantined) {
      const primary =
        Object.values(verdict.year.items)[0]?.accession ?? `unknown-${verdict.year.fy}`;
      await deps.store.putQuarantine(
        ticker,
        {
          documentId: primary,
          fy: verdict.year.fy,
          reasons: verdict.reasons,
          rows: toStatementRows(verdict.year, { cik: listing.cik, recordedAt })
        },
        recordedAt
      );
    }

    const latest = served.at(-1);
    if (latest !== undefined) {
      const mappedAccession =
        Object.values(latest.items)
          .map((item) => item.accession)
          .sort()
          .at(-1) ?? 'none';
      // Prefer the submissions feed's newest annual accession when the sweep
      // fetched it: it is exactly what next week's change detector compares
      // against, so an amendment the mapping never selects (a 10-K/A whose
      // periods the originals already cover) settles instead of re-ingesting
      // weekly forever.
      await deps.store.completeProfile(
        {
          ticker,
          name: listing.name,
          cik: listing.cik,
          exchange: listing.exchange,
          currency: 'USD',
          lastFilingSeen: submissionsLatest ?? mappedAccession,
          latestFyEndDate: latest.endDate
        },
        recordedAt
      );
    }
    // With no servable years the profile stays incomplete on purpose: the
    // route keeps answering 202 rather than serving an empty company, and
    // the quarantine holds whatever failed the gates.

    if (latest !== undefined && deps.invalidateEdge !== undefined) {
      try {
        await deps.invalidateEdge(ticker);
      } catch (error) {
        console.log(
          JSON.stringify({
            route: 'ingestTicker',
            outcome: 'invalidation_failed',
            ticker,
            detail: error instanceof Error ? error.message : String(error)
          })
        );
      }
    }

    return {
      outcome: 'ingested',
      ticker,
      servedYears: served.length,
      quarantinedYears: quarantined.length
    };
  } finally {
    // Completion removes the lock attribute; this release covers every other
    // path (errors, unknown tickers, nothing servable). Lease expiry covers
    // a crash before we get here.
    await deps.store.releaseIngestLock(ticker, untilIso);
  }
}
