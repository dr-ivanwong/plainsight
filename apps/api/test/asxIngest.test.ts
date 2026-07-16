/**
 * Behavioural tests for the ASX ingest: the extraction-to-canonical
 * conversion with its print checksum, and the runAsxIngest choreography
 * (extract-once cache, quarantines, newest-document-wins merge, gates,
 * profile completion), all over fakes.
 */
import type {
  ExtractionResult,
  LadderOutcome,
  PreparedDocument
} from '@plainsight/extraction-core';
import { EXTRACTION_PROMPT_VERSION } from '@plainsight/extraction-core';
import type { PreprocessOutcome } from '@plainsight/extraction-core/pdf';
import { describe, expect, it } from 'vitest';

import type { MapAnnouncement, MapDocumentRecord } from '../src/index.js';
import {
  asxCodeOf,
  convertExtractedYear,
  runAsxIngest,
  toAsxStatementRows,
  type AsxIngestDeps
} from '../src/index.js';
import type { ProfileWrite, QuarantineEntry } from '../src/db/table.js';
import type { FinancialsStatement } from '@plainsight/api-contract';

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

const cohYear = {
  fy: 'FY2025',
  endDate: '2025-06-30',
  currency: 'AUD',
  scale: 'millions' as const,
  fields: {
    revenue: { value: 2343.1, page: 128, confidence: 1 },
    netIncome: { value: 388.9, page: 128, confidence: 1 },
    dilutedShares: { value: 65_606_224, page: 136, confidence: 1 },
    totalAssets: { value: 2825.0, page: 129, confidence: 1 },
    totalLiabilities: { value: 874.7, page: 129, confidence: 0.98 },
    totalEquity: { value: 1950.3, page: 129, confidence: 1 },
    longTermDebt: { notPrinted: true as const, confidence: 0.9 }
  },
  dilutedEps: { value: 592.8, unit: 'cents' as const, page: 136, confidence: 1 }
};

describe('convertExtractedYear', () => {
  it('converts printed millions to integer minor units, share counts exactly', () => {
    const converted = convertExtractedYear(cohYear);
    expect('year' in converted).toBe(true);
    if (!('year' in converted)) return;
    expect(converted.year.items.revenue?.amountMinor).toBe(234_310_000_000);
    expect(converted.year.items.dilutedShares?.amountMinor).toBe(65_606_224);
    // notPrinted stays absent: the pipeline never asserts the zero state.
    expect(converted.year.items.longTermDebt).toBeUndefined();
    expect(converted.year.items.totalLiabilities?.confidence).toBe(0.98);
  });

  it('accepts the printed EPS when net income over shares reproduces it', () => {
    expect('year' in convertExtractedYear(cohYear)).toBe(true);
  });

  it('quarantines a year whose printed EPS does not reproduce', () => {
    const transposed = {
      ...cohYear,
      fields: { ...cohYear.fields, netIncome: { value: 838.9, page: 128, confidence: 1 } }
    };
    const converted = convertExtractedYear(transposed);
    expect('failure' in converted).toBe(true);
    if (!('failure' in converted)) return;
    expect(converted.failure.reasons.join(' ')).toContain('does not reproduce');
  });

  it('rejects negative unsigned magnitudes and non-label years', () => {
    const negative = convertExtractedYear({
      ...cohYear,
      dilutedEps: undefined,
      fields: { revenue: { value: -1, confidence: 1 } }
    } as never);
    expect('failure' in negative).toBe(true);

    const badLabel = convertExtractedYear({ ...cohYear, fy: '2025' } as never);
    expect('failure' in badLabel).toBe(true);
  });

  it('allows signed losses through, the Cochlear FY2020 shape', () => {
    const lossYear = convertExtractedYear({
      fy: 'FY2020',
      endDate: '2020-06-30',
      currency: 'AUD',
      scale: 'millions' as const,
      fields: {
        operatingIncome: { value: -262.2, confidence: 1 },
        taxExpense: { value: -32.8, confidence: 1 },
        netIncome: { value: -238.3, confidence: 1 }
      }
    });
    expect('year' in lossYear).toBe(true);
    if (!('year' in lossYear)) return;
    expect(lossYear.year.items.operatingIncome?.amountMinor).toBe(-26_220_000_000);
  });
});

describe('toAsxStatementRows', () => {
  it('splits by statement and carries the full trust chain per field', () => {
    const converted = convertExtractedYear(cohYear);
    if (!('year' in converted)) throw new Error('expected a converted year');
    const rows = toAsxStatementRows(converted.year, {
      documentId: '02980612',
      recordedAt: '2026-07-16T03:00:00.000Z',
      extraction: {
        provider: 'anthropic-haiku-4.5',
        model: 'claude-haiku-4-5-20251001',
        promptVersion: EXTRACTION_PROMPT_VERSION
      }
    });
    expect(rows.map((row) => row.statement)).toEqual(['income', 'balance']);
    const income = rows[0]!;
    expect(income.provenance.source).toBe('asx_map');
    expect(income.provenance.filing.system).toBe('ASX_MAP');
    expect(income.provenance.filing.url).toContain('idsId=02980612');
    expect(income.provenance.extraction?.provider).toBe('anthropic-haiku-4.5');
    expect(income.provenance.extraction?.fields?.revenue).toEqual({ confidence: 1, page: 128 });
    expect(income.provenance.mappingVersion).toBe(EXTRACTION_PROMPT_VERSION);
  });
});

// ---------------------------------------------------------------------------
// The ingest choreography
// ---------------------------------------------------------------------------

const announcement = (idsId: string, date: string, headline: string, pages: number): MapAnnouncement => ({
  idsId,
  date,
  headline,
  priceSensitive: true,
  pages,
  fileSize: undefined
});

const extractionFor = (years: ExtractionResult['years']): ExtractionResult => ({ years });

const yearOf = (fy: string, revenueMillions: number) => ({
  fy,
  endDate: `${fy.slice(2)}-06-30`,
  currency: 'AUD',
  scale: 'millions' as const,
  fields: {
    revenue: { value: revenueMillions, page: 10, confidence: 1 },
    totalAssets: { value: 1000, page: 12, confidence: 1 },
    totalLiabilities: { value: 400, page: 12, confidence: 1 },
    totalEquity: { value: 600, page: 12, confidence: 1 }
  }
});

interface FakeWorld {
  deps: AsxIngestDeps;
  putRows: FinancialsStatement[][];
  quarantines: QuarantineEntry[];
  profiles: ProfileWrite[];
  documents: Map<string, MapDocumentRecord>;
  fetched: string[];
  extracted: number;
  invalidated: string[];
}

function fakeWorld(options: {
  announcements: MapAnnouncement[];
  results?: Record<string, ExtractionResult | 'ladder_failure'>;
  preprocessRefusal?: string | undefined;
  lockHeld?: boolean;
  profileMeta?: { lastFilingSeen?: string };
}): FakeWorld {
  const world: FakeWorld = {
    putRows: [],
    quarantines: [],
    profiles: [],
    documents: new Map(),
    fetched: [],
    extracted: 0,
    invalidated: [],
    deps: undefined as never
  };
  let pendingResult: ExtractionResult | 'ladder_failure' | undefined;
  world.deps = {
    map: {
      fetchAnnouncementsYear: (_code, year) =>
        Promise.resolve({
          announcements: options.announcements.filter((entry) => entry.date.startsWith(String(year))),
          companyName: 'COCHLEAR LIMITED'
        }),
      fetchAnnouncementPdf: (idsId) => {
        world.fetched.push(idsId);
        pendingResult = options.results?.[idsId];
        return Promise.resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
      }
    },
    store: {
      acquireIngestLock: () => Promise.resolve(!(options.lockHeld ?? false)),
      releaseIngestLock: () => Promise.resolve(),
      getProfileMeta: () => Promise.resolve(options.profileMeta),
      putStatementRows: (_ticker: string, rows: FinancialsStatement[]) => {
        world.putRows.push(rows);
        return Promise.resolve();
      },
      putQuarantine: (_ticker: string, entry: QuarantineEntry) => {
        world.quarantines.push(entry);
        return Promise.resolve();
      },
      completeProfile: (profile: ProfileWrite) => {
        world.profiles.push(profile);
        return Promise.resolve();
      }
    } as never,
    documents: {
      getDocument: (_ticker, documentId) => Promise.resolve(world.documents.get(documentId)),
      putDocument: (record) => {
        world.documents.set(record.documentId, record);
        return Promise.resolve();
      }
    },
    preprocess: (): Promise<PreprocessOutcome> =>
      Promise.resolve(
        options.preprocessRefusal === undefined
          ? {
              ok: true,
              document: { sections: [{ page: 1, text: 'statements' }] },
              needsVision: false,
              window: { from: 1, to: 3 },
              pageCount: 100
            }
          : { ok: false, reason: options.preprocessRefusal as never, pageCount: 100 }
      ),
    extract: (_document: PreparedDocument): Promise<LadderOutcome> => {
      world.extracted += 1;
      if (pendingResult === undefined || pendingResult === 'ladder_failure') {
        return Promise.resolve({
          ok: false,
          attempts: [
            {
              rungId: 'groq-llama-3.3-70b',
              model: 'llama-3.3-70b-versatile',
              repaired: true,
              failure: { kind: 'rate_limited', detail: 'HTTP 429' }
            }
          ]
        });
      }
      return Promise.resolve({
        ok: true,
        result: pendingResult,
        provenance: {
          provider: 'anthropic-haiku-4.5',
          model: 'claude-haiku-4-5-20251001',
          promptVersion: EXTRACTION_PROMPT_VERSION
        },
        attempts: [{ rungId: 'anthropic-haiku-4.5', model: 'claude-haiku-4-5-20251001', repaired: false }]
      });
    },
    now: () => new Date('2026-07-16T03:00:00.000Z'),
    invalidateEdge: (ticker) => {
      world.invalidated.push(ticker);
      return Promise.resolve();
    }
  };
  return world;
}

const AR_2025 = announcement('900', '2025-08-15', 'Annual Report 2025', 188);
const AR_2024 = announcement('800', '2024-08-16', 'Annual Report 2024', 180);

describe('runAsxIngest', () => {
  it('extracts the backfill, merges newest-document-wins, writes rows and the profile', async () => {
    const world = fakeWorld({
      announcements: [AR_2025, AR_2024],
      results: {
        '900': extractionFor([yearOf('FY2024', 2240), yearOf('FY2025', 2343.1)]),
        '800': extractionFor([yearOf('FY2023', 1936.1), yearOf('FY2024', 2235.6)])
      }
    });
    const outcome = await runAsxIngest(world.deps, 'COH.AX');

    expect(outcome).toMatchObject({ outcome: 'ingested', servedYears: 3, quarantinedYears: 0 });
    expect(world.fetched).toEqual(['900', '800']);
    // FY2024 appears in both documents; the newer document's restated
    // comparative wins (2240, not 2235.6).
    const allRows = world.putRows.flat();
    const fy2024Income = allRows.find((row) => row.fy === 'FY2024' && row.statement === 'income');
    expect(fy2024Income?.values.revenue).toBe(224_000_000_000);
    expect(fy2024Income?.provenance.filing.documentId).toBe('900');

    expect(world.profiles).toHaveLength(1);
    expect(world.profiles[0]).toMatchObject({
      ticker: 'COH.AX',
      name: 'COCHLEAR LIMITED',
      exchange: 'ASX',
      currency: 'AUD',
      lastFilingSeen: '900',
      latestFyEndDate: '2025-06-30'
    });
    expect(world.profiles[0]?.cik).toBeUndefined();
    expect(world.invalidated).toEqual(['COH.AX']);
    expect(world.documents.get('900')?.status).toBe('extracted');
  });

  it('honours the extract-once cache: hits never fetch or spend', async () => {
    const world = fakeWorld({ announcements: [AR_2025] });
    world.documents.set('900', {
      ticker: 'COH.AX',
      documentId: '900',
      headline: 'Annual Report 2025',
      documentDate: '2025-08-15',
      status: 'extracted',
      promptVersion: EXTRACTION_PROMPT_VERSION,
      provider: 'anthropic-haiku-4.5',
      model: 'claude-haiku-4-5-20251001',
      extractedAt: '2026-07-01T00:00:00.000Z',
      result: extractionFor([yearOf('FY2025', 2343.1)])
    });
    const outcome = await runAsxIngest(world.deps, 'COH.AX');
    expect(outcome).toMatchObject({ outcome: 'ingested', servedYears: 1 });
    expect(world.fetched).toEqual([]);
    expect(world.extracted).toBe(0);
  });

  it('a cached quarantined document stays quarantined without a retry', async () => {
    const world = fakeWorld({ announcements: [AR_2025] });
    world.documents.set('900', {
      ticker: 'COH.AX',
      documentId: '900',
      headline: 'Annual Report 2025',
      documentDate: '2025-08-15',
      status: 'quarantined',
      promptVersion: EXTRACTION_PROMPT_VERSION,
      provider: 'none',
      model: 'none',
      extractedAt: '2026-07-01T00:00:00.000Z',
      failure: 'preprocessing refused the document: scanned_document'
    });
    const outcome = await runAsxIngest(world.deps, 'COH.AX');
    expect(outcome).toMatchObject({ outcome: 'ingested', servedYears: 0 });
    expect(world.extracted).toBe(0);
    expect(world.profiles).toHaveLength(0);
  });

  it('quarantines a preprocessing refusal into the document cache and moves on', async () => {
    const world = fakeWorld({ announcements: [AR_2025], preprocessRefusal: 'scanned_document' });
    const outcome = await runAsxIngest(world.deps, 'COH.AX');
    expect(outcome).toMatchObject({ outcome: 'ingested', servedYears: 0 });
    expect(world.documents.get('900')).toMatchObject({
      status: 'quarantined',
      failure: 'preprocessing refused the document: scanned_document'
    });
    expect(world.extracted).toBe(0);
  });

  it('quarantines a document every ladder rung failed on, naming the attempts', async () => {
    const world = fakeWorld({ announcements: [AR_2025], results: { '900': 'ladder_failure' } });
    await runAsxIngest(world.deps, 'COH.AX');
    expect(world.documents.get('900')?.failure).toContain('groq-llama-3.3-70b rate_limited');
  });

  it('quarantines a year that fails the gates, with its rows and document key', async () => {
    const broken = yearOf('FY2025', 2343.1);
    broken.fields.totalEquity.value = 100; // balance no longer cross-foots
    const world = fakeWorld({
      announcements: [AR_2025],
      results: { '900': extractionFor([broken]) }
    });
    const outcome = await runAsxIngest(world.deps, 'COH.AX');
    expect(outcome).toMatchObject({ outcome: 'ingested', servedYears: 0, quarantinedYears: 1 });
    expect(world.quarantines[0]?.documentId).toBe('900#FY2025');
    expect(world.quarantines[0]?.reasons.join(' ')).toContain('cross-foot');
    expect(world.quarantines[0]?.rows.length).toBeGreaterThan(0);
    expect(world.profiles).toHaveLength(0);
  });

  it('reports unknown tickers, held locks, and unchanged sweeps', async () => {
    const noReports = fakeWorld({ announcements: [] });
    expect(await runAsxIngest(noReports.deps, 'COH.AX')).toEqual({
      outcome: 'unknown_ticker',
      ticker: 'COH.AX'
    });

    const held = fakeWorld({ announcements: [AR_2025], lockHeld: true });
    expect(await runAsxIngest(held.deps, 'COH.AX')).toEqual({
      outcome: 'lock_held',
      ticker: 'COH.AX'
    });

    const swept = fakeWorld({
      announcements: [AR_2025],
      profileMeta: { lastFilingSeen: '900' }
    });
    expect(await runAsxIngest(swept.deps, 'COH.AX', 'sweep')).toEqual({
      outcome: 'unchanged',
      ticker: 'COH.AX'
    });

    const notAsx = fakeWorld({ announcements: [] });
    expect(await runAsxIngest(notAsx.deps, 'AAPL')).toEqual({
      outcome: 'unknown_ticker',
      ticker: 'AAPL'
    });
  });
});

describe('asxCodeOf', () => {
  it('strips the .AX namespace and rejects everything else', () => {
    expect(asxCodeOf('COH.AX')).toBe('COH');
    expect(asxCodeOf('CSL.AX')).toBe('CSL');
    expect(asxCodeOf('AAPL')).toBeUndefined();
    expect(asxCodeOf('.AX')).toBeUndefined();
  });
});
