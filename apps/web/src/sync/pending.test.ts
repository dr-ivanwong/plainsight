// @vitest-environment jsdom

// The pending diff (main plan §12.9): a local write counts as pending from
// the moment it happens until the server accepts it, through failed runs
// included. Never silently equal.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCompany } from '../db';
import { PlainsightDb } from '../db/db';
import { runSync, type SyncDeps } from './engine';
import { countPendingWrites } from './pending';

let db: PlainsightDb;
let counter = 0;
let seq = 0;

beforeEach(async () => {
  db = new PlainsightDb(`pending-${Date.now()}-${Math.random()}`);
  await db.open();
  seq = 0;
});

/** A server with nothing to say that accepts every push. */
const acceptingFetch: typeof fetch = (async (url: unknown, init?: unknown) => {
  if (String(url).startsWith('/v1/sync/pull')) {
    return Response.json({ status: 'ok', records: [], checkpoint: 0, hasMore: false });
  }
  const body = JSON.parse(String((init as { body: string }).body)) as {
    records: Array<{ recordType: string; recordId: string }>;
  };
  return Response.json({
    accepted: body.records.map((record) => ({
      recordType: record.recordType,
      recordId: record.recordId,
      seq: (seq += 1)
    })),
    superseded: []
  });
}) as typeof fetch;

const offlineFetch: typeof fetch = (async () => {
  throw new TypeError('offline');
}) as typeof fetch;

const deps = (fetchImpl: typeof fetch): SyncDeps => ({
  db,
  accessToken: async () => 'token',
  fetchImpl,
  now: () => new Date('2026-07-18T10:00:00Z'),
  newId: () => `id-${(counter += 1)}`
});

describe('pending writes', () => {
  it('a fresh edit counts as pending until the server accepts it', async () => {
    await createCompany(db, { name: 'Apple Inc.', currency: 'USD', sector: 'Technology' });
    expect(await countPendingWrites(db)).toBe(1);

    await expect(runSync(deps(acceptingFetch))).resolves.toMatchObject({
      outcome: 'ok',
      pushed: 1
    });
    expect(await countPendingWrites(db)).toBe(0);
  });

  it('a failed run leaves pending pending', async () => {
    await createCompany(db, { name: 'Apple Inc.', currency: 'USD', sector: 'Technology' });
    await expect(runSync(deps(offlineFetch))).resolves.toEqual({ outcome: 'failed' });
    expect(await countPendingWrites(db)).toBe(1);
  });

  it('a local deletion is pending until its tombstone lands', async () => {
    const company = await createCompany(db, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    await runSync(deps(acceptingFetch));
    expect(await countPendingWrites(db)).toBe(0);

    await db.companies.delete(company.id);
    expect(await countPendingWrites(db)).toBe(1);

    await runSync(deps(acceptingFetch));
    expect(await countPendingWrites(db)).toBe(0);
  });
});
