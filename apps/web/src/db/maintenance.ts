/**
 * The data screen's two removal actions. Sample removal deletes by the sample
 * flag across every table that keys on the company (data-model spec §9), one
 * tap, no ceremony. The wipe deletes the whole database and reopens an empty
 * one: every company, statement, thesis and setting on this device goes,
 * which is why the screen makes the owner type the app's name first.
 */
import type { PlainsightDb } from './db';

export async function removeSampleData(db: PlainsightDb): Promise<void> {
  await db.transaction(
    'rw',
    [db.companies, db.statements, db.prices, db.theses, db.thesisVersions, db.flagDismissals],
    async () => {
      const sampleIds = (await db.companies.toArray())
        .filter((company) => company.sample === true)
        .map((company) => company.id);
      if (sampleIds.length === 0) return;
      await db.companies.bulkDelete(sampleIds);
      for (const companyId of sampleIds) {
        await db.statements.where('companyId').equals(companyId).delete();
        await db.flagDismissals.where('companyId').equals(companyId).delete();
        await db.thesisVersions.where('companyId').equals(companyId).delete();
        await db.prices.delete(companyId);
        await db.theses.delete(companyId);
      }
    }
  );
}

export async function wipeEverything(db: PlainsightDb): Promise<void> {
  await db.delete();
  await db.open();
}
