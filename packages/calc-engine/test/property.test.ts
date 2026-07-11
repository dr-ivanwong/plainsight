/**
 * Property-based tests (main plan section 5): algebraic invariants that must
 * hold for ALL representable inputs, not just the cases we thought of.
 * The headline property is the no-NaN rule: whatever the data, every ok value
 * is finite and every formatted string is free of NaN and Infinity.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatMetricValue } from '../src/format.js';
import { LINE_ITEM_IDS, type LineItemId } from '../src/lineItems.js';
import { METRICS, METRIC_IDS } from '../src/metrics.js';
import { computeMetricsReport } from '../src/report.js';
import type {
  CompanyFinancials,
  EntryValue,
  MetricValue,
  PriceRecord,
  StatementYear
} from '../src/types.js';

// Amounts stay an order of magnitude under the safe-integer ceiling so sums of
// a handful of items remain safe integers, matching what Zod-validated storage
// can actually hold.
const AMOUNT = 1_000_000_000_000_000;

const entryValueArb: fc.Arbitrary<EntryValue> = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: -AMOUNT, max: AMOUNT }).map((amountMinor) => ({ kind: 'entered' as const, amountMinor })) },
  { weight: 1, arbitrary: fc.constant({ kind: 'not_reported_zero' as const }) }
);

const valuesArb: fc.Arbitrary<StatementYear['values']> = fc
  .uniqueArray(fc.constantFrom<LineItemId>(...LINE_ITEM_IDS), { minLength: 0, maxLength: 22 })
  .chain((ids) =>
    fc.tuple(...ids.map((id) => entryValueArb.map((value) => [id, value] as const))).map((pairs) => {
      const values: Partial<Record<LineItemId, EntryValue>> = {};
      for (const [id, value] of pairs) values[id] = value;
      return values;
    })
  );

function yearArb(fyYearNumber: number): fc.Arbitrary<StatementYear> {
  return valuesArb.map((values) => ({
    fy: `FY${fyYearNumber}` as const,
    endDate: `${fyYearNumber}-12-31`,
    currency: 'USD',
    entryScale: 'ones',
    values
  }));
}

const inputArb: fc.Arbitrary<CompanyFinancials> = fc
  .uniqueArray(fc.integer({ min: 2000, max: 2030 }), { minLength: 0, maxLength: 12 })
  .chain((fyYears) => fc.tuple(...fyYears.map(yearArb)))
  .chain((years) =>
    fc
      .option(
        fc
          .integer({ min: 0, max: 100_000_000 })
          .map((amountMinor): PriceRecord => ({ amountMinor, currency: 'USD', asOf: '2026-07-10' })),
        { nil: undefined }
      )
      .map((price) => (price === undefined ? { years } : { years, price }))
  );

const defined = <T>(value: T | undefined): value is T => value !== undefined;

function everyMetricValue(input: CompanyFinancials): MetricValue[] {
  const report = computeMetricsReport(input);
  return METRIC_IDS.flatMap((id) => Object.values(report.metrics[id].values).filter(defined));
}

describe('the no-NaN rule', () => {
  it('never produces a non-finite ok value and never throws on representable input', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        for (const value of everyMetricValue(input)) {
          if (value.status === 'ok') {
            expect(Number.isFinite(value.value)).toBe(true);
          }
        }
      })
    );
  });

  it('formatted output never contains NaN or Infinity', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const report = computeMetricsReport(input);
        for (const id of METRIC_IDS) {
          for (const value of Object.values(report.metrics[id].values).filter(defined)) {
            const text = formatMetricValue(value, METRICS[id].format, 'USD');
            expect(text).not.toMatch(/NaN|Infinity/);
            expect(text.length).toBeGreaterThan(0);
          }
        }
      })
    );
  });
});

describe('the three-state rule (spec section 8)', () => {
  it('an asserted not-reported-zero computes identically to an entered 0 everywhere', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const zeroed: CompanyFinancials = {
          ...input,
          years: input.years.map((year) => ({
            ...year,
            values: Object.fromEntries(
              Object.entries(year.values).map(([id, value]) => [
                id,
                value.kind === 'not_reported_zero' ? { kind: 'entered', amountMinor: 0 } : value
              ])
            ) as StatementYear['values']
          }))
        };
        expect(computeMetricsReport(zeroed)).toEqual(computeMetricsReport(input));
      })
    );
  });
});

describe('determinism and order independence', () => {
  it('the report is a pure function of the input', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        expect(computeMetricsReport(input)).toEqual(computeMetricsReport(input));
      })
    );
  });

  it('input year order never changes the report', () => {
    fc.assert(
      fc.property(inputArb, fc.infiniteStream(fc.nat()), (input, seeds) => {
        const shuffled = [...input.years];
        // Fisher-Yates with the generated seeds keeps the shuffle deterministic.
        const iterator = seeds[Symbol.iterator]();
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
          const j = (iterator.next().value as number) % (i + 1);
          const a = shuffled[i] as StatementYear;
          shuffled[i] = shuffled[j] as StatementYear;
          shuffled[j] = a;
        }
        const reordered: CompanyFinancials =
          input.price === undefined ? { years: shuffled } : { years: shuffled, price: input.price };
        expect(computeMetricsReport(reordered)).toEqual(computeMetricsReport(input));
      })
    );
  });
});

describe('margin bounds (main plan section 5)', () => {
  it('gross margin never exceeds 1 when derived from non-negative cost and positive revenue', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: AMOUNT }),
        fc.integer({ min: 0, max: AMOUNT }),
        (revenue, costOfRevenue) => {
          const report = computeMetricsReport({
            years: [
              {
                fy: 'FY2024',
                endDate: '2024-12-31',
                currency: 'USD',
                entryScale: 'ones',
                values: {
                  revenue: { kind: 'entered', amountMinor: revenue },
                  costOfRevenue: { kind: 'entered', amountMinor: costOfRevenue }
                }
              }
            ]
          });
          const grossMargin = report.metrics.grossMargin.values.FY2024;
          expect(grossMargin?.status).toBe('ok');
          if (grossMargin?.status === 'ok') {
            expect(grossMargin.value).toBeLessThanOrEqual(1);
          }
        }
      )
    );
  });
});

describe('denominator basis selection', () => {
  it('averages exactly when the prior balance sheet is complete', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const report = computeMetricsReport(input);
        const byLabel = new Map(input.years.map((year) => [year.fy, year]));
        for (const [fy, value] of Object.entries(report.metrics.roe.values)) {
          if (value === undefined || value.status !== 'ok') continue;
          const priorLabel = `FY${Number(fy.slice(2)) - 1}` as const;
          const prior = byLabel.get(priorLabel);
          const balanceItems: LineItemId[] = [
            'cashAndEquivalents',
            'currentAssets',
            'totalAssets',
            'currentLiabilities',
            'shortTermDebt',
            'longTermDebt',
            'totalLiabilities',
            'totalEquity'
          ];
          const priorComplete =
            prior !== undefined && balanceItems.every((id) => prior.values[id] !== undefined);
          expect(value.basis).toBe(priorComplete ? 'average' : 'ending');
        }
      })
    );
  });
});
