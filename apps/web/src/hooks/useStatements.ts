import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';

import {
  db as appDb,
  moveToQuarantine,
  partitionRows,
  statementRecordSchema,
  type PlainsightDb,
  type StatementRecord
} from '../db';

/**
 * Every stored statement row for a company, live. undefined while the query
 * attaches. Corrupt rows drop from the result synchronously and move to
 * quarantine from an effect, keeping the querier pure.
 */
export function useStatements(
  companyId: string,
  db: PlainsightDb = appDb
): StatementRecord[] | undefined {
  const raws = useLiveQuery(
    () => db.statements.where('companyId').equals(companyId).toArray(),
    [db, companyId]
  );

  const partitioned = useMemo(
    () => (raws === undefined ? undefined : partitionRows(raws, statementRecordSchema)),
    [raws]
  );

  useEffect(() => {
    if (partitioned !== undefined && partitioned.invalid.length > 0) {
      void moveToQuarantine(db, 'statements', partitioned.invalid);
    }
  }, [db, partitioned]);

  return partitioned?.valid;
}
