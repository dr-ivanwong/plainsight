import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { company, incomeStatement } from '../test/builders';
import { PlainsightDb } from './db';
import type { CompanyRecord, StatementRecord } from './records';
import { companyRecordSchema, statementRecordSchema } from './records';
import { validateRow, validateRows } from './safeRead';

let db: PlainsightDb;

beforeEach(() => {
  db = new PlainsightDb(`plainsight-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

/** Stores a shape the typed table would refuse, standing in for corruption or a hostile import. */
const putCorrupt = async (row: object) => {
  await db.companies.put(row as unknown as CompanyRecord);
};

describe('validateRows', () => {
  it('returns valid rows parsed and writes nothing to quarantine', async () => {
    const rows = [company(), company({ id: 'coca-cola', name: 'The Coca-Cola Company' })];
    await db.companies.bulkPut(rows);

    const valid = await validateRows(db, 'companies', await db.companies.toArray(), companyRecordSchema);

    expect(valid.map((row) => row.id).sort()).toEqual(['apple', 'coca-cola']);
    expect(await db.quarantine.count()).toBe(0);
  });

  it('moves a corrupt row to quarantine and out of its home table', async () => {
    await db.companies.put(company());
    await putCorrupt({ ...company({ id: 'broken' }), dataVersion: 1.5 });

    const valid = await validateRows(db, 'companies', await db.companies.toArray(), companyRecordSchema);

    expect(valid.map((row) => row.id)).toEqual(['apple']);
    expect(await db.companies.count()).toBe(1);

    const quarantined = await db.quarantine.toArray();
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatchObject({ table: 'companies', raw: { id: 'broken' } });
    expect(quarantined[0]?.reason).toContain('dataVersion');
    expect(Number.isNaN(Date.parse(quarantined[0]?.quarantinedAt ?? ''))).toBe(false);
  });

  it('is idempotent: a second read after the move sees a clean table', async () => {
    await putCorrupt({ ...company(), sample: 'yes' });
    await validateRows(db, 'companies', await db.companies.toArray(), companyRecordSchema);
    await validateRows(db, 'companies', await db.companies.toArray(), companyRecordSchema);

    expect(await db.companies.count()).toBe(0);
    expect(await db.quarantine.count()).toBe(1);
  });

  it('deletes by compound key when a statement row is corrupt', async () => {
    const corrupt = incomeStatement({
      values: { revenue: { kind: 'entered', amountMinor: 0.5 } }
    });
    await db.statements.put(corrupt as unknown as StatementRecord);

    const valid = await validateRows(
      db,
      'statements',
      await db.statements.toArray(),
      statementRecordSchema
    );

    expect(valid).toEqual([]);
    expect(await db.statements.count()).toBe(0);
    const quarantined = await db.quarantine.toArray();
    expect(quarantined[0]?.table).toBe('statements');
  });

  it('quarantines a row whose primary key has the wrong type, deleting by the stored key', async () => {
    await putCorrupt({ ...company(), id: 42 });

    await validateRows(db, 'companies', await db.companies.toArray(), companyRecordSchema);

    expect(await db.companies.count()).toBe(0);
    const quarantined = await db.quarantine.toArray();
    expect(quarantined[0]?.reason).toContain('id');
  });

  it('caps the recorded reason at three issues and counts the rest', async () => {
    await putCorrupt({
      id: 'mangled',
      name: 7,
      currency: 'usd',
      sample: 'no',
      createdAt: 'nah',
      updatedAt: 3,
      dataVersion: -1.2
    });

    await validateRows(db, 'companies', await db.companies.toArray(), companyRecordSchema);

    const quarantined = await db.quarantine.toArray();
    expect(quarantined[0]?.reason).toMatch(/; and \d+ more$/);
  });
});

describe('validateRow', () => {
  it('returns null for a missing row without touching quarantine', async () => {
    const row = await validateRow(db, 'companies', await db.companies.get('ghost'), companyRecordSchema);
    expect(row).toBeNull();
    expect(await db.quarantine.count()).toBe(0);
  });

  it('returns the parsed row when valid and null (plus a quarantine move) when corrupt', async () => {
    await db.companies.put(company());
    const valid = await validateRow(db, 'companies', await db.companies.get('apple'), companyRecordSchema);
    expect(valid?.name).toBe('Apple Inc.');

    await putCorrupt({ ...company({ id: 'broken' }), currency: 'money' });
    const corrupt = await validateRow(
      db,
      'companies',
      await db.companies.get('broken'),
      companyRecordSchema
    );
    expect(corrupt).toBeNull();
    expect(await db.quarantine.count()).toBe(1);
    expect(await db.companies.get('broken')).toBeUndefined();
  });
});
