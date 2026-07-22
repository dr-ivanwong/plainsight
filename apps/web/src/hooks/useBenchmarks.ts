import type { MetricId } from '@plainsight/calc-engine';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';

import {
  benchmarkRecordSchema,
  db as appDb,
  moveToQuarantine,
  partitionRows,
  type PlainsightDb
} from '../db';

/**
 * The stored benchmark reference values, live, keyed by metric (dashboard
 * design plan §6.5). Corrupt rows drop synchronously and quarantine from an
 * effect, as on every read boundary.
 */
export function useBenchmarks(
  db: PlainsightDb = appDb
): Partial<Record<MetricId, number>> | undefined {
  const raws = useLiveQuery(() => db.benchmarks.toArray(), [db]);

  const partitioned = useMemo(
    () => (raws === undefined ? undefined : partitionRows(raws, benchmarkRecordSchema)),
    [raws]
  );

  useEffect(() => {
    if (partitioned !== undefined && partitioned.invalid.length > 0) {
      void moveToQuarantine(db, 'benchmarks', partitioned.invalid);
    }
  }, [db, partitioned]);

  return useMemo(() => {
    if (partitioned === undefined) return undefined;
    const values: Partial<Record<MetricId, number>> = {};
    for (const row of partitioned.valid) values[row.metricId] = row.value;
    return values;
  }, [partitioned]);
}
