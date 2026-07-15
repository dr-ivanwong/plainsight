/**
 * Journey B's landing step (main plan §3): a served financials response
 * becomes a company plus statement rows in one transaction, every row
 * carrying its EDGAR provenance (filing reference and mapping version), so
 * tap-to-see-source works on imported numbers exactly as the trust story
 * promises. The wire's bare integers wrap into entered values here; the
 * pipeline never asserts the not-reported-zero state, so absent stays absent
 * and the user asserts ∅0 in the grid where the reading is theirs to make
 * (data-model spec §8).
 */
import type { FinancialsResponse } from '@plainsight/api-contract';
import type { EntryValue, LineItemId } from '@plainsight/calc-engine';

import {
  companyRecordSchema,
  db as appDb,
  statementRecordSchema,
  validateRow,
  type CompanyRecord,
  type PlainsightDb
} from '../../db';

export interface ImportListing {
  ticker: string;
  name: string;
  exchange?: string | undefined;
}

/**
 * Re-importing a ticker opens what already exists rather than minting a
 * twin: the library is the owner's research, and a duplicate row would only
 * split it. Samples are excluded (the sample set wears real tickers).
 */
export async function existingImportTarget(
  db: PlainsightDb,
  ticker: string
): Promise<CompanyRecord | null> {
  const match = await db.companies
    .filter((company) => company.ticker === ticker && company.sample === false)
    .first();
  if (match === undefined) return null;
  return validateRow(db, 'companies', match, companyRecordSchema);
}

export async function importFinancials(
  listing: ImportListing,
  data: FinancialsResponse,
  db: PlainsightDb = appDb
): Promise<CompanyRecord> {
  const now = new Date().toISOString();
  const currency = data.statements[0]?.currency ?? 'USD';
  const company = companyRecordSchema.parse({
    id: crypto.randomUUID(),
    name: listing.name,
    ticker: data.ticker,
    ...(listing.exchange === undefined ? {} : { exchange: listing.exchange }),
    currency,
    sample: false,
    createdAt: now,
    updatedAt: now,
    dataVersion: 1
  });
  const rows = data.statements.map((statement) =>
    statementRecordSchema.parse({
      companyId: company.id,
      fy: statement.fy,
      statement: statement.statement,
      endDate: statement.endDate,
      // Display convenience only (storage is minor units): EDGAR filers
      // print in millions, so the grid re-displays at that scale.
      entryScale: 'millions',
      values: Object.fromEntries(
        (Object.entries(statement.values) as [LineItemId, number][]).map(
          ([itemId, amountMinor]): [LineItemId, EntryValue] => [
            itemId,
            { kind: 'entered', amountMinor }
          ]
        )
      ),
      provenance: statement.provenance,
      updatedAt: now
    })
  );
  await db.transaction('rw', [db.companies, db.statements], async () => {
    await db.companies.add(company);
    await db.statements.bulkPut(rows);
  });
  return company;
}
