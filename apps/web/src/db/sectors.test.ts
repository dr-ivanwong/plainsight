// The pinned sector vocabulary (data-model spec §12): ids, labels, and the
// normalisation that keeps a cosmetic label from ever quarantining a company
// row at the record boundary.
import { describe, expect, it } from 'vitest';

import { companyRecordSchema } from './records';
import { isSectorId, normaliseSector, SECTOR_IDS, SECTOR_LABELS } from './sectors';
import { company } from '../test/builders';

describe('the sector vocabulary', () => {
  it('pins the ids in section order: the original four, then the additions in adoption order', () => {
    expect(SECTOR_IDS).toEqual([
      'healthcare',
      'technology',
      'banks',
      'retail',
      'resources',
      'property',
      'industrials',
      'insurance'
    ]);
  });

  it('carries one label per id', () => {
    for (const id of SECTOR_IDS) {
      expect(SECTOR_LABELS[id]).toBeTruthy();
      expect(isSectorId(id)).toBe(true);
    }
    expect(isSectorId('Healthcare')).toBe(false);
  });

  it('keeps ids as they are', () => {
    for (const id of SECTOR_IDS) {
      expect(normaliseSector(id)).toBe(id);
    }
  });

  it('maps labels and the retired sample strings, case-blind and trimmed', () => {
    expect(normaliseSector('Healthcare')).toBe('healthcare');
    expect(normaliseSector('Medical devices')).toBe('healthcare');
    expect(normaliseSector('Conglomerate')).toBe('retail');
    expect(normaliseSector('Consumer staples')).toBe('retail');
    expect(normaliseSector('Retail')).toBe('retail');
    expect(normaliseSector('  BANKS  ')).toBe('banks');
  });

  it('clears anything unrecognised to absent', () => {
    expect(normaliseSector('Founder vibes')).toBeUndefined();
    expect(normaliseSector('')).toBeUndefined();
    expect(normaliseSector('   ')).toBeUndefined();
  });

  it('normalises at the record boundary instead of quarantining', () => {
    const mapped = companyRecordSchema.parse({ ...company(), sector: 'Consumer staples' });
    expect(mapped.sector).toBe('retail');

    const cleared = companyRecordSchema.parse({ ...company(), sector: 'Founder vibes' });
    expect(cleared.sector).toBeUndefined();

    const absent = companyRecordSchema.parse(company());
    expect(absent.sector).toBeUndefined();
  });
});
