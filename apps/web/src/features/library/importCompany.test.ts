/**
 * The import writer: a served financials response lands as a company plus
 * statement rows with their EDGAR provenance intact, readable back through
 * the validated repositories, and re-imports resolve to the existing company.
 */
import 'fake-indexeddb/auto';
import type { FinancialsResponse } from '@plainsight/api-contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCompany, listStatements, PlainsightDb } from '../../db';
import { existingImportTarget, importFinancials } from './importCompany';

const RESPONSE: FinancialsResponse = {
  ticker: 'AAPL',
  statements: [
    {
      fy: 'FY2024',
      statement: 'income',
      endDate: '2024-09-28',
      currency: 'USD',
      values: { revenue: 39_103_500_000_000, netIncome: 9_373_600_000_000 },
      provenance: {
        source: 'edgar',
        recordedAt: '2026-07-12T00:00:00Z',
        filing: { system: 'EDGAR', documentId: '0000320193-24-000123' },
        mappingVersion: 'edgar-us-gaap-1'
      }
    },
    {
      fy: 'FY2024',
      statement: 'balance',
      endDate: '2024-09-28',
      currency: 'USD',
      values: { totalAssets: 36_498_000_000_000, totalEquity: 5_695_000_000_000 },
      provenance: {
        source: 'edgar',
        recordedAt: '2026-07-12T00:00:00Z',
        filing: { system: 'EDGAR', documentId: '0000320193-24-000123' },
        mappingVersion: 'edgar-us-gaap-1'
      }
    }
  ],
  gaps: []
};

let db: PlainsightDb;
let counter = 0;

beforeEach(() => {
  counter += 1;
  db = new PlainsightDb(`import-test-${counter}`);
});

describe('importFinancials', () => {
  it('creates the company and its rows in one pass, provenance carried', async () => {
    const company = await importFinancials(
      { ticker: 'AAPL', name: 'Apple Inc.', exchange: 'Nasdaq' },
      RESPONSE,
      db
    );
    expect(company).toMatchObject({
      name: 'Apple Inc.',
      ticker: 'AAPL',
      exchange: 'Nasdaq',
      currency: 'USD',
      sample: false,
      dataVersion: 1
    });
    const rows = await listStatements(db, company.id);
    expect(rows).toHaveLength(2);
    const income = rows.find((row) => row.statement === 'income');
    expect(income?.values.revenue).toEqual({ kind: 'entered', amountMinor: 39_103_500_000_000 });
    expect(income?.provenance).toMatchObject({
      source: 'edgar',
      filing: { system: 'EDGAR', documentId: '0000320193-24-000123' },
      mappingVersion: 'edgar-us-gaap-1'
    });
    expect(income?.entryScale).toBe('millions');
  });
});

describe('existingImportTarget', () => {
  it('finds a real company by ticker and ignores samples', async () => {
    expect(await existingImportTarget(db, 'AAPL')).toBeNull();
    const created = await createCompany(db, { name: 'Apple Inc.', ticker: 'AAPL', currency: 'USD' });
    const found = await existingImportTarget(db, 'AAPL');
    expect(found?.id).toBe(created.id);

    await db.companies.add({
      id: 'sample-ko',
      name: 'Coca-Cola',
      ticker: 'KO',
      currency: 'USD',
      sample: true,
      createdAt: '2026-07-12T00:00:00Z',
      updatedAt: '2026-07-12T00:00:00Z',
      dataVersion: 0
    });
    expect(await existingImportTarget(db, 'KO')).toBeNull();
  });
});
