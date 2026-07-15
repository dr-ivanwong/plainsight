import { describe, expect, it } from 'vitest';

import {
  companyRecordSchema,
  priceRecordSchema,
  statementRecordSchema
} from '../../db/records';
import { SAMPLE_COMPANIES, SAMPLE_PRICES, SAMPLE_STATEMENTS } from './sampleData';

const NOW = '2026-07-11T09:30:00Z';

describe('the generated sample data', () => {
  it('carries the pinned sample set, flagged sample throughout', () => {
    expect(SAMPLE_COMPANIES.map((company) => company.id)).toEqual([
      'sample-apple',
      'sample-coca-cola',
      'sample-costco',
      'sample-csl'
    ]);
    expect(SAMPLE_COMPANIES.every((company) => company.sample)).toBe(true);
    expect(SAMPLE_COMPANIES.map((company) => company.name)).toEqual([
      'Apple',
      'Coca-Cola',
      'Costco',
      'CSL'
    ]);
    expect(SAMPLE_COMPANIES.at(-1)).toMatchObject({ exchange: 'ASX', currency: 'USD' });
  });

  it('holds ten years of three statements per company, plus a price each', () => {
    expect(SAMPLE_STATEMENTS).toHaveLength(120);
    expect(SAMPLE_PRICES).toHaveLength(4);
  });

  it('passes every record through the storage schemas once stamped', () => {
    for (const company of SAMPLE_COMPANIES) {
      companyRecordSchema.parse({ ...company, createdAt: NOW, updatedAt: NOW, dataVersion: 0 });
    }
    for (const row of SAMPLE_STATEMENTS) {
      statementRecordSchema.parse({ ...row, updatedAt: NOW });
    }
    for (const price of SAMPLE_PRICES) {
      priceRecordSchema.parse({ ...price, updatedAt: NOW });
    }
  });

  it('carries sample provenance with the filing reference attached', () => {
    for (const row of SAMPLE_STATEMENTS) {
      expect(row.provenance.source).toBe('sample');
      if (row.companyId === 'sample-csl') {
        expect(row.provenance.filing?.system).toBe('ASX_MAP');
        expect(row.provenance.filing?.documentId).toMatch(/^ar\d{4}$/);
      } else {
        expect(row.provenance.filing?.system).toBe('EDGAR');
        expect(row.provenance.filing?.documentId).toMatch(/^\d{10}-\d{2}-\d{6}$/);
      }
    }
  });
});
