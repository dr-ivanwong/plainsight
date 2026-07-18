// The review model: printed values become stored units exactly as typing
// would make them, the confirm threshold counts only what it should, the
// gates mark their fields, and the writes carry per-field provenance for
// everything the reviewer left as read.
import type { ExtractionResult } from '@plainsight/extraction-core';
import { describe, expect, it } from 'vitest';

import {
  buildWrites,
  effectiveValues,
  fieldKey,
  gatesFor,
  requiredConfirmations,
  seedReview
} from './reviewModel';

const result: ExtractionResult = {
  years: [
    {
      fy: 'FY2024',
      endDate: '2024-06-30',
      currency: 'AUD',
      scale: 'millions',
      fields: {
        revenue: { value: 44_189, page: 84, confidence: 0.97 },
        costOfRevenue: { value: 30_000, confidence: 0.82 },
        netIncome: { value: 2_557.1, confidence: 0.55 },
        interestExpense: { notPrinted: true, confidence: 0.93 },
        dilutedShares: { value: 1_134_028_167, confidence: 0.95 },
        totalAssets: { value: 27_000, confidence: 0.96 },
        totalLiabilities: { value: 17_000, confidence: 0.96 },
        totalEquity: { value: 10_000, confidence: 0.96 }
      }
    }
  ],
  warnings: ['FY2023 was restated in this report.']
};

describe('seedReview', () => {
  it('converts printed money at the stated scale and keeps counts exact', () => {
    const [year] = seedReview(result);
    expect(year?.fields.revenue?.value).toEqual({
      kind: 'entered',
      amountMinor: 4_418_900_000_000
    });
    // 2,557.1 million at cents lands on an integer.
    expect(year?.fields.netIncome?.value).toEqual({
      kind: 'entered',
      amountMinor: 255_710_000_000
    });
    expect(year?.fields.dilutedShares?.value).toEqual({
      kind: 'entered',
      amountMinor: 1_134_028_167
    });
    expect(year?.fields.interestExpense?.value).toEqual({ kind: 'not_reported_zero' });
    expect(year?.fields.revenue?.page).toBe(84);
  });

  it('drops a year whose label the engine cannot speak', () => {
    const bad: ExtractionResult = {
      years: [{ ...result.years[0]!, fy: 'FY24' as never }]
    };
    expect(seedReview(bad)).toHaveLength(0);
  });
});

describe('requiredConfirmations', () => {
  it('counts only the fields below the confirm threshold', () => {
    const years = seedReview(result);
    expect(requiredConfirmations(years, new Map())).toEqual([fieldKey('FY2024', 'netIncome')]);
  });

  it('lets an overtyped figure satisfy its own confirmation', () => {
    const years = seedReview(result);
    const edits = new Map([[fieldKey('FY2024', 'netIncome'), { kind: 'entered' as const, amountMinor: 1 }]]);
    expect(requiredConfirmations(years, edits)).toEqual([]);
  });
});

describe('gatesFor', () => {
  it('passes a balance sheet that cross-foots and names the fields of one that does not', () => {
    const years = seedReview(result);
    const clean = gatesFor(years, new Map());
    expect(clean[0]?.results.find((gate) => gate.gate === 'balance_sheet')?.status).toBe('pass');

    const broken = gatesFor(
      years,
      new Map([[fieldKey('FY2024', 'totalEquity'), { kind: 'entered' as const, amountMinor: 1 }]])
    );
    expect(broken[0]?.results.find((gate) => gate.gate === 'balance_sheet')?.status).toBe('fail');
    expect(broken[0]?.offenders.has('totalEquity')).toBe(true);
    expect(broken[0]?.offenders.has('totalAssets')).toBe(true);
  });
});

describe('buildWrites', () => {
  it('splits by statement, keeps provenance for unedited fields, and drops it for overtyped ones', () => {
    const years = seedReview(result);
    const edits = new Map([[fieldKey('FY2024', 'costOfRevenue'), { kind: 'entered' as const, amountMinor: 5 }]]);
    const writes = buildWrites({
      companyId: 'csl',
      years,
      edits,
      provenance: { provider: 'anthropic-haiku-4.5', model: 'm', promptVersion: 'v3' },
      recordedAt: '2026-07-18T01:00:00Z'
    });

    const statements = writes.map((write) => write.statement).sort();
    expect(statements).toEqual(['balance', 'income']);

    const income = writes.find((write) => write.statement === 'income');
    expect(income?.values.costOfRevenue).toEqual({ kind: 'entered', amountMinor: 5 });
    expect(income?.provenance.source).toBe('user_upload');
    expect(income?.provenance.extraction?.fields?.revenue).toEqual({ confidence: 0.97, page: 84 });
    expect(income?.provenance.extraction?.fields?.costOfRevenue).toBeUndefined();
    expect(income?.provenance.extraction?.promptVersion).toBe('v3');

    const balance = writes.find((write) => write.statement === 'balance');
    expect(balance?.values.totalAssets).toEqual({
      kind: 'entered',
      amountMinor: 2_700_000_000_000
    });
  });

  it('drops a cleared field from the write entirely', () => {
    const years = seedReview(result);
    const edits = new Map([[fieldKey('FY2024', 'netIncome'), null]]);
    const writes = buildWrites({
      companyId: 'csl',
      years,
      edits,
      provenance: { provider: 'p', model: 'm', promptVersion: 'v' },
      recordedAt: '2026-07-18T01:00:00Z'
    });
    const income = writes.find((write) => write.statement === 'income');
    expect(income?.values.netIncome).toBeUndefined();
    expect(effectiveValues(years[0]!, edits).netIncome).toBeUndefined();
  });
});
