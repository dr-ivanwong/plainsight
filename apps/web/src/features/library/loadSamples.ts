import { db as appDb, type PlainsightDb } from '../../db';

/**
 * One-tap sample load (frontend spec §4): the trio arrives flagged sample
 * throughout, stamped now, in one transaction. The data itself lives in a
 * lazily imported chunk so the shell never carries it. Loading twice is
 * harmless: stable ids make it an overwrite, not a duplicate.
 */
export async function loadSampleData(db: PlainsightDb = appDb): Promise<void> {
  const { SAMPLE_COMPANIES, SAMPLE_PRICES, SAMPLE_STATEMENTS } = await import('./sampleData');
  const now = new Date().toISOString();
  await db.transaction('rw', [db.companies, db.statements, db.prices], async () => {
    await db.companies.bulkPut(
      SAMPLE_COMPANIES.map((company) => ({
        ...company,
        createdAt: now,
        updatedAt: now,
        dataVersion: 0
      }))
    );
    await db.statements.bulkPut(
      SAMPLE_STATEMENTS.map((row) => ({ ...row, updatedAt: now }))
    );
    await db.prices.bulkPut(SAMPLE_PRICES.map((price) => ({ ...price, updatedAt: now })));
  });
}
