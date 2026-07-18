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
    // The ASX golden five since the ASX-first steer (data-model spec §12,
    // the sample-corpus decision as amended twice on 2026-07-18).
    expect(SAMPLE_COMPANIES.map((company) => company.id)).toEqual([
      'sample-csl',
      'sample-wesfarmers',
      'sample-woolworths',
      'sample-jb-hi-fi',
      'sample-cochlear'
    ]);
    expect(SAMPLE_COMPANIES.every((company) => company.sample)).toBe(true);
    expect(SAMPLE_COMPANIES.map((company) => company.name)).toEqual([
      'CSL',
      'Wesfarmers',
      'Woolworths',
      'JB Hi-Fi',
      'Cochlear'
    ]);
    expect(SAMPLE_COMPANIES.every((company) => company.exchange === 'ASX')).toBe(true);
    // The ASX-listed-USD-reporter nuance rides along: CSL presents in USD.
    expect(SAMPLE_COMPANIES[0]).toMatchObject({ currency: 'USD' });
    expect(SAMPLE_COMPANIES.slice(1).every((company) => company.currency === 'AUD')).toBe(true);
  });

  it('holds ten CSL years and six for each six-year fixture, plus a price each', () => {
    expect(SAMPLE_STATEMENTS).toHaveLength(102);
    expect(
      SAMPLE_STATEMENTS.filter((row) => row.companyId === 'sample-csl')
    ).toHaveLength(30);
    expect(SAMPLE_PRICES).toHaveLength(5);
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
      // Annual reports for most; JB Hi-Fi publishes its results as a
      // financial report, so its document keys carry the fr prefix.
      expect(row.provenance.filing?.documentId).toMatch(/^(ar|fr)\d{4}$/);
    }
  });
});
