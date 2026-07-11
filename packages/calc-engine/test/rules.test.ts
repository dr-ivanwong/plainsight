import { describe, expect, it } from 'vitest';
import { computeMetricsReport } from '../src/report.js';
import type { RuleId, StatementYear } from '../src/types.js';
import { completeYear, zeroAsserted, type ValueSpec } from './helpers.js';

/** Runs the full report and returns the fired rule, if any. */
function fired(years: StatementYear[], ruleId: RuleId) {
  return computeMetricsReport({ years }).flags.find((flag) => flag.ruleId === ruleId);
}

/** Years FY2020..FY2024 built from per-year overrides, oldest first. */
function run(...overrides: ValueSpec[]): StatementYear[] {
  return overrides.map((values, i) => completeYear(`FY${2020 + i}`, values));
}

describe('R1 earnings quality', () => {
  const below = { operatingCashFlow: 15_000, capex: 1_000 }; // OCF 15k vs NI 20k
  const above = { operatingCashFlow: 25_000 };

  it('fires when OCF trails NI for 3 years and cumulative coverage is under 0.9', () => {
    const flag = fired(run(above, below, below, below), 'R1');
    expect(flag).toMatchObject({ ruleId: 'R1', severity: 'orange', window: ['FY2021', 'FY2022', 'FY2023'] });
    expect(flag?.firedWith.cumulativeCoverageDisplay).toBe('75.0%');
    expect(flag?.explanation).toContain('FY2021, FY2022 and FY2023');
  });

  it('does not fire when cumulative coverage reaches 0.9', () => {
    const wobble = { operatingCashFlow: 18_000, capex: 1_000 }; // 3 x 18k / 3 x 20k = 0.9
    expect(fired(run(wobble, wobble, wobble), 'R1')).toBeUndefined();
  });

  it('does not fire when any of the three years covers net income', () => {
    expect(fired(run(below, above, below), 'R1')).toBeUndefined();
  });

  it('abstains when the window has a gap', () => {
    const years = [completeYear('FY2020', below), completeYear('FY2022', below), completeYear('FY2023', below)];
    expect(fired(years, 'R1')).toBeUndefined();
  });

  it('abstains when an input is missing in the window', () => {
    const years = [
      completeYear('FY2020', below),
      completeYear('FY2021', below, { drop: ['netIncome'] }),
      completeYear('FY2022', below)
    ];
    expect(fired(years, 'R1')).toBeUndefined();
  });

  it('stays silent when cumulative net income is not positive (interpretation note)', () => {
    const losses = { netIncome: -10_000, operatingCashFlow: -15_000, capex: 1_000 };
    expect(fired(run(losses, losses, losses), 'R1')).toBeUndefined();
  });
});

describe('R2 eroding moat', () => {
  // Gross margin walks down 2 pp a year from 46% via costOfRevenue overrides.
  const gm = (marginPercent: number): ValueSpec => ({
    costOfRevenue: 100_000 - marginPercent * 1_000
  });

  it('fires orange at 3 declining steps with a cumulative fall of at least 2 pp', () => {
    const flag = fired(run(gm(46), gm(44), gm(42), gm(40)), 'R2');
    expect(flag).toMatchObject({ ruleId: 'R2', severity: 'orange' });
    expect(flag?.window).toEqual(['FY2020', 'FY2021', 'FY2022', 'FY2023']);
    expect(flag?.firedWith.margin).toBe('gross margin');
  });

  it('goes red at 5 or more declining steps', () => {
    const flag = fired(run(gm(46), gm(44), gm(42), gm(40), gm(38), gm(36)), 'R2');
    expect(flag).toMatchObject({ severity: 'red' });
    expect(flag?.firedWith.steps).toBe(5);
  });

  it('does not fire when the cumulative decline stays under 2 pp (basis-point drift)', () => {
    expect(fired(run(gm(46), gm(45.5), gm(45.1), gm(44.8)), 'R2')).toBeUndefined();
  });

  it('does not fire at only 2 declining steps', () => {
    expect(fired(run(gm(46), gm(44), gm(42)), 'R2')).toBeUndefined();
  });

  it('a gap year breaks the streak (P-6)', () => {
    const years = [
      completeYear('FY2019', gm(48)),
      completeYear('FY2020', gm(46)),
      // FY2021 missing
      completeYear('FY2022', gm(44)),
      completeYear('FY2023', gm(42)),
      completeYear('FY2024', gm(40))
    ];
    expect(fired(years, 'R2')).toBeUndefined();
  });

  it('a year where the margin does not compute breaks the streak', () => {
    const years = run(gm(46), gm(44), { ...gm(42), revenue: 0 }, gm(40), gm(38));
    expect(fired(years, 'R2')).toBeUndefined();
  });

  it('reports both margins when both erode', () => {
    const both = (margin: number): ValueSpec => ({
      costOfRevenue: 100_000 - margin * 1_000,
      operatingIncome: margin * 1_000 - 20_000
    });
    const flag = fired(run(both(46), both(44), both(42), both(40)), 'R2');
    expect(flag?.firedWith.margin).toBe('gross and operating');
  });
});

describe('R3 leverage-flattered returns', () => {
  // Baseline M6 = 0.5 (20k debt / 40k equity), ROE = 0.5.
  const leveredUp: ValueSpec = { longTermDebt: 30_000, totalLiabilities: 75_000, totalAssets: 115_000 };

  it('fires when D/E rises 0.3 while ROE moves no more than 1 pp', () => {
    // D/E: 0.5 -> 0.875 (rise 0.375); ROE stays 0.5 on ending basis... the
    // engine averages once priors are complete, so hold equity and NI flat.
    const flag = fired(run({}, {}, {}, leveredUp), 'R3');
    expect(flag).toMatchObject({ ruleId: 'R3', severity: 'orange' });
    expect(flag?.window).toEqual(['FY2020', 'FY2021', 'FY2022', 'FY2023']);
  });

  it('does not fire when the D/E rise is under 0.3', () => {
    const mild: ValueSpec = { longTermDebt: 25_000, totalLiabilities: 70_000, totalAssets: 110_000 };
    expect(fired(run({}, {}, {}, mild), 'R3')).toBeUndefined();
  });

  it('does not fire when ROE rose more than 1 pp alongside', () => {
    const earning: ValueSpec = { ...leveredUp, netIncome: 24_000 };
    expect(fired(run({}, {}, {}, earning), 'R3')).toBeUndefined();
  });

  it('abstains without four consecutive labels', () => {
    expect(fired(run({}, {}, leveredUp), 'R3')).toBeUndefined();
  });

  it('abstains when an endpoint metric does not compute', () => {
    const negativeEquityStart: ValueSpec = { totalEquity: -40_000, totalLiabilities: 140_000 };
    expect(fired(run(negativeEquityStart, {}, {}, leveredUp), 'R3')).toBeUndefined();
  });
});

describe('R4 fragility', () => {
  it('fires orange below 3x coverage', () => {
    // operatingIncome 25_000 / interest 10_000 = 2.5x.
    const flag = fired(run({ interestExpense: 10_000 }), 'R4');
    expect(flag).toMatchObject({ ruleId: 'R4', severity: 'orange', window: ['FY2020'] });
    expect(flag?.firedWith.coverageDisplay).toBe('2.5×');
  });

  it('fires red below 1.5x and when coverage is negative', () => {
    expect(fired(run({ interestExpense: 20_000 }), 'R4')).toMatchObject({ severity: 'red' });
    const negative = fired(run({ operatingIncome: -5_000, interestExpense: 10_000 }), 'R4');
    expect(negative).toMatchObject({ severity: 'red' });
    expect(negative?.explanation).toContain('did not cover');
  });

  it('does not fire at 3x or better', () => {
    expect(fired(run({ interestExpense: 8_000 }), 'R4')).toBeUndefined(); // 3.125x
  });

  it('abstains for the no-debt state (N5)', () => {
    expect(fired(run({ interestExpense: zeroAsserted }), 'R4')).toBeUndefined();
    expect(fired(run({ interestExpense: 0 }), 'R4')).toBeUndefined();
  });

  it('abstains when the latest year cannot compute coverage', () => {
    const years = [completeYear('FY2020', {}, { drop: ['operatingIncome'] })];
    expect(fired(years, 'R4')).toBeUndefined();
  });
});

describe('R5 dilution', () => {
  // Shares grow ~6%/yr: 1_000 -> 1_191; revenue flat by default.
  const sh = (shares: number): ValueSpec => ({ dilutedShares: shares });

  it('fires when share CAGR tops 2%/yr without commensurate revenue growth', () => {
    const flag = fired(run(sh(1_000), sh(1_060), sh(1_124), sh(1_191)), 'R5');
    expect(flag).toMatchObject({ ruleId: 'R5', severity: 'orange' });
    expect(flag?.window).toEqual(['FY2020', 'FY2021', 'FY2022', 'FY2023']);
  });

  it('does not fire when revenue grows at least twice as fast as the share count', () => {
    const years = run(
      { ...sh(1_000), revenue: 100_000 },
      { ...sh(1_060), revenue: 114_000 },
      { ...sh(1_124), revenue: 130_000 },
      { ...sh(1_191), revenue: 148_200 } // ~14%/yr vs ~6%/yr shares
    );
    expect(fired(years, 'R5')).toBeUndefined();
  });

  it('does not fire at 2%/yr share growth or less', () => {
    expect(fired(run(sh(1_000), sh(1_015), sh(1_030), sh(1_045)), 'R5')).toBeUndefined();
  });

  it('abstains on degenerate endpoints', () => {
    expect(fired(run(sh(0), sh(1_060), sh(1_124), sh(1_191)), 'R5')).toBeUndefined();
    expect(fired(run({ ...sh(1_000), revenue: 0 }, sh(1_060), sh(1_124), sh(1_191)), 'R5')).toBeUndefined();
  });

  it('abstains when the window is not covered', () => {
    expect(fired(run(sh(1_000), sh(1_060), sh(1_124)), 'R5')).toBeUndefined();
  });

  it('abstains when revenue is missing inside the window', () => {
    const years = [
      completeYear('FY2020', sh(1_000)),
      completeYear('FY2021', sh(1_060), { drop: ['revenue'] }),
      completeYear('FY2022', sh(1_124)),
      completeYear('FY2023', sh(1_191))
    ];
    expect(fired(years, 'R5')).toBeUndefined();
  });
});

describe('R6 manufactured returns', () => {
  // ROE 20k/8k = 250%; D/E 20k/8k = 2.5 with equity shrunk to 8k.
  const shrunkEquity: ValueSpec = { totalEquity: 8_000, totalLiabilities: 92_000 };

  it('fires when latest ROE tops 25% on debt-to-equity above 2', () => {
    const flag = fired(run(shrunkEquity), 'R6');
    expect(flag).toMatchObject({ ruleId: 'R6', severity: 'orange', window: ['FY2020'] });
    expect(flag?.whatToCheck).toContain('ROIC');
  });

  it('does not fire at the boundaries (strict comparisons)', () => {
    // ROE exactly 25% with high leverage: 100k equity gives ROE 20%.
    const roeAtBoundary: ValueSpec = { netIncome: 2_000, totalEquity: 8_000, totalLiabilities: 92_000 };
    expect(fired(run(roeAtBoundary), 'R6')).toBeUndefined();
    // D/E exactly 2.0: debt 20k on 10k equity.
    const deAtBoundary: ValueSpec = { totalEquity: 10_000, totalLiabilities: 90_000 };
    expect(fired(run(deAtBoundary), 'R6')).toBeUndefined();
  });

  it('abstains when either metric does not compute', () => {
    const negativeEquity: ValueSpec = { totalEquity: -8_000, totalLiabilities: 108_000 };
    expect(fired(run(negativeEquity), 'R6')).toBeUndefined();
  });
});

describe('R7 capital-intensity creep', () => {
  it('fires when revenue rises and FCF falls in each of the latest two steps', () => {
    const years = run(
      { revenue: 100_000, operatingCashFlow: 22_000 },
      { revenue: 110_000, operatingCashFlow: 20_000 },
      { revenue: 120_000, operatingCashFlow: 18_000 }
    );
    const flag = fired(years, 'R7');
    expect(flag).toMatchObject({ ruleId: 'R7', severity: 'orange' });
    expect(flag?.window).toEqual(['FY2020', 'FY2021', 'FY2022']);
  });

  it('does not fire when either step breaks the pattern', () => {
    const revenueDips = run(
      { revenue: 100_000, operatingCashFlow: 22_000 },
      { revenue: 95_000, operatingCashFlow: 20_000 },
      { revenue: 120_000, operatingCashFlow: 18_000 }
    );
    expect(fired(revenueDips, 'R7')).toBeUndefined();
    const fcfRecovers = run(
      { revenue: 100_000, operatingCashFlow: 22_000 },
      { revenue: 110_000, operatingCashFlow: 20_000 },
      { revenue: 120_000, operatingCashFlow: 21_000 }
    );
    expect(fired(fcfRecovers, 'R7')).toBeUndefined();
  });

  it('abstains on a gap or a missing input', () => {
    const gap = [
      completeYear('FY2020', { operatingCashFlow: 22_000 }),
      completeYear('FY2022', { operatingCashFlow: 20_000 }),
      completeYear('FY2023', { operatingCashFlow: 18_000 })
    ];
    expect(fired(gap, 'R7')).toBeUndefined();
    const missing = [
      completeYear('FY2020'),
      completeYear('FY2021'),
      completeYear('FY2022', {}, { drop: ['capex'] })
    ];
    expect(fired(missing, 'R7')).toBeUndefined();
  });
});

describe('rule evaluation with no data', () => {
  it('every rule abstains on an empty library entry', () => {
    expect(computeMetricsReport({ years: [] }).flags).toEqual([]);
  });

  it('every rule abstains on a single sparse year', () => {
    expect(computeMetricsReport({ years: [completeYear('FY2024')] }).flags).toEqual([]);
  });
});
