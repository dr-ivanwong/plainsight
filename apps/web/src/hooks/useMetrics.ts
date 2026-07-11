import { computeMetricsReport, type MetricsReport } from '@plainsight/calc-engine';
import { useMemo } from 'react';

import { assembleFinancials, type CompanyRecord, type PlainsightDb, type PriceRecord } from '../db';
import { db as appDb } from '../db';
import { useCompany } from './useCompany';
import { usePrice } from './usePrice';
import { useStatements } from './useStatements';

export interface CompanyMetrics {
  company: CompanyRecord;
  price: PriceRecord | null;
  report: MetricsReport;
}

/**
 * The engine over live storage (frontend spec §6): company, statements and
 * price assemble into the engine's input and compute one MetricsReport.
 * The three inputs only change identity when the store changes, and every
 * statements or prices write moves the company's dataVersion in the same
 * transaction, so this memo recomputes exactly once per (companyId,
 * dataVersion): the pinned memoisation, achieved through input identity.
 */
export function useMetrics(
  companyId: string,
  db: PlainsightDb = appDb
): CompanyMetrics | null | undefined {
  const company = useCompany(companyId, db);
  const statements = useStatements(companyId, db);
  const price = usePrice(companyId, db);

  return useMemo(() => {
    if (company === undefined || statements === undefined || price === undefined) {
      return undefined;
    }
    if (company === null) return null;
    const report = computeMetricsReport(assembleFinancials(company, statements, price));
    return { company, price, report };
  }, [company, statements, price]);
}
