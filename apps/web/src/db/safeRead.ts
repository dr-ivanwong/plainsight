/**
 * Zod-on-read (data-model spec §9): rows come out of Dexie as untrusted data,
 * pass their record schema, and any failure moves the raw row to the
 * quarantine table instead of crashing a screen. "Moves" is literal: the row
 * leaves its home table in the same transaction, so a corrupt record is seen
 * once, not on every read.
 *
 * Validation and the move are split on purpose. Dexie live queries must stay
 * pure (no writes inside the querier), so hooks partition synchronously with
 * partitionRows and run moveToQuarantine from an effect; imperative reads use
 * validateRows, which does both in one call.
 */
import type { IndexableType, Table } from 'dexie';
import type { ZodError, ZodType } from 'zod';
import type { PlainsightDb, TableName } from './db';

/** Tables whose reads pass a schema. Quarantine itself is read permissively; it never re-quarantines. */
export type ValidatedTableName = Exclude<TableName, 'quarantine'>;

export interface InvalidRow {
  raw: unknown;
  reason: string;
}

export interface PartitionedRows<T> {
  valid: T[];
  invalid: InvalidRow[];
}

const MAX_REPORTED_ISSUES = 3;

function reasonFrom(error: ZodError): string {
  const reported = error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => `${issue.path.join('.') || '(record)'}: ${issue.message}`);
  const remainder = error.issues.length - reported.length;
  const summary = reported.join('; ');
  return remainder > 0 ? `${summary}; and ${remainder} more` : summary;
}

function isIndexablePart(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * Reads the row's primary key straight off the raw object via the table's key
 * path (all pinned key paths are flat). IndexedDB enforced the key when the
 * row was written, so extraction only fails for shapes that could never have
 * been stored; those rows are quarantined without a delete.
 */
function primaryKeyOf(raw: unknown, keyPath: unknown): IndexableType | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  if (typeof keyPath === 'string') {
    const value = record[keyPath];
    return isIndexablePart(value) ? value : undefined;
  }
  if (Array.isArray(keyPath)) {
    const parts = keyPath.map((part) => record[String(part)]);
    return parts.every(isIndexablePart) ? parts : undefined;
  }
  return undefined;
}

/** Pure split of raw rows into parsed records and quarantine candidates; safe inside a live query. */
export function partitionRows<T>(rows: readonly unknown[], schema: ZodType<T>): PartitionedRows<T> {
  const valid: T[] = [];
  const invalid: InvalidRow[] = [];
  for (const raw of rows) {
    const result = schema.safeParse(raw);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push({ raw, reason: reasonFrom(result.error) });
    }
  }
  return { valid, invalid };
}

/**
 * Moves invalid rows out of their home table and into quarantine, atomically
 * per batch. Idempotent: a row that already left its table (an earlier move,
 * or an effect re-run) is skipped rather than quarantined twice.
 */
export async function moveToQuarantine(
  db: PlainsightDb,
  tableName: ValidatedTableName,
  rows: readonly InvalidRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const table = db.table(tableName) as Table<unknown, IndexableType>;
  const { keyPath } = table.schema.primKey;
  const quarantinedAt = new Date().toISOString();
  await db.transaction('rw', [table, db.quarantine], async () => {
    for (const { raw, reason } of rows) {
      const key = primaryKeyOf(raw, keyPath);
      if (key !== undefined) {
        const present = await table.get(key);
        if (present === undefined) continue;
        await table.delete(key);
      }
      await db.quarantine.add({ table: tableName, raw, reason, quarantinedAt });
    }
  });
}

/**
 * Validates rows already read from a table. Valid rows come back parsed;
 * invalid rows are moved to quarantine and dropped from the result.
 */
export async function validateRows<T>(
  db: PlainsightDb,
  tableName: ValidatedTableName,
  rows: readonly unknown[],
  schema: ZodType<T>
): Promise<T[]> {
  const { valid, invalid } = partitionRows(rows, schema);
  await moveToQuarantine(db, tableName, invalid);
  return valid;
}

/** Single-row variant for point reads; undefined (no row) and corrupt rows both come back null. */
export async function validateRow<T>(
  db: PlainsightDb,
  tableName: ValidatedTableName,
  row: unknown,
  schema: ZodType<T>
): Promise<T | null> {
  if (row === undefined) return null;
  const [valid] = await validateRows(db, tableName, [row], schema);
  return valid ?? null;
}
