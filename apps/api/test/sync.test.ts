/**
 * The sync protocol over a faked store (backend spec §4): last-write-wins
 * with the device tiebreak, idempotent replays, tombstone bookkeeping, the
 * purge watermark, thesis double protection, and both handlers' envelopes.
 */
import {
  errorEnvelopeSchema,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type SyncEnvelope,
  type SyncServerRecord
} from '@plainsight/api-contract';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import type { FeedState, SyncStore, TombstoneMark } from '../src/db/syncStore.js';
import { createSyncPullHandler } from '../src/handlers/syncPull.js';
import { createSyncPushHandler } from '../src/handlers/syncPush.js';
import { runPull, runPush, wins, type SyncDeps } from '../src/sync/core.js';

class FakeSyncStore implements SyncStore {
  records = new Map<string, SyncServerRecord & { expiresAt?: number }>();
  seq = 0;
  marks: TombstoneMark[] = [];
  watermark = 0;
  thesisVersions: Array<{ key: string; payload: unknown }> = [];
  checkpoints = new Map<string, number>();
  responses = new Map<string, { userId: string; body: string }>();

  private key(recordType: string, recordId: string): string {
    return `${recordType}#${recordId}`;
  }

  async getRecord(
    _userId: string,
    recordType: string,
    recordId: string
  ): Promise<SyncServerRecord | undefined> {
    const stored = this.records.get(this.key(recordType, recordId));
    if (stored === undefined) return undefined;
    const { expiresAt, ...record } = stored;
    void expiresAt;
    return record;
  }

  async nextSeq(): Promise<number> {
    this.seq += 1;
    return this.seq;
  }

  async putRecordIfNewer(
    _userId: string,
    record: SyncServerRecord,
    expiresAt?: number
  ): Promise<boolean> {
    const stored = this.records.get(this.key(record.recordType, record.recordId));
    if (
      stored !== undefined &&
      !(
        record.lamport > stored.lamport ||
        (record.lamport === stored.lamport && record.deviceId > stored.deviceId)
      )
    ) {
      return false;
    }
    this.records.set(this.key(record.recordType, record.recordId), {
      ...record,
      ...(expiresAt === undefined ? {} : { expiresAt })
    });
    return true;
  }

  async appendThesisVersion(
    _userId: string,
    recordId: string,
    lamport: number,
    payload: unknown
  ): Promise<void> {
    const key = `${recordId}#${lamport}`;
    if (this.thesisVersions.some((version) => version.key === key)) return;
    this.thesisVersions.push({ key, payload });
  }

  async markTombstone(_userId: string, mark: TombstoneMark): Promise<void> {
    this.marks.push(mark);
  }

  async getFeedState(): Promise<FeedState> {
    return { seq: this.seq, purgeWatermark: this.watermark, marks: [...this.marks] };
  }

  async advanceWatermark(
    _userId: string,
    watermark: number,
    marks: TombstoneMark[]
  ): Promise<void> {
    this.watermark = watermark;
    this.marks = marks;
  }

  async queryFeed(
    _userId: string,
    afterSeq: number,
    limit: number
  ): Promise<{ records: SyncServerRecord[]; hasMore: boolean }> {
    const all = [...this.records.values()]
      .filter((record) => record.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq)
      .map(({ expiresAt, ...record }) => {
        void expiresAt;
        return record;
      });
    return { records: all.slice(0, limit), hasMore: all.length > limit };
  }

  async putCheckpoint(_userId: string, deviceId: string, checkpoint: number): Promise<void> {
    this.checkpoints.set(deviceId, checkpoint);
  }

  async getStoredResponse(idempotencyKey: string, userId: string): Promise<string | undefined> {
    const stored = this.responses.get(idempotencyKey);
    return stored !== undefined && stored.userId === userId ? stored.body : undefined;
  }

  async storeResponse(idempotencyKey: string, userId: string, body: string): Promise<void> {
    this.responses.set(idempotencyKey, { userId, body });
  }
}

const T0 = new Date('2026-07-18T00:00:00Z');
const deps = (store: SyncStore, now: Date = T0): SyncDeps => ({ store, now: () => now });

function envelope(overrides: Partial<SyncEnvelope> = {}): SyncEnvelope {
  return {
    recordType: 'company',
    recordId: 'company-1',
    payload: { name: 'Apple Inc.' },
    schemaVersion: 1,
    lamport: 1,
    deviceId: 'device-a',
    deleted: false,
    ...overrides
  } as SyncEnvelope;
}

describe('last-write-wins (backend spec §4)', () => {
  it('orders by lamport first, then the device tiebreak, and replays lose', () => {
    expect(wins({ lamport: 2, deviceId: 'a' }, { lamport: 1, deviceId: 'z' })).toBe(true);
    expect(wins({ lamport: 1, deviceId: 'b' }, { lamport: 1, deviceId: 'a' })).toBe(true);
    expect(wins({ lamport: 1, deviceId: 'a' }, { lamport: 1, deviceId: 'a' })).toBe(false);
    expect(wins({ lamport: 1, deviceId: 'a' }, undefined)).toBe(true);
  });

  it('accepts winners with sequence numbers and returns server copies to losers', async () => {
    const store = new FakeSyncStore();
    const first = await runPush(deps(store), 'user-1', [envelope({ lamport: 5 })]);
    expect(first.accepted).toEqual([{ recordType: 'company', recordId: 'company-1', seq: 1 }]);

    const second = await runPush(deps(store), 'user-1', [
      envelope({ lamport: 3, deviceId: 'device-b', payload: { name: 'Stale' } })
    ]);
    expect(second.accepted).toEqual([]);
    expect(second.superseded).toHaveLength(1);
    expect(second.superseded[0]).toMatchObject({ lamport: 5, seq: 1 });
  });

  it('write races fall back to superseded with the current copy', async () => {
    const store = new FakeSyncStore();
    await runPush(deps(store), 'user-1', [envelope({ lamport: 9 })]);
    const original = store.putRecordIfNewer.bind(store);
    store.putRecordIfNewer = async () => false;
    const raced = await runPush(deps(store), 'user-1', [envelope({ lamport: 10 })]);
    store.putRecordIfNewer = original;
    expect(raced.accepted).toEqual([]);
    expect(raced.superseded[0]).toMatchObject({ lamport: 9 });
  });
});

describe('tombstones and the purge watermark (backend spec §4)', () => {
  it('a tombstone carries the 90-day expiry and lands a mark', async () => {
    const store = new FakeSyncStore();
    await runPush(deps(store), 'user-1', [
      envelope({ deleted: true, payload: undefined, lamport: 2 })
    ]);
    expect(store.marks).toHaveLength(1);
    const ninetyDays = 90 * 24 * 60 * 60;
    expect(store.marks[0]?.expiresAt).toBe(Math.floor(T0.getTime() / 1000) + ninetyDays);
    expect(store.records.get('company#company-1')?.expiresAt).toBe(store.marks[0]?.expiresAt);
  });

  it('an expired mark advances the watermark and stale checkpoints resync', async () => {
    const store = new FakeSyncStore();
    store.seq = 10;
    store.marks = [
      { seq: 4, expiresAt: 100 },
      { seq: 9, expiresAt: 9_999_999_999 }
    ];
    const result = await runPull(deps(store), 'user-1', 'device-a', 3);
    expect(result.status).toBe('full_resync_required');
    expect(store.watermark).toBe(4);
    expect(store.marks).toEqual([{ seq: 9, expiresAt: 9_999_999_999 }]);
  });

  it('checkpoint zero is the full resync itself and always answers ok', async () => {
    const store = new FakeSyncStore();
    store.watermark = 7;
    const result = await runPull(deps(store), 'user-1', 'device-a', 0);
    expect(result.status).toBe('ok');
  });
});

describe('the pull feed', () => {
  it('pages above the checkpoint and persists the per-device cursor', async () => {
    const store = new FakeSyncStore();
    for (let index = 1; index <= 3; index += 1) {
      await runPush(deps(store), 'user-1', [
        envelope({ recordId: `company-${index}`, lamport: index })
      ]);
    }
    const page = await runPull(deps(store), 'user-1', 'device-b', 1);
    if (page.status !== 'ok') throw new Error('expected an ok page');
    expect(page.records.map((record) => record.seq)).toEqual([2, 3]);
    expect(page.checkpoint).toBe(3);
    expect(page.hasMore).toBe(false);
    expect(store.checkpoints.get('device-b')).toBe(3);
  });

  it('an empty page keeps the caller checkpoint', async () => {
    const store = new FakeSyncStore();
    const page = await runPull(deps(store), 'user-1', 'device-a', 5);
    if (page.status !== 'ok') throw new Error('expected an ok page');
    expect(page.checkpoint).toBe(5);
    expect(page.hasMore).toBe(false);
  });
});

describe('thesis double protection (backend spec §4)', () => {
  it('an accepted thesis write appends a version; replays do not duplicate it', async () => {
    const store = new FakeSyncStore();
    const thesis = envelope({
      recordType: 'thesis',
      recordId: 'company-1',
      lamport: 4,
      payload: { body: 'A durable moat.' }
    });
    await runPush(deps(store), 'user-1', [thesis]);
    await runPush(deps(store), 'user-1', [thesis]);
    expect(store.thesisVersions).toHaveLength(1);
    expect(store.thesisVersions[0]?.payload).toEqual({ body: 'A durable moat.' });
  });

  it('a superseded thesis write appends nothing', async () => {
    const store = new FakeSyncStore();
    await runPush(deps(store), 'user-1', [
      envelope({ recordType: 'thesis', lamport: 9, payload: { body: 'Current.' } })
    ]);
    await runPush(deps(store), 'user-1', [
      envelope({ recordType: 'thesis', lamport: 2, deviceId: 'device-b', payload: { body: 'Old.' } })
    ]);
    expect(store.thesisVersions).toHaveLength(1);
  });
});

function pushEvent(
  body: unknown,
  headers: Record<string, string> = { 'idempotency-key': 'key-1' },
  sub: string | null = 'user-1'
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers,
    requestContext: {
      requestId: 'req_test',
      ...(sub === null ? {} : { authorizer: { jwt: { claims: { sub } } } })
    }
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function pullEvent(
  query: Record<string, string>,
  sub: string | null = 'user-1'
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    queryStringParameters: query,
    requestContext: {
      requestId: 'req_test',
      ...(sub === null ? {} : { authorizer: { jwt: { claims: { sub } } } })
    }
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('the push handler', () => {
  it('applies a batch and replays it verbatim under the same key, without double effects', async () => {
    const store = new FakeSyncStore();
    const handler = createSyncPushHandler(store, () => T0);
    const request = { records: [envelope({ lamport: 2 })] };

    const first = await handler(pushEvent(request));
    expect(first.statusCode).toBe(200);
    const firstBody = syncPushResponseSchema.parse(JSON.parse(first.body ?? ''));
    expect(firstBody.accepted).toHaveLength(1);

    const second = await handler(pushEvent(request));
    expect(second.body).toBe(first.body);
    expect(store.seq).toBe(1);
  });

  it('requires the Idempotency-Key header', async () => {
    const handler = createSyncPushHandler(new FakeSyncStore(), () => T0);
    const response = await handler(pushEvent({ records: [envelope()] }, {}));
    expect(response.statusCode).toBe(400);
    const body = errorEnvelopeSchema.parse(JSON.parse(response.body ?? ''));
    expect(body.error.code).toBe('invalid_request');
  });

  it('rejects a body that fails the wire schema', async () => {
    const handler = createSyncPushHandler(new FakeSyncStore(), () => T0);
    const smuggled = { records: [{ ...envelope(), recordType: 'providerCredentials' }] };
    const response = await handler(pushEvent(smuggled));
    expect(response.statusCode).toBe(400);
  });

  it('answers unauthenticated without claims, in the envelope', async () => {
    const handler = createSyncPushHandler(new FakeSyncStore(), () => T0);
    const response = await handler(pushEvent({ records: [envelope()] }, { 'idempotency-key': 'k' }, null));
    expect(response.statusCode).toBe(401);
    const body = errorEnvelopeSchema.parse(JSON.parse(response.body ?? ''));
    expect(body.error.code).toBe('unauthenticated');
  });
});

describe('the pull handler', () => {
  it('serves a page and validates it against the contract', async () => {
    const store = new FakeSyncStore();
    await runPush(deps(store), 'user-1', [envelope({ lamport: 1 })]);
    const handler = createSyncPullHandler(store, () => T0);
    const response = await handler(pullEvent({ deviceId: 'device-a' }));
    expect(response.statusCode).toBe(200);
    const body = syncPullResponseSchema.parse(JSON.parse(response.body ?? ''));
    if (body.status !== 'ok') throw new Error('expected an ok page');
    expect(body.records).toHaveLength(1);
  });

  it('requires a deviceId', async () => {
    const handler = createSyncPullHandler(new FakeSyncStore(), () => T0);
    const response = await handler(pullEvent({}));
    expect(response.statusCode).toBe(400);
  });

  it('answers unauthenticated without claims', async () => {
    const handler = createSyncPullHandler(new FakeSyncStore(), () => T0);
    const response = await handler(pullEvent({ deviceId: 'device-a' }, null));
    expect(response.statusCode).toBe(401);
  });
});
