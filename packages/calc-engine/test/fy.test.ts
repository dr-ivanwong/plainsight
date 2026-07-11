import { describe, expect, it } from 'vitest';
import { compareFyLabels, fyLabelFromEndDate, fyLabelOf, fyYear, parseIsoDate } from '../src/fy.js';

describe('parseIsoDate', () => {
  it('parses a valid date', () => {
    expect(parseIsoDate('2025-06-30')).toEqual({ year: 2025, month: 6, day: 30 });
  });

  it('accepts 29 February in a leap year and rejects it otherwise', () => {
    expect(parseIsoDate('2024-02-29').day).toBe(29);
    expect(() => parseIsoDate('2023-02-29')).toThrow(RangeError);
    // Century leap rule: 2000 was a leap year, 1900 was not.
    expect(parseIsoDate('2000-02-29').day).toBe(29);
    expect(() => parseIsoDate('1900-02-29')).toThrow(RangeError);
  });

  it.each(['2025-6-30', '30-06-2025', 'garbage', '2025-06-30T00:00:00Z', ''])(
    'rejects malformed input %j',
    (input) => {
      expect(() => parseIsoDate(input)).toThrow(RangeError);
    }
  );

  it('rejects out-of-range months and days', () => {
    expect(() => parseIsoDate('2025-00-10')).toThrow(RangeError);
    expect(() => parseIsoDate('2025-13-10')).toThrow(RangeError);
    expect(() => parseIsoDate('2025-04-31')).toThrow(RangeError);
    expect(() => parseIsoDate('2025-01-00')).toThrow(RangeError);
    expect(parseIsoDate('2025-01-31').day).toBe(31);
  });
});

describe('fyLabelFromEndDate (the fiscal-calendar policy)', () => {
  it('labels by the calendar year containing the year end', () => {
    // The spec's own example: CSL's year ending 2025-06-30 is FY2025.
    expect(fyLabelFromEndDate('2025-06-30')).toBe('FY2025');
    expect(fyLabelFromEndDate('2024-12-31')).toBe('FY2024');
    expect(fyLabelFromEndDate('2024-09-28')).toBe('FY2024');
  });
});

describe('fyYear and fyLabelOf', () => {
  it('round-trips', () => {
    expect(fyYear('FY2024')).toBe(2024);
    expect(fyLabelOf(2024)).toBe('FY2024');
  });

  it('rejects malformed labels', () => {
    expect(() => fyYear('FY24' as never)).toThrow(RangeError);
    expect(() => fyYear('2024' as never)).toThrow(RangeError);
  });

  it('rejects out-of-range years', () => {
    expect(() => fyLabelOf(999)).toThrow(RangeError);
    expect(() => fyLabelOf(10000)).toThrow(RangeError);
    expect(() => fyLabelOf(2024.5)).toThrow(RangeError);
  });
});

describe('compareFyLabels', () => {
  it('sorts ascending', () => {
    const labels = ['FY2024', 'FY2015', 'FY2020'] as const;
    expect([...labels].sort(compareFyLabels)).toEqual(['FY2015', 'FY2020', 'FY2024']);
  });
});
