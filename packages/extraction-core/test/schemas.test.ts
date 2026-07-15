import { describe, expect, it } from 'vitest';

import { extractionResultSchema } from '../src/index.js';

const cochlearLossYear = {
  fy: 'FY2020',
  endDate: '2020-06-30',
  currency: 'AUD',
  scale: 'millions',
  fields: {
    revenue: { value: 1320.6, page: 79, confidence: 1 },
    operatingIncome: { value: -262.2, page: 79, confidence: 0.95 },
    taxExpense: { value: -32.8, page: 79, confidence: 0.9 },
    netIncome: { value: -238.3, page: 79, confidence: 1 },
    dilutedShares: { value: 59634602, page: 90, confidence: 1 },
    longTermDebt: { notPrinted: true, confidence: 0.8 }
  },
  dilutedEps: { value: -399.6, unit: 'cents', page: 90, confidence: 1 }
};

describe('the extraction result schema', () => {
  it('accepts a real year shape: signed values, a not-printed line, cents EPS', () => {
    const parsed = extractionResultSchema.parse({
      years: [cochlearLossYear],
      warnings: ['FY2020 includes a patent litigation expense of 503.7']
    });
    expect(parsed.years[0]?.fields.operatingIncome).toEqual({
      value: -262.2,
      page: 79,
      confidence: 0.95
    });
    expect(parsed.years[0]?.fields.longTermDebt).toEqual({ notPrinted: true, confidence: 0.8 });
  });

  it('warnings are optional; empty years are not', () => {
    expect(extractionResultSchema.safeParse({ years: [cochlearLossYear] }).success).toBe(true);
    expect(extractionResultSchema.safeParse({ years: [] }).success).toBe(false);
  });

  it('rejects what the entry grid could not take', () => {
    const withYear = (patch: object) => ({ years: [{ ...cochlearLossYear, ...patch }] });
    expect(extractionResultSchema.safeParse(withYear({ fy: '2020' })).success).toBe(false);
    expect(extractionResultSchema.safeParse(withYear({ endDate: '30 June 2020' })).success).toBe(
      false
    );
    expect(extractionResultSchema.safeParse(withYear({ currency: 'aud' })).success).toBe(false);
    expect(extractionResultSchema.safeParse(withYear({ scale: 'crores' })).success).toBe(false);
    expect(
      extractionResultSchema.safeParse(
        withYear({ fields: { revenue: { value: 1, confidence: 1.2 } } })
      ).success
    ).toBe(false);
    expect(
      extractionResultSchema.safeParse(
        withYear({ fields: { revenue: { value: 1, page: 0, confidence: 1 } } })
      ).success
    ).toBe(false);
    expect(
      extractionResultSchema.safeParse(
        withYear({ fields: { ebitda: { value: 1, confidence: 1 } } })
      ).success
    ).toBe(false);
    expect(
      extractionResultSchema.safeParse(
        withYear({ dilutedEps: { value: 1, unit: 'pence', confidence: 1 } })
      ).success
    ).toBe(false);
  });
});
