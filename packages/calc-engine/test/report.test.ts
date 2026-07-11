import { describe, expect, it } from 'vitest';
import { METRIC_IDS } from '../src/metrics.js';
import { computeMetricsReport } from '../src/report.js';
import type { PriceRecord } from '../src/types.js';
import { completeYear } from './helpers.js';

const PRICE: PriceRecord = { amountMinor: 10_000, currency: 'USD', asOf: '2026-07-10' };

describe('computeMetricsReport', () => {
  it('handles an empty input without inventing data', () => {
    const report = computeMetricsReport({ years: [] });
    expect(report.fyLabels).toEqual([]);
    expect(report.latestFy).toBeNull();
    expect(report.currency).toBeNull();
    expect(report.marketCapMinor).toBeNull();
    expect(report.flags).toEqual([]);
    for (const id of METRIC_IDS) {
      expect(report.metrics[id].latest).toBeNull();
      expect(report.metrics[id].delta).toBeNull();
    }
  });

  it('sorts years by label regardless of input order', () => {
    const report = computeMetricsReport({
      years: [completeYear('FY2024'), completeYear('FY2022'), completeYear('FY2023')]
    });
    expect(report.fyLabels).toEqual(['FY2022', 'FY2023', 'FY2024']);
    expect(report.latestFy).toBe('FY2024');
    expect(report.currency).toBe('USD');
  });

  it('rejects duplicate fiscal-year labels (unrepresentable in storage)', () => {
    expect(() =>
      computeMetricsReport({ years: [completeYear('FY2024'), completeYear('FY2024')] })
    ).toThrow(RangeError);
  });

  it('asserts the price at the boundary', () => {
    expect(() =>
      computeMetricsReport({
        years: [],
        price: { amountMinor: 0.5, currency: 'USD', asOf: '2026-07-10' }
      })
    ).toThrow(RangeError);
  });

  it('computes market cap from the latest complete year', () => {
    const report = computeMetricsReport({
      years: [
        completeYear('FY2023', { dilutedShares: 2_000 }),
        // Latest year is incomplete, so FY2023's share count is the one used.
        completeYear('FY2024', {}, { drop: ['capex'] })
      ],
      price: PRICE
    });
    expect(report.marketCapMinor).toBe(10_000 * 2_000);
  });

  it('market cap is null without a price or without any complete year', () => {
    expect(
      computeMetricsReport({ years: [completeYear('FY2024')] }).marketCapMinor
    ).toBeNull();
    expect(
      computeMetricsReport({
        years: [completeYear('FY2024', {}, { drop: ['capex'] })],
        price: PRICE
      }).marketCapMinor
    ).toBeNull();
  });

  it('propagates fired flags', () => {
    const report = computeMetricsReport({
      years: [completeYear('FY2024', { interestExpense: 10_000 })]
    });
    expect(report.flags.map((flag) => flag.ruleId)).toEqual(['fragility']);
  });

  it('covers every metric for every labelled year', () => {
    const report = computeMetricsReport({
      years: [completeYear('FY2023'), completeYear('FY2024')],
      price: PRICE
    });
    for (const id of METRIC_IDS) {
      expect(Object.keys(report.metrics[id].values).sort()).toEqual(['FY2023', 'FY2024']);
      expect(report.metrics[id].latest).not.toBeNull();
    }
  });
});
