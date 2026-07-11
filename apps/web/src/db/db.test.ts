import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { company, dismissal, incomeStatement, thesisVersion, T0 } from '../test/builders';
import { PlainsightDb, TABLE_NAMES } from './db';

let db: PlainsightDb;

beforeEach(() => {
  db = new PlainsightDb(`plainsight-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

describe('the version 1 schema', () => {
  it('creates exactly the nine pinned tables', () => {
    expect(db.tables.map((table) => table.name).sort()).toEqual([...TABLE_NAMES].sort());
  });

  it('keys each table as the spec pins it', () => {
    expect(db.companies.schema.primKey.keyPath).toBe('id');
    expect(db.statements.schema.primKey.keyPath).toEqual(['companyId', 'fy', 'statement']);
    expect(db.prices.schema.primKey.keyPath).toBe('companyId');
    expect(db.theses.schema.primKey.keyPath).toBe('companyId');
    expect(db.thesisVersions.schema.primKey.auto).toBe(true);
    expect(db.flagDismissals.schema.primKey.keyPath).toEqual(['companyId', 'ruleId']);
    expect(db.providerCredentials.schema.primKey.keyPath).toBe('providerId');
    expect(db.quarantine.schema.primKey.auto).toBe(true);
    expect(db.meta.schema.primKey.keyPath).toBe('key');
  });
});

describe('round trips', () => {
  it('stores and retrieves a company by id', async () => {
    const record = company();
    await db.companies.put(record);
    expect(await db.companies.get('apple')).toEqual(record);
  });

  it('addresses statements by company, year and statement, and upserts on the same key', async () => {
    await db.statements.put(incomeStatement());
    await db.statements.put(incomeStatement({ statement: 'balance', values: {} }));
    await db.statements.put(incomeStatement({ fy: 'FY2023', endDate: '2023-09-30' }));

    const row = await db.statements.get(['apple', 'FY2024', 'income']);
    expect(row?.values.revenue).toEqual({ kind: 'entered', amountMinor: 391_035_000 });

    await db.statements.put(
      incomeStatement({ values: { revenue: { kind: 'entered', amountMinor: 1 } } })
    );
    expect(await db.statements.count()).toBe(3);
  });

  it('indexes statements by company for whole-company reads', async () => {
    await db.statements.bulkPut([
      incomeStatement(),
      incomeStatement({ fy: 'FY2023', endDate: '2023-09-30' }),
      incomeStatement({ companyId: 'coca-cola' })
    ]);
    expect(await db.statements.where('companyId').equals('apple').count()).toBe(2);
  });

  it('auto-increments thesis version ids', async () => {
    const first = await db.thesisVersions.add(thesisVersion());
    const second = await db.thesisVersions.add(thesisVersion());
    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it('keys flag dismissals by company and rule', async () => {
    await db.flagDismissals.put(dismissal());
    const row = await db.flagDismissals.get(['apple', 'fragility']);
    expect(row?.dismissedAtFy).toBe('FY2024');
  });

  it('stores meta settings under their literal keys', async () => {
    await db.meta.put({ key: 'theme', value: 'dark' });
    await db.meta.put({ key: 'onboardingDone', value: true });
    expect(await db.meta.get('theme')).toEqual({ key: 'theme', value: 'dark' });
  });

  it('sorts companies by the updatedAt index', async () => {
    await db.companies.bulkPut([
      company({ id: 'newer', updatedAt: '2026-07-11T10:00:00Z' }),
      company({ id: 'older', updatedAt: T0 })
    ]);
    const ordered = await db.companies.orderBy('updatedAt').reverse().toArray();
    expect(ordered.map((row) => row.id)).toEqual(['newer', 'older']);
  });
});
