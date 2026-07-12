/**
 * Validation gates over mapped years (backend spec §5; tolerance pinned by
 * the data-model spec §4). A failing year is quarantined, never served; the
 * blast radius of bad data is that year, and partial data degrades with
 * gaps rather than blocking the ticker. The gross-profit subtotal gate lives
 * inside the mapping itself (an inconsistent as-reported figure is dropped at
 * resolution); the schema gate runs where rows are built, since statement
 * rows only exist by parsing the wire contract.
 */
import { scaleUnitMinor } from '@plainsight/calc-engine';
import type { MappedYear } from '../edgar/mapping.js';

export interface GateVerdict {
  year: MappedYear;
  reasons: string[];
}

export interface GateOutcome {
  served: MappedYear[];
  quarantined: GateVerdict[];
}

/**
 * The pinned identity tolerance: max(3 units at millions scale, 0.1% of the
 * larger side). EDGAR large caps print in millions; the floor mirrors the
 * fixture generator and the entry-mode gate.
 */
const toleranceMinor = (largerSideMinor: number): number =>
  Math.max(3 * scaleUnitMinor('millions'), 0.001 * Math.abs(largerSideMinor));

function balanceIdentityReason(year: MappedYear): string | undefined {
  const assets = year.items.totalAssets?.amountMinor;
  const liabilities = year.items.totalLiabilities?.amountMinor;
  const equity = year.items.totalEquity?.amountMinor;
  // Not applicable without all three totals (Coca-Cola files no total
  // liabilities); sufficiency is the client's concern, not a data defect.
  if (assets === undefined || liabilities === undefined || equity === undefined) return undefined;
  const diff = Math.abs(assets - (liabilities + equity));
  const tolerance = toleranceMinor(Math.max(Math.abs(assets), Math.abs(liabilities + equity)));
  if (diff <= tolerance) return undefined;
  return `balance sheet does not cross-foot: assets differ from liabilities plus equity by ${diff} minor units (tolerance ${Math.round(tolerance)})`;
}

/**
 * Year-over-year scale sanity (backend spec §5): a twenty-fold jump in
 * revenue or total assets between consecutive years is a unit-scale misread,
 * not growth. Wide deliberately: EDGAR values are as-filed integers, so this
 * gate exists for the pathological case, and a real fast-grower must never
 * quarantine.
 */
const SCALE_JUMP_RATIO = 20;

function scaleJumpReasons(previous: MappedYear | undefined, year: MappedYear): string[] {
  if (previous === undefined) return [];
  const reasons: string[] = [];
  for (const itemId of ['revenue', 'totalAssets'] as const) {
    const before = previous.items[itemId]?.amountMinor;
    const after = year.items[itemId]?.amountMinor;
    if (before === undefined || after === undefined || before <= 0 || after <= 0) continue;
    const ratio = after / before;
    if (ratio > SCALE_JUMP_RATIO || ratio < 1 / SCALE_JUMP_RATIO) {
      reasons.push(
        `${itemId} moved ${ratio > 1 ? Math.round(ratio) : `1/${Math.round(1 / ratio)}`}x against ${previous.fy}: order-of-magnitude jump reads as a unit error`
      );
    }
  }
  return reasons;
}

/** Runs every gate over the mapped years, in fiscal order. */
export function runGates(years: MappedYear[]): GateOutcome {
  const served: MappedYear[] = [];
  const quarantined: GateVerdict[] = [];
  let previousServed: MappedYear | undefined;
  for (const year of years) {
    const reasons: string[] = [];
    const balance = balanceIdentityReason(year);
    if (balance !== undefined) reasons.push(balance);
    reasons.push(...scaleJumpReasons(previousServed, year));
    if (reasons.length > 0) {
      quarantined.push({ year, reasons });
    } else {
      served.push(year);
      previousServed = year;
    }
  }
  return { served, quarantined };
}
