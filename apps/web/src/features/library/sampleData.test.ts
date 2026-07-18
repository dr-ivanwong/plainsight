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
    // CSL alone since the ASX-first steer (data-model spec §12, the
    // sample-corpus decision as amended 2026-07-18): the ASX golden fixture
    // with ten-year depth.
    expect(SAMPLE_COMPANIES.map((company) => company.id)).toEqual(['sample-csl']);
    expect(SAMPLE_COMPANIES.every((company) => company.sample)).toBe(true);
    expect(SAMPLE_COMPANIES.map((company) => company.name)).toEqual(['CSL']);
    expect(SAMPLE_COMPANIES[0]).toMatchObject({ exchange: 'ASX', currency: 'USD' });
  });

  it('holds ten years of three statements, plus a price', () => {
    expect(SAMPLE_STATEMENTS).toHaveLength(30);
    expect(SAMPLE_PRICES).toHaveLength(1);
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
      expect(row.provenance.filing?.system).toBe('ASX_MAP');
      expect(row.provenance.filing?.documentId).toMatch(/^ar\d{4}$/);
    }
  });
});
