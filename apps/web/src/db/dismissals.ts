/**
 * Flag-dismissal repository. A dismissal is keyed by company and rule and
 * remembered against the latest fiscal year at the time (data-model spec §7):
 * a new year invalidates it and the rule re-evaluates. Dismissals never touch
 * dataVersion; they filter what the report already computed.
 */
import type { FyLabel, RuleId } from '@plainsight/calc-engine';

import type { PlainsightDb } from './db';
import { flagDismissalRecordSchema, type FlagDismissalRecord } from './records';
import { validateRows } from './safeRead';

export interface DismissalWrite {
  companyId: string;
  ruleId: RuleId;
  dismissedAtFy: FyLabel;
}

export async function putDismissal(
  db: PlainsightDb,
  write: DismissalWrite
): Promise<FlagDismissalRecord> {
  const record = flagDismissalRecordSchema.parse({
    ...write,
    dismissedAt: new Date().toISOString()
  });
  await db.flagDismissals.put(record);
  return record;
}

export async function removeDismissal(
  db: PlainsightDb,
  companyId: string,
  ruleId: RuleId
): Promise<void> {
  await db.flagDismissals.delete([companyId, ruleId]);
}

export async function listDismissals(
  db: PlainsightDb,
  companyId: string
): Promise<FlagDismissalRecord[]> {
  const rows = await db.flagDismissals.where('companyId').equals(companyId).toArray();
  return validateRows(db, 'flagDismissals', rows, flagDismissalRecordSchema);
}
