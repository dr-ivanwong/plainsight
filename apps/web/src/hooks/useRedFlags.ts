import type { MetricsReport, RuleId, RuleResult } from '@plainsight/calc-engine';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';

import {
  db as appDb,
  flagDismissalRecordSchema,
  moveToQuarantine,
  partitionRows,
  putDismissal,
  removeDismissal,
  type PlainsightDb
} from '../db';

export interface RedFlags {
  active: RuleResult[];
  dismissed: RuleResult[];
  dismiss: (ruleId: RuleId) => Promise<void>;
  restore: (ruleId: RuleId) => Promise<void>;
}

/**
 * The report's fired rules, split by the company's live dismissals (frontend
 * spec §6). Only a dismissal made against the report's latest year counts: a
 * new fiscal year invalidates it and the rule speaks again (data-model spec
 * §7, dismissible-but-persistent).
 */
export function useRedFlags(
  companyId: string,
  report: MetricsReport,
  db: PlainsightDb = appDb
): RedFlags | undefined {
  const raws = useLiveQuery(
    () => db.flagDismissals.where('companyId').equals(companyId).toArray(),
    [db, companyId]
  );

  const partitioned = useMemo(
    () => (raws === undefined ? undefined : partitionRows(raws, flagDismissalRecordSchema)),
    [raws]
  );

  useEffect(() => {
    if (partitioned !== undefined && partitioned.invalid.length > 0) {
      void moveToQuarantine(db, 'flagDismissals', partitioned.invalid);
    }
  }, [db, partitioned]);

  return useMemo(() => {
    if (partitioned === undefined) return undefined;
    const current = new Set(
      partitioned.valid
        .filter((dismissal) => dismissal.dismissedAtFy === report.latestFy)
        .map((dismissal) => dismissal.ruleId)
    );
    return {
      active: report.flags.filter((flag) => !current.has(flag.ruleId)),
      dismissed: report.flags.filter((flag) => current.has(flag.ruleId)),
      dismiss: async (ruleId) => {
        if (report.latestFy === null) return;
        await putDismissal(db, { companyId, ruleId, dismissedAtFy: report.latestFy });
      },
      restore: async (ruleId) => {
        await removeDismissal(db, companyId, ruleId);
      }
    };
  }, [partitioned, report, companyId, db]);
}
