/**
 * The read side of the contract mirror. The fixture in fixtures/ is
 * written by the engine (pairs_engine.golden, byte-pinned over there);
 * parsing it here is what makes drift on either side a test failure.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAIR_SCAN_ARTEFACT_KIND,
  pairsArtefactCollectionSchema,
  pairsArtefactRunSchema,
  pairScanReportSchema
} from '../src/index.js';

const fixture: unknown = JSON.parse(
  readFileSync(new URL('../fixtures/pair-scan.golden.json', import.meta.url), 'utf8')
);

const run = {
  runDate: '2024-01-26',
  engineVersion: '0.1.0',
  schemaVersion: 1,
  generatedAt: '2026-07-22T09:30:00Z',
  receivedAt: '2026-07-22T09:31:11Z',
  sizeBytes: 2048
};

describe('the pair scan report schema', () => {
  it('parses the engine-written golden fixture', () => {
    const report = pairScanReportSchema.parse(fixture);
    expect(report.artefact).toBe(PAIR_SCAN_ARTEFACT_KIND);
    expect(report.universe).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
    // Ten choose-two pairs, reconciled exactly: tested plus skipped.
    expect(report.pairsTested + report.skipped.length).toBe(10);
    expect(report.pairs).toHaveLength(report.pairsTested);
    for (const skipped of report.skipped) {
      expect([skipped.ticker1, skipped.ticker2]).toContain('EEE');
    }
    const planted = report.candidates.find(
      (candidate) => candidate.ticker1 === 'AAA' && candidate.ticker2 === 'BBB'
    );
    expect(planted).toBeDefined();
    expect(Math.abs((planted?.beta ?? 0) - 2.5)).toBeLessThan(0.05);
    // Every candidate also appears in the full pair table, flagged.
    for (const candidate of report.candidates) {
      const row = report.pairs.find(
        (pair) => pair.ticker1 === candidate.ticker1 && pair.ticker2 === candidate.ticker2
      );
      expect(row?.candidate).toBe(true);
    }
  });

  it('rejects a wrong artefact kind, schema version, or skip reason', () => {
    const report = pairScanReportSchema.parse(fixture);
    expect(pairScanReportSchema.safeParse({ ...report, artefact: 'somethingElse' }).success).toBe(false);
    expect(pairScanReportSchema.safeParse({ ...report, schemaVersion: 2 }).success).toBe(false);
    expect(
      pairScanReportSchema.safeParse({
        ...report,
        skipped: [{ ticker1: 'AAA', ticker2: 'EEE', sharedTrainDays: 3, reason: 'gutFeel' }]
      }).success
    ).toBe(false);
    expect(pairScanReportSchema.safeParse({ ...report, runDate: '26/01/2024' }).success).toBe(false);
  });
});

describe('the run and collection schemas', () => {
  it('accepts a stored run and rejects a negative size', () => {
    expect(pairsArtefactRunSchema.parse(run)).toEqual(run);
    expect(pairsArtefactRunSchema.safeParse({ ...run, sizeBytes: -1 }).success).toBe(false);
  });

  it('accepts the empty collection and the populated one', () => {
    expect(pairsArtefactCollectionSchema.parse({ latest: null, history: [] })).toEqual({
      latest: null,
      history: []
    });
    const populated = pairsArtefactCollectionSchema.parse({
      latest: fixture,
      history: [run]
    });
    expect(populated.latest?.runDate).toBe('2024-01-26');
    expect(populated.history).toHaveLength(1);
  });
});
