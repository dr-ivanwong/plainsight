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
import { company, incomeStatement, thesisVersion } from '../test/builders';

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

const name = `plainsight-migration-${crypto.randomUUID()}`;

afterEach(async () => {
  await new PlainsightDb(name).delete();
});

describe('the version-2 upgrade, from a version-1 fixture', () => {
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
    expect(upgraded.verno).toBe(2);
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
