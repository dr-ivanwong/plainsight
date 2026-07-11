import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { incomeStatement, price } from '../test/builders';
import { createCompany, getCompany, listCompanies } from './companies';
import { PlainsightDb } from './db';
import { getMeta, setMeta } from './meta';
import { getPrice, putPrice } from './prices';
import type { MetaRecord } from './records';
import { listStatements, upsertStatement } from './statements';

const T1 = '2026-07-11T10:00:00Z';
const T2 = '2026-07-11T10:01:00Z';
const T3 = '2026-07-11T10:02:00Z';

/** Turns a stored-record builder result into the write shape (updatedAt is the repository's job). */
const writeOf = <T extends { updatedAt: string }>(record: T): Omit<T, 'updatedAt'> => {
  const { updatedAt: _discarded, ...rest } = record;
  return rest;
};

let db: PlainsightDb;

beforeEach(() => {
  db = new PlainsightDb(`plainsight-test-${crypto.randomUUID()}`);
  // Only Date is faked: fake-indexeddb schedules its request callbacks on real
  // timers, so freezing those would deadlock every await on the database.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(T1) });
});

afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
});

describe('createCompany', () => {
  it('stores a validated record with fresh identity and version fields', async () => {
    const created = await createCompany(db, { name: 'Wesfarmers', ticker: 'WES', currency: 'AUD' });
    expect(created).toMatchObject({
      name: 'Wesfarmers',
      ticker: 'WES',
      currency: 'AUD',
      sample: false,
      dataVersion: 0,
      createdAt: '2026-07-11T10:00:00.000Z'
    });
    expect(created.id).not.toHaveLength(0);
    expect(await db.companies.get(created.id)).toEqual(created);
  });

  it('rejects an empty name or a malformed currency before writing anything', async () => {
    await expect(createCompany(db, { name: '', currency: 'AUD' })).rejects.toThrow();
    await expect(createCompany(db, { name: 'Wesfarmers', currency: 'dollars' })).rejects.toThrow();
    expect(await db.companies.count()).toBe(0);
  });

  it('cannot be handed identity or flag fields by a caller', async () => {
    const smuggled = { name: 'Wesfarmers', currency: 'AUD', sample: true, dataVersion: 9 };
    const created = await createCompany(db, smuggled);
    expect(created.sample).toBe(false);
    expect(created.dataVersion).toBe(0);
  });
});

describe('reads', () => {
  it('getCompany returns null for an unknown id', async () => {
    expect(await getCompany(db, 'ghost')).toBeNull();
  });

  it('listCompanies orders by most recently updated', async () => {
    const first = await createCompany(db, { name: 'Wesfarmers', currency: 'AUD' });
    vi.setSystemTime(new Date(T2));
    await createCompany(db, { name: 'Woolworths', currency: 'AUD' });

    vi.setSystemTime(new Date(T3));
    await upsertStatement(db, writeOf(incomeStatement({ companyId: first.id })));

    const names = (await listCompanies(db)).map((row) => row.name);
    expect(names).toEqual(['Wesfarmers', 'Woolworths']);
  });
});

describe('upsertStatement', () => {
  it('writes the row and bumps the company dataVersion in the same transaction', async () => {
    const created = await createCompany(db, { name: 'Apple Inc.', currency: 'USD' });

    vi.setSystemTime(new Date(T2));
    const write = writeOf(incomeStatement({ companyId: created.id }));
    await upsertStatement(db, write);

    const after = await getCompany(db, created.id);
    expect(after?.dataVersion).toBe(1);
    expect(after?.updatedAt).toBe('2026-07-11T10:01:00.000Z');
    expect(await listStatements(db, created.id)).toHaveLength(1);

    await upsertStatement(db, write);
    expect((await getCompany(db, created.id))?.dataVersion).toBe(2);
    expect(await listStatements(db, created.id)).toHaveLength(1);
  });

  it('refuses a row for an unknown company and leaves nothing behind', async () => {
    const write = writeOf(incomeStatement({ companyId: 'ghost' }));
    await expect(upsertStatement(db, write)).rejects.toThrow('no company');
    expect(await db.statements.count()).toBe(0);
  });

  it('rejects an invalid row before touching the company', async () => {
    const created = await createCompany(db, { name: 'Apple Inc.', currency: 'USD' });
    const write = writeOf(
      incomeStatement({
        companyId: created.id,
        values: { capex: { kind: 'entered', amountMinor: 1 } }
      })
    );
    await expect(upsertStatement(db, write)).rejects.toThrow();
    expect((await getCompany(db, created.id))?.dataVersion).toBe(0);
    expect(await db.statements.count()).toBe(0);
  });

  it('lists only the requested company', async () => {
    const a = await createCompany(db, { name: 'Apple Inc.', currency: 'USD' });
    const b = await createCompany(db, { name: 'Costco', currency: 'USD' });
    await upsertStatement(db, writeOf(incomeStatement({ companyId: a.id })));
    await upsertStatement(db, writeOf(incomeStatement({ companyId: b.id })));
    expect(await listStatements(db, a.id)).toHaveLength(1);
  });
});

describe('putPrice', () => {
  it('stores one price per company and bumps the dataVersion', async () => {
    const created = await createCompany(db, { name: 'Apple Inc.', currency: 'USD' });
    const write = writeOf(price({ companyId: created.id }));

    await putPrice(db, write);
    expect((await getCompany(db, created.id))?.dataVersion).toBe(1);
    expect(await getPrice(db, created.id)).toMatchObject({ amountMinor: 21_150 });

    await putPrice(db, { ...write, amountMinor: 22_000 });
    expect(await db.prices.count()).toBe(1);
    expect((await getPrice(db, created.id))?.amountMinor).toBe(22_000);
  });

  it('rejects a price in a different currency and rolls the bump back', async () => {
    const created = await createCompany(db, { name: 'CSL', currency: 'AUD' });
    const write = writeOf(price({ companyId: created.id, currency: 'USD' }));

    await expect(putPrice(db, write)).rejects.toThrow('reporting currency');
    expect(await db.prices.count()).toBe(0);
    expect((await getCompany(db, created.id))?.dataVersion).toBe(0);
  });

  it('returns null when no price is stored', async () => {
    expect(await getPrice(db, 'ghost')).toBeNull();
  });
});

describe('dismissals', () => {
  it('round-trips a dismissal keyed by company and rule', async () => {
    const { listDismissals, putDismissal, removeDismissal } = await import('./dismissals');
    await putDismissal(db, { companyId: 'apple', ruleId: 'fragility', dismissedAtFy: 'FY2024' });
    const rows = await listDismissals(db, 'apple');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ruleId: 'fragility', dismissedAtFy: 'FY2024' });

    await removeDismissal(db, 'apple', 'fragility');
    expect(await listDismissals(db, 'apple')).toHaveLength(0);
  });

  it('refuses a dismissal for a rule id that is not pinned', async () => {
    const { putDismissal } = await import('./dismissals');
    await expect(
      putDismissal(db, {
        companyId: 'apple',
        ruleId: 'notARule' as never,
        dismissedAtFy: 'FY2024'
      })
    ).rejects.toThrow();
  });
});

describe('meta', () => {
  it('round-trips each setting with its own value type', async () => {
    await setMeta(db, 'theme', 'dark');
    await setMeta(db, 'onboardingDone', true);
    expect(await getMeta(db, 'theme')).toBe('dark');
    expect(await getMeta(db, 'onboardingDone')).toBe(true);
    expect(await getMeta(db, 'schemaVersion')).toBeUndefined();
  });

  it('rejects an illegal value at the write boundary', async () => {
    await expect(setMeta(db, 'theme', 'blue' as never)).rejects.toThrow();
  });

  it('quarantines a corrupt row and reads it as unset', async () => {
    await db.meta.put({ key: 'theme', value: 'blue' } as unknown as MetaRecord);
    expect(await getMeta(db, 'theme')).toBeUndefined();
    expect(await db.quarantine.count()).toBe(1);
  });
});
