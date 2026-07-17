// The history row's length note: absolute size for the first version, the
// movement against the previous version after that, true minus and all.
import { describe, expect, it } from 'vitest';

import { deltaLabel, wordCount } from './versionWords';

const sections = (business: string, moat = '', valuation = '', kills = '') => ({
  business,
  moat,
  valuation,
  kills
});

describe('wordCount', () => {
  it('counts nothing for an unwritten thesis', () => {
    expect(wordCount(sections(''))).toBe(0);
  });

  it('sums words across sections, whatever the whitespace', () => {
    expect(wordCount(sections('one  two\nthree', 'four', '', '\n five '))).toBe(5);
  });
});

describe('deltaLabel', () => {
  it('states the first version in absolute words', () => {
    expect(deltaLabel(3, null)).toBe('3 words');
    expect(deltaLabel(1, null)).toBe('1 word');
  });

  it('states growth and shrinkage against the previous version', () => {
    expect(deltaLabel(5, 3)).toBe('+2 words');
    expect(deltaLabel(3, 5)).toBe('−2 words');
    expect(deltaLabel(4, 3)).toBe('+1 word');
  });

  it('says so plainly when nothing moved', () => {
    expect(deltaLabel(4, 4)).toBe('no change in length');
  });
});
