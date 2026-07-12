/**
 * The mapping's golden tests: mapCompanyfacts over the recorded companyfacts
 * documents must reproduce the hand-verified calc-engine fixtures' line items
 * to integer equality (the same acceptance rule the engine meets, data-model
 * spec §11). One deliberate divergence: fixture entries asserting the
 * not-reported-zero state are user-shaped assertions the pipeline must NOT
 * make (three-state rule, data-model spec §8), so the mapping must emit
 * nothing for them.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapCompanyfacts, toStatementRows, EDGAR_MAPPING_VERSION } from '../src/index.js';

interface GoldenEntry {
  kind: 'entered' | 'not_reported_zero';
  amountMinor?: number;
}

interface GoldenYear {
  fy: string;
  endDate: string;
  values: Record<string, GoldenEntry>;
  sourceRef: { system: string; accessions: string[] };
}

interface GoldenFixture {
  meta: { ticker: string; cik: string };
  years: GoldenYear[];
}

const TICKERS = ['aapl', 'msft', 'ko', 'cost', 'unp'];

function loadGolden(ticker: string): GoldenFixture {
  const url = new URL(`../../../packages/calc-engine/fixtures/${ticker}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as GoldenFixture;
}

function loadRecorded(ticker: string): unknown {
  const url = new URL(`./fixtures/companyfacts/${ticker}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

describe.each(TICKERS)('mapping golden corpus: %s', (ticker) => {
  const golden = loadGolden(ticker);
  const mapped = mapCompanyfacts(loadRecorded(ticker));
  const byFy = new Map(mapped.years.map((year) => [year.fy as string, year]));

  it('covers every hand-verified fiscal year', () => {
    for (const goldenYear of golden.years) {
      expect(byFy.has(goldenYear.fy), `${goldenYear.fy} missing from mapping output`).toBe(true);
      expect(byFy.get(goldenYear.fy)?.endDate).toBe(goldenYear.endDate);
    }
  });

  it('reproduces every entered line item to integer equality, and nothing else', () => {
    for (const goldenYear of golden.years) {
      const year = byFy.get(goldenYear.fy);
      if (year === undefined) continue; // reported by the coverage test above
      const enteredEntries = Object.entries(goldenYear.values).filter(
        ([, entry]) => entry.kind === 'entered'
      );
      for (const [itemId, entry] of enteredEntries) {
        expect(
          year.items[itemId as keyof typeof year.items]?.amountMinor,
          `${golden.meta.ticker} ${goldenYear.fy} ${itemId}`
        ).toBe(entry.amountMinor);
      }
      // Key-set equality: the mapping must not produce items the hand-verified
      // corpus does not carry, and (below) must not fabricate the fixtures'
      // user-shaped not-reported-zero assertions.
      expect(Object.keys(year.items).sort(), `${golden.meta.ticker} ${goldenYear.fy}`).toEqual(
        enteredEntries.map(([itemId]) => itemId).sort()
      );
      for (const [itemId, entry] of Object.entries(goldenYear.values)) {
        if (entry.kind === 'not_reported_zero') {
          expect(
            year.items[itemId as keyof typeof year.items],
            `${goldenYear.fy} ${itemId} must stay absent: only the user asserts not-reported-zero`
          ).toBeUndefined();
        }
      }
    }
  });

  it('emits contract-valid statement rows whose filing reference the corpus verified', () => {
    const latestGolden = golden.years.at(-1);
    expect(latestGolden).toBeDefined();
    if (latestGolden === undefined) return;
    const year = byFy.get(latestGolden.fy);
    expect(year).toBeDefined();
    if (year === undefined) return;
    const rows = toStatementRows(year, {
      cik: Number(golden.meta.cik),
      recordedAt: '2026-07-12T00:00:00Z'
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.provenance.mappingVersion).toBe(EDGAR_MAPPING_VERSION);
      expect(latestGolden.sourceRef.accessions).toContain(row.provenance.filing.documentId);
      expect(row.provenance.filing.url).toContain(String(Number(golden.meta.cik)));
    }
  });
});
