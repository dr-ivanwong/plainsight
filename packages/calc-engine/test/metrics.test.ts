import { describe, expect, it } from 'vitest';
import {
  buildSeries,
  computeMetric,
  effectiveTaxRate,
  METRIC_IDS,
  METRICS,
  type MetricContext
} from '../src/metrics.js';
import { fyYear } from '../src/fy.js';
import type { MetricId, PriceRecord, StatementYear } from '../src/types.js';
import { completeYear, year, zeroAsserted } from './helpers.js';

const PRICE: PriceRecord = { amountMinor: 10_000, currency: 'USD', asOf: '2026-07-10' };

function ctx(y: StatementYear, prior?: StatementYear, price?: PriceRecord): MetricContext {
  return { year: y, prior, price };
}

function series(years: StatementYear[], id: MetricId, price?: PriceRecord) {
  const byYear = new Map(years.map((y) => [fyYear(y.fy), y]));
  return buildSeries(id, years, byYear, price);
}

describe('the metric dictionary (14 pinned, 12 cards)', () => {
  it('renders exactly 12 dashboard cards', () => {
    const cards = METRIC_IDS.filter((id) => METRICS[id].card);
    expect(cards).toHaveLength(12);
  });

  it('hosts FCF margin in FCF conversion and earnings yield in P/E', () => {
    expect(METRICS.fcfMargin).toMatchObject({ card: false, detailHostId: 'fcfConversion' });
    expect(METRICS.earningsYield).toMatchObject({ card: false, detailHostId: 'pe' });
  });

  it('has unique, consistent ids', () => {
    expect(new Set(METRIC_IDS).size).toBe(14);
    for (const id of METRIC_IDS) expect(METRICS[id].id).toBe(id);
  });
});

describe('the margins', () => {
  it('gross margin prefers as-reported gross profit over the derivation (as-reported precedence)', () => {
    const reported = completeYear('FY2024', { grossProfit: 39_000 });
    expect(computeMetric('grossMargin', ctx(reported))).toEqual({ status: 'ok', value: 0.39 });
  });

  it('gross margin derives gross profit when the filing omits it', () => {
    // 100_000 - 60_000 over 100_000.
    expect(computeMetric('grossMargin', ctx(completeYear('FY2024')))).toEqual({ status: 'ok', value: 0.4 });
  });

  it('gross margin is insufficient without revenue or without both gross profit inputs', () => {
    expect(computeMetric('grossMargin', ctx(year('FY2024', { revenue: 100 })))).toEqual({
      status: 'insufficient_data',
      missing: ['costOfRevenue']
    });
  });

  it('margins are not meaningful at zero revenue', () => {
    const y = completeYear('FY2024', { revenue: 0 });
    for (const id of ['grossMargin', 'operatingMargin', 'netMargin'] as const) {
      expect(computeMetric(id, ctx(y))).toEqual({ status: 'not_meaningful', reason: 'zero_revenue' });
    }
  });

  it('operating and net margins compute; negative earnings pass through as negative margins', () => {
    const y = completeYear('FY2024', { netIncome: -10_000 });
    expect(computeMetric('operatingMargin', ctx(y))).toEqual({ status: 'ok', value: 0.25 });
    expect(computeMetric('netMargin', ctx(y))).toEqual({ status: 'ok', value: -0.1 });
  });
});

describe('ROE and the denominator basis', () => {
  it('uses the ending balance without a prior year', () => {
    expect(computeMetric('roe', ctx(completeYear('FY2024')))).toEqual({
      status: 'ok',
      value: 0.5,
      basis: 'ending'
    });
  });

  it('uses the ending balance when the prior balance sheet is incomplete', () => {
    const prior = completeYear('FY2023', {}, { drop: ['totalAssets'] });
    expect(computeMetric('roe', ctx(completeYear('FY2024'), prior))).toMatchObject({
      basis: 'ending'
    });
  });

  it('averages opening and closing equity when the prior balance sheet is complete', () => {
    const prior = completeYear('FY2023', { totalEquity: 60_000 });
    // 20_000 / ((40_000 + 60_000) / 2)
    expect(computeMetric('roe', ctx(completeYear('FY2024'), prior))).toEqual({
      status: 'ok',
      value: 0.4,
      basis: 'average'
    });
  });

  it('is not meaningful at non-positive equity, on the basis actually used', () => {
    expect(computeMetric('roe', ctx(completeYear('FY2024', { totalEquity: -5_000 })))).toEqual({
      status: 'not_meaningful',
      reason: 'negative_equity'
    });
    // Average drags the denominator to zero even though ending equity is positive.
    const prior = completeYear('FY2023', { totalEquity: -40_000 });
    expect(computeMetric('roe', ctx(completeYear('FY2024'), prior))).toEqual({
      status: 'not_meaningful',
      reason: 'negative_equity'
    });
  });

  it('reports missing inputs', () => {
    expect(computeMetric('roe', ctx(year('FY2024', { netIncome: 1 })))).toEqual({
      status: 'insufficient_data',
      missing: ['totalEquity']
    });
  });
});

describe('ROIC (the pinned definition)', () => {
  it('computes NOPAT over averaged invested capital', () => {
    // Tax rate 4_000/24_000 = 1/6; NOPAT = 25_000 * 5/6.
    // IC(2024) = 5_000 + 15_000 + 40_000 - 10_000 = 50_000; IC(2023) = 40_000.
    const prior = completeYear('FY2023', { totalEquity: 30_000 });
    const result = computeMetric('roic', ctx(completeYear('FY2024'), prior));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value).toBeCloseTo((25_000 * (5 / 6)) / 45_000, 12);
      expect(result.basis).toBe('average');
    }
  });

  it('takes the rate as 0 when pre-tax income is non-positive', () => {
    const y = completeYear('FY2024', { pretaxIncome: -1_000 });
    const result = computeMetric('roic', ctx(y));
    expect(result).toMatchObject({ status: 'ok', basis: 'ending' });
    if (result.status === 'ok') expect(result.value).toBeCloseTo(25_000 / 50_000, 12);
  });

  it('clamps the effective tax rate to [0, 0.45]', () => {
    expect(effectiveTaxRate(-500, 1_000)).toBe(0); // benefit year
    expect(effectiveTaxRate(600, 1_000)).toBe(0.45); // one-off charge
    expect(effectiveTaxRate(300, 1_000)).toBeCloseTo(0.3, 12);
    expect(effectiveTaxRate(300, 0)).toBe(0);
  });

  it('is not meaningful when invested capital is non-positive', () => {
    // Cash exceeds debt plus equity.
    const y = completeYear('FY2024', { cashAndEquivalents: 70_000 });
    expect(computeMetric('roic', ctx(y))).toEqual({
      status: 'not_meaningful',
      reason: 'negative_invested_capital'
    });
  });
});

describe('debt-to-equity', () => {
  it('computes on ending balances', () => {
    expect(computeMetric('debtToEquity', ctx(completeYear('FY2024')))).toEqual({ status: 'ok', value: 0.5 });
  });

  it('computes 0.00 for a genuinely unlevered company (spec section 8)', () => {
    const y = completeYear('FY2024', { shortTermDebt: zeroAsserted, longTermDebt: zeroAsserted });
    expect(computeMetric('debtToEquity', ctx(y))).toEqual({ status: 'ok', value: 0 });
  });

  it('is not meaningful at non-positive equity', () => {
    expect(computeMetric('debtToEquity', ctx(completeYear('FY2024', { totalEquity: 0 })))).toEqual({
      status: 'not_meaningful',
      reason: 'negative_equity'
    });
  });
});

describe('the current ratio', () => {
  it('computes', () => {
    expect(computeMetric('currentRatio', ctx(completeYear('FY2024')))).toEqual({ status: 'ok', value: 2 });
  });

  it('is not meaningful at zero current liabilities', () => {
    expect(computeMetric('currentRatio', ctx(completeYear('FY2024', { currentLiabilities: 0 })))).toEqual({
      status: 'not_meaningful',
      reason: 'zero_denominator'
    });
  });
});

describe('interest coverage and the no-debt state', () => {
  it('computes', () => {
    expect(computeMetric('interestCoverage', ctx(completeYear('FY2024')))).toEqual({ status: 'ok', value: 25 });
  });

  it('renders the healthy no-debt state for asserted and entered zero interest', () => {
    for (const interest of [zeroAsserted, 0] as const) {
      const y = completeYear('FY2024', { interestExpense: interest });
      expect(computeMetric('interestCoverage', ctx(y))).toEqual({
        status: 'not_meaningful',
        reason: 'no_interest_expense'
      });
    }
  });

  it('passes negative coverage through (the fragility rule renders it red)', () => {
    const y = completeYear('FY2024', { operatingIncome: -2_000 });
    expect(computeMetric('interestCoverage', ctx(y))).toEqual({ status: 'ok', value: -2 });
  });
});

describe('the free cash flow family', () => {
  it('FCF is operating cash flow minus capex, a money value that is never n/m', () => {
    expect(computeMetric('fcf', ctx(completeYear('FY2024')))).toEqual({ status: 'ok', value: 15_000 });
    expect(computeMetric('fcf', ctx(completeYear('FY2024', { capex: 30_000 })))).toEqual({
      status: 'ok',
      value: -8_000
    });
  });

  it('an asserted zero capex makes FCF equal operating cash flow (spec section 8)', () => {
    const y = completeYear('FY2024', { capex: zeroAsserted });
    expect(computeMetric('fcf', ctx(y))).toEqual({ status: 'ok', value: 22_000 });
  });

  it('computes FCF margin', () => {
    expect(computeMetric('fcfMargin', ctx(completeYear('FY2024')))).toEqual({ status: 'ok', value: 0.15 });
    expect(computeMetric('fcfMargin', ctx(completeYear('FY2024', { revenue: 0 })))).toEqual({
      status: 'not_meaningful',
      reason: 'zero_revenue'
    });
  });

  it('FCF conversion is not meaningful at non-positive net income', () => {
    expect(computeMetric('fcfConversion', ctx(completeYear('FY2024')))).toEqual({ status: 'ok', value: 0.75 });
    expect(computeMetric('fcfConversion', ctx(completeYear('FY2024', { netIncome: 0 })))).toEqual({
      status: 'not_meaningful',
      reason: 'negative_earnings'
    });
  });
});

describe('the valuation metrics and the price gate', () => {
  it('the price gate comes first, before sufficiency', () => {
    const empty = year('FY2024', {});
    for (const id of ['pe', 'earningsYield', 'fcfYield'] as const) {
      expect(computeMetric(id, ctx(empty))).toEqual({ status: 'not_meaningful', reason: 'no_price' });
    }
  });

  it('refuses a price in another currency (the amendment of 2026-07-15)', () => {
    // Regression capture: before the currency guard, these computed a
    // meaningless figure from an AUD price against USD statements (the CSL
    // shape). Now they are typed not-meaningful, before sufficiency.
    const audPrice: PriceRecord = { amountMinor: 24_000, currency: 'AUD', asOf: '2026-07-15' };
    for (const id of ['pe', 'earningsYield', 'fcfYield'] as const) {
      expect(computeMetric(id, ctx(completeYear('FY2024'), undefined, audPrice))).toEqual({
        status: 'not_meaningful',
        reason: 'currency_mismatch'
      });
    }
  });

  it('reports missing inputs once a price exists', () => {
    expect(computeMetric('pe', ctx(year('FY2024', {}), undefined, PRICE))).toEqual({
      status: 'insufficient_data',
      missing: ['netIncome', 'dilutedShares']
    });
  });

  it('P/E computes price over EPS', () => {
    // EPS = 20_000 / 1_000 = 20 minor; P/E = 10_000 / 20.
    expect(computeMetric('pe', ctx(completeYear('FY2024'), undefined, PRICE))).toEqual({
      status: 'ok',
      value: 500
    });
  });

  it('P/E and earnings yield are not meaningful at non-positive EPS', () => {
    const y = completeYear('FY2024', { netIncome: 0 });
    expect(computeMetric('pe', ctx(y, undefined, PRICE))).toEqual({
      status: 'not_meaningful',
      reason: 'negative_earnings'
    });
    expect(computeMetric('earningsYield', ctx(y, undefined, PRICE))).toEqual({
      status: 'not_meaningful',
      reason: 'negative_earnings'
    });
  });

  it('zero shares or a zero price are zero denominators', () => {
    const noShares = completeYear('FY2024', { dilutedShares: 0 });
    expect(computeMetric('pe', ctx(noShares, undefined, PRICE))).toEqual({
      status: 'not_meaningful',
      reason: 'zero_denominator'
    });
    expect(computeMetric('earningsYield', ctx(noShares, undefined, PRICE))).toEqual({
      status: 'not_meaningful',
      reason: 'zero_denominator'
    });
    expect(computeMetric('fcfYield', ctx(noShares, undefined, PRICE))).toEqual({
      status: 'not_meaningful',
      reason: 'zero_denominator'
    });
    const zeroPrice: PriceRecord = { ...PRICE, amountMinor: 0 };
    expect(computeMetric('earningsYield', ctx(completeYear('FY2024'), undefined, zeroPrice))).toEqual({
      status: 'not_meaningful',
      reason: 'zero_denominator'
    });
    expect(computeMetric('fcfYield', ctx(completeYear('FY2024'), undefined, zeroPrice))).toEqual({
      status: 'not_meaningful',
      reason: 'zero_denominator'
    });
  });

  it('earnings yield inverts P/E', () => {
    expect(computeMetric('earningsYield', ctx(completeYear('FY2024'), undefined, PRICE))).toEqual({
      status: 'ok',
      value: 0.002
    });
  });

  it('FCF yield computes, negative FCF rendering negative by design', () => {
    // Market cap = 10_000 * 1_000 = 10_000_000 minor.
    expect(computeMetric('fcfYield', ctx(completeYear('FY2024'), undefined, PRICE))).toEqual({
      status: 'ok',
      value: 0.0015
    });
    const burning = completeYear('FY2024', { capex: 30_000 });
    expect(computeMetric('fcfYield', ctx(burning, undefined, PRICE))).toEqual({
      status: 'ok',
      value: -0.0008
    });
  });
});

describe('buildSeries and the five-year delta', () => {
  it('handles an empty input', () => {
    const s = series([], 'netMargin');
    expect(s).toEqual({ id: 'netMargin', values: {}, latest: null, delta: null });
  });

  it('computes a delta only when both endpoints are ok', () => {
    const years = [
      completeYear('FY2019', { netIncome: 10_000 }),
      completeYear('FY2024', { netIncome: 20_000 })
    ];
    const s = series(years, 'netMargin');
    expect(s.delta).toEqual({ fromFy: 'FY2019', toFy: 'FY2024', change: 0.1, direction: 'up' });
  });

  it('hides the delta when the five-years-prior label is absent', () => {
    const s = series([completeYear('FY2020'), completeYear('FY2024')], 'netMargin');
    expect(s.delta).toBeNull();
  });

  it('hides the delta when an endpoint does not compute', () => {
    const from = completeYear('FY2019', { revenue: 0 });
    const s = series([from, completeYear('FY2024')], 'netMargin');
    expect(s.delta).toBeNull();
    const toBad = [completeYear('FY2019'), completeYear('FY2024', { revenue: 0 })];
    expect(series(toBad, 'netMargin').delta).toBeNull();
  });

  it('reports direction down and flat', () => {
    const down = series(
      [completeYear('FY2019', { netIncome: 30_000 }), completeYear('FY2024')],
      'netMargin'
    );
    expect(down.delta).toMatchObject({ direction: 'down' });
    const flat = series([completeYear('FY2019'), completeYear('FY2024')], 'netMargin');
    expect(flat.delta).toMatchObject({ direction: 'flat', change: 0 });
  });

  it('feeds the prior year to the averaged-basis metrics per label', () => {
    const years = [completeYear('FY2023', { totalEquity: 60_000 }), completeYear('FY2024')];
    const s = series(years, 'roe');
    expect(s.values.FY2023).toMatchObject({ basis: 'ending' });
    expect(s.values.FY2024).toMatchObject({ basis: 'average' });
    expect(s.latest).toMatchObject({ basis: 'average' });
  });
});
