import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';

import {
  db as appDb,
  moveToQuarantine,
  partitionRows,
  providerCredentialRecordSchema,
  type PlainsightDb,
  type ProviderCredentialRecord
} from '../db';

/**
 * Every stored provider key, live (frontend spec §6). undefined while the
 * query attaches. The records never leave the device: the export allowlist
 * cannot reach this table and sync will never carry it (data-model spec §5).
 */
export function useProviderKeys(
  db: PlainsightDb = appDb
): ProviderCredentialRecord[] | undefined {
  const raws = useLiveQuery(() => db.providerCredentials.toArray(), [db]);

  const partitioned = useMemo(
    () => (raws === undefined ? undefined : partitionRows(raws, providerCredentialRecordSchema)),
    [raws]
  );

  useEffect(() => {
    if (partitioned !== undefined && partitioned.invalid.length > 0) {
      void moveToQuarantine(db, 'providerCredentials', partitioned.invalid);
    }
  }, [db, partitioned]);

  return partitioned?.valid;
}
