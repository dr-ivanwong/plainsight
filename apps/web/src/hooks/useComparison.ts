import { useMemo } from 'react';

import { db as appDb, type PlainsightDb } from '../db';
import { useMetrics, type CompanyMetrics } from './useMetrics';

/** The comparison's pinned selection cap (frontend spec §3): pick 2 to 4. */
export const MAX_COMPARE = 4;

export interface Comparison {
  /** One resolved column per selected company, in selection order; ids that match nothing simply drop. */
  columns: CompanyMetrics[];
  /**
   * More than one statement currency among the columns. Ratios compare
   * freely; absolute money rows never do (currency policy, data-model
   * spec §4), and the table hides them when this is set.
   */
  mixedCurrencies: boolean;
}

/**
 * The compare screen's fan-out (frontend spec §6): one metrics report per
 * selected company plus the currency-comparability check. The fan-out has a
 * fixed arity of four so the rules of hooks hold for any selection size;
 * unused slots query the empty id, which resolves to null for pennies.
 * undefined while any selected company's report is still attaching.
 */
export function useComparison(
  ids: readonly string[],
  db: PlainsightDb = appDb
): Comparison | undefined {
  const first = useMetrics(ids[0] ?? '', db);
  const second = useMetrics(ids[1] ?? '', db);
  const third = useMetrics(ids[2] ?? '', db);
  const fourth = useMetrics(ids[3] ?? '', db);

  return useMemo(() => {
    const slots = [first, second, third, fourth];
    const requested = slots.slice(0, Math.min(ids.length, MAX_COMPARE));
    if (requested.some((slot) => slot === undefined)) return undefined;
    const columns = requested.filter(
      (slot): slot is CompanyMetrics => slot !== null && slot !== undefined
    );
    const currencies = new Set(
      columns.map((column) => column.report.currency).filter((currency) => currency !== null)
    );
    return { columns, mixedCurrencies: currencies.size > 1 };
  }, [ids, first, second, third, fourth]);
}
