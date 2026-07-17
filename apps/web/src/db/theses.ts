/**
 * Thesis repository: the one live draft per company (data-model spec §9).
 * The draft autosaves continuously from the editor; immutable snapshots live
 * in thesisVersions and arrive with the version-history slice. Thesis text
 * never feeds the engine, so unlike statement and price writes there is no
 * dataVersion to bump.
 */
import type { PlainsightDb } from './db';
import { thesisRecordSchema, type ThesisRecord, type ThesisSections } from './records';
import { validateRow } from './safeRead';

export async function putThesisDraft(
  db: PlainsightDb,
  companyId: string,
  sections: ThesisSections
): Promise<ThesisRecord> {
  const record = thesisRecordSchema.parse({
    companyId,
    sections,
    updatedAt: new Date().toISOString()
  });
  await db.theses.put(record);
  return record;
}

export async function getThesis(db: PlainsightDb, companyId: string): Promise<ThesisRecord | null> {
  return validateRow(db, 'theses', await db.theses.get(companyId), thesisRecordSchema);
}
