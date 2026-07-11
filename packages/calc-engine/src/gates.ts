/**
 * Identity gates under the pinned rounding tolerance (data-model section 4).
 *
 * A gate passes when abs(diff) <= max(3 x scaleUnit, 0.1% of the larger side),
 * where scaleUnit is one unit at the year's entry scale. A breach warns in
 * entry mode (as-reported precedence: the engine never "corrects" a filing)
 * and hard-fails in extraction review.
 */
import { scaleUnitMinor } from './money.js';
import type { StatementYear } from './types.js';
import { resolvedValue } from './values.js';

export type GateId = 'balance_sheet' | 'gross_profit';

export type GateResult =
  | { gate: GateId; status: 'not_applicable' }
  | { gate: GateId; status: 'pass' | 'fail'; diffMinor: number; toleranceMinor: number };

/** The pinned tolerance: max(3 x scaleUnit, 0.1% of the larger side of the identity). */
export function toleranceMinor(year: StatementYear, largerSideMinor: number): number {
  return Math.max(3 * scaleUnitMinor(year.entryScale), 0.001 * Math.abs(largerSideMinor));
}

function gateResult(gate: GateId, year: StatementYear, left: number, right: number): GateResult {
  const diffMinor = left - right;
  const larger = Math.max(Math.abs(left), Math.abs(right));
  const tolerance = toleranceMinor(year, larger);
  return {
    gate,
    status: Math.abs(diffMinor) <= tolerance ? 'pass' : 'fail',
    diffMinor,
    toleranceMinor: tolerance
  };
}

/**
 * The two identities checkable from the canonical items in entry mode:
 * assets = liabilities + equity, and (when the filing reports gross profit;
 * as-reported precedence) grossProfit = revenue - costOfRevenue. A gate whose
 * inputs are not all present is not applicable; sufficiency is a different
 * concern (section 10).
 */
export function checkIdentities(year: StatementYear): GateResult[] {
  const results: GateResult[] = [];

  const assets = resolvedValue(year, 'totalAssets');
  const liabilities = resolvedValue(year, 'totalLiabilities');
  const equity = resolvedValue(year, 'totalEquity');
  if (assets === undefined || liabilities === undefined || equity === undefined) {
    results.push({ gate: 'balance_sheet', status: 'not_applicable' });
  } else {
    results.push(gateResult('balance_sheet', year, assets, liabilities + equity));
  }

  const grossProfitEntered = year.values.grossProfit?.kind === 'entered';
  const grossProfit = grossProfitEntered ? resolvedValue(year, 'grossProfit') : undefined;
  const revenue = resolvedValue(year, 'revenue');
  const costOfRevenue = resolvedValue(year, 'costOfRevenue');
  if (grossProfit === undefined || revenue === undefined || costOfRevenue === undefined) {
    // The gate compares an as-reported gross profit against its derivation;
    // without an entered gross profit (or its inputs) there is nothing to check.
    results.push({ gate: 'gross_profit', status: 'not_applicable' });
  } else {
    results.push(gateResult('gross_profit', year, grossProfit, revenue - costOfRevenue));
  }

  return results;
}
