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
}

export type IngestOutcome =
  | { outcome: 'ingested'; ticker: string; servedYears: number; quarantinedYears: number }
  | { outcome: 'lock_held'; ticker: string }
  | { outcome: 'unknown_ticker'; ticker: string };

export async function runIngest(deps: IngestDeps, ticker: string): Promise<IngestOutcome> {
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
      const primaryAccession =
        Object.values(latest.items)
          .map((item) => item.accession)
          .sort()
          .at(-1) ?? 'none';
      await deps.store.completeProfile(
        {
          ticker,
          name: listing.name,
          cik: listing.cik,
          exchange: listing.exchange,
          currency: 'USD',
          lastFilingSeen: primaryAccession,
          latestFyEndDate: latest.endDate
        },
        recordedAt
      );
    }
    // With no servable years the profile stays incomplete on purpose: the
    // route keeps answering 202 rather than serving an empty company, and
    // the quarantine holds whatever failed the gates.

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
