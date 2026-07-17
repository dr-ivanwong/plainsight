import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';

import {
  db as appDb,
  moveToQuarantine,
  partitionRows,
  thesisVersionRecordSchema,
  type PlainsightDb,
  type ThesisVersionRecord
} from '../db';

/**
 * The company's saved thesis versions, newest first, live (frontend spec §6).
 * undefined while the query attaches. Corrupt rows drop from the result
 * synchronously and move to quarantine from an effect, keeping the querier
 * pure.
 */
export function useThesisVersions(
  companyId: string,
  db: PlainsightDb = appDb
): ThesisVersionRecord[] | undefined {
  const raws = useLiveQuery(
    () => db.thesisVersions.where('companyId').equals(companyId).toArray(),
    [db, companyId]
  );

  const partitioned = useMemo(() => {
    if (raws === undefined) return undefined;
    const split = partitionRows(raws, thesisVersionRecordSchema);
    return {
      ...split,
      valid: [...split.valid].sort((a, b) =>
        a.savedAt === b.savedAt ? b.id - a.id : b.savedAt.localeCompare(a.savedAt)
      )
    };
  }, [raws]);

  useEffect(() => {
    if (partitioned !== undefined && partitioned.invalid.length > 0) {
      void moveToQuarantine(db, 'thesisVersions', partitioned.invalid);
    }
  }, [db, partitioned]);

  return partitioned?.valid;
}
