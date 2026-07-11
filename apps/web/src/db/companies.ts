/**
 * Company repository: creation, validated reads, and the dataVersion bump that
 * the statement and price writers run inside their transactions. Metric
 * memoisation keys on (companyId, dataVersion), so any write to a company's
 * numbers must move the version (data-model spec §9).
 */
import type { PlainsightDb } from './db';
import { companyRecordSchema, type CompanyRecord } from './records';
import { validateRow, validateRows } from './safeRead';

/** What the add-company form supplies; everything else is set here. */
export interface NewCompany {
  name: string;
  ticker?: string;
  exchange?: string;
  sector?: string;
  currency: string;
}

export async function createCompany(db: PlainsightDb, input: NewCompany): Promise<CompanyRecord> {
  const now = new Date().toISOString();
  const record = companyRecordSchema.parse({
    ...input,
    id: crypto.randomUUID(),
    sample: false,
    createdAt: now,
    updatedAt: now,
    dataVersion: 0
  });
  await db.companies.add(record);
  return record;
}

export async function getCompany(db: PlainsightDb, id: string): Promise<CompanyRecord | null> {
  return validateRow(db, 'companies', await db.companies.get(id), companyRecordSchema);
}

/** Companies for the library, most recently updated first. */
export async function listCompanies(db: PlainsightDb): Promise<CompanyRecord[]> {
  const rows = await db.companies.orderBy('updatedAt').reverse().toArray();
  return validateRows(db, 'companies', rows, companyRecordSchema);
}

/**
 * Increments the company's dataVersion and touches updatedAt, returning the
 * written record. Runs inside the caller's transaction, deliberately without
 * the quarantine machinery (a sub-transaction may only touch its parent's
 * tables); a missing or corrupt company fails the write loudly and rolls the
 * whole transaction back.
 */
export async function bumpDataVersion(
  db: PlainsightDb,
  companyId: string,
  now: string
): Promise<CompanyRecord> {
  const company = await db.companies.get(companyId);
  if (company === undefined) {
    throw new Error(`no company with id ${companyId}: statements and prices need a stored company`);
  }
  if (!Number.isInteger(company.dataVersion)) {
    throw new Error(`company ${companyId} has a corrupt dataVersion; refusing to write against it`);
  }
  const touched = { ...company, dataVersion: company.dataVersion + 1, updatedAt: now };
  await db.companies.put(touched);
  return touched;
}
