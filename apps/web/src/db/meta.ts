/**
 * Typed access to the meta table's pinned settings. The record schema is a
 * discriminated union over the keys, so each key reads and writes exactly its
 * own value shape; a corrupt row quarantines and reads as unset.
 */
import type { PlainsightDb } from './db';
import { metaRecordSchema, type MetaKey, type MetaRecord } from './records';
import { validateRow } from './safeRead';

/** Key-to-value map derived from the record union, so lookups stay a plain indexed access. */
type MetaValues = { [R in MetaRecord as R['key']]: R['value'] };

export type MetaValue<K extends MetaKey> = MetaValues[K];

export async function getMeta<K extends MetaKey>(
  db: PlainsightDb,
  key: K
): Promise<MetaValue<K> | undefined> {
  const record = await validateRow(db, 'meta', await db.meta.get(key), metaRecordSchema);
  if (record === null || record.key !== key) return undefined;
  return record.value as MetaValue<K>;
}

export async function setMeta<K extends MetaKey>(
  db: PlainsightDb,
  key: K,
  value: MetaValue<K>
): Promise<void> {
  await db.meta.put(metaRecordSchema.parse({ key, value }));
}
