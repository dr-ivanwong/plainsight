/**
 * Price repository: the single manual price record per company that feeds the
 * valuation metrics. Writes bump the company's dataVersion in the same
 * transaction, exactly as statement writes do (data-model spec §9).
 */
import { bumpDataVersion } from './companies';
import type { PlainsightDb } from './db';
import { priceRecordSchema, type PriceRecord } from './records';
import { validateRow } from './safeRead';

export type PriceWrite = Omit<PriceRecord, 'updatedAt'>;

/**
 * Puts the company's price. The price must be in the company's reporting
 * currency: no FX conversion exists anywhere in v1 (currency-comparability
 * policy, data-model spec §4), so a price in any other currency would put
 * numbers on the dashboard that no detail sheet could reproduce.
 */
export async function putPrice(db: PlainsightDb, input: PriceWrite): Promise<PriceRecord> {
  const now = new Date().toISOString();
  const record = priceRecordSchema.parse({ ...input, updatedAt: now });
  await db.transaction('rw', [db.prices, db.companies], async () => {
    const company = await bumpDataVersion(db, record.companyId, now);
    if (company.currency !== record.currency) {
      throw new Error(
        `price currency ${record.currency} does not match the company's reporting currency ${company.currency}`
      );
    }
    await db.prices.put(record);
  });
  return record;
}

export async function getPrice(db: PlainsightDb, companyId: string): Promise<PriceRecord | null> {
  return validateRow(db, 'prices', await db.prices.get(companyId), priceRecordSchema);
}
