/**
 * The sync protocol (backend spec §4, pinned): last-write-wins per record on
 * the (lamport, deviceId) pair with a lexicographic device tiebreak, per-user
 * sequence numbers as the pull cursor, 90-day tombstones, and the purge
 * watermark that turns a too-old checkpoint into a full resync. Pure against
 * the store interface; the handlers own HTTP and identity.
 */
import type { SyncEnvelope, SyncPullResponse, SyncPushResponse } from '@plainsight/api-contract';
import type { SyncStore, TombstoneMark } from '../db/syncStore.js';

export const TOMBSTONE_TTL_DAYS = 90;
export const IDEMPOTENCY_TTL_HOURS = 24;
export const PULL_PAGE_SIZE = 100;

export interface SyncDeps {
  store: SyncStore;
  now: () => Date;
}

const epochSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

export const tombstoneExpiry = (now: Date): number =>
  epochSeconds(now) + TOMBSTONE_TTL_DAYS * 24 * 60 * 60;

export const idempotencyExpiry = (now: Date): number =>
  epochSeconds(now) + IDEMPOTENCY_TTL_HOURS * 60 * 60;

/** Strictly exceeds: an identical pair is a replay and must be a no-op. */
export function wins(
  candidate: { lamport: number; deviceId: string },
  incumbent: { lamport: number; deviceId: string } | undefined
): boolean {
  if (incumbent === undefined) return true;
  if (candidate.lamport !== incumbent.lamport) return candidate.lamport > incumbent.lamport;
  return candidate.deviceId > incumbent.deviceId;
}

export async function runPush(
  deps: SyncDeps,
  userId: string,
  records: SyncEnvelope[]
): Promise<SyncPushResponse> {
  const accepted: SyncPushResponse['accepted'] = [];
  const superseded: SyncPushResponse['superseded'] = [];

  for (const record of records) {
    const stored = await deps.store.getRecord(userId, record.recordType, record.recordId);
    if (!wins(record, stored)) {
      if (stored !== undefined) superseded.push(stored);
      continue;
    }

    const seq = await deps.store.nextSeq(userId);
    const serverRecord = { ...record, seq };
    const now = deps.now();
    const expiresAt = record.deleted ? tombstoneExpiry(now) : undefined;
    const written = await deps.store.putRecordIfNewer(userId, serverRecord, expiresAt);
    if (!written) {
      // A concurrent writer won between the read and the write; its copy is
      // the server truth now. The assigned seq stays burnt, which is fine:
      // the cursor only needs monotonicity, not density.
      const current = await deps.store.getRecord(userId, record.recordType, record.recordId);
      if (current !== undefined) superseded.push(current);
      continue;
    }

    accepted.push({ recordType: record.recordType, recordId: record.recordId, seq });
    if (record.deleted && expiresAt !== undefined) {
      await deps.store.markTombstone(userId, { seq, expiresAt });
    } else if (record.recordType === 'thesis') {
      // Double protection (backend spec §4): every accepted thesis write also
      // lands an append-only version item, exempt from last-write-wins, so
      // concurrent edits can never destroy writing.
      await deps.store.appendThesisVersion(
        userId,
        record.recordId,
        record.lamport,
        record.payload,
        now.toISOString()
      );
    }
  }

  return { accepted, superseded };
}

export async function runPull(
  deps: SyncDeps,
  userId: string,
  deviceId: string,
  checkpoint: number
): Promise<SyncPullResponse> {
  const state = await deps.store.getFeedState(userId);
  const nowEpoch = epochSeconds(deps.now());

  // Tombstones expire in seq order (a fixed TTL offset over an increasing
  // clock), so the purge watermark is simply the newest expired mark, and the
  // live marks carry forward. Advanced lazily here; pushes only append.
  const expired = state.marks.filter((mark) => mark.expiresAt <= nowEpoch);
  let watermark = state.purgeWatermark;
  if (expired.length > 0) {
    watermark = Math.max(watermark, ...expired.map((mark) => mark.seq));
    await deps.store.advanceWatermark(
      userId,
      watermark,
      state.marks.filter((mark) => mark.expiresAt > nowEpoch)
    );
  }

  // A positive checkpoint older than the watermark missed purged tombstones.
  // Zero is exempt: it means "I hold nothing yet", which is exactly the full
  // resync the client performs on this very answer (backend spec §4).
  if (checkpoint > 0 && checkpoint < watermark) {
    return { status: 'full_resync_required' };
  }

  const { records, hasMore } = await deps.store.queryFeed(userId, checkpoint, PULL_PAGE_SIZE);
  const lastRecord = records.at(-1);
  const newCheckpoint = lastRecord === undefined ? checkpoint : lastRecord.seq;
  await deps.store.putCheckpoint(userId, deviceId, newCheckpoint);
  return { status: 'ok', records, checkpoint: newCheckpoint, hasMore };
}

/** Exported for the handler's tombstone bookkeeping tests. */
export type { TombstoneMark };
