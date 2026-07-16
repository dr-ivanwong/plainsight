/**
 * The bake-off scorer, tested against a miniature of the real Cochlear
 * transcription: the scorecard's arithmetic must be beyond doubt before it
 * ranks providers and pins the ladder.
 */
import { describe, expect, it } from 'vitest';

// @ts-expect-error tools are plain modules outside the compiled surface
import { aggregateScores, expectedYearsByDocument, gateOutcomes, scoreDocument } from '../tools/lib/score.mjs';

const TRANSCRIPTION = {
  meta: { ticker: 'COH', currency: 'AUD', documents: { ar2025: {}, ar2023: {} } },
  years: [
    {
      fy: 'FY2024',
      endDate: '2024-06-30',
      document: 'ar2025',
      eps: { diluted: 543.0, dp: 1, unit: 'cents' },
      values: { revenue: 2235.6, longTermDebt: 'nrz', dilutedShares: 65_720_649 }
    },
    {
      fy: 'FY2025',
      endDate: '2025-06-30',
      document: 'ar2025',
      eps: { diluted: 592.8, dp: 1, unit: 'cents' },
      values: { revenue: 2343.1, longTermDebt: 'nrz', dilutedShares: 65_606_224 }
    },
    {
      fy: 'FY2023',
      endDate: '2023-06-30',
      document: 'ar2023',
      eps: { diluted: 456.1, dp: 1, unit: 'cents' },
      values: { revenue: 1936.1 }
    }
  ]
};

const perfectYear = (fy: string, endDate: string, revenue: number, shares: number, eps: number) => ({
  fy,
  endDate,
  currency: 'AUD',
  scale: 'millions',
  fields: {
    revenue: { value: revenue, confidence: 1 },
    longTermDebt: { notPrinted: true, confidence: 0.9 },
    dilutedShares: { value: shares, confidence: 1 }
  },
  dilutedEps: { value: eps, unit: 'cents', confidence: 1 }
});

describe('expectedYearsByDocument', () => {
  it('groups the transcription by source document', () => {
    const byDocument = expectedYearsByDocument(TRANSCRIPTION);
    expect([...byDocument.keys()]).toEqual(['ar2025', 'ar2023']);
    expect(byDocument.get('ar2025').map((year: { fy: string }) => year.fy)).toEqual([
      'FY2024',
      'FY2025'
    ]);
  });
});

describe('scoreDocument', () => {
  const expected = expectedYearsByDocument(TRANSCRIPTION).get('ar2025');

  it('scores a perfect extraction perfect', () => {
    const score = scoreDocument(
      expected,
      {
        years: [
          perfectYear('FY2024', '2024-06-30', 2235.6, 65_720_649, 543.0),
          perfectYear('FY2025', '2025-06-30', 2343.1, 65_606_224, 592.8)
        ]
      },
      'AUD'
    );
    // Per year: endDate + currency + three values + the printed EPS.
    expect(score.fieldsExpected).toBe(12);
    expect(score.fieldsCorrect).toBe(12);
    expect(score.wrong).toEqual([]);
    expect(score.missingYears).toEqual([]);
  });

  it('charges misreads, false zeros, wrong dates, and missing years', () => {
    const wrongYear = perfectYear('FY2025', '2025-06-29', 2343.2, 65_606_224, 592.8);
    // The false zero: claiming a printed line where the filing has none.
    (wrongYear.fields as Record<string, unknown>)['longTermDebt'] = { value: 45, confidence: 1 };
    const score = scoreDocument(expected, { years: [wrongYear] }, 'AUD');

    expect(score.missingYears).toEqual(['FY2024']);
    const wrongItems = score.wrong.map((entry: { item: string }) => entry.item).sort();
    expect(wrongItems).toEqual(['endDate', 'longTermDebt', 'revenue']);
    // FY2024's five fields count as expected and none as correct.
    expect(score.fieldsExpected).toBe(12);
    expect(score.fieldsCorrect).toBe(3);
  });

  it('notes extra years without penalising them', () => {
    const score = scoreDocument(
      expected,
      {
        years: [
          perfectYear('FY2024', '2024-06-30', 2235.6, 65_720_649, 543.0),
          perfectYear('FY2025', '2025-06-30', 2343.1, 65_606_224, 592.8),
          perfectYear('FY2023', '2023-06-30', 1936.1, 65_896_853, 456.1)
        ]
      },
      'AUD'
    );
    expect(score.extraYears).toEqual(['FY2023']);
    expect(score.fieldsCorrect).toBe(score.fieldsExpected);
  });
});

describe('gateOutcomes', () => {
  it('checks balance, gross profit, and the printed EPS where present', () => {
    const outcomes = gateOutcomes({
      fields: {
        totalAssets: { value: 2825.0, confidence: 1 },
        totalLiabilities: { value: 874.7, confidence: 1 },
        totalEquity: { value: 1950.3, confidence: 1 },
        revenue: { value: 2343.1, confidence: 1 },
        costOfRevenue: { value: 615.2, confidence: 1 },
        grossProfit: { value: 1727.9, confidence: 1 },
        netIncome: { value: 388.9, confidence: 1 },
        dilutedShares: { value: 65_606_224, confidence: 1 }
      },
      dilutedEps: { value: 592.8, unit: 'cents', confidence: 1 }
    });
    expect(outcomes).toEqual({ balance: true, grossProfit: true, eps: true });

    const broken = gateOutcomes({
      fields: {
        totalAssets: { value: 2825.0, confidence: 1 },
        totalLiabilities: { value: 874.7, confidence: 1 },
        totalEquity: { value: 1000, confidence: 1 }
      }
    });
    expect(broken).toEqual({ balance: false });
  });
});

describe('aggregateScores', () => {
  it('folds documents into the scorecard row', () => {
    const aggregate = aggregateScores([
      {
        latencyMs: 1000,
        failed: false,
        score: {
          fieldsExpected: 10,
          fieldsCorrect: 10,
          wrong: [],
          missingYears: [],
          gates: { applicable: 3, passed: 3 },
          extraYears: []
        }
      },
      {
        latencyMs: 3000,
        failed: true,
        score: {
          fieldsExpected: 10,
          fieldsCorrect: 0,
          wrong: [],
          missingYears: ['FY2024', 'FY2025'],
          gates: { applicable: 0, passed: 0 },
          extraYears: []
        }
      }
    ]);
    expect(aggregate.accuracy).toBe(0.5);
    expect(aggregate.gatePassRate).toBe(1);
    expect(aggregate.failures).toBe(1);
    expect(aggregate.missingYears).toBe(2);
    expect(aggregate.meanLatencyMs).toBe(2000);
  });
});
