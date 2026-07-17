import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';

import {
  db as appDb,
  moveToQuarantine,
  partitionRows,
  thesisRecordSchema,
  type PlainsightDb,
  type ThesisRecord
} from '../db';

/**
 * The company's live thesis draft (frontend spec §6). undefined while the
 * query attaches; null when nothing has been written yet (or a corrupt row
 * just moved to quarantine). Wrapped in the querier so absence is
 * distinguishable from attachment.
 */
export function useThesis(
  companyId: string,
  db: PlainsightDb = appDb
): ThesisRecord | null | undefined {
  const result = useLiveQuery(async () => ({ row: await db.theses.get(companyId) }), [
    db,
    companyId
  ]);

  const partitioned = useMemo(() => {
    if (result === undefined) return undefined;
    if (result.row === undefined) return { valid: [] as ThesisRecord[], invalid: [] };
    return partitionRows([result.row], thesisRecordSchema);
  }, [result]);

  useEffect(() => {
    if (partitioned !== undefined && partitioned.invalid.length > 0) {
      void moveToQuarantine(db, 'theses', partitioned.invalid);
    }
  }, [db, partitioned]);

  if (partitioned === undefined) return undefined;
  return partitioned.valid[0] ?? null;
}
