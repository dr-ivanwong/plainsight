// The previous-version upgrade fixture (data-model spec §9: every migration
// lands with a test that imports a fixture of the prior schema version). A
// database is written through the version-1 schema exactly as it shipped,
// then opened by the current PlainsightDb, which runs the real upgrade; the
// assertions are what an upgrade owes the owner: nothing lost, everything
// still readable through the validated repositories, key-generator state
// intact, and the new table present and writable. Future migrations copy
// this file's shape; a data-rewriting one asserts the rewrite too.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import { listCompanies } from './companies';
import { PlainsightDb, TABLE_NAMES } from './db';
import { getMeta } from './meta';
import { listStatements } from './statements';
import { collectPendingWrites } from '../sync/pending';
import { company, incomeStatement, thesisVersion, T0 } from '../test/builders';

/**
 * The version-1 schema, verbatim as it shipped (db.ts's version(1) block):
 * nine tables, no syncState. The fixture writer, never edited to match new
 * code; if version 1 ever needs changing here, something is wrong.
 */
class V1Db extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      companies: 'id, updatedAt',
      statements: '[companyId+fy+statement], companyId',
      prices: 'companyId',
      theses: 'companyId',
      thesisVersions: '++id, companyId',
      flagDismissals: '[companyId+ruleId], companyId',
      providerCredentials: 'providerId',
      quarantine: '++id, table',
      meta: 'key'
    });
  }
}

/**
 * The version-2 schema, verbatim as it shipped: version 1's nine tables plus
 * the syncState shadow. The version-3 fixture writer, held to the same rule
 * as V1Db: never edited to match new code.
 */
class V2Db extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      companies: 'id, updatedAt',
      statements: '[companyId+fy+statement], companyId',
      prices: 'companyId',
      theses: 'companyId',
      thesisVersions: '++id, companyId',
      flagDismissals: '[companyId+ruleId], companyId',
      providerCredentials: 'providerId',
      quarantine: '++id, table',
      meta: 'key'
    });
    this.version(2).stores({
      syncState: 'recordKey'
    });
  }
}

/**
 * The version-3 schema as it shipped: version 2's tables, no new stores. The
 * shipped version 3 only rewrote sector rows, and a fresh fixture never runs
 * upgrade callbacks, so an empty one holds the version number honestly.
 */
class V3Db extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      companies: 'id, updatedAt',
      statements: '[companyId+fy+statement], companyId',
      prices: 'companyId',
      theses: 'companyId',
      thesisVersions: '++id, companyId',
      flagDismissals: '[companyId+ruleId], companyId',
      providerCredentials: 'providerId',
      quarantine: '++id, table',
      meta: 'key'
    });
    this.version(2).stores({
      syncState: 'recordKey'
    });
    this.version(3).upgrade(async () => {});
  }
}

const name = `plainsight-migration-${crypto.randomUUID()}`;

afterEach(async () => {
  await new PlainsightDb(name).delete();
});

describe('the upgrade chain, from a version-1 fixture', () => {
  it('carries every record across, adds syncState, and keeps the key generators', async () => {
    // Write the fixture through the schema that actually shipped.
    const v1 = new V1Db(name);
    const seeded = company({ id: 'csl', name: 'CSL' });
    const statement = incomeStatement({ companyId: 'csl' });
    await v1.table('companies').put(seeded);
    await v1.table('statements').put(statement);
    await v1.table('meta').put({ key: 'onboardingDone', value: true });
    const firstVersionId = await v1
      .table('thesisVersions')
      .add(thesisVersion({ companyId: 'csl' }));
    await v1.close();

    // The real upgrade runs on open.
    const upgraded = new PlainsightDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(4);
    expect(upgraded.tables.map((table) => table.name).sort()).toEqual([...TABLE_NAMES].sort());

    // Nothing lost, and still valid under Zod-on-read: the repositories are
    // the proof, not raw table dumps.
    expect(await listCompanies(upgraded)).toEqual([seeded]);
    expect(await listStatements(upgraded, 'csl')).toEqual([statement]);
    expect(await getMeta(upgraded, 'onboardingDone')).toBe(true);

    // The auto-increment generator survived the upgrade rather than being
    // reset by a recreated store: the next id continues the sequence.
    const nextVersionId = await upgraded.thesisVersions.add(thesisVersion({ companyId: 'csl' }));
    expect(nextVersionId).toBe((firstVersionId as number) + 1);

    // The additive half: syncState exists, starts empty, and takes writes.
    expect(await upgraded.syncState.count()).toBe(0);
    await upgraded.syncState.put({
      recordKey: 'company#csl',
      lastLamport: 1,
      lastDeviceId: 'device-1',
      fingerprint: 'f1'
    });
    expect(await upgraded.syncState.count()).toBe(1);
    await upgraded.close();
  });
});

describe('the version-3 upgrade, from a version-2 fixture', () => {
  it('rewrites legacy sectors to pinned ids, clears unknown ones, and queues each rewrite', async () => {
    // Write the fixture through the schema that shipped, sectors as the old
    // free text (the sample five's strings and a hand-typed stray).
    const v2 = new V2Db(name);
    await v2.table('companies').bulkPut([
      { ...company({ id: 'coh', name: 'Cochlear' }), sector: 'Medical devices' },
      { ...company({ id: 'wes', name: 'Wesfarmers' }), sector: 'Conglomerate' },
      { ...company({ id: 'odd', name: 'Odd One' }), sector: 'Founder vibes' },
      { ...company({ id: 'csl', name: 'CSL' }), sector: 'healthcare' },
      company({ id: 'bare', name: 'Bare' })
    ]);
    // The server already holds Cochlear's and CSL's pre-upgrade copies: their
    // shadows fingerprint the seeded updatedAt.
    await v2.table('syncState').bulkPut([
      { recordKey: 'company#coh', lastLamport: 4, lastDeviceId: 'd1', fingerprint: T0 },
      { recordKey: 'company#csl', lastLamport: 4, lastDeviceId: 'd1', fingerprint: T0 }
    ]);
    await v2.close();

    const upgraded = new PlainsightDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(4);

    // The stored rows themselves are rewritten, not merely normalised on
    // read: raw table dumps are the proof here, deliberately.
    const raw = new Map(
      (await upgraded.companies.toArray()).map((row) => [row.id, row] as const)
    );
    expect(raw.get('coh')?.sector).toBe('healthcare');
    expect(raw.get('wes')?.sector).toBe('retail');
    expect(raw.get('odd')?.sector).toBeUndefined();
    expect(raw.get('csl')?.sector).toBe('healthcare');
    expect(raw.get('bare')?.sector).toBeUndefined();

    // Only rewritten rows moved their change stamp; a row already carrying an
    // id, or carrying nothing, stays exactly as it was.
    expect(raw.get('coh')?.updatedAt).not.toBe(T0);
    expect(raw.get('wes')?.updatedAt).not.toBe(T0);
    expect(raw.get('odd')?.updatedAt).not.toBe(T0);
    expect(raw.get('csl')?.updatedAt).toBe(T0);
    expect(raw.get('bare')?.updatedAt).toBe(T0);

    // The rewrite queues like an ordinary edit (main plan §12.9): the
    // rewritten row now disagrees with its shadow and will push; the
    // already-clean row still agrees and will not.
    const pending = await collectPendingWrites(upgraded);
    const pendingIds = pending.upserts
      .filter((record) => record.recordType === 'company')
      .map((record) => record.recordId);
    expect(pendingIds).toContain('coh');
    expect(pendingIds).not.toContain('csl');

    // And the validated read path serves the rewritten rows untouched.
    const readable = await listCompanies(upgraded);
    expect(readable).toHaveLength(5);
    await upgraded.close();
  });
});

describe('the version-4 upgrade, from a version-3 fixture', () => {
  it('adds benchmarks seeded with the two resolved defaults, everything else intact', async () => {
    const v3 = new V3Db(name);
    const seeded = company({ id: 'wow', name: 'Woolworths' });
    await v3.table('companies').put(seeded);
    await v3.table('meta').put({ key: 'onboardingDone', value: true });
    await v3.close();

    const upgraded = new PlainsightDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(4);
    expect(upgraded.tables.map((table) => table.name).sort()).toEqual([...TABLE_NAMES].sort());

    // The defaults as resolved (finance-look gap plan §6): ROE and the
    // fragility rule's coverage floor; debt-to-equity deliberately absent.
    const rows = new Map(
      (await upgraded.benchmarks.toArray()).map((row) => [row.metricId, row.value] as const)
    );
    expect(rows.get('roe')).toBe(0.15);
    expect(rows.get('interestCoverage')).toBe(3);
    expect(rows.has('debtToEquity')).toBe(false);
    expect(rows.size).toBe(2);

    // Nothing lost, and the new table takes ordinary writes.
    expect(await listCompanies(upgraded)).toEqual([seeded]);
    await upgraded.benchmarks.put({
      metricId: 'debtToEquity',
      value: 1,
      updatedAt: new Date().toISOString()
    });
    expect(await upgraded.benchmarks.count()).toBe(3);
    await upgraded.close();
  });

  it('seeds the same defaults on a fresh database, where no upgrade runs', async () => {
    const fresh = new PlainsightDb(name);
    await fresh.open();
    const rows = new Map(
      (await fresh.benchmarks.toArray()).map((row) => [row.metricId, row.value] as const)
    );
    expect(rows.get('roe')).toBe(0.15);
    expect(rows.get('interestCoverage')).toBe(3);
    expect(rows.size).toBe(2);
    await fresh.close();
  });
});
