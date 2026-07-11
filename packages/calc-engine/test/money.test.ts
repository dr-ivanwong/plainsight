import { describe, expect, it } from 'vitest';
import { assertSafeInteger, scaleUnitMinor } from '../src/money.js';

describe('scaleUnitMinor', () => {
  it('returns one unit at each entry scale, in minor units', () => {
    expect(scaleUnitMinor('ones')).toBe(100);
    expect(scaleUnitMinor('thousands')).toBe(100_000);
    expect(scaleUnitMinor('millions')).toBe(100_000_000);
    expect(scaleUnitMinor('billions')).toBe(100_000_000_000);
  });
});

describe('assertSafeInteger', () => {
  it('passes safe integers through, including negatives and zero', () => {
    expect(assertSafeInteger(0, 'test')).toBe(0);
    expect(assertSafeInteger(-42, 'test')).toBe(-42);
    expect(assertSafeInteger(Number.MAX_SAFE_INTEGER, 'test')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5, 2 ** 53])(
    'throws on %s',
    (value) => {
      expect(() => assertSafeInteger(value, 'test')).toThrow(RangeError);
    }
  );
});
