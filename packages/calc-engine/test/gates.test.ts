import { describe, expect, it } from 'vitest';
import { checkIdentities, toleranceMinor } from '../src/gates.js';
import { completeYear, entered, year, zeroAsserted } from './helpers.js';

function gate(results: ReturnType<typeof checkIdentities>, id: 'balance_sheet' | 'gross_profit') {
  const found = results.find((r) => r.gate === id);
  if (found === undefined) throw new Error(`missing gate ${id}`);
  return found;
}

describe('P-2 tolerance', () => {
  it('uses the 3-unit floor at small magnitudes', () => {
    // ones scale: 3 units = 300 minor; 0.1% of 100_000 minor is 100.
    const y = year('FY2024', {});
    expect(toleranceMinor(y, 100_000)).toBe(300);
  });

  it('uses the 0.1% arm at large magnitudes', () => {
    const y = year('FY2024', {});
    expect(toleranceMinor(y, 1_000_000_000)).toBe(1_000_000);
  });

  it('scales the floor with the entry scale', () => {
    const y = year('FY2024', {}, { entryScale: 'millions' });
    expect(toleranceMinor(y, 100_000)).toBe(300_000_000);
  });
});

describe('balance sheet gate: assets = liabilities + equity', () => {
  it('passes on an exact identity', () => {
    const result = gate(checkIdentities(completeYear('FY2024')), 'balance_sheet');
    expect(result).toMatchObject({ status: 'pass', diffMinor: 0 });
  });

  it('passes inside tolerance and fails beyond it', () => {
    // ones scale, sides ~100_000 minor: tolerance is the 300 floor.
    const inside = completeYear('FY2024', { totalAssets: 100_299 });
    expect(gate(checkIdentities(inside), 'balance_sheet').status).toBe('pass');

    const outside = completeYear('FY2024', { totalAssets: 100_301 });
    const failed = gate(checkIdentities(outside), 'balance_sheet');
    expect(failed).toMatchObject({ status: 'fail', diffMinor: 301 });
  });

  it('is not applicable until all three totals are present', () => {
    const y = completeYear('FY2024', {}, { drop: ['totalLiabilities'] });
    expect(gate(checkIdentities(y), 'balance_sheet').status).toBe('not_applicable');
  });
});

describe('gross profit gate (P-8: as-reported vs derived)', () => {
  it('passes when the reported figure matches revenue minus cost of revenue', () => {
    const y = completeYear('FY2024', { grossProfit: 40_000 });
    expect(gate(checkIdentities(y), 'gross_profit')).toMatchObject({ status: 'pass', diffMinor: 0 });
  });

  it('fails beyond tolerance', () => {
    const y = completeYear('FY2024', { grossProfit: 41_000 });
    expect(gate(checkIdentities(y), 'gross_profit').status).toBe('fail');
  });

  it('is not applicable when gross profit is not entered (derived-only years)', () => {
    expect(gate(checkIdentities(completeYear('FY2024')), 'gross_profit').status).toBe('not_applicable');
  });

  it('is not applicable for a not-reported-zero gross profit', () => {
    const y = completeYear('FY2024', { grossProfit: zeroAsserted });
    expect(gate(checkIdentities(y), 'gross_profit').status).toBe('not_applicable');
  });

  it('is not applicable when the derivation inputs are missing', () => {
    const y = year('FY2024', { grossProfit: entered(40_000), revenue: 100_000 });
    expect(gate(checkIdentities(y), 'gross_profit').status).toBe('not_applicable');
  });
});
