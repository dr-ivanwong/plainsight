import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';

import {
  db as appDb,
  moveToQuarantine,
  partitionRows,
  priceRecordSchema,
  type PlainsightDb,
  type PriceRecord
} from '../db';

/**
 * The company's single manual price record, live. undefined while the query
 * attaches; null when no price has been entered (or a corrupt row just moved
 * to quarantine). Wrapped in the querier so absence is distinguishable from
 * attachment.
 */
export function usePrice(
  companyId: string,
  db: PlainsightDb = appDb
): PriceRecord | null | undefined {
  const result = useLiveQuery(async () => ({ row: await db.prices.get(companyId) }), [
    db,
    companyId
  ]);

  const partitioned = useMemo(() => {
    if (result === undefined) return undefined;
    if (result.row === undefined) return { valid: [] as PriceRecord[], invalid: [] };
    return partitionRows([result.row], priceRecordSchema);
  }, [result]);

  useEffect(() => {
    if (partitioned !== undefined && partitioned.invalid.length > 0) {
      void moveToQuarantine(db, 'prices', partitioned.invalid);
    }
  }, [db, partitioned]);

  if (partitioned === undefined) return undefined;
  return partitioned.valid[0] ?? null;
}
