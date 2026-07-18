// @vitest-environment jsdom

// The reconciler against a faithful in-memory server (backend spec §4 wire):
// server-wins convergence across two real Dexie databases (main plan §12.9).
// The server's accepted copy is the truth on every device; a local edit is
// pending until the server accepts it, and never outlives a newer server copy.
import 'fake-indexeddb/auto';
import type { SyncServerRecord } from '@plainsight/api-contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCompany, getMeta, putThesisDraft, setMeta } from '../db';
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

describe('two devices converge on the server\'s copy', () => {
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

  it('offline edits on both sides settle on the copy the server accepted first', async () => {
    const company = await createCompany(deviceA, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    await runSync(deviceDeps(deviceA, server, 'a'));
    await runSync(deviceDeps(deviceB, server, 'b'));

    // Both edit the same thesis while apart; A reaches the server first.
    await putThesisDraft(deviceA, company.id, { business: 'Version from A', moat: '', valuation: '', kills: '' });
    await putThesisDraft(deviceB, company.id, { business: 'Version from B', moat: '', valuation: '', kills: '' });
    await runSync(deviceDeps(deviceA, server, 'a'));

    // B pulls A's copy and it beats B's dirty edit: the pending version
    // from B is discarded, not pushed above the server's truth.
    const bRun = await runSync(deviceDeps(deviceB, server, 'b'));
    expect(bRun).toMatchObject({ outcome: 'ok', pushed: 0, pulled: 1 });
    await runSync(deviceDeps(deviceA, server, 'a'));

    const onA = await deviceA.theses.get(company.id);
    const onB = await deviceB.theses.get(company.id);
    expect(onA?.sections.business).toBe('Version from A');
    expect(onA?.sections).toEqual(onB?.sections);
    const onServer = server.records.get(`thesis#${company.id}`)?.payload as {
      sections: { business: string };
    };
    expect(onServer.sections.business).toBe('Version from A');
  });

  it('a pulled tombstone beats a dirty local edit', async () => {
    const company = await createCompany(deviceA, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    await runSync(deviceDeps(deviceA, server, 'a'));
    await runSync(deviceDeps(deviceB, server, 'b'));

    // B edits while A deletes; A's deletion reaches the server first.
    const onB = await deviceB.companies.get(company.id);
    await deviceB.companies.put({
      ...onB!,
      name: 'Edited on B',
      updatedAt: '2026-07-18T11:00:00.000Z'
    });
    await deviceA.companies.delete(company.id);
    await runSync(deviceDeps(deviceA, server, 'a'));

    const bRun = await runSync(deviceDeps(deviceB, server, 'b'));
    expect(bRun).toMatchObject({ outcome: 'ok', pushed: 0 });
    expect(await deviceB.companies.get(company.id)).toBeUndefined();
    expect(server.records.get(`company#${company.id}`)?.deleted).toBe(true);
  });

  it('a replayed record does not beat the pending edit built on it', async () => {
    const company = await createCompany(deviceA, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    await runSync(deviceDeps(deviceA, server, 'a'));
    await runSync(deviceDeps(deviceB, server, 'b'));

    // B edits, then its next pull replays the very record the edit was
    // built on (a rewound checkpoint, as a full resync would). The server
    // has not moved past B's base, so the pending edit stands and pushes.
    const onB = await deviceB.companies.get(company.id);
    await deviceB.companies.put({
      ...onB!,
      name: 'Edited on B',
      updatedAt: '2026-07-18T11:00:00.000Z'
    });
    await setMeta(deviceB, 'syncCheckpoint', 0);

    const bRun = await runSync(deviceDeps(deviceB, server, 'b'));
    expect(bRun).toMatchObject({ outcome: 'ok', pushed: 1 });
    expect((await deviceB.companies.get(company.id))?.name).toBe('Edited on B');
    const onServer = server.records.get(`company#${company.id}`)?.payload as { name: string };
    expect(onServer.name).toBe('Edited on B');
  });

  it('an equal-Lamport copy another device won at the server applies on pull', async () => {
    const company = await createCompany(deviceA, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    await runSync(deviceDeps(deviceA, server, 'a'));

    // The mid-air crossing: another device pushes the same record at the
    // same Lamport value before ever seeing A's copy. The server's
    // lexicographic deviceId tiebreak accepts it as the newer write.
    await server.fetchImpl('/v1/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        records: [
          {
            recordType: 'company',
            recordId: company.id,
            payload: { ...company, name: 'Crossed from B', updatedAt: '2026-07-18T11:00:00.000Z' },
            schemaVersion: 1,
            lamport: 1,
            deviceId: 'b-crossing',
            deleted: false
          }
        ]
      })
    });

    const run = await runSync(deviceDeps(deviceA, server, 'a'));
    expect(run).toMatchObject({ outcome: 'ok', pushed: 0, pulled: 1 });
    expect((await deviceA.companies.get(company.id))?.name).toBe('Crossed from B');
  });

  it('the tiebreak loser never re-beats: replays of both copies stay settled', async () => {
    const company = await createCompany(deviceA, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    await runSync(deviceDeps(deviceA, server, 'a'));
    await server.fetchImpl('/v1/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        records: [
          {
            recordType: 'company',
            recordId: company.id,
            payload: { ...company, name: 'Crossed from B', updatedAt: '2026-07-18T11:00:00.000Z' },
            schemaVersion: 1,
            lamport: 1,
            deviceId: 'b-crossing',
            deleted: false
          }
        ]
      })
    });
    await runSync(deviceDeps(deviceA, server, 'a'));

    // A full resync replays both the loser's own old copy and the winner;
    // neither exceeds the shadow's pair, so nothing moves.
    await setMeta(deviceA, 'syncCheckpoint', 0);
    const replay = await runSync(deviceDeps(deviceA, server, 'a'));
    expect(replay).toMatchObject({ outcome: 'ok', pushed: 0, pulled: 0 });
    expect((await deviceA.companies.get(company.id))?.name).toBe('Crossed from B');
  });

  it('an old shadow without a device recorded keeps replays off a pending edit', async () => {
    const company = await createCompany(deviceA, {
      name: 'Apple Inc.',
      currency: 'USD',
      sector: 'Technology'
    });
    await runSync(deviceDeps(deviceA, server, 'a'));

    // A shadow from before the tiebreak landed: no device recorded.
    const recordKey = `company#${company.id}`;
    const shadow = await deviceA.syncState.get(recordKey);
    await deviceA.syncState.put({
      recordKey,
      lastLamport: shadow!.lastLamport,
      fingerprint: shadow!.fingerprint
    });

    // An offline edit sits on that base when a full resync replays it.
    const row = await deviceA.companies.get(company.id);
    await deviceA.companies.put({
      ...row!,
      name: 'Edited offline',
      updatedAt: '2026-07-18T12:00:00.000Z'
    });
    await setMeta(deviceA, 'syncCheckpoint', 0);

    const run = await runSync(deviceDeps(deviceA, server, 'a'));
    expect(run).toMatchObject({ outcome: 'ok', pushed: 1, pulled: 0 });
    expect((await deviceA.companies.get(company.id))?.name).toBe('Edited offline');
    const onServer = server.records.get(recordKey)?.payload as { name: string };
    expect(onServer.name).toBe('Edited offline');
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
