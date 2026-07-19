import { LINE_ITEMS, type FyLabel, type LineItemId } from '@plainsight/calc-engine';

/** The pinned deep link (data-model spec §10): the first missing item, in its home statement. */
export function entrySearchFor(missing: readonly LineItemId[], fy: FyLabel) {
  const first = missing[0];
  if (first === undefined) return { fy };
  return { stmt: LINE_ITEMS[first].statement, fy, focus: first };
}
