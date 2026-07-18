/**
 * The one definition of a pending local write, shared by the reconciler and
 * the settings surface (main plan §12.9: the backend is the source of truth,
 * and pending state is surfaced, never silently equal). A record is pending
 * when its own change stamp disagrees with its sync shadow: created or edited
 * here and not yet accepted by the server. A shadow whose row is gone locally
 * is a pending deletion.
 */
import type { SyncEnvelope } from '@plainsight/api-contract';
import type { PlainsightDb } from '../db/db';

export interface PendingLocalRecord {
  recordType: SyncEnvelope['recordType'];
  recordId: string;
  payload: unknown;
  fingerprint: string;
}

export interface PendingWrites {
  upserts: PendingLocalRecord[];
  /** recordKeys still shadowed after their local rows were deleted. */
  deletions: string[];
}

export const recordKeyOf = (recordType: string, recordId: string): string =>
  `${recordType}#${recordId}`;

/** Every syncable row, keyed the way the wire names it. */
export async function collectLocal(db: PlainsightDb): Promise<Map<string, PendingLocalRecord>> {
  const map = new Map<string, PendingLocalRecord>();
  const put = (record: PendingLocalRecord): void => {
    map.set(recordKeyOf(record.recordType, record.recordId), record);
  };
  for (const row of await db.companies.toArray()) {
    put({ recordType: 'company', recordId: row.id, payload: row, fingerprint: row.updatedAt });
  }
  for (const row of await db.statements.toArray()) {
    put({
      recordType: 'statement',
      recordId: `${row.companyId}|${row.fy}|${row.statement}`,
      payload: row,
      fingerprint: row.updatedAt
    });
  }
  for (const row of await db.prices.toArray()) {
    put({ recordType: 'price', recordId: row.companyId, payload: row, fingerprint: row.updatedAt });
  }
  for (const row of await db.theses.toArray()) {
    put({ recordType: 'thesis', recordId: row.companyId, payload: row, fingerprint: row.updatedAt });
  }
  for (const row of await db.thesisVersions.toArray()) {
    // Versions are append-only; identity is the company plus the moment
    // saved, never the device-local auto-increment id.
    const { id: _localId, ...portable } = row;
    put({
      recordType: 'thesis',
      recordId: `${row.companyId}|v|${row.savedAt}`,
      payload: portable,
      fingerprint: row.savedAt
    });
  }
  for (const row of await db.flagDismissals.toArray()) {
    put({
      recordType: 'flagDismissal',
      recordId: `${row.companyId}|${row.ruleId}`,
      payload: row,
      fingerprint: row.dismissedAt
    });
  }
  return map;
}

/** The full diff against the shadow: what would push if a sync ran now. */
export async function collectPendingWrites(db: PlainsightDb): Promise<PendingWrites> {
  const local = await collectLocal(db);
  const shadows = new Map(
    (await db.syncState.toArray()).map((row) => [row.recordKey, row] as const)
  );
  const upserts: PendingLocalRecord[] = [];
  for (const [recordKey, record] of local) {
    if (shadows.get(recordKey)?.fingerprint === record.fingerprint) continue;
    upserts.push(record);
  }
  const deletions: string[] = [];
  for (const recordKey of shadows.keys()) {
    if (local.has(recordKey)) continue;
    const [recordType, recordId = ''] = recordKey.split('#', 2);
    // Versions are append-only; a missing row never becomes a tombstone.
    if (recordType === 'thesis' && recordId.includes('|v|')) continue;
    deletions.push(recordKey);
  }
  return { upserts, deletions };
}
