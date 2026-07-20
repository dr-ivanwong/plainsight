/**
 * Statement repository. The one rule that matters: a statements write and the
 * company's dataVersion bump happen in the same transaction (data-model spec
 * §9); a write that did not bump would leave memoised metrics serving stale
 * numbers, which is exactly the class of bug this product cannot have.
 */
import { bumpDataVersion } from './companies';
import type { PlainsightDb } from './db';
import { statementRecordSchema, type StatementRecord } from './records';
import { validateRows } from './safeRead';

/** A full row as the entry screen commits it; updatedAt is set here. */
export type StatementWrite = Omit<StatementRecord, 'updatedAt'>;

export async function upsertStatement(
  db: PlainsightDb,
  input: StatementWrite
): Promise<StatementRecord> {
  const now = new Date().toISOString();
  const record = statementRecordSchema.parse({ ...input, updatedAt: now });
  await db.transaction('rw', [db.statements, db.companies], async () => {
    await bumpDataVersion(db, record.companyId, now);
    await db.statements.put(record);
  });
  return record;
}

/**
 * All-or-nothing across several statements. Review mode saves one
 * confirmation as multiple statement rows, and its failure banner promises
 * "Nothing was stored"; this enclosing transaction is what makes that
 * sentence true. Each upsertStatement's own transaction joins this one
 * (same tables, Dexie nesting), so a failure at any write rolls back every
 * earlier one.
 */
export async function upsertStatements(
  db: PlainsightDb,
  inputs: readonly StatementWrite[]
): Promise<void> {
  await db.transaction('rw', [db.statements, db.companies], async () => {
    for (const input of inputs) {
      await upsertStatement(db, input);
    }
  });
}

/** Every stored statement row for the company; screens group rows by fiscal year. */
export async function listStatements(
  db: PlainsightDb,
  companyId: string
): Promise<StatementRecord[]> {
  const rows = await db.statements.where('companyId').equals(companyId).toArray();
  return validateRows(db, 'statements', rows, statementRecordSchema);
}
