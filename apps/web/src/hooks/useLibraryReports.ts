import { computeMetricsReport, type MetricsReport } from '@plainsight/calc-engine';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';

import {
  assembleFinancials,
  db as appDb,
  flagDismissalRecordSchema,
  moveToQuarantine,
  partitionRows,
  priceRecordSchema,
  statementRecordSchema,
  type CompanyRecord,
  type PlainsightDb
} from '../db';

export interface LibraryReportRow {
  company: CompanyRecord;
  report: MetricsReport;
  activeFlagCount: number;
}

/**
 * Every library company's report and active-flag count in one live pass: the
 * screener table sorts by these values, so they must sit above the row
 * components, where the per-company hooks cannot reach (hooks cannot run in
 * a loop). Validation and dismissal semantics mirror those hooks exactly:
 * corrupt rows drop synchronously and quarantine from an effect, and only a
 * dismissal made against the report's latest year quietens a flag.
 */
export function useLibraryReports(
  companies: readonly CompanyRecord[],
  db: PlainsightDb = appDb
): LibraryReportRow[] | undefined {
  const raws = useLiveQuery(
    async () => ({
      statements: await db.statements.toArray(),
      prices: await db.prices.toArray(),
      dismissals: await db.flagDismissals.toArray()
    }),
    [db]
  );

  const partitioned = useMemo(() => {
    if (raws === undefined) return undefined;
    return {
      statements: partitionRows(raws.statements, statementRecordSchema),
      prices: partitionRows(raws.prices, priceRecordSchema),
      dismissals: partitionRows(raws.dismissals, flagDismissalRecordSchema)
    };
  }, [raws]);

  useEffect(() => {
    if (partitioned === undefined) return;
    if (partitioned.statements.invalid.length > 0) {
      void moveToQuarantine(db, 'statements', partitioned.statements.invalid);
    }
    if (partitioned.prices.invalid.length > 0) {
      void moveToQuarantine(db, 'prices', partitioned.prices.invalid);
    }
    if (partitioned.dismissals.invalid.length > 0) {
      void moveToQuarantine(db, 'flagDismissals', partitioned.dismissals.invalid);
    }
  }, [db, partitioned]);

  return useMemo(() => {
    if (partitioned === undefined) return undefined;
    return companies.map((company) => {
      const statements = partitioned.statements.valid.filter(
        (row) => row.companyId === company.id
      );
      const price =
        partitioned.prices.valid.find((row) => row.companyId === company.id) ?? null;
      const report = computeMetricsReport(assembleFinancials(company, statements, price));
      const dismissedNow = new Set(
        partitioned.dismissals.valid
          .filter((row) => row.companyId === company.id && row.dismissedAtFy === report.latestFy)
          .map((row) => row.ruleId)
      );
      const activeFlagCount = report.flags.filter(
        (flag) => !dismissedNow.has(flag.ruleId)
      ).length;
      return { company, report, activeFlagCount };
    });
  }, [partitioned, companies]);
}
