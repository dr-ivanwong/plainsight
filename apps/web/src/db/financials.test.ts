import { computeMetricsReport } from '@plainsight/calc-engine';
import { describe, expect, it } from 'vitest';
import { company, incomeStatement, price } from '../test/builders';
import { assembleFinancials } from './financials';
import type { StatementRecord } from './records';

const balanceRow = (over: Partial<StatementRecord> = {}): StatementRecord =>
  incomeStatement({
    statement: 'balance',
    values: { totalEquity: { kind: 'entered', amountMinor: 50_000 } },
    ...over
  });

const cashflowRow = (over: Partial<StatementRecord> = {}): StatementRecord =>
  incomeStatement({
    statement: 'cashflow',
    values: {
      operatingCashFlow: { kind: 'entered', amountMinor: 30_000 },
      capex: { kind: 'entered', amountMinor: 10_000 }
    },
    ...over
  });

describe('assembleFinancials', () => {
  it('merges a year across statements, with the company currency and no collisions', () => {
    const owner = company({ currency: 'USD' });
    const { years } = assembleFinancials(owner, [incomeStatement(), balanceRow(), cashflowRow()]);

    expect(years).toHaveLength(1);
    const year = years[0];
    expect(year?.fy).toBe('FY2024');
    expect(year?.currency).toBe('USD');
    expect(year?.values).toEqual({
      revenue: { kind: 'entered', amountMinor: 391_035_000 },
      netIncome: { kind: 'entered', amountMinor: 93_736_000 },
      totalEquity: { kind: 'entered', amountMinor: 50_000 },
      operatingCashFlow: { kind: 'entered', amountMinor: 30_000 },
      capex: { kind: 'entered', amountMinor: 10_000 }
    });
  });

  it('takes year-level fields from the income row first, then balance, then cashflow', () => {
    const disagreeing = balanceRow({ endDate: '2024-09-30', entryScale: 'thousands' });
    const withIncome = assembleFinancials(company(), [disagreeing, incomeStatement()]);
    expect(withIncome.years[0]?.endDate).toBe('2024-09-28');
    expect(withIncome.years[0]?.entryScale).toBe('millions');

    const withoutIncome = assembleFinancials(company(), [cashflowRow(), disagreeing]);
    expect(withoutIncome.years[0]?.endDate).toBe('2024-09-30');
    expect(withoutIncome.years[0]?.entryScale).toBe('thousands');
  });

  it('sorts years ascending by label regardless of storage order', () => {
    const rows = [
      incomeStatement({ fy: 'FY2024' }),
      incomeStatement({ fy: 'FY2022', endDate: '2022-09-24' }),
      incomeStatement({ fy: 'FY2023', endDate: '2023-09-30' })
    ];
    const { years } = assembleFinancials(company(), rows);
    expect(years.map((year) => year.fy)).toEqual(['FY2022', 'FY2023', 'FY2024']);
  });

  it('maps the price record to the engine shape and omits it when absent', () => {
    const withPrice = assembleFinancials(company(), [], price());
    expect(withPrice.price).toEqual({ amountMinor: 21_150, currency: 'USD', asOf: '2026-07-10' });

    const withoutPrice = assembleFinancials(company(), []);
    expect(withoutPrice.price).toBeUndefined();
    expect(withoutPrice.years).toEqual([]);
  });

  it('produces input the engine computes from end to end', () => {
    const report = computeMetricsReport(assembleFinancials(company(), [incomeStatement()]));
    expect(report.fyLabels).toEqual(['FY2024']);
    expect(report.metrics.netMargin.latest).toMatchObject({
      status: 'ok',
      value: 93_736_000 / 391_035_000
    });
  });
});
