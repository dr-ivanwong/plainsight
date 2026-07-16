/**
 * The on-demand ASX ingest (backend spec §5): the EDGAR ingest's shape with
 * the extraction engine where the mapping table sits. Resolve the statutory
 * lodgements from the last few year pages, and for each document run the
 * extract-once contract: DOC# cache hit or fetch, preprocess, ladder,
 * cache the outcome forever (quarantined outcomes included, so a document
 * is never re-tried by default). Extracted years merge newest-document-wins,
 * matching the golden corpus's sourcing rule (an even year reads from the
 * following report's comparative column, restatements included), then the
 * same pinned gates and the same write choreography as EDGAR.
 *
 * The first ingest backfills the three most recent statutory reports: six
 * fiscal years, the data-model spec's minimum depth (its §12 depth
 * rationale), for three cached extractions.
 */
import type { LadderOutcome, PreparedDocument } from '@plainsight/extraction-core';
import { EXTRACTION_PROMPT_VERSION } from '@plainsight/extraction-core';
import type { PreprocessOutcome } from '@plainsight/extraction-core/pdf';

import type { AnnouncementsYear, MapAnnouncement } from '../asx/client.js';
import { convertExtraction, toAsxStatementRows, type ConvertedYear } from '../asx/convert.js';
import type { DocumentCacheStore, MapDocumentRecord } from '../asx/documents.js';
import { resolveStatutoryReports } from '../asx/resolve.js';
import type { IngestStore } from '../db/table.js';
import { INGEST_LOCK_LEASE_MS } from './core.js';
import { runGates } from './gates.js';

/** The .AX suffix is the ticker namespace for ASX listings (backend spec §2). */
export const ASX_TICKER_SUFFIX = '.AX';

export const asxCodeOf = (ticker: string): string | undefined =>
  ticker.endsWith(ASX_TICKER_SUFFIX) && ticker.length > ASX_TICKER_SUFFIX.length
    ? ticker.slice(0, -ASX_TICKER_SUFFIX.length)
    : undefined;

/** Three reports carry six fiscal years, the pinned minimum depth. */
const DEFAULT_BACKFILL_REPORTS = 3;
/** Year pages fetched to find them: the backfill plus one season of slack. */
const YEAR_PAGES = 3;

export interface AsxIngestDeps {
  map: {
    fetchAnnouncementsYear(asxCode: string, year: number): Promise<AnnouncementsYear>;
    fetchAnnouncementPdf(idsId: string): Promise<Uint8Array>;
  };
  store: IngestStore;
  documents: DocumentCacheStore;
  preprocess(bytes: Uint8Array): Promise<PreprocessOutcome>;
  extract(document: PreparedDocument): Promise<LadderOutcome>;
  now: () => Date;
  invalidateEdge?: ((ticker: string) => Promise<void>) | undefined;
  backfillReports?: number | undefined;
}

export type AsxIngestOutcome =
  | {
      outcome: 'ingested';
      ticker: string;
      servedYears: number;
      quarantinedYears: number;
      documents: number;
    }
  | { outcome: 'unchanged'; ticker: string }
  | { outcome: 'lock_held'; ticker: string }
  | { outcome: 'unknown_ticker'; ticker: string };

interface ExtractedDocument {
  record: MapDocumentRecord;
  announcement: MapAnnouncement;
}

export async function runAsxIngest(
  deps: AsxIngestDeps,
  ticker: string,
  mode: 'on_demand' | 'sweep' = 'on_demand'
): Promise<AsxIngestOutcome> {
  const asxCode = asxCodeOf(ticker);
  if (asxCode === undefined) return { outcome: 'unknown_ticker', ticker };

  const nowIso = deps.now().toISOString();
  const untilIso = new Date(deps.now().getTime() + INGEST_LOCK_LEASE_MS).toISOString();
  const locked = await deps.store.acquireIngestLock(ticker, nowIso, untilIso);
  if (!locked) return { outcome: 'lock_held', ticker };

  try {
    const thisYear = deps.now().getUTCFullYear();
    const announcements: MapAnnouncement[] = [];
    let companyName: string | undefined;
    for (let offset = 0; offset < YEAR_PAGES; offset += 1) {
      const page = await deps.map.fetchAnnouncementsYear(asxCode, thisYear - offset);
      announcements.push(...page.announcements);
      companyName ??= page.companyName;
    }

    const reports = resolveStatutoryReports(announcements).slice(
      0,
      deps.backfillReports ?? DEFAULT_BACKFILL_REPORTS
    );
    if (reports.length === 0) {
      // Nothing statutory on the MAP for this code: a typo, a delisting, or
      // a fund whose lodgements this pipeline does not read. Same semantics
      // as EDGAR's unknown ticker: nothing to write, the 202 caps out.
      return { outcome: 'unknown_ticker', ticker };
    }

    const newest = reports[0]!;
    if (mode === 'sweep') {
      const meta = await deps.store.getProfileMeta(ticker);
      if (meta?.lastFilingSeen !== undefined && meta.lastFilingSeen === newest.idsId) {
        return { outcome: 'unchanged', ticker };
      }
    }

    const recordedAt = deps.now().toISOString();
    const extracted: ExtractedDocument[] = [];
    for (const announcement of reports) {
      const record = await extractDocument(deps, ticker, announcement, recordedAt);
      if (record.status === 'extracted' && record.result !== undefined) {
        extracted.push({ record, announcement });
      }
    }

    // Newest document wins a contested year: iterate oldest first so later
    // (newer) documents overwrite, which is the corpus's comparative-column
    // sourcing rule applied to a rolling pipeline.
    const byYear = new Map<string, { year: ConvertedYear; document: ExtractedDocument }>();
    let quarantinedYears = 0;
    for (const document of [...extracted].reverse()) {
      const { years, failures } = convertExtraction(document.record.result!);
      for (const failure of failures) {
        quarantinedYears += 1;
        await deps.store.putQuarantine(
          ticker,
          {
            // Suffix the fiscal year so two failing years from one document
            // keep separate quarantine rows under the QUAR# prefix.
            documentId: `${document.record.documentId}#${failure.fy}`,
            fy: failure.fy,
            reasons: failure.reasons,
            rows: []
          },
          recordedAt
        );
      }
      for (const year of years) byYear.set(year.fy, { year, document });
    }

    const ordered = [...byYear.values()].sort((a, b) => a.year.fy.localeCompare(b.year.fy));
    const { served, quarantined } = runGates(ordered.map((entry) => entry.year));
    const documentOf = new Map(ordered.map((entry) => [entry.year.fy, entry.document]));

    const rowsOf = (year: ConvertedYear) => {
      const document = documentOf.get(year.fy)!;
      return toAsxStatementRows(year, {
        documentId: document.record.documentId,
        recordedAt,
        extraction: {
          provider: document.record.provider,
          model: document.record.model,
          promptVersion: document.record.promptVersion
        }
      });
    };

    const servedRows = served.flatMap(rowsOf);
    if (servedRows.length > 0) await deps.store.putStatementRows(ticker, servedRows);
    for (const verdict of quarantined) {
      quarantinedYears += 1;
      await deps.store.putQuarantine(
        ticker,
        {
          documentId: `${documentOf.get(verdict.year.fy)!.record.documentId}#${verdict.year.fy}`,
          fy: verdict.year.fy,
          reasons: verdict.reasons,
          rows: rowsOf(verdict.year)
        },
        recordedAt
      );
    }

    const latest = served.at(-1);
    if (latest !== undefined) {
      await deps.store.completeProfile(
        {
          ticker,
          name: companyName ?? asxCode,
          exchange: 'ASX',
          currency: latest.currency,
          lastFilingSeen: newest.idsId,
          latestFyEndDate: latest.endDate
        },
        recordedAt
      );
      if (deps.invalidateEdge !== undefined) {
        try {
          await deps.invalidateEdge(ticker);
        } catch (error) {
          console.log(
            JSON.stringify({
              route: 'extractFiling',
              outcome: 'invalidation_failed',
              ticker,
              detail: error instanceof Error ? error.message : String(error)
            })
          );
        }
      }
    }

    return {
      outcome: 'ingested',
      ticker,
      servedYears: served.length,
      quarantinedYears,
      documents: reports.length
    };
  } finally {
    await deps.store.releaseIngestLock(ticker, untilIso);
  }
}

/**
 * The extract-once contract for one document: a cache hit of either status
 * is final (re-running a quarantined document is an explicit operator
 * action, never a default); a miss runs fetch, preprocess, ladder, and
 * caches whatever happened. Scanned documents quarantine as preprocessing
 * refusals: the Lambda carries no rasteriser yet (vision documents are the
 * upload path's concern; every ASX 200 statutory report in the corpus is
 * born-digital), and the refusal names the reason for the review queue.
 */
async function extractDocument(
  deps: AsxIngestDeps,
  ticker: string,
  announcement: MapAnnouncement,
  recordedAt: string
): Promise<MapDocumentRecord> {
  const cached = await deps.documents.getDocument(ticker, announcement.idsId);
  if (cached !== undefined) return cached;

  const base = {
    ticker,
    documentId: announcement.idsId,
    headline: announcement.headline,
    documentDate: announcement.date,
    ...(announcement.pages === undefined ? {} : { pdfPages: announcement.pages }),
    promptVersion: EXTRACTION_PROMPT_VERSION,
    extractedAt: recordedAt
  };

  let record: MapDocumentRecord;
  const bytes = await deps.map.fetchAnnouncementPdf(announcement.idsId);
  const prepared = await deps.preprocess(bytes);
  if (!prepared.ok) {
    record = {
      ...base,
      status: 'quarantined',
      provider: 'none',
      model: 'none',
      failure: `preprocessing refused the document: ${prepared.reason}`
    };
  } else {
    const outcome = await deps.extract(prepared.document);
    record = outcome.ok
      ? {
          ...base,
          status: 'extracted',
          provider: outcome.provenance.provider,
          model: outcome.provenance.model,
          result: outcome.result
        }
      : {
          ...base,
          status: 'quarantined',
          provider: 'none',
          model: 'none',
          failure: `every ladder rung failed: ${outcome.attempts
            .map((attempt) => `${attempt.rungId} ${attempt.failure?.kind ?? 'ok'}`)
            .join('; ')}`
        };
  }
  await deps.documents.putDocument(record);
  return record;
}
