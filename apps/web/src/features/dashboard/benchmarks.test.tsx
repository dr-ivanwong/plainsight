// @vitest-environment jsdom

// The benchmark helpers (dashboard design plan §6.5): the unfavourable-side
// band, the line's spoken words, and the editor's small parser.
import { describe, expect, it } from 'vitest';

import { parseBenchmarkText } from './BenchmarkEditor';
import { benchmarkBands } from './TrendMiniChart';
import { benchmarkLabelFor } from './TrendSection';

describe('benchmarkBands', () => {
  it('bands only the unfavourable side when up is healthy, gapping with the series', () => {
    const points = [
      { fy: 'FY2021', value: 0.1 },
      { fy: 'FY2022', value: 0.2 },
      { fy: 'FY2023', value: null },
      { fy: 'FY2024', value: 0.14 }
    ] as const;
    expect(benchmarkBands(points, 0.15, 'up')).toEqual([
      [0.1, 0.15],
      null,
      null,
      [0.14, 0.15]
    ]);
  });

  it('flips the unfavourable side when down is healthy (leverage above its line)', () => {
    const points = [
      { fy: 'FY2023', value: 1 },
      { fy: 'FY2024', value: 2 }
    ] as const;
    expect(benchmarkBands(points, 1.5, 'down')).toEqual([null, [1.5, 2]]);
  });
});

describe('benchmarkLabelFor', () => {
  it('speaks the coverage default as the rule threshold, anything else as a reference', () => {
    expect(benchmarkLabelFor('interestCoverage', 3, 'AUD')).toBe('3.0× rule threshold');
    expect(benchmarkLabelFor('interestCoverage', 4, 'AUD')).toBe('4.0× reference');
    expect(benchmarkLabelFor('roe', 0.15, 'AUD')).toBe('15.0% reference');
  });
});

describe('parseBenchmarkText', () => {
  it('reads percent points into fractions and plain decimals as they are', () => {
    expect(parseBenchmarkText('15', 'percent')).toBe(0.15);
    expect(parseBenchmarkText('12.5', 'percent')).toBe(0.125);
    expect(parseBenchmarkText('3.5', 'coverage')).toBe(3.5);
    expect(parseBenchmarkText(' 1,000 ', 'ratio')).toBe(1000);
  });

  it('refuses anything that is not a positive number', () => {
    expect(parseBenchmarkText('abc', 'ratio')).toBeNull();
    expect(parseBenchmarkText('-3', 'ratio')).toBeNull();
    expect(parseBenchmarkText('0', 'ratio')).toBeNull();
    expect(parseBenchmarkText('', 'percent')).toBeNull();
  });
});
