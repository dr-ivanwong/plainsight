/**
 * Thesis repository: the one live draft per company plus its immutable
 * versions (data-model spec §9). The draft autosaves continuously from the
 * editor; a version is an explicit act, append-only, optionally carrying the
 * financials snapshot (the engine's input shape) so it can re-render its
 * metrics exactly as they stood. Thesis text never feeds the engine, so
 * unlike statement and price writes there is no dataVersion to bump.
 */
import type { PlainsightDb } from './db';
import {
  thesisRecordSchema,
  thesisVersionRecordSchema,
  type FinancialsSnapshot,
  type ThesisRecord,
  type ThesisSections,
  type ThesisVersionRecord
} from './records';
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

export interface ThesisVersionWrite {
  companyId: string;
  sections: ThesisSections;
  financialsSnapshot?: FinancialsSnapshot;
}

/**
 * Saves an immutable version and, in the same transaction, the draft it
 * snapshots: what history shows is exactly what the editor held. The row id
 * comes from the table's auto-increment.
 */
export async function saveThesisVersion(
  db: PlainsightDb,
  input: ThesisVersionWrite
): Promise<ThesisVersionRecord> {
  const savedAt = new Date().toISOString();
  const body = thesisVersionRecordSchema.omit({ id: true }).parse({ ...input, savedAt });
  const id = await db.transaction('rw', [db.theses, db.thesisVersions], async () => {
    await db.theses.put(
      thesisRecordSchema.parse({ companyId: input.companyId, sections: input.sections, updatedAt: savedAt })
    );
    return db.thesisVersions.add(body);
  });
  return { ...body, id: Number(id) };
}
