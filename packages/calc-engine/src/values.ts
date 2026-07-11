/**
 * Value resolution and data sufficiency (spec sections 8 and 10).
 *
 * The three-state rule: an absent key is unknown and blocks; an entered 0
 * counts and computes as 0; a user-asserted not-reported-zero counts and
 * computes as 0. Nothing is ever interpolated (data-sufficiency policy,
 * data-model section 4).
 */
import { coreItemsFor, STATEMENT_KINDS, type LineItemId, type StatementKind } from './lineItems.js';
import { assertSafeInteger } from './money.js';
import type { MetricId, StatementYear } from './types.js';

/**
 * Resolves an item to a computable number: entered amount, 0 for a
 * not-reported-zero assertion, or undefined when unknown.
 */
export function resolvedValue(year: StatementYear, id: LineItemId): number | undefined {
  const entry = year.values[id];
  if (entry === undefined) return undefined;
  if (entry.kind === 'not_reported_zero') return 0;
  return assertSafeInteger(entry.amountMinor, `${year.fy} ${id}`);
}

/** Present means entered or asserted not-reported-zero (counts for completeness). */
export function hasValue(year: StatementYear, id: LineItemId): boolean {
  return year.values[id] !== undefined;
}

/**
 * Resolves an item that a sufficiency check has already guaranteed present.
 * The throw marks a programming error (a metric read an input its section 10
 * requirement list does not cover), never a data state.
 */
export function requireValue(year: StatementYear, id: LineItemId): number {
  const value = resolvedValue(year, id);
  if (value === undefined) {
    throw new RangeError(`${year.fy} ${id}: read without a sufficiency check`);
  }
  return value;
}

export function statementComplete(year: StatementYear, statement: StatementKind): boolean {
  return coreItemsFor(statement).every((id) => hasValue(year, id));
}

/** Every core item across all three statements present (spec section 10). */
export function yearComplete(year: StatementYear): boolean {
  return STATEMENT_KINDS.every((statement) => statementComplete(year, statement));
}

export function balanceSheetComplete(year: StatementYear): boolean {
  return statementComplete(year, 'balance');
}

export function missingCoreItems(year: StatementYear): LineItemId[] {
  return STATEMENT_KINDS.flatMap((statement) =>
    coreItemsFor(statement).filter((id) => !hasValue(year, id))
  );
}

/**
 * Per-metric input requirements, pinned by the spec section 10 table. Missing
 * items drive the dashboard's "Add the N missing numbers" copy and its
 * deep link into data entry. The price record is not a line item; a missing
 * price is never `insufficient_data` (it renders as the enter-price card).
 *
 * Gross margin requires revenue plus either grossProfit or costOfRevenue (the
 * as-reported-precedence derivation, data-model section 4). When neither is
 * present the missing list names `costOfRevenue`, the enterable core item, so
 * the deep link lands on a field the user can actually fill.
 */
const METRIC_REQUIREMENTS: Readonly<Record<Exclude<MetricId, 'grossMargin'>, readonly LineItemId[]>> = {
  operatingMargin: ['revenue', 'operatingIncome'],
  netMargin: ['revenue', 'netIncome'],
  roe: ['netIncome', 'totalEquity'],
  roic: [
    'operatingIncome',
    'taxExpense',
    'pretaxIncome',
    'shortTermDebt',
    'longTermDebt',
    'totalEquity',
    'cashAndEquivalents'
  ],
  debtToEquity: ['shortTermDebt', 'longTermDebt', 'totalEquity'],
  currentRatio: ['currentAssets', 'currentLiabilities'],
  interestCoverage: ['operatingIncome', 'interestExpense'],
  fcf: ['operatingCashFlow', 'capex'],
  fcfMargin: ['operatingCashFlow', 'capex', 'revenue'],
  fcfConversion: ['operatingCashFlow', 'capex', 'netIncome'],
  pe: ['netIncome', 'dilutedShares'],
  earningsYield: ['netIncome', 'dilutedShares'],
  fcfYield: ['operatingCashFlow', 'capex', 'dilutedShares']
};

export function missingForMetric(metricId: MetricId, year: StatementYear): LineItemId[] {
  if (metricId === 'grossMargin') {
    const missing: LineItemId[] = [];
    if (!hasValue(year, 'revenue')) missing.push('revenue');
    if (!hasValue(year, 'grossProfit') && !hasValue(year, 'costOfRevenue')) {
      missing.push('costOfRevenue');
    }
    return missing;
  }
  return METRIC_REQUIREMENTS[metricId].filter((id) => !hasValue(year, id));
}
