/**
 * The sync wire contract (backend spec section 4, pinned; owner-confirmed
 * 2026-07-12): last-write-wins per record on the (lamport, deviceId) pair, a
 * per-user sequence number as the pull cursor, and 90-day tombstones behind a
 * purge watermark that forces a full resync when a device sleeps past it.
 */
import { z } from 'zod';

const nonEmpty = z.string().min(1);

/**
 * The record types that sync. Provider credentials are not a record type and
 * can never become one by accident: the enum is the rejection (data-model
 * section 5, keys never sync by construction).
 */
export const SYNC_RECORD_TYPES = [
  'company',
  'statement',
  'price',
  'thesis',
  'flagDismissal'
] as const;

export type SyncRecordType = (typeof SYNC_RECORD_TYPES)[number];

/** Push batches are bounded (backend spec section 4). */
export const SYNC_PUSH_MAX_RECORDS = 100;

const recordFields = z.object({
  recordType: z.enum(SYNC_RECORD_TYPES),
  recordId: z.string().min(1).max(200),
  /** Opaque to the server; absent exactly when the record is a tombstone. */
  payload: z.unknown().optional(),
  schemaVersion: z.number().int().positive(),
  lamport: z.number().int().positive(),
  deviceId: z.string().min(1).max(64),
  deleted: z.boolean()
});

const tombstonesDropPayloads = (record: { deleted: boolean; payload?: unknown }): boolean =>
  record.deleted === (record.payload === undefined);

export const syncEnvelopeSchema = recordFields.refine(tombstonesDropPayloads, {
  message: 'a tombstone drops its payload; a live record carries one'
});

export type SyncEnvelope = z.infer<typeof syncEnvelopeSchema>;

/** A server-held record: the envelope plus its position in the per-user feed. */
export const syncServerRecordSchema = recordFields
  .extend({ seq: z.number().int().positive() })
  .refine(tombstonesDropPayloads, {
    message: 'a tombstone drops its payload; a live record carries one'
  });

export type SyncServerRecord = z.infer<typeof syncServerRecordSchema>;

export const syncPushRequestSchema = z.object({
  records: z.array(syncEnvelopeSchema).min(1).max(SYNC_PUSH_MAX_RECORDS)
});

export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

/**
 * The push verdict (backend spec section 4): winners are listed with their
 * assigned sequence numbers; losers come back as the current server copies so
 * the client can apply them locally.
 */
export const syncPushResponseSchema = z.object({
  accepted: z.array(
    z.object({
      recordType: z.enum(SYNC_RECORD_TYPES),
      recordId: nonEmpty,
      seq: z.number().int().positive()
    })
  ),
  superseded: z.array(syncServerRecordSchema)
});

export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

/**
 * The pull page. The checkpoint is the protocol's own cursor (backend spec
 * section 4: the response ends with the new checkpoint), so pagination is
 * simply pulling again while hasMore holds. A checkpoint that predates the
 * tombstone purge watermark answers full_resync_required instead, and the
 * client re-pulls from zero and reconciles by last-write-wins.
 */
export const syncPullResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    records: z.array(syncServerRecordSchema),
    checkpoint: z.number().int().nonnegative(),
    hasMore: z.boolean()
  }),
  z.object({ status: z.literal('full_resync_required') })
]);

export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;
