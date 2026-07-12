/**
 * Behavioural tests for the selection policy and the mapping's production
 * generalisations, over small synthetic companyfacts documents. The golden
 * corpus (mapping.golden.test.ts) is the acceptance suite; these pin the
 * policy branches a healthy corpus never exercises.
 */
import { describe, expect, it } from 'vitest';
import {
  allCandidateConcepts,
  edgarFilingUrl,
  mapCompanyfacts,
  toMinor,
  toStatementRows,
  type MappedYear
} from '../src/index.js';
import { KEPT_CONCEPTS, prune, TICKERS } from '../tools/record-companyfacts.mjs';

interface FactInput {
  start?: string;
  end: string;
  val: number;
  accn?: string;
  form?: string;
  filed?: string;
}

const fact = ({ start, end, val, accn = 'acc-1', form = '10-K', filed = '2026-02-01' }: FactInput) => ({
  ...(start === undefined ? {} : { start }),
  end,
  val,
  accn,
  form,
  filed
});

const doc = (concepts: Record<string, ReturnType<typeof fact>[]>, unit = 'USD') => ({
  cik: 7,
  entityName: 'Synthetic Test Co',
  facts: {
    'us-gaap': Object.fromEntries(
      Object.entries(concepts).map(([concept, facts]) => [concept, { units: { [unit]: facts } }])
    )
  }
});

/** A full-year duration ending on the given date. */
const year = (end: string) => ({ start: `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`, end });

describe('as-originally-reported selection', () => {
  it('takes the earliest original 10-K and ignores later re-presentations', () => {
    const mapped = mapCompanyfacts(
      doc({
        NetIncomeLoss: [
          fact({ ...year('2024-12-31'), val: 100, accn: 'orig', filed: '2025-02-01' }),
          fact({ ...year('2024-12-31'), val: 999, accn: 'restated', filed: '2026-02-01' })
        ]
      })
    );
    expect(mapped.years).toHaveLength(1);
    expect(mapped.years[0]?.items.netIncome).toMatchObject({ amountMinor: 10_000, accession: 'orig' });
  });

  it('prefers any original 10-K over an amendment, whatever the filing order', () => {
    const mapped = mapCompanyfacts(
      doc({
        NetIncomeLoss: [
          fact({ ...year('2024-12-31'), val: 50, accn: 'amendment', form: '10-K/A', filed: '2025-01-01' }),
          fact({ ...year('2024-12-31'), val: 100, accn: 'orig', filed: '2025-06-01' })
        ]
      })
    );
    expect(mapped.years[0]?.items.netIncome?.accession).toBe('orig');
  });

  it('uses a 10-K/A only when no original carries the period', () => {
    const mapped = mapCompanyfacts(
      doc({
        NetIncomeLoss: [fact({ ...year('2024-12-31'), val: 55, accn: 'amendment', form: '10-K/A' })]
      })
    );
    expect(mapped.years[0]?.items.netIncome).toMatchObject({ amountMinor: 5_500, accession: 'amendment' });
  });

  it('ignores non-annual durations and non-10-K forms', () => {
    const mapped = mapCompanyfacts(
      doc({
        NetIncomeLoss: [
          fact({ start: '2024-10-01', end: '2024-12-31', val: 25 }), // a quarter
          fact({ ...year('2023-12-31'), val: 75, form: '10-Q' }),
          fact({ start: '2023-12-25', end: '2024-12-29', val: 100 }) // a 53-week year passes
        ]
      })
    );
    expect(mapped.years).toHaveLength(1);
    expect(mapped.years[0]?.fy).toBe('FY2024');
    expect(mapped.years[0]?.items.netIncome?.amountMinor).toBe(10_000);
  });

  it('treats a dated balance fact as an instant: a start date disqualifies it', () => {
    const mapped = mapCompanyfacts(
      doc({
        NetIncomeLoss: [fact({ ...year('2024-12-31'), val: 100 })],
        Assets: [
          fact({ ...year('2024-12-31'), val: 999 }), // duration-shaped: not an instant
          fact({ end: '2024-12-31', val: 500 })
        ]
      })
    );
    expect(mapped.years[0]?.items.totalAssets?.amountMinor).toBe(50_000);
  });
});

describe('summed items', () => {
  it('adds short-term investments onto cash when listed separately', () => {
    const mapped = mapCompanyfacts(
      doc({
        NetIncomeLoss: [fact({ ...year('2024-12-31'), val: 100 })],
        CashAndCashEquivalentsAtCarryingValue: [fact({ end: '2024-12-31', val: 1_000 })],
        ShortTermInvestments: [fact({ end: '2024-12-31', val: 250 })]
      })
    );
    expect(mapped.years[0]?.items.cashAndEquivalents).toMatchObject({
      amountMinor: 125_000,
      concepts: ['CashAndCashEquivalentsAtCarryingValue', 'ShortTermInvestments']
    });
  });

  it('omits the item when a required component group is missing', () => {
    const mapped = mapCompanyfacts(
      doc({
        NetIncomeLoss: [fact({ ...year('2024-12-31'), val: 100 })],
        ShortTermInvestments: [fact({ end: '2024-12-31', val: 250 })]
      })
    );
    expect(mapped.years[0]?.items.cashAndEquivalents).toBeUndefined();
  });

  it('prefers a reported single total over summing components', () => {
    const mapped = mapCompanyfacts(
      doc({
        NetIncomeLoss: [fact({ ...year('2024-12-31'), val: 100 })],
        DebtCurrent: [fact({ end: '2024-12-31', val: 500 })],
        CommercialPaper: [fact({ end: '2024-12-31', val: 100 })]
      })
    );
    expect(mapped.years[0]?.items.shortTermDebt).toMatchObject({
      amountMinor: 50_000,
      concepts: ['DebtCurrent']
    });
  });

  it('sums every borrowing form present plus the current portion of long-term debt', () => {
    const mapped = mapCompanyfacts(
      doc({
        NetIncomeLoss: [fact({ ...year('2024-12-31'), val: 100 })],
        CommercialPaper: [fact({ end: '2024-12-31', val: 100 })],
        ShortTermBorrowings: [fact({ end: '2024-12-31', val: 25 })],
        LongTermDebtCurrent: [fact({ end: '2024-12-31', val: 30 })]
      })
    );
    expect(mapped.years[0]?.items.shortTermDebt).toMatchObject({
      amountMinor: 15_500,
      concepts: ['CommercialPaper', 'ShortTermBorrowings', 'LongTermDebtCurrent']
    });
  });
});

describe('gross-profit consistency (the generalised Costco reading)', () => {
  const base = {
    NetIncomeLoss: [fact({ ...year('2024-12-31'), val: 100 })],
    Revenues: [fact({ ...year('2024-12-31'), val: 10_000_000_000 })],
    CostOfRevenue: [fact({ ...year('2024-12-31'), val: 4_000_000_000 })]
  };

  it('keeps an as-reported gross profit that agrees with its derivation', () => {
    const mapped = mapCompanyfacts(
      doc({ ...base, GrossProfit: [fact({ ...year('2024-12-31'), val: 6_000_000_000 })] })
    );
    expect(mapped.years[0]?.items.grossProfit?.amountMinor).toBe(600_000_000_000);
  });

  it('drops one that disagrees beyond the pinned tolerance, keeping the derived basis', () => {
    const mapped = mapCompanyfacts(
      doc({ ...base, GrossProfit: [fact({ ...year('2024-12-31'), val: 5_900_000_000 })] })
    );
    expect(mapped.years[0]?.items.grossProfit).toBeUndefined();
    expect(mapped.years[0]?.items.revenue).toBeDefined();
    expect(mapped.years[0]?.items.costOfRevenue).toBeDefined();
  });
});

describe('boundary asserts', () => {
  it('converts clean dollars and rejects fractional cents and unsafe magnitudes', () => {
    expect(toMinor(2, 'x')).toBe(200);
    expect(toMinor(-3.25, 'x')).toBe(-325);
    expect(() => toMinor(123.456, 'x')).toThrow('not a clean cent amount');
    expect(() => toMinor(1e14, 'x')).toThrow('safe integer');
  });

  it('rounds diluted shares as plain counts', () => {
    const mapped = mapCompanyfacts({
      cik: 7,
      entityName: 'Synthetic Test Co',
      facts: {
        'us-gaap': {
          NetIncomeLoss: { units: { USD: [fact({ ...year('2024-12-31'), val: 100 })] } },
          WeightedAverageNumberOfDilutedSharesOutstanding: {
            units: { shares: [fact({ ...year('2024-12-31'), val: 1_234_567.4 })] }
          }
        }
      }
    });
    expect(mapped.years[0]?.items.dilutedShares?.amountMinor).toBe(1_234_567);
  });

  it('throws on a document with no us-gaap facts', () => {
    expect(() => mapCompanyfacts({ cik: 7, entityName: 'X', facts: {} })).toThrow('no us-gaap facts');
  });

  it('labels by calendar year of the year end; the later period wins a collision', () => {
    const mapped = mapCompanyfacts(
      doc({
        NetIncomeLoss: [
          fact({ start: '2023-04-01', end: '2024-03-31', val: 10 }),
          fact({ start: '2024-01-01', end: '2024-12-31', val: 20 })
        ]
      })
    );
    expect(mapped.years).toHaveLength(1);
    expect(mapped.years[0]).toMatchObject({ fy: 'FY2024', endDate: '2024-12-31' });
    expect(mapped.years[0]?.items.netIncome?.amountMinor).toBe(2_000);
  });
});

describe('statement rows', () => {
  it('splits a year by statement and names the modal accession per row', () => {
    const mapped: MappedYear = {
      fy: 'FY2024',
      endDate: '2024-12-31',
      currency: 'USD',
      items: {
        revenue: { amountMinor: 1_000, concepts: ['Revenues'], accession: 'acc-a' },
        netIncome: { amountMinor: 100, concepts: ['NetIncomeLoss'], accession: 'acc-a' },
        interestExpense: { amountMinor: 5, concepts: ['InterestExpense'], accession: 'acc-b' },
        totalAssets: { amountMinor: 9_000, concepts: ['Assets'], accession: 'acc-b' }
      }
    };
    const rows = toStatementRows(mapped, { cik: 320193, recordedAt: '2026-07-12T00:00:00Z' });
    expect(rows.map((row) => row.statement)).toEqual(['income', 'balance']);
    const income = rows[0];
    expect(income?.values).toEqual({ revenue: 1_000, netIncome: 100, interestExpense: 5 });
    expect(income?.provenance.filing.documentId).toBe('acc-a');
    expect(rows[1]?.provenance.filing.documentId).toBe('acc-b');
    expect(income?.provenance.filing.url).toBe(edgarFilingUrl(320193, 'acc-a'));
  });
});

describe('the fixture recorder stays aligned with the mapping', () => {
  it('prunes to a superset of the mapping candidates, for the golden corpus tickers', () => {
    const kept = new Set(KEPT_CONCEPTS);
    for (const concept of allCandidateConcepts()) {
      expect(kept.has(concept), `recorder must keep ${concept}; re-record after widening`).toBe(true);
    }
    expect([...TICKERS].sort()).toEqual(['AAPL', 'COST', 'KO', 'MSFT', 'UNP']);
  });

  it('keeps only annual-report forms and mapping candidates', () => {
    const pruned = prune(
      {
        cik: 7,
        entityName: 'X',
        facts: {
          'us-gaap': {
            NetIncomeLoss: {
              units: {
                USD: [
                  fact({ ...year('2024-12-31'), val: 1 }),
                  fact({ ...year('2024-12-31'), val: 2, form: '10-Q' })
                ]
              }
            },
            SomeConceptTheMappingNeverReads: { units: { USD: [fact({ end: '2024-12-31', val: 3 })] } }
          }
        }
      },
      '2026-07-12T00:00:00Z'
    );
    const concepts = pruned.facts['us-gaap'] as Record<string, { units: Record<string, unknown[]> }>;
    expect(Object.keys(concepts)).toEqual(['NetIncomeLoss']);
    expect(concepts.NetIncomeLoss?.units.USD).toHaveLength(1);
  });
});
