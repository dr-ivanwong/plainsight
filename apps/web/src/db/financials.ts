/**
 * Assembles the engine's input from stored records: the three per-statement
 * rows of a fiscal year merge into one StatementYear. Values cannot collide
 * because every line item belongs to exactly one statement (enforced on write
 * and on read by the record schema). Year-level fields (endDate, entryScale)
 * are written identically across a year's rows by the entry screen; should
 * rows ever disagree (a hand-edited import), the merge stays deterministic:
 * income wins, then balance, then cashflow. Currency is the company's, and
 * provenance stays on the per-statement rows where the detail sheets read it.
 */
import {
  compareFyLabels,
  STATEMENT_KINDS,
  type CompanyFinancials,
  type EntryValue,
  type FyLabel,
  type LineItemId,
  type StatementYear
} from '@plainsight/calc-engine';
import type { CompanyRecord, PriceRecord, StatementRecord } from './records';

export function assembleFinancials(
  company: CompanyRecord,
  statements: readonly StatementRecord[],
  price: PriceRecord | null = null
): CompanyFinancials {
  const byFy = new Map<FyLabel, StatementRecord[]>();
  for (const row of statements) {
    const group = byFy.get(row.fy);
    if (group === undefined) {
      byFy.set(row.fy, [row]);
    } else {
      group.push(row);
    }
  }

  const years: StatementYear[] = [...byFy.entries()]
    .sort(([a], [b]) => compareFyLabels(a, b))
    .flatMap(([fy, group]) => {
      const ordered = [...group].sort(
        (a, b) => STATEMENT_KINDS.indexOf(a.statement) - STATEMENT_KINDS.indexOf(b.statement)
      );
      const head = ordered[0];
      if (head === undefined) return []; // unreachable: groups are built non-empty
      const values: Partial<Record<LineItemId, EntryValue>> = {};
      for (const row of ordered) {
        Object.assign(values, row.values);
      }
      return [
        {
          fy,
          endDate: head.endDate,
          currency: company.currency,
          entryScale: head.entryScale,
          values
        }
      ];
    });

  return price === null
    ? { years }
    : {
        years,
        price: { amountMinor: price.amountMinor, currency: price.currency, asOf: price.asOf }
      };
}
