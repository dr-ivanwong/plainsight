import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  company,
  credential,
  dismissal,
  incomeStatement,
  price,
  thesis,
  thesisVersion,
  T0
} from '../test/builders';
import { PlainsightDb } from './db';
import { applyImport, buildExport, dryRunCounts, parseExportFile, type ExportFile } from './exportFile';
import { getMeta, setMeta } from './meta';

let db: PlainsightDb;

beforeEach(() => {
  db = new PlainsightDb(`plainsight-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

async function populateEverything(): Promise<void> {
  await db.companies.put(company());
  await db.statements.put(incomeStatement());
  await db.prices.put(price());
  await db.theses.put(thesis());
  await db.thesisVersions.add(thesisVersion());
  await db.flagDismissals.put(dismissal());
  await db.providerCredentials.put(credential({ key: 'sk-live-SENTINEL-KEY' }));
  await db.quarantine.add({
    table: 'companies',
    raw: { secret: 'quarantined-raw-payload' },
    reason: 'broken',
    quarantinedAt: T0
  });
  await setMeta(db, 'theme', 'dark');
}

describe('buildExport', () => {
  it('enumerates exactly the allowlist and never key material', async () => {
    await populateEverything();
    const file = await buildExport(db, '0.0.0');

    expect(Object.keys(file.data).sort()).toEqual([
      'companies',
      'flagDismissals',
      'prices',
      'settings',
      'statements',
      'theses',
      'thesisVersions'
    ]);
    const text = JSON.stringify(file);
    expect(text).not.toContain('SENTINEL');
    expect(text).not.toContain('quarantined-raw-payload');
    expect(file.data.settings.theme).toBe('dark');
    expect(file.data.companies[0]?.sample).toBe(false);
  });
});

describe('replace', () => {
  it('round-trips a full library', async () => {
    await populateEverything();
    const file = await buildExport(db, '0.0.0');
    expect(dryRunCounts(file)).toMatchObject({ companies: 1, fiscalYears: 1, theses: 1 });

    await Promise.all([
      db.companies.clear(),
      db.statements.clear(),
      db.prices.clear(),
      db.theses.clear(),
      db.thesisVersions.clear(),
      db.flagDismissals.clear()
    ]);

    const parsed = parseExportFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await applyImport(db, parsed.file, 'replace');

    expect(await db.companies.toArray()).toEqual([company()]);
    expect(await db.statements.toArray()).toEqual([incomeStatement()]);
    expect(await db.prices.toArray()).toEqual([price()]);
    expect(await db.theses.toArray()).toEqual([thesis()]);
    expect(await db.thesisVersions.count()).toBe(1);
    expect(await db.flagDismissals.toArray()).toEqual([dismissal()]);
  });
});

const emptyData = {
  companies: [],
  statements: [],
  prices: [],
  theses: [],
  thesisVersions: [],
  flagDismissals: [],
  settings: {}
};

const fileWith = (data: Partial<ExportFile['data']>): ExportFile => ({
  format: 'plainsight-export',
  formatVersion: 1,
  exportedAt: T0,
  appVersion: '0.0.0',
  data: { ...emptyData, ...data }
});

describe('merge', () => {
  it('keeps the newer record on both sides', async () => {
    await db.companies.put(company({ name: 'Newer here', updatedAt: '2026-07-11T12:00:00Z' }));
    await db.statements.put(incomeStatement({ updatedAt: '2026-07-01T00:00:00Z' }));

    const file = fileWith({
      companies: [
        company({ name: 'Older there', updatedAt: '2026-07-01T00:00:00Z' }),
        company({ id: 'incoming', name: 'Brand new' })
      ],
      statements: [
        incomeStatement({
          updatedAt: '2026-07-11T12:00:00Z',
          values: { revenue: { kind: 'entered', amountMinor: 1 } }
        })
      ]
    });
    await applyImport(db, file, 'merge');

    expect((await db.companies.get('apple'))?.name).toBe('Newer here');
    expect((await db.companies.get('incoming'))?.name).toBe('Brand new');
    expect((await db.statements.get(['apple', 'FY2024', 'income']))?.values.revenue).toEqual({
      kind: 'entered',
      amountMinor: 1
    });
  });

  it('adds unseen thesis versions by company and moment, never duplicating', async () => {
    await db.thesisVersions.add(thesisVersion({ savedAt: T0 }));
    const file = fileWith({
      thesisVersions: [
        { ...thesisVersion({ savedAt: T0 }), id: 7 },
        { ...thesisVersion({ savedAt: '2026-07-12T00:00:00Z' }), id: 9 }
      ]
    });
    await applyImport(db, file, 'merge');
    expect(await db.thesisVersions.count()).toBe(2);
  });

  it('fills settings only where unset; replace overwrites them', async () => {
    await setMeta(db, 'theme', 'light');
    const file = fileWith({
      settings: { theme: 'dark', educationLayerOff: true }
    } as Partial<ExportFile['data']>);

    await applyImport(db, file, 'merge');
    expect(await getMeta(db, 'theme')).toBe('light');
    expect(await getMeta(db, 'educationLayerOff')).toBe(true);

    await applyImport(db, file, 'replace');
    expect(await getMeta(db, 'theme')).toBe('dark');
  });
});

describe('parseExportFile', () => {
  it('recognises rubbish and foreign files as not Plainsight', () => {
    expect(parseExportFile('not json')).toEqual({ ok: false, reason: 'not-plainsight' });
    expect(parseExportFile('{"format":"other","formatVersion":1}')).toEqual({
      ok: false,
      reason: 'not-plainsight'
    });
  });

  it('gates a newer major before validating records', () => {
    const text = JSON.stringify({ format: 'plainsight-export', formatVersion: 2 });
    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'newer-version' });
  });

  it('refuses a file carrying invalid records', () => {
    const broken = fileWith({ companies: [{ ...company(), currency: 'dollars' }] });
    expect(parseExportFile(JSON.stringify(broken))).toEqual({
      ok: false,
      reason: 'invalid-records'
    });
  });
});
