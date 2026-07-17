import { useEffect, useMemo, useRef } from 'react';

import { MAX_COMPARE } from '../../hooks/useComparison';

/**
 * Series-slot assignment for the trend chart: colour follows the company,
 * never its rank. A company keeps the slot it already holds for as long as
 * it stays selected, so unpicking one company never repaints the others;
 * newcomers take the lowest freed slot. Pure, so the rule is testable.
 */
export function assignSlots(
  previous: ReadonlyMap<string, number>,
  ids: readonly string[]
): ReadonlyMap<string, number> {
  const next = new Map<string, number>();
  for (const id of ids) {
    const held = previous.get(id);
    if (held !== undefined && held < MAX_COMPARE) next.set(id, held);
  }
  const used = new Set(next.values());
  let free = 0;
  for (const id of ids) {
    if (next.has(id)) continue;
    while (used.has(free)) free += 1;
    if (free >= MAX_COMPARE) break;
    next.set(id, free);
    used.add(free);
  }
  return next;
}

/** The slot map, remembered across selection changes for the life of the screen. */
export function useSeriesSlots(ids: readonly string[]): ReadonlyMap<string, number> {
  const held = useRef<ReadonlyMap<string, number>>(new Map());
  const slots = useMemo(() => assignSlots(held.current, ids), [ids]);
  useEffect(() => {
    held.current = slots;
  }, [slots]);
  return slots;
}
