/**
 * Report assembly: (statements) -> MetricsReport. Pure, synchronous, no I/O.
 * The UI renders the unions in the report; it never recomputes (spec section 1).
 */
import { compareFyLabels, fyYear } from './fy.js';
import { buildSeries, METRIC_IDS } from './metrics.js';
import { assertSafeInteger } from './money.js';
import { evaluateRules } from './rules.js';
import type {
  CompanyFinancials,
  FyLabel,
  MetricId,
  MetricSeries,
  MetricsReport,
  StatementYear
} from './types.js';
import { requireValue, yearComplete } from './values.js';

/**
 * N3: market cap = price times the latest complete FY's diluted shares.
 * Null without a price or without a complete year.
 */
function marketCapMinor(
  yearsAscending: readonly StatementYear[],
  price: CompanyFinancials['price']
): number | null {
  if (price === undefined) return null;
  for (let i = yearsAscending.length - 1; i >= 0; i -= 1) {
    const year = yearsAscending[i] as StatementYear;
    if (yearComplete(year)) {
      return price.amountMinor * requireValue(year, 'dilutedShares');
    }
  }
  return null;
}

export function computeMetricsReport(input: CompanyFinancials): MetricsReport {
  if (input.price !== undefined) {
    assertSafeInteger(input.price.amountMinor, 'price');
  }

  const yearsAscending = [...input.years].sort((a, b) => compareFyLabels(a.fy, b.fy));
  const yearByFyYear = new Map<number, StatementYear>();
  for (const year of yearsAscending) {
    const numericYear = fyYear(year.fy);
    if (yearByFyYear.has(numericYear)) {
      // Duplicate labels are unrepresentable in storage (the compound primary
      // key); seeing one here is a programming error upstream, not a data state.
      throw new RangeError(`Duplicate fiscal year in input: ${year.fy}`);
    }
    yearByFyYear.set(numericYear, year);
  }

  const metrics = {} as Record<MetricId, MetricSeries>;
  for (const id of METRIC_IDS) {
    metrics[id] = buildSeries(id, yearsAscending, yearByFyYear, input.price);
  }

  const fyLabels: FyLabel[] = yearsAscending.map((year) => year.fy);
  const latestYear = yearsAscending.at(-1);

  return {
    fyLabels,
    latestFy: latestYear?.fy ?? null,
    currency: latestYear?.currency ?? null,
    metrics,
    flags: evaluateRules({ yearsAscending, yearByFyYear, series: metrics }),
    marketCapMinor: marketCapMinor(yearsAscending, input.price)
  };
}
