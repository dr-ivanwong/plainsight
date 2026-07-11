import { describe, expect, it } from 'vitest';
import { coreItemsFor, LINE_ITEMS, LINE_ITEM_IDS } from '../src/lineItems.js';
import {
  balanceSheetComplete,
  hasValue,
  missingCoreItems,
  missingForMetric,
  requireValue,
  resolvedValue,
  statementComplete,
  yearComplete
} from '../src/values.js';
import { completeYear, entered, year, zeroAsserted } from './helpers.js';

describe('the three-state rule (spec section 8)', () => {
  const y = year('FY2024', {
    revenue: 100,
    costOfRevenue: entered(0),
    interestExpense: zeroAsserted
  });

  it('resolves entered values', () => {
    expect(resolvedValue(y, 'revenue')).toBe(100);
  });

  it('an entered 0 counts and computes as 0', () => {
    expect(resolvedValue(y, 'costOfRevenue')).toBe(0);
    expect(hasValue(y, 'costOfRevenue')).toBe(true);
  });

  it('a not-reported-zero assertion counts and computes as 0', () => {
    expect(resolvedValue(y, 'interestExpense')).toBe(0);
    expect(hasValue(y, 'interestExpense')).toBe(true);
  });

  it('an absent key is unknown: undefined, never 0', () => {
    expect(resolvedValue(y, 'netIncome')).toBeUndefined();
    expect(hasValue(y, 'netIncome')).toBe(false);
  });

  it('asserts safe integers at the boundary', () => {
    const bad = year('FY2024', { revenue: entered(1.5) });
    expect(() => resolvedValue(bad, 'revenue')).toThrow(RangeError);
  });
});

describe('requireValue', () => {
  it('returns a present value', () => {
    expect(requireValue(year('FY2024', { revenue: 7 }), 'revenue')).toBe(7);
  });

  it('throws on an absent value (programming error, not a data state)', () => {
    expect(() => requireValue(year('FY2024', {}), 'revenue')).toThrow(RangeError);
  });
});

describe('line item dictionary', () => {
  it('has 22 items with consistent ids', () => {
    expect(LINE_ITEM_IDS).toHaveLength(22);
    for (const id of LINE_ITEM_IDS) {
      expect(LINE_ITEMS[id].id).toBe(id);
    }
  });

  it('pins the P-0 signed exceptions exactly', () => {
    const signed = LINE_ITEM_IDS.filter((id) => LINE_ITEMS[id].signed);
    expect(signed).toEqual([
      'grossProfit',
      'operatingIncome',
      'pretaxIncome',
      'taxExpense',
      'netIncome',
      'totalEquity',
      'operatingCashFlow'
    ]);
  });

  it('defines statement completeness by core items (gross profit is derived, never blocks)', () => {
    expect(coreItemsFor('income')).toEqual([
      'revenue',
      'costOfRevenue',
      'operatingIncome',
      'interestExpense',
      'pretaxIncome',
      'taxExpense',
      'netIncome',
      'dilutedShares'
    ]);
    expect(coreItemsFor('balance')).toHaveLength(8);
    expect(coreItemsFor('cashflow')).toEqual(['operatingCashFlow', 'capex']);
  });
});

describe('completeness (spec section 10)', () => {
  it('a complete year is complete on every statement', () => {
    const y = completeYear('FY2024');
    expect(statementComplete(y, 'income')).toBe(true);
    expect(statementComplete(y, 'balance')).toBe(true);
    expect(statementComplete(y, 'cashflow')).toBe(true);
    expect(yearComplete(y)).toBe(true);
    expect(balanceSheetComplete(y)).toBe(true);
    expect(missingCoreItems(y)).toEqual([]);
  });

  it('a not-reported-zero assertion counts toward completeness', () => {
    const y = completeYear('FY2024', { interestExpense: zeroAsserted });
    expect(yearComplete(y)).toBe(true);
  });

  it('a missing core item blocks exactly its statement', () => {
    const y = completeYear('FY2024', {}, { drop: ['capex'] });
    expect(statementComplete(y, 'cashflow')).toBe(false);
    expect(statementComplete(y, 'income')).toBe(true);
    expect(yearComplete(y)).toBe(false);
    expect(missingCoreItems(y)).toEqual(['capex']);
  });

  it('contextual items never block completeness', () => {
    const y = completeYear('FY2024');
    expect(hasValue(y, 'depreciationAmortisation')).toBe(false);
    expect(yearComplete(y)).toBe(true);
  });
});

describe('missingForMetric (drives the deep link)', () => {
  it('lists exactly the absent requirements', () => {
    const y = year('FY2024', { revenue: 100 });
    expect(missingForMetric('M2', y)).toEqual(['operatingIncome']);
    expect(missingForMetric('M3', y)).toEqual(['netIncome']);
    expect(missingForMetric('M9', y)).toEqual(['operatingCashFlow', 'capex']);
  });

  it('M1 accepts either grossProfit or costOfRevenue (P-8)', () => {
    expect(missingForMetric('M1', year('FY2024', { revenue: 1, grossProfit: 1 }))).toEqual([]);
    expect(missingForMetric('M1', year('FY2024', { revenue: 1, costOfRevenue: 1 }))).toEqual([]);
    // When neither is present the deep link targets the enterable core item.
    expect(missingForMetric('M1', year('FY2024', { revenue: 1 }))).toEqual(['costOfRevenue']);
    expect(missingForMetric('M1', year('FY2024', {}))).toEqual(['revenue', 'costOfRevenue']);
  });

  it('the price record is not a line item and never appears in missing lists', () => {
    const y = completeYear('FY2024');
    expect(missingForMetric('M12', y)).toEqual([]);
    expect(missingForMetric('M13', y)).toEqual([]);
    expect(missingForMetric('M14', y)).toEqual([]);
  });
});
