import { describe, expect, it } from 'vitest';
import {
  SYNC_PUSH_MAX_RECORDS,
  SYNC_RECORD_TYPES,
  syncEnvelopeSchema,
  syncPullResponseSchema,
  syncPushRequestSchema,
  syncPushResponseSchema
} from '../src/index.js';

const live = {
  recordType: 'thesis',
  recordId: 'company-1',
  payload: { body: 'A durable moat.' },
  schemaVersion: 1,
  lamport: 4,
  deviceId: 'device-a',
  deleted: false
};

describe('sync envelope (backend spec section 4)', () => {
  it('accepts a live record and a payloadless tombstone', () => {
    expect(syncEnvelopeSchema.parse(live).recordId).toBe('company-1');
    const tombstone = { ...live, deleted: true, payload: undefined };
    delete (tombstone as Record<string, unknown>)['payload'];
    expect(syncEnvelopeSchema.parse(tombstone).deleted).toBe(true);
  });

  it('holds the tombstone rule in both directions', () => {
    expect(syncEnvelopeSchema.safeParse({ ...live, deleted: true }).success).toBe(false);
    const bare = { ...live } as Record<string, unknown>;
    delete bare['payload'];
    expect(syncEnvelopeSchema.safeParse(bare).success).toBe(false);
  });

  it('rejects provider credentials as a record type, by construction', () => {
    expect(SYNC_RECORD_TYPES).not.toContain('providerCredentials');
    const smuggled = { ...live, recordType: 'providerCredentials' };
    expect(syncEnvelopeSchema.safeParse(smuggled).success).toBe(false);
  });

  it('bounds a push batch to the pinned maximum', () => {
    expect(syncPushRequestSchema.safeParse({ records: [] }).success).toBe(false);
    const oversize = Array.from({ length: SYNC_PUSH_MAX_RECORDS + 1 }, () => live);
    expect(syncPushRequestSchema.safeParse({ records: oversize }).success).toBe(false);
    expect(syncPushRequestSchema.parse({ records: [live] }).records).toHaveLength(1);
  });
});

describe('sync responses', () => {
  it('shapes the push verdict with winners and current server copies', () => {
    const body = {
      accepted: [{ recordType: 'thesis', recordId: 'company-1', seq: 7 }],
      superseded: [{ ...live, lamport: 9, seq: 6 }]
    };
    const parsed = syncPushResponseSchema.parse(body);
    expect(parsed.superseded[0]?.seq).toBe(6);
  });

  it('shapes both pull outcomes', () => {
    const ok = syncPullResponseSchema.parse({
      status: 'ok',
      records: [{ ...live, seq: 3 }],
      checkpoint: 3,
      hasMore: false
    });
    expect(ok.status).toBe('ok');
    const resync = syncPullResponseSchema.parse({ status: 'full_resync_required' });
    expect(resync.status).toBe('full_resync_required');
  });
});
