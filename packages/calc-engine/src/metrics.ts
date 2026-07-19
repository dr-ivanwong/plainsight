/**
 * The metric dictionary and per-metric computation, pinned by
 * docs/plan/plainsight-data-model.md section 6. The dictionary pins 14 metrics;
 * exactly 12 render as dashboard cards (the metric-budget decision, data-model
 * section 12): FCF margin lives in FCF conversion's detail sheet and earnings
 * yield in P/E's.
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
  /** Pinned identifier, doubling as the slug for typed search params (`?metric=roe`). */
  readonly id: MetricId;
  readonly label: string;
  /** The pinned formula, rendered on the metric detail sheet. */
  readonly formula: string;
  readonly format: MetricFormat;
  /** Whether this metric renders as one of the 12 dashboard cards (the metric-budget decision). */
  readonly card: boolean;
  /** For the two detail-sheet metrics, the card whose sheet hosts them. */
  readonly detailHostId?: MetricId;
  /**
   * The compare screen's best-in-row preference: which end wins when ranking
   * peers at a point in time. Lower is better for leverage and for the price
   * paid per dollar of earnings. Distinct from healthDirection below: a
   * group's best price is a ranking, not a health claim.
   */
  readonly higherIsBetter: boolean;
  /**
   * The pinned own-trend health direction (data-model section 6, health
   * direction note): the direction a healthy trend moves. Absent where the
   * dictionary claims none: the current ratio (an ever-fatter one is not
   * obviously healthier) and the price-driven valuation metrics (their moves
   * describe the price paid, not the business). The dashboard's delta
   * colour, health dots, and sparkline colour all read this field.
   */
  readonly healthDirection?: 'up' | 'down';
}

const def = (
  id: MetricId,
  label: string,
  formula: string,
  format: MetricFormat,
  opts: {
    card?: boolean;
    detailHostId?: MetricId;
    higherIsBetter?: boolean;
    healthDirection?: 'up' | 'down';
  } = {}
): MetricDef => ({
  id,
  label,
  formula,
  format,
  card: opts.card ?? true,
  ...(opts.detailHostId === undefined ? {} : { detailHostId: opts.detailHostId }),
  higherIsBetter: opts.higherIsBetter ?? true,
  ...(opts.healthDirection === undefined ? {} : { healthDirection: opts.healthDirection })
});

/** Dictionary order (data-model section 6), which is also dashboard card order. */
export const METRIC_IDS: readonly MetricId[] = [
  'grossMargin',
  'operatingMargin',
  'netMargin',
  'roe',
  'roic',
  'debtToEquity',
  'currentRatio',
  'interestCoverage',
  'fcf',
  'fcfMargin',
  'fcfConversion',
  'pe',
  'earningsYield',
  'fcfYield'
];

export const METRICS: Readonly<Record<MetricId, MetricDef>> = {
  grossMargin: def('grossMargin', 'Gross margin', 'grossProfit ÷ revenue', 'percent', {
    healthDirection: 'up'
  }),
  operatingMargin: def('operatingMargin', 'Operating margin', 'operatingIncome ÷ revenue', 'percent', {
    healthDirection: 'up'
  }),
  netMargin: def('netMargin', 'Net margin', 'netIncome ÷ revenue', 'percent', {
    healthDirection: 'up'
  }),
  roe: def('roe', 'ROE', 'netIncome ÷ totalEquity', 'percent', { healthDirection: 'up' }),
  roic: def('roic', 'ROIC', 'NOPAT ÷ invested capital', 'percent', { healthDirection: 'up' }),
  debtToEquity: def('debtToEquity', 'Debt-to-equity', '(shortTermDebt + longTermDebt) ÷ totalEquity', 'ratio', {
    higherIsBetter: false,
    healthDirection: 'down'
  }),
  currentRatio: def('currentRatio', 'Current ratio', 'currentAssets ÷ currentLiabilities', 'ratio'),
  interestCoverage: def('interestCoverage', 'Interest coverage', 'operatingIncome ÷ interestExpense', 'coverage', {
    healthDirection: 'up'
  }),
  fcf: def('fcf', 'Free cash flow', 'operatingCashFlow − capex', 'money', {
    healthDirection: 'up'
  }),
  fcfMargin: def('fcfMargin', 'FCF margin', 'FCF ÷ revenue', 'percent', {
    card: false,
    detailHostId: 'fcfConversion',
    healthDirection: 'up'
  }),
  fcfConversion: def('fcfConversion', 'FCF conversion', 'FCF ÷ netIncome', 'percent', {
    healthDirection: 'up'
  }),
  pe: def('pe', 'P/E', 'price ÷ (netIncome ÷ dilutedShares)', 'ratio', { higherIsBetter: false }),
  earningsYield: def('earningsYield', 'Earnings yield', '(netIncome ÷ dilutedShares) ÷ price', 'percent', {
    card: false,
    detailHostId: 'pe'
  }),
  fcfYield: def('fcfYield', 'FCF yield', 'FCF ÷ (price × dilutedShares)', 'percent')
};

/**
 * Effective tax rate = taxExpense ÷ pretaxIncome clamped to [0, 0.45]; 0 when
 * pretax <= 0 (the pinned ROIC definition, data-model section 6).
 */
export function effectiveTaxRate(taxExpense: number, pretaxIncome: number): number {
  if (pretaxIncome <= 0) return 0;
  return Math.min(Math.max(taxExpense / pretaxIncome, 0), 0.45);
}

/**
 * NOPAT = operatingIncome × (1 − effective tax rate) (the pinned ROIC
 * definition, data-model section 6). Exported so the detail sheet substitutes
 * the very arithmetic the metric used, never a parallel derivation.
 */
export function nopat(operatingIncome: number, taxExpense: number, pretaxIncome: number): number {
  return operatingIncome * (1 - effectiveTaxRate(taxExpense, pretaxIncome));
}

/**
 * Invested capital = shortTermDebt + longTermDebt + totalEquity −
 * cashAndEquivalents (the pinned ROIC definition, data-model section 6).
 * Exported for the same single-definition reason as `nopat`.
 */
export function investedCapital(parts: {
  shortTermDebt: number;
  longTermDebt: number;
  totalEquity: number;
  cashAndEquivalents: number;
}): number {
  return parts.shortTermDebt + parts.longTermDebt + parts.totalEquity - parts.cashAndEquivalents;
}

export interface MetricContext {
  year: StatementYear;
  /** The year labelled one prior, when present in the input; feeds the averaged denominator basis. */
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
 * The return metrics' denominator basis (data-model section 4): average of
 * opening and closing balances when the prior FY's balance sheet is complete,
 * else the ending balance. The balance callback receives one year and returns
 * its balance in minor units.
 */
function returnDenominator(
  ctx: MetricContext,
  balanceOf: (year: StatementYear) => number
): { denominator: number; basis: Basis } {
  const { prior } = ctx;
  if (prior !== undefined && balanceSheetComplete(prior)) {
    return { denominator: (balanceOf(ctx.year) + balanceOf(prior)) / 2, basis: 'average' };
  }
  return { denominator: balanceOf(ctx.year), basis: 'ending' };
}

/** grossProfit as reported when entered, else derived from its inputs (as-reported precedence, data-model section 4). */
function grossProfitOf(year: StatementYear): number {
  const entered = resolvedValue(year, 'grossProfit');
  if (entered !== undefined) return entered;
  return requireValue(year, 'revenue') - requireValue(year, 'costOfRevenue');
}

/** The year's invested capital from its required items (sufficiency-checked by the caller). */
function investedCapitalOf(year: StatementYear): number {
  return investedCapital({
    shortTermDebt: requireValue(year, 'shortTermDebt'),
    longTermDebt: requireValue(year, 'longTermDebt'),
    totalEquity: requireValue(year, 'totalEquity'),
    cashAndEquivalents: requireValue(year, 'cashAndEquivalents')
  });
}

function fcfOf(year: StatementYear): number {
  // operatingCashFlow − capex, capex being purchases of property, plant and
  // equipment only. The conservative FCF definition (data-model section 6),
  // stated on the detail sheet.
  return requireValue(year, 'operatingCashFlow') - requireValue(year, 'capex');
}

export function computeMetric(id: MetricId, ctx: MetricContext): MetricValue {
  const { year, price } = ctx;

  // Valuation metrics: the price gate comes first (the dashboard collapses
  // these cards into "Enter today's price" regardless of line-item state),
  // then the currency guard: a price cannot meet statements in another
  // currency, because no FX exists anywhere (data-model section 4 policy;
  // section 6 amendment of 2026-07-15).
  if (id === 'pe' || id === 'earningsYield' || id === 'fcfYield') {
    if (price === undefined) return notMeaningful('no_price');
    if (price.currency !== year.currency) return notMeaningful('currency_mismatch');
    return computeValuationMetric(id, year, price);
  }

  const missing = missingForMetric(id, year);
  if (missing.length > 0) return insufficient(missing);

  switch (id) {
    case 'grossMargin': {
      const revenue = requireValue(year, 'revenue');
      if (revenue === 0) return notMeaningful('zero_revenue');
      return ok(grossProfitOf(year) / revenue);
    }
    case 'operatingMargin': {
      const revenue = requireValue(year, 'revenue');
      if (revenue === 0) return notMeaningful('zero_revenue');
      return ok(requireValue(year, 'operatingIncome') / revenue);
    }
    case 'netMargin': {
      const revenue = requireValue(year, 'revenue');
      if (revenue === 0) return notMeaningful('zero_revenue');
      return ok(requireValue(year, 'netIncome') / revenue);
    }
    case 'roe': {
      const { denominator, basis } = returnDenominator(ctx, (y) => requireValue(y, 'totalEquity'));
      if (denominator <= 0) return notMeaningful('negative_equity');
      return ok(requireValue(year, 'netIncome') / denominator, basis);
    }
    case 'roic': {
      const nopatValue = nopat(
        requireValue(year, 'operatingIncome'),
        requireValue(year, 'taxExpense'),
        requireValue(year, 'pretaxIncome')
      );
      const { denominator, basis } = returnDenominator(ctx, investedCapitalOf);
      if (denominator <= 0) return notMeaningful('negative_invested_capital');
      return ok(nopatValue / denominator, basis);
    }
    case 'debtToEquity': {
      const equity = requireValue(year, 'totalEquity');
      if (equity <= 0) return notMeaningful('negative_equity');
      const debt = requireValue(year, 'shortTermDebt') + requireValue(year, 'longTermDebt');
      return ok(debt / equity);
    }
    case 'currentRatio': {
      const currentLiabilities = requireValue(year, 'currentLiabilities');
      if (currentLiabilities === 0) return notMeaningful('zero_denominator');
      return ok(requireValue(year, 'currentAssets') / currentLiabilities);
    }
    case 'interestCoverage': {
      const interest = requireValue(year, 'interestExpense');
      // Zero or asserted not-reported interest is a healthy no-debt state
      // (data-model section 6, no-debt coverage note).
      if (interest === 0) return notMeaningful('no_interest_expense');
      return ok(requireValue(year, 'operatingIncome') / interest);
    }
    case 'fcf': {
      return ok(fcfOf(year));
    }
    case 'fcfMargin': {
      const revenue = requireValue(year, 'revenue');
      if (revenue === 0) return notMeaningful('zero_revenue');
      return ok(fcfOf(year) / revenue);
    }
    case 'fcfConversion': {
      const netIncome = requireValue(year, 'netIncome');
      if (netIncome <= 0) return notMeaningful('negative_earnings');
      return ok(fcfOf(year) / netIncome);
    }
  }
}

function computeValuationMetric(
  id: 'pe' | 'earningsYield' | 'fcfYield',
  year: StatementYear,
  price: PriceRecord
): MetricValue {
  const missing = missingForMetric(id, year);
  if (missing.length > 0) return insufficient(missing);

  const shares = requireValue(year, 'dilutedShares');
  switch (id) {
    case 'pe': {
      if (shares === 0) return notMeaningful('zero_denominator');
      const eps = requireValue(year, 'netIncome') / shares;
      if (eps <= 0) return notMeaningful('negative_earnings');
      return ok(price.amountMinor / eps);
    }
    case 'earningsYield': {
      if (shares === 0 || price.amountMinor === 0) return notMeaningful('zero_denominator');
      const eps = requireValue(year, 'netIncome') / shares;
      if (eps <= 0) return notMeaningful('negative_earnings');
      return ok(eps / price.amountMinor);
    }
    case 'fcfYield': {
      const marketCap = price.amountMinor * shares;
      if (marketCap === 0) return notMeaningful('zero_denominator');
      // Negative FCF renders as a negative yield by design (dictionary note).
      return ok(fcfOf(year) / marketCap);
    }
  }
}

/**
 * Assembles one metric's series across the labelled years, with the pinned
 * delta: latest FY against the FY five labels prior, present only when both
 * endpoints compute (data-sufficiency policy, data-model section 4).
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
