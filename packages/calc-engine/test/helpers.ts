/** Shared builders for engine tests. Amounts are integer minor units. */
import type { LineItemId } from '../src/lineItems.js';
import type { EntryValue, FyLabel, Scale, StatementYear } from '../src/types.js';

export const entered = (amountMinor: number): EntryValue => ({ kind: 'entered', amountMinor });

export const zeroAsserted: EntryValue = { kind: 'not_reported_zero' };

export type ValueSpec = Partial<Record<LineItemId, number | EntryValue>>;

function toEntries(values: ValueSpec): Partial<Record<LineItemId, EntryValue>> {
  const out: Partial<Record<LineItemId, EntryValue>> = {};
  for (const [id, spec] of Object.entries(values) as [LineItemId, number | EntryValue][]) {
    out[id] = typeof spec === 'number' ? entered(spec) : spec;
  }
  return out;
}

export function year(
  fy: FyLabel,
  values: ValueSpec,
  opts: { endDate?: string; currency?: string; entryScale?: Scale } = {}
): StatementYear {
  return {
    fy,
    endDate: opts.endDate ?? `${fy.slice(2)}-12-31`,
    currency: opts.currency ?? 'USD',
    entryScale: opts.entryScale ?? 'ones',
    values: toEntries(values)
  };
}

/**
 * A complete, internally consistent year: the balance sheet balances exactly
 * and every core item is present. Override any item per test.
 */
export const COMPLETE_VALUES: Readonly<Record<string, number>> = {
  revenue: 100_000,
  costOfRevenue: 60_000,
  operatingIncome: 25_000,
  interestExpense: 1_000,
  pretaxIncome: 24_000,
  taxExpense: 4_000,
  netIncome: 20_000,
  dilutedShares: 1_000,
  cashAndEquivalents: 10_000,
  currentAssets: 40_000,
  totalAssets: 100_000,
  currentLiabilities: 20_000,
  shortTermDebt: 5_000,
  longTermDebt: 15_000,
  totalLiabilities: 60_000,
  totalEquity: 40_000,
  operatingCashFlow: 22_000,
  capex: 7_000
};

export function completeYear(
  fy: FyLabel,
  overrides: ValueSpec = {},
  opts: { endDate?: string; currency?: string; entryScale?: Scale; drop?: LineItemId[] } = {}
): StatementYear {
  const values: ValueSpec = { ...(COMPLETE_VALUES as ValueSpec), ...overrides };
  for (const id of opts.drop ?? []) {
    delete values[id];
  }
  return year(fy, values, opts);
}
