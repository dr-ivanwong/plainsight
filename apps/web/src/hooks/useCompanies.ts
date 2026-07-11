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
 * The library's companies, most recently updated first, live against
 * IndexedDB. Returns undefined only on the very first render while the query
 * attaches; steady-state loading is not a state the library has (frontend
 * spec §3). Corrupt rows are dropped from the result synchronously and moved
 * to quarantine from an effect, because the live-query callback must stay
 * pure: a write inside it would re-trigger the very query that ran it.
 */
export function useCompanies(db: PlainsightDb = appDb): CompanyRecord[] | undefined {
  const raws = useLiveQuery(() => db.companies.orderBy('updatedAt').reverse().toArray(), [db]);

  const partitioned = useMemo(
    () => (raws === undefined ? undefined : partitionRows(raws, companyRecordSchema)),
    [raws]
  );

  useEffect(() => {
    if (partitioned !== undefined && partitioned.invalid.length > 0) {
      void moveToQuarantine(db, 'companies', partitioned.invalid);
    }
  }, [db, partitioned]);

  return partitioned?.valid;
}
