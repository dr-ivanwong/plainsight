import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';

import {
  companyRecordSchema,
  db as appDb,
  moveToQuarantine,
  partitionRows,
  type CompanyRecord,
  type PlainsightDb
} from '../db';

/**
 * One company, live. undefined while the query attaches; null when no such
 * company exists (or its row was corrupt and has just moved to quarantine).
 * The row is wrapped before it leaves the querier so a missing company is
 * distinguishable from a query still attaching.
 */
export function useCompany(id: string, db: PlainsightDb = appDb): CompanyRecord | null | undefined {
  const result = useLiveQuery(async () => ({ row: await db.companies.get(id) }), [db, id]);

  const partitioned = useMemo(() => {
    if (result === undefined) return undefined;
    if (result.row === undefined) return { valid: [], invalid: [] };
    return partitionRows([result.row], companyRecordSchema);
  }, [result]);

  useEffect(() => {
    if (partitioned !== undefined && partitioned.invalid.length > 0) {
      void moveToQuarantine(db, 'companies', partitioned.invalid);
    }
  }, [db, partitioned]);

  if (partitioned === undefined) return undefined;
  return partitioned.valid[0] ?? null;
}
