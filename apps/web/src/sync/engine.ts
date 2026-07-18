/**
 * The Dexie-side reconciler (backend spec §4; main plan §5: sync is an
 * optional overlay, silent and retried, and the UI never blocks on it).
 *
 * The engine is additive by design: no existing write path knows it exists.
 * It diffs each table's own change stamps against the sync shadow to find
 * dirty records and deletions, stamps outgoing records from the device's
 * Lamport clock at push time (a pending local edit therefore always outranks
 * everything this device has seen, which is exactly last-write-wins from the
 * owner's point of view), and applies pulled records unless the local copy
 * is dirty, in which case the local edit wins now and pushes next.
 */
import {
  syncPullResponseSchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
  type SyncEnvelope,
  type SyncServerRecord
} from '@plainsight/api-contract';
import type { PlainsightDb } from '../db/db';
import {
  companyRecordSchema,
  flagDismissalRecordSchema,
  priceRecordSchema,
  statementRecordSchema,
  thesisRecordSchema,
  thesisVersionRecordSchema
} from '../db/records';
import { getMeta, setMeta } from '../db/meta';

export interface SyncDeps {
  db: PlainsightDb;
  /** Null means signed out; the run ends quietly. */
  accessToken(): Promise<string | null>;
  fetchImpl: typeof fetch;
  now(): Date;
  newId(): string;
}

export type SyncOutcome =
  | { outcome: 'signed_out' }
  | { outcome: 'failed' }
  | { outcome: 'ok'; pushed: number; pulled: number };

const PAGE_LIMIT = 40;
const PUSH_BATCH = 100;

interface LocalRecord {
  recordType: SyncEnvelope['recordType'];
  recordId: string;
  payload: unknown;
  fingerprint: string;
}

const keyOf = (recordType: string, recordId: string): string => `${recordType}#${recordId}`;

/** Every syncable row, keyed the way the wire names it. */
async function collectLocal(db: PlainsightDb): Promise<Map<string, LocalRecord>> {
  const map = new Map<string, LocalRecord>();
  const put = (record: LocalRecord): void => {
    map.set(keyOf(record.recordType, record.recordId), record);
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

/** Applies one server record locally; the schemas hold the boundary. */
async function applyRecord(db: PlainsightDb, record: SyncServerRecord): Promise<void> {
  const versionMarker = record.recordType === 'thesis' && record.recordId.includes('|v|');
  if (record.deleted) {
    if (versionMarker) return; // versions are append-only, even against tombstones
    const [companyId = '', b = '', c = ''] = record.recordId.split('|');
    if (record.recordType === 'company') await db.companies.delete(record.recordId);
    if (record.recordType === 'price') await db.prices.delete(record.recordId);
    if (record.recordType === 'thesis') await db.theses.delete(record.recordId);
    if (record.recordType === 'statement') await db.statements.delete([companyId, b, c]);
    if (record.recordType === 'flagDismissal') await db.flagDismissals.delete([companyId, b]);
    return;
  }
  switch (record.recordType) {
    case 'company':
      await db.companies.put(companyRecordSchema.parse(record.payload));
      return;
    case 'statement':
      await db.statements.put(statementRecordSchema.parse(record.payload));
      return;
    case 'price':
      await db.prices.put(priceRecordSchema.parse(record.payload));
      return;
    case 'flagDismissal':
      await db.flagDismissals.put(flagDismissalRecordSchema.parse(record.payload));
      return;
    case 'thesis': {
      if (!versionMarker) {
        await db.theses.put(thesisRecordSchema.parse(record.payload));
        return;
      }
      const version = thesisVersionRecordSchema.omit({ id: true }).parse(record.payload);
      const twin = await db.thesisVersions
        .where('companyId')
        .equals(version.companyId)
        .filter((row) => row.savedAt === version.savedAt)
        .first();
      if (twin === undefined) await db.thesisVersions.add(version as never);
      return;
    }
  }
}

const fingerprintOf = (record: SyncServerRecord): string => {
  const payload = record.payload as Record<string, unknown> | undefined;
  const stamp = payload?.['updatedAt'] ?? payload?.['savedAt'] ?? payload?.['dismissedAt'];
  return typeof stamp === 'string' ? stamp : `lamport:${record.lamport}`;
};

export async function runSync(deps: SyncDeps): Promise<SyncOutcome> {
  try {
    const token = await deps.accessToken();
    if (token === null) return { outcome: 'signed_out' };
    const { db } = deps;
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    let deviceId = await getMeta(db, 'deviceId');
    if (deviceId === undefined) {
      deviceId = deps.newId();
      await setMeta(db, 'deviceId', deviceId);
    }
    let clock = (await getMeta(db, 'lamportClock')) ?? 0;
    let checkpoint = (await getMeta(db, 'syncCheckpoint')) ?? 0;

    const local = await collectLocal(db);
    const state = new Map(
      (await db.syncState.toArray()).map((row) => [row.recordKey, row] as const)
    );

    // Pull first, so pushes stamp above everything another device sent.
    let pulled = 0;
    let sawFullResync = false;
    for (let page = 0; page < 200; page += 1) {
      const response = await deps.fetchImpl(
        `/v1/sync/pull?deviceId=${encodeURIComponent(deviceId)}&checkpoint=${checkpoint}`,
        { headers }
      );
      if (!response.ok) return { outcome: 'failed' };
      const body = syncPullResponseSchema.parse(await response.json());
      if (body.status === 'full_resync_required') {
        if (sawFullResync) return { outcome: 'failed' };
        sawFullResync = true;
        checkpoint = 0;
        continue;
      }
      for (const record of body.records) {
        clock = Math.max(clock, record.lamport);
        const recordKey = keyOf(record.recordType, record.recordId);
        const shadow = state.get(recordKey);
        const localRecord = local.get(recordKey);
        const locallyDirty =
          localRecord !== undefined && localRecord.fingerprint !== shadow?.fingerprint;
        if (shadow !== undefined && record.lamport <= shadow.lastLamport) continue;
        if (locallyDirty) continue; // the local edit wins now and pushes below
        await applyRecord(db, record);
        const fingerprint = record.deleted ? '' : fingerprintOf(record);
        if (record.deleted) {
          local.delete(recordKey);
          state.delete(recordKey);
          await db.syncState.delete(recordKey);
        } else {
          const row = { recordKey, lastLamport: record.lamport, fingerprint };
          state.set(recordKey, row);
          await db.syncState.put(row);
          local.set(recordKey, {
            recordType: record.recordType,
            recordId: record.recordId,
            payload: record.payload,
            fingerprint
          });
        }
        pulled += 1;
      }
      checkpoint = body.checkpoint;
      if (!body.hasMore) break;
    }

    // Dirty records and local deletions, stamped now, above everything seen.
    const outgoing: Array<{ envelope: SyncEnvelope; fingerprint: string }> = [];
    for (const [recordKey, record] of local) {
      const shadow = state.get(recordKey);
      if (shadow !== undefined && shadow.fingerprint === record.fingerprint) continue;
      clock += 1;
      outgoing.push({
        envelope: {
          recordType: record.recordType,
          recordId: record.recordId,
          payload: record.payload,
          schemaVersion: 1,
          lamport: clock,
          deviceId,
          deleted: false
        },
        fingerprint: record.fingerprint
      });
    }
    for (const [recordKey, shadow] of state) {
      if (local.has(recordKey)) continue;
      const [recordType, recordId] = recordKey.split('#', 2) as [
        SyncEnvelope['recordType'],
        string
      ];
      if (recordType === 'thesis' && recordId.includes('|v|')) continue;
      clock += 1;
      void shadow;
      outgoing.push({
        envelope: {
          recordType,
          recordId,
          schemaVersion: 1,
          lamport: clock,
          deviceId,
          deleted: true
        },
        fingerprint: ''
      });
    }

    let pushed = 0;
    for (let start = 0; start < outgoing.length; start += PUSH_BATCH) {
      const batch = outgoing.slice(start, start + PUSH_BATCH);
      const request = syncPushRequestSchema.parse({
        records: batch.map((entry) => entry.envelope)
      });
      const response = await deps.fetchImpl('/v1/sync/push', {
        method: 'POST',
        headers: { ...headers, 'idempotency-key': deps.newId() },
        body: JSON.stringify(request)
      });
      if (!response.ok) return { outcome: 'failed' };
      const verdict = syncPushResponseSchema.parse(await response.json());
      const byKey = new Map(batch.map((entry) => [keyOf(entry.envelope.recordType, entry.envelope.recordId), entry] as const));
      for (const accepted of verdict.accepted) {
        const entry = byKey.get(keyOf(accepted.recordType, accepted.recordId));
        if (entry === undefined) continue;
        pushed += 1;
        const recordKey = keyOf(accepted.recordType, accepted.recordId);
        if (entry.envelope.deleted) {
          await deps.db.syncState.delete(recordKey);
        } else {
          await deps.db.syncState.put({
            recordKey,
            lastLamport: entry.envelope.lamport,
            fingerprint: entry.fingerprint
          });
        }
      }
      for (const superseded of verdict.superseded) {
        // Another device out-wrote this one mid-run; its copy is the truth.
        await applyRecord(deps.db, superseded);
        const recordKey = keyOf(superseded.recordType, superseded.recordId);
        if (superseded.deleted) {
          await deps.db.syncState.delete(recordKey);
        } else {
          await deps.db.syncState.put({
            recordKey,
            lastLamport: superseded.lamport,
            fingerprint: fingerprintOf(superseded)
          });
        }
      }
    }

    await setMeta(db, 'lamportClock', clock);
    await setMeta(db, 'syncCheckpoint', checkpoint);
    await setMeta(db, 'lastSyncedAt', deps.now().toISOString());
    return { outcome: 'ok', pushed, pulled };
  } catch {
    return { outcome: 'failed' };
  }
}

export { PAGE_LIMIT };
