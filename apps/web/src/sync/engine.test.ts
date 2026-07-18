// @vitest-environment jsdom

// The reconciler against a faithful in-memory server (backend spec §4):
// last-write-wins convergence across two real Dexie databases, which is the
// Phase 3 exit criterion in miniature.
import 'fake-indexeddb/auto';
import type { SyncServerRecord } from '@plainsight/api-contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCompany, getMeta, putThesisDraft } from '../db';
import { PlainsightDb } from '../db/db';
import { runSync, type SyncDeps } from './engine';

/** The §4 server rules, in miniature: LWW per record, per-user seq feed. */
class FakeServer {
  records = new Map<string, SyncServerRecord>();
  seq = 0;

  fetchImpl: typeof fetch = (async (url: unknown, init?: unknown) => {
    const address = String(url);
    if (address.startsWith('/v1/sync/pull')) {
      const checkpoint = Number(new URLSearchParams(address.split('?')[1]).get('checkpoint'));
      const above = [...this.records.values()]
        .filter((record) => record.seq > checkpoint)
        .sort((a, b) => a.seq - b.seq);
      const page = above.slice(0, 100);
      const last = page.at(-1);
      return Response.json({
        status: 'ok',
        records: page,
        checkpoint: last === undefined ? checkpoint : last.seq,
        hasMore: above.length > page.length
      });
    }
    const body = JSON.parse(String((init as { body: string }).body)) as {
      records: Array<Omit<SyncServerRecord, 'seq'>>;
    };
    const accepted: unknown[] = [];
    const superseded: SyncServerRecord[] = [];
    for (const incoming of body.records) {
      const key = `${incoming.recordType}#${incoming.recordId}`;
      const stored = this.records.get(key);
      const wins =
        stored === undefined ||
        incoming.lamport > stored.lamport ||
        (incoming.lamport === stored.lamport && incoming.deviceId > stored.deviceId);
      if (!wins) {
        if (stored !== undefined) superseded.push(stored);
        continue;
      }
      this.seq += 1;
      this.records.set(key, { ...incoming, seq: this.seq } as SyncServerRecord);
      accepted.push({ recordType: incoming.recordType, recordId: incoming.recordId, seq: this.seq });
    }
    return Response.json({ accepted, superseded });
  }) as typeof fetch;
}

let counter = 0;
const deviceDeps = (db: PlainsightDb, server: FakeServer, device: string): SyncDeps => ({
  db,
  accessToken: async () => 'token',
  fetchImpl: server.fetchImpl,
  now: () => new Date('2026-07-18T10:00:00Z'),
  newId: () => `${device}-${(counter += 1)}`
});

let deviceA: PlainsightDb;
let deviceB: PlainsightDb;
let server: FakeServer;

beforeEach(async () => {
  deviceA = new PlainsightDb(`sync-a-${Date.now()}-${Math.random()}`);
  deviceB = new PlainsightDb(`sync-b-${Date.now()}-${Math.random()}`);
  await deviceA.open();
  await deviceB.open();
  server = new FakeServer();
});

describe('two devices converge (the Phase 3 exit criterion)', () => {
  it('carries a company from one device to the other', async () => {
    const company = await createCompany(deviceA, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    const pushRun = await runSync(deviceDeps(deviceA, server, 'a'));
    expect(pushRun).toMatchObject({ outcome: 'ok', pushed: 1 });

    const pullRun = await runSync(deviceDeps(deviceB, server, 'b'));
    expect(pullRun).toMatchObject({ outcome: 'ok', pulled: 1 });
    expect((await deviceB.companies.get(company.id))?.name).toBe('Apple Inc.');
  });

  it('offline edits on both sides settle on the later writer everywhere', async () => {
    const company = await createCompany(deviceA, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    await runSync(deviceDeps(deviceA, server, 'a'));
    await runSync(deviceDeps(deviceB, server, 'b'));

    // Both edit the same thesis while apart.
    await putThesisDraft(deviceA, company.id, { business: 'Version from A', moat: '', valuation: '', kills: '' });
    await putThesisDraft(deviceB, company.id, { business: 'Version from B', moat: '', valuation: '', kills: '' });

    await runSync(deviceDeps(deviceA, server, 'a'));
    // B pulls A's copy but holds its own dirty edit, then pushes it above.
    await runSync(deviceDeps(deviceB, server, 'b'));
    await runSync(deviceDeps(deviceA, server, 'a'));

    const onA = await deviceA.theses.get(company.id);
    const onB = await deviceB.theses.get(company.id);
    expect(onA?.sections.business).toBe('Version from B');
    expect(onA?.sections).toEqual(onB?.sections);
  });

  it('a deletion travels as a tombstone', async () => {
    const company = await createCompany(deviceA, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    await runSync(deviceDeps(deviceA, server, 'a'));
    await runSync(deviceDeps(deviceB, server, 'b'));
    expect(await deviceB.companies.get(company.id)).toBeDefined();

    await deviceA.companies.delete(company.id);
    await runSync(deviceDeps(deviceA, server, 'a'));
    await runSync(deviceDeps(deviceB, server, 'b'));
    expect(await deviceB.companies.get(company.id)).toBeUndefined();
  });

  it('repeated runs settle: nothing left to push, nothing new to pull', async () => {
    await createCompany(deviceA, { name: 'Apple Inc.', currency: 'USD', sector: 'Technology' });
    await runSync(deviceDeps(deviceA, server, 'a'));
    const second = await runSync(deviceDeps(deviceA, server, 'a'));
    expect(second).toEqual({ outcome: 'ok', pushed: 0, pulled: 0 });
    expect(await getMeta(deviceA, 'lastSyncedAt')).toBeDefined();
    expect(await getMeta(deviceA, 'deviceId')).toBeDefined();
  });

  it('signed out, the run ends quietly and touches nothing', async () => {
    const deps = { ...deviceDeps(deviceA, server, 'a'), accessToken: async () => null };
    await expect(runSync(deps)).resolves.toEqual({ outcome: 'signed_out' });
  });
});
