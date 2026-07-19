/**
 * The Dexie-side reconciler. The wire is backend spec §4 unchanged; the
 * policy is main plan §12.9: the backend is the source of truth, and the
 * client holds a synchronised working copy.
 *
 * Pull first: every server record newer than its shadow applies locally, and
 * a pulled server copy beats a dirty local edit. Then push: whatever still
 * differs from its shadow is a pending local write (pending.ts, the one
 * definition the settings surface shares), stamped from the device's Lamport
 * clock and retried run after run until the server accepts it. The UI never
 * blocks on a run.
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
  thesisVersionRecordSchema,
  type SyncStateRecord
} from '../db/records';
import type { AccessTokenAnswer } from '../auth/session';
import { getMeta, setMeta } from '../db/meta';
import { collectPendingWrites, recordKeyOf } from './pending';

export interface SyncDeps {
  db: PlainsightDb;
  /**
   * The auth layer's three-way answer: signed_out ends the run quietly,
   * unavailable fails it into the scheduler's backoff with the session kept.
   */
  accessToken(): Promise<AccessTokenAnswer>;
  fetchImpl: typeof fetch;
  now(): Date;
  newId(): string;
}

export type SyncOutcome =
  | { outcome: 'signed_out' }
  | { outcome: 'failed' }
  | { outcome: 'ok'; pushed: number; pulled: number };

const PUSH_BATCH = 100;

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

/**
 * The spec §4 comparison, client side, the same pair the server's
 * conditional write uses: a pulled copy applies when its (lamport, deviceId)
 * exceeds the shadow's, with the lexicographic deviceId tiebreak deciding
 * equal Lamport values. A replay of the copy this device already holds (its
 * own echo, a full resync) therefore never clobbers a pending edit built on
 * it, while an equal-Lamport copy another device won at the server does
 * apply. A shadow written before the tiebreak landed has no device recorded;
 * equal then reads as already-seen, the pre-tiebreak behaviour, so migration
 * cannot turn a replay into a beat.
 */
const pullWins = (record: SyncServerRecord, shadow: SyncStateRecord): boolean => {
  if (record.lamport !== shadow.lastLamport) return record.lamport > shadow.lastLamport;
  return shadow.lastDeviceId !== undefined && record.deviceId > shadow.lastDeviceId;
};

export async function runSync(deps: SyncDeps): Promise<SyncOutcome> {
  try {
    const token = await deps.accessToken();
    if (token.status === 'signed_out') return { outcome: 'signed_out' };
    // An unreachable token endpoint fails the run without touching the wire:
    // the backoff owns the retry, and the queued writes keep waiting rather
    // than the device silently signing out (main plan §12.9).
    if (token.status === 'unavailable') return { outcome: 'failed' };
    const { db } = deps;
    const headers = {
      authorization: `Bearer ${token.accessToken}`,
      'content-type': 'application/json'
    };

    let deviceId = await getMeta(db, 'deviceId');
    if (deviceId === undefined) {
      deviceId = deps.newId();
      await setMeta(db, 'deviceId', deviceId);
    }
    let clock = (await getMeta(db, 'lamportClock')) ?? 0;
    let checkpoint = (await getMeta(db, 'syncCheckpoint')) ?? 0;

    const shadows = new Map(
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
        const recordKey = recordKeyOf(record.recordType, record.recordId);
        const shadow = shadows.get(recordKey);
        // The only guard is the pair comparison (pullWins): anything the
        // server has moved past the shadow applies, dirty local edit or
        // not. The server's copy wins, and the beaten edit never pushes.
        if (shadow !== undefined && !pullWins(record, shadow)) continue;
        await applyRecord(db, record);
        if (record.deleted) {
          shadows.delete(recordKey);
          await db.syncState.delete(recordKey);
        } else {
          const row = {
            recordKey,
            lastLamport: record.lamport,
            lastDeviceId: record.deviceId,
            fingerprint: fingerprintOf(record)
          };
          shadows.set(recordKey, row);
          await db.syncState.put(row);
        }
        pulled += 1;
      }
      checkpoint = body.checkpoint;
      if (!body.hasMore) break;
    }

    // Whatever still differs from its shadow after the pull is a pending
    // local write, stamped now, above everything seen.
    const pending = await collectPendingWrites(db);
    const outgoing: Array<{ envelope: SyncEnvelope; fingerprint: string }> = [];
    for (const record of pending.upserts) {
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
    for (const recordKey of pending.deletions) {
      const [recordType, recordId] = recordKey.split('#', 2) as [
        SyncEnvelope['recordType'],
        string
      ];
      clock += 1;
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
      const byKey = new Map(
        batch.map((entry) => [recordKeyOf(entry.envelope.recordType, entry.envelope.recordId), entry] as const)
      );
      for (const accepted of verdict.accepted) {
        const entry = byKey.get(recordKeyOf(accepted.recordType, accepted.recordId));
        if (entry === undefined) continue;
        pushed += 1;
        const recordKey = recordKeyOf(accepted.recordType, accepted.recordId);
        if (entry.envelope.deleted) {
          await deps.db.syncState.delete(recordKey);
        } else {
          await deps.db.syncState.put({
            recordKey,
            lastLamport: entry.envelope.lamport,
            lastDeviceId: entry.envelope.deviceId,
            fingerprint: entry.fingerprint
          });
        }
      }
      for (const superseded of verdict.superseded) {
        // Another device out-wrote this one mid-run; its copy is the truth.
        await applyRecord(deps.db, superseded);
        const recordKey = recordKeyOf(superseded.recordType, superseded.recordId);
        if (superseded.deleted) {
          await deps.db.syncState.delete(recordKey);
        } else {
          await deps.db.syncState.put({
            recordKey,
            lastLamport: superseded.lamport,
            lastDeviceId: superseded.deviceId,
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
