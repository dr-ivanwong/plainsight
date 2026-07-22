/**
 * Benchmark repository (dashboard design plan §6.5): one global reference
 * value per metric, edited from the dashboard's trends section. A benchmark
 * fires nothing; the deterministic rules stay the only authority that raises
 * an item to investigate.
 */
import type { MetricId } from '@plainsight/calc-engine';

import type { PlainsightDb } from './db';
import { benchmarkRecordSchema, type BenchmarkRecord } from './records';

export async function putBenchmark(
  db: PlainsightDb,
  metricId: MetricId,
  value: number
): Promise<BenchmarkRecord> {
  const record = benchmarkRecordSchema.parse({
    metricId,
    value,
    updatedAt: new Date().toISOString()
  });
  await db.benchmarks.put(record);
  return record;
}

export async function removeBenchmark(db: PlainsightDb, metricId: MetricId): Promise<void> {
  await db.benchmarks.delete(metricId);
}
