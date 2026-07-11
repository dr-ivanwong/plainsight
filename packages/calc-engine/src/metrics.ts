/**
 * The metric dictionary M1..M14 and per-metric computation, pinned by
 * docs/plan/plainsight-data-model.md section 6. The dictionary pins 14 metrics;
 * exactly 12 render as dashboard cards (D2): M10 lives in M11's detail sheet
 * and M13 in M12's.
 *
 * Guard order inside each metric: price availability first for the valuation
 * metrics (a missing price renders as the enter-price card, section 10), then
 * input sufficiency (insufficient_data with the missing items), then the pinned
 * not-meaningful cases, then the value. Division is only reached with a
 * non-zero denominator, so NaN and Infinity are unrepresentable in results.
 */
import type { LineItemId } from './lineItems.js';
import { fyYear } from './fy.js';
import type {
  Basis,
  FyLabel,
  MetricDelta,
  MetricFormat,
  MetricId,
  MetricSeries,
  MetricValue,
  PriceRecord,
  StatementYear
} from './types.js';
import { balanceSheetComplete, missingForMetric, requireValue, resolvedValue } from './values.js';

export interface MetricDef {
  readonly id: MetricId;
  /** Stable slug for typed search params (`?metric=roe`). */
  readonly key: string;
  readonly label: string;
  /** The pinned formula, rendered on the S4 detail sheet. */
  readonly formula: string;
  readonly format: MetricFormat;
  /** D2: whether this metric renders as one of the 12 dashboard cards. */
  readonly card: boolean;
  /** For the two detail-sheet metrics, the card whose sheet hosts them. */
  readonly detailHostId?: MetricId;
  /**
   * Display hint for the delta chip's improving/deteriorating mapping
   * (main plan, S3). Not a pinned dictionary field; the pinned content is the
   * formula and the edge cases. Lower is better for leverage and for the
   * price paid per dollar of earnings.
   */
  readonly higherIsBetter: boolean;
}

const def = (
  id: MetricId,
  key: string,
  label: string,
  formula: string,
  format: MetricFormat,
  opts: { card?: boolean; detailHostId?: MetricId; higherIsBetter?: boolean } = {}
): MetricDef => ({
  id,
  key,
  label,
  formula,
  format,
  card: opts.card ?? true,
  ...(opts.detailHostId === undefined ? {} : { detailHostId: opts.detailHostId }),
  higherIsBetter: opts.higherIsBetter ?? true
});

export const METRIC_IDS: readonly MetricId[] = [
  'M1',
  'M2',
  'M3',
  'M4',
  'M5',
  'M6',
  'M7',
  'M8',
  'M9',
  'M10',
  'M11',
  'M12',
  'M13',
  'M14'
];

export const METRICS: Readonly<Record<MetricId, MetricDef>> = {
  M1: def('M1', 'grossMargin', 'Gross margin', 'grossProfit ÷ revenue', 'percent'),
  M2: def('M2', 'operatingMargin', 'Operating margin', 'operatingIncome ÷ revenue', 'percent'),
  M3: def('M3', 'netMargin', 'Net margin', 'netIncome ÷ revenue', 'percent'),
  M4: def('M4', 'roe', 'ROE', 'netIncome ÷ totalEquity', 'percent'),
  M5: def('M5', 'roic', 'ROIC', 'NOPAT ÷ invested capital', 'percent'),
  M6: def('M6', 'debtToEquity', 'Debt-to-equity', '(shortTermDebt + longTermDebt) ÷ totalEquity', 'ratio', {
    higherIsBetter: false
  }),
  M7: def('M7', 'currentRatio', 'Current ratio', 'currentAssets ÷ currentLiabilities', 'ratio'),
  M8: def('M8', 'interestCoverage', 'Interest coverage', 'operatingIncome ÷ interestExpense', 'coverage'),
  M9: def('M9', 'fcf', 'Free cash flow', 'operatingCashFlow − capex', 'money'),
  M10: def('M10', 'fcfMargin', 'FCF margin', 'FCF ÷ revenue', 'percent', {
    card: false,
    detailHostId: 'M11'
  }),
  M11: def('M11', 'fcfConversion', 'FCF conversion', 'FCF ÷ netIncome', 'percent'),
  M12: def('M12', 'pe', 'P/E', 'price ÷ (netIncome ÷ dilutedShares)', 'ratio', { higherIsBetter: false }),
  M13: def('M13', 'earningsYield', 'Earnings yield', '(netIncome ÷ dilutedShares) ÷ price', 'percent', {
    card: false,
    detailHostId: 'M12'
  }),
  M14: def('M14', 'fcfYield', 'FCF yield', 'FCF ÷ (price × dilutedShares)', 'percent')
};

/** N1: effective tax rate = taxExpense ÷ pretaxIncome clamped to [0, 0.45]; 0 when pretax <= 0. */
export function effectiveTaxRate(taxExpense: number, pretaxIncome: number): number {
  if (pretaxIncome <= 0) return 0;
  return Math.min(Math.max(taxExpense / pretaxIncome, 0), 0.45);
}

export interface MetricContext {
  year: StatementYear;
  /** The year labelled one prior, when present in the input (P-4). */
  prior: StatementYear | undefined;
  price: PriceRecord | undefined;
}

const ok = (value: number, basis?: Basis): MetricValue =>
  basis === undefined ? { status: 'ok', value } : { status: 'ok', value, basis };

const notMeaningful = (
  reason: Extract<MetricValue, { status: 'not_meaningful' }>['reason']
): MetricValue => ({
  status: 'not_meaningful',
  reason
});

const insufficient = (missing: LineItemId[]): MetricValue => ({
  status: 'insufficient_data',
  missing
});

/**
 * P-4 for the return metrics: average of opening and closing balances when the
 * prior FY's balance sheet is complete, else the ending balance. The balance
 * callback receives one year and returns its balance in minor units.
 */
function p4Denominator(
  ctx: MetricContext,
  balanceOf: (year: StatementYear) => number
): { denominator: number; basis: Basis } {
  const { prior } = ctx;
  if (prior !== undefined && balanceSheetComplete(prior)) {
    return { denominator: (balanceOf(ctx.year) + balanceOf(prior)) / 2, basis: 'average' };
  }
  return { denominator: balanceOf(ctx.year), basis: 'ending' };
}

/** grossProfit as reported when entered, else derived from its inputs (P-8). */
function grossProfitOf(year: StatementYear): number {
  const entered = resolvedValue(year, 'grossProfit');
  if (entered !== undefined) return entered;
  return requireValue(year, 'revenue') - requireValue(year, 'costOfRevenue');
}

/** N1: invested capital = shortTermDebt + longTermDebt + totalEquity − cashAndEquivalents. */
function investedCapitalOf(year: StatementYear): number {
  return (
    requireValue(year, 'shortTermDebt') +
    requireValue(year, 'longTermDebt') +
    requireValue(year, 'totalEquity') -
    requireValue(year, 'cashAndEquivalents')
  );
}

function fcfOf(year: StatementYear): number {
  // N2: operatingCashFlow − capex, capex being purchases of property, plant and
  // equipment only. The conservative definition, stated on the detail sheet.
  return requireValue(year, 'operatingCashFlow') - requireValue(year, 'capex');
}

export function computeMetric(id: MetricId, ctx: MetricContext): MetricValue {
  const { year, price } = ctx;

  // Valuation metrics: the price gate comes first; the dashboard collapses
  // these cards into "Enter today's price" regardless of line-item state.
  if (id === 'M12' || id === 'M13' || id === 'M14') {
    if (price === undefined) return notMeaningful('no_price');
    return computeValuationMetric(id, year, price);
  }

  const missing = missingForMetric(id, year);
  if (missing.length > 0) return insufficient(missing);

  switch (id) {
    case 'M1': {
      const revenue = requireValue(year, 'revenue');
      if (revenue === 0) return notMeaningful('zero_revenue');
      return ok(grossProfitOf(year) / revenue);
    }
    case 'M2': {
      const revenue = requireValue(year, 'revenue');
      if (revenue === 0) return notMeaningful('zero_revenue');
      return ok(requireValue(year, 'operatingIncome') / revenue);
    }
    case 'M3': {
      const revenue = requireValue(year, 'revenue');
      if (revenue === 0) return notMeaningful('zero_revenue');
      return ok(requireValue(year, 'netIncome') / revenue);
    }
    case 'M4': {
      const { denominator, basis } = p4Denominator(ctx, (y) => requireValue(y, 'totalEquity'));
      if (denominator <= 0) return notMeaningful('negative_equity');
      return ok(requireValue(year, 'netIncome') / denominator, basis);
    }
    case 'M5': {
      const taxRate = effectiveTaxRate(
        requireValue(year, 'taxExpense'),
        requireValue(year, 'pretaxIncome')
      );
      const nopat = requireValue(year, 'operatingIncome') * (1 - taxRate);
      const { denominator, basis } = p4Denominator(ctx, investedCapitalOf);
      if (denominator <= 0) return notMeaningful('negative_invested_capital');
      return ok(nopat / denominator, basis);
    }
    case 'M6': {
      const equity = requireValue(year, 'totalEquity');
      if (equity <= 0) return notMeaningful('negative_equity');
      const debt = requireValue(year, 'shortTermDebt') + requireValue(year, 'longTermDebt');
      return ok(debt / equity);
    }
    case 'M7': {
      const currentLiabilities = requireValue(year, 'currentLiabilities');
      if (currentLiabilities === 0) return notMeaningful('zero_denominator');
      return ok(requireValue(year, 'currentAssets') / currentLiabilities);
    }
    case 'M8': {
      const interest = requireValue(year, 'interestExpense');
      // N5: zero or asserted not-reported interest is a healthy no-debt state.
      if (interest === 0) return notMeaningful('no_interest_expense');
      return ok(requireValue(year, 'operatingIncome') / interest);
    }
    case 'M9': {
      return ok(fcfOf(year));
    }
    case 'M10': {
      const revenue = requireValue(year, 'revenue');
      if (revenue === 0) return notMeaningful('zero_revenue');
      return ok(fcfOf(year) / revenue);
    }
    case 'M11': {
      const netIncome = requireValue(year, 'netIncome');
      if (netIncome <= 0) return notMeaningful('negative_earnings');
      return ok(fcfOf(year) / netIncome);
    }
  }
}

function computeValuationMetric(
  id: 'M12' | 'M13' | 'M14',
  year: StatementYear,
  price: PriceRecord
): MetricValue {
  const missing = missingForMetric(id, year);
  if (missing.length > 0) return insufficient(missing);

  const shares = requireValue(year, 'dilutedShares');
  switch (id) {
    case 'M12': {
      if (shares === 0) return notMeaningful('zero_denominator');
      const eps = requireValue(year, 'netIncome') / shares;
      if (eps <= 0) return notMeaningful('negative_earnings');
      return ok(price.amountMinor / eps);
    }
    case 'M13': {
      if (shares === 0 || price.amountMinor === 0) return notMeaningful('zero_denominator');
      const eps = requireValue(year, 'netIncome') / shares;
      if (eps <= 0) return notMeaningful('negative_earnings');
      return ok(eps / price.amountMinor);
    }
    case 'M14': {
      const marketCap = price.amountMinor * shares;
      if (marketCap === 0) return notMeaningful('zero_denominator');
      // Negative FCF renders as a negative yield by design (dictionary note).
      return ok(fcfOf(year) / marketCap);
    }
  }
}

/**
 * Assembles one metric's series across the labelled years, with the P-6 delta:
 * latest FY against the FY five labels prior, present only when both endpoints
 * compute.
 */
export function buildSeries(
  id: MetricId,
  yearsAscending: readonly StatementYear[],
  yearByFyYear: ReadonlyMap<number, StatementYear>,
  price: PriceRecord | undefined
): MetricSeries {
  const values: Partial<Record<FyLabel, MetricValue>> = {};
  for (const year of yearsAscending) {
    const prior = yearByFyYear.get(fyYear(year.fy) - 1);
    values[year.fy] = computeMetric(id, { year, prior, price });
  }

  const latestYear = yearsAscending.at(-1);
  if (latestYear === undefined) {
    return { id, values, latest: null, delta: null };
  }

  const latest = values[latestYear.fy] as MetricValue;

  let delta: MetricDelta | null = null;
  const fromYear = yearByFyYear.get(fyYear(latestYear.fy) - 5);
  if (latest.status === 'ok' && fromYear !== undefined) {
    const from = values[fromYear.fy] as MetricValue;
    if (from.status === 'ok') {
      const change = latest.value - from.value;
      delta = {
        fromFy: fromYear.fy,
        toFy: latestYear.fy,
        change,
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
      };
    }
  }

  return { id, values, latest, delta };
}
