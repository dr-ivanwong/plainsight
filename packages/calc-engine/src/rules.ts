/**
 * The red-flag rules, thresholds pinned by docs/plan/plainsight-data-model.md
 * section 7 (owner-confirmed 2026-07-11, including the two de-noising
 * amendments: the earnings-quality cumulative magnitude test and the
 * eroding-moat cumulative 2 pp floor).
 *
 * Contract: a fired rule emits severity, the numbers it fired with, a
 * plain-language explanation, and what to check in the filing; everything is an
 * item to investigate, never a verdict. A rule whose data window is not covered
 * abstains silently, and abstention is not a pass (the data-sufficiency policy:
 * streaks and windows need consecutive labels; a missing year breaks them;
 * nothing is interpolated).
 *
 * Interpretation notes recorded for owner review (the spec's wording leaves two
 * corners open; both readings here are the conservative ones):
 * - "over the latest 3 years" (leverage-flattered returns, dilution) is read as
 *   a three-year span: endpoints t−3 and t, with all four labels present. CAGR
 *   uses exponent 1/3.
 * - the earnings-quality magnitude test needs cumulative net income > 0 to be
 *   meaningful; when the three-year cumulative NI is zero or negative the rule
 *   stays silent rather than dividing by a degenerate base.
 *
 * Float thresholds compare with a 1e-9 epsilon (values are O(1) ratios built
 * from integer minor units; real filings sit nowhere near 1e-9 of a threshold).
 */
import { fyYear } from './fy.js';
import type { LineItemId } from './lineItems.js';
import type {
  FyLabel,
  MetricId,
  MetricSeries,
  MetricValue,
  RuleResult,
  Severity,
  StatementYear
} from './types.js';
import { resolvedValue } from './values.js';
import { formatCoverage, formatPercent, formatRatio } from './format.js';

const EPS = 1e-9;

export interface RuleInput {
  /** Labelled years ascending; the report guarantees unique, sorted labels. */
  yearsAscending: readonly StatementYear[];
  yearByFyYear: ReadonlyMap<number, StatementYear>;
  series: Readonly<Record<MetricId, MetricSeries>>;
}

/**
 * The last `count` labels ending at the latest label, present and consecutive,
 * or null (abstain) when the window is not covered.
 */
function consecutiveWindow(input: RuleInput, count: number): StatementYear[] | null {
  const latest = input.yearsAscending.at(-1);
  if (latest === undefined) return null;
  const latestYear = fyYear(latest.fy);
  const window: StatementYear[] = [];
  for (let y = latestYear - count + 1; y <= latestYear; y += 1) {
    const year = input.yearByFyYear.get(y);
    if (year === undefined) return null;
    window.push(year);
  }
  return window;
}

/** Resolved values for one item across a window; null (abstain) on any gap. */
function windowValues(window: readonly StatementYear[], id: LineItemId): number[] | null {
  const values: number[] = [];
  for (const year of window) {
    const value = resolvedValue(year, id);
    if (value === undefined) return null;
    values.push(value);
  }
  return values;
}

function okValue(series: MetricSeries, fy: FyLabel): number | null {
  const value: MetricValue | undefined = series.values[fy];
  return value !== undefined && value.status === 'ok' ? value.value : null;
}

const labels = (window: readonly StatementYear[]): FyLabel[] => window.map((y) => y.fy);

/** 'FY2023, FY2024 and FY2025' for explanation copy. Callers pass at least two labels. */
function joinLabels(window: readonly FyLabel[]): string {
  return `${window.slice(0, -1).join(', ')} and ${window.at(-1)}`;
}

/** Earnings quality: OCF below NI in each of the latest 3 FYs, and cumulative OCF ÷ NI < 0.9. */
function evaluateEarningsQuality(input: RuleInput): RuleResult | null {
  const window = consecutiveWindow(input, 3);
  if (window === null) return null;
  const ocf = windowValues(window, 'operatingCashFlow');
  const ni = windowValues(window, 'netIncome');
  if (ocf === null || ni === null) return null;

  const everyYearBelow = ocf.every((value, i) => value < (ni[i] as number));
  if (!everyYearBelow) return null;

  const cumulativeOcf = ocf.reduce((a, b) => a + b, 0);
  const cumulativeNi = ni.reduce((a, b) => a + b, 0);
  // The magnitude test keeps working-capital wobble from firing; it needs a
  // positive earnings base to mean anything (interpretation note above).
  if (cumulativeNi <= 0) return null;
  const coverage = cumulativeOcf / cumulativeNi;
  if (coverage >= 0.9 - EPS) return null;

  const windowLabels = labels(window);
  return {
    ruleId: 'earningsQuality',
    name: 'Earnings quality',
    severity: 'orange',
    window: windowLabels,
    firedWith: { cumulativeCoverage: coverage, cumulativeCoverageDisplay: formatPercent(coverage) },
    explanation:
      `Operating cash flow was below net income in each of ${joinLabels(windowLabels)}, ` +
      `covering ${formatPercent(coverage)} of it in total. Profits that do not arrive as cash ` +
      `are worth a closer look.`,
    whatToCheck:
      'Compare receivables growth with revenue growth, and read the accrual notes against the cash flow statement.'
  };
}

interface MarginDecline {
  marginLabel: string;
  steps: number;
  window: FyLabel[];
  from: number;
  to: number;
}

/**
 * Counts consecutive year-over-year declining steps ending at the latest label.
 * A gap in labels, or a year where the margin does not compute, breaks the
 * streak (the data-sufficiency policy).
 */
function decliningStreak(
  input: RuleInput,
  metricId: 'grossMargin' | 'operatingMargin',
  marginLabel: string
): MarginDecline | null {
  const latest = input.yearsAscending.at(-1);
  if (latest === undefined) return null;
  const series = input.series[metricId];

  let steps = 0;
  let cursor = fyYear(latest.fy);
  const windowLabels: FyLabel[] = [latest.fy];
  for (;;) {
    const current = input.yearByFyYear.get(cursor);
    const prior = input.yearByFyYear.get(cursor - 1);
    if (current === undefined || prior === undefined) break;
    const currentValue = okValue(series, current.fy);
    const priorValue = okValue(series, prior.fy);
    if (currentValue === null || priorValue === null) break;
    if (!(currentValue < priorValue - EPS)) break;
    steps += 1;
    windowLabels.unshift(prior.fy);
    cursor -= 1;
  }

  if (steps === 0) return null;
  const firstLabel = windowLabels[0] as FyLabel;
  const from = okValue(series, firstLabel) as number;
  const to = okValue(series, latest.fy) as number;
  return { marginLabel, steps, window: windowLabels, from, to };
}

/** Eroding moat: a margin declining >= 3 consecutive steps with a cumulative fall >= 2 pp; red at >= 5 steps. */
function evaluateErodingMoat(input: RuleInput): RuleResult | null {
  const candidates = [
    decliningStreak(input, 'grossMargin', 'Gross margin'),
    decliningStreak(input, 'operatingMargin', 'Operating margin')
  ].filter((candidate): candidate is MarginDecline => candidate !== null);

  const fired = candidates.filter(
    (candidate) => candidate.steps >= 3 && candidate.from - candidate.to >= 0.02 - EPS
  );
  if (fired.length === 0) return null;

  // When both margins qualify, report the longer erosion.
  fired.sort((a, b) => b.steps - a.steps);
  const worst = fired[0] as MarginDecline;
  const severity: Severity = worst.steps >= 5 ? 'red' : 'orange';
  const both = fired.length === 2;

  return {
    ruleId: 'erodingMoat',
    name: 'Eroding moat',
    severity,
    window: worst.window,
    firedWith: {
      margin: both ? 'gross and operating' : worst.marginLabel.toLowerCase(),
      steps: worst.steps,
      from: formatPercent(worst.from),
      to: formatPercent(worst.to)
    },
    explanation:
      `${both ? 'Gross and operating margins have' : `${worst.marginLabel} has`} declined for ` +
      `${worst.steps} consecutive years${both ? '' : `, from ${formatPercent(worst.from)} to ${formatPercent(worst.to)}`}. ` +
      `Durable pricing power does not usually erode this steadily.`,
    whatToCheck: 'Look for pricing power, competition and mix shift in the MD&A.'
  };
}

/** Leverage-flattered returns: D/E up >= 0.3 over the latest 3 years while ROE rises <= 1 pp. */
function evaluateLeverageFlatteredReturns(input: RuleInput): RuleResult | null {
  const window = consecutiveWindow(input, 4);
  if (window === null) return null;
  const first = (window[0] as StatementYear).fy;
  const last = (window.at(-1) as StatementYear).fy;

  const deStart = okValue(input.series.debtToEquity, first);
  const deEnd = okValue(input.series.debtToEquity, last);
  const roeStart = okValue(input.series.roe, first);
  const roeEnd = okValue(input.series.roe, last);
  if (deStart === null || deEnd === null || roeStart === null || roeEnd === null) return null;

  const deRise = deEnd - deStart;
  const roeRise = roeEnd - roeStart;
  if (deRise < 0.3 - EPS || roeRise > 0.01 + EPS) return null;

  return {
    ruleId: 'leverageFlatteredReturns',
    name: 'Leverage-flattered returns',
    severity: 'orange',
    window: labels(window),
    firedWith: {
      debtToEquityFrom: formatRatio(deStart),
      debtToEquityTo: formatRatio(deEnd),
      roeChangePp: (roeRise * 100).toFixed(1)
    },
    explanation:
      `Debt-to-equity rose from ${formatRatio(deStart)} to ${formatRatio(deEnd)} over the last ` +
      `three years while ROE moved ${(roeRise * 100).toFixed(1)} pp. Borrowing that does not lift ` +
      `returns deserves an explanation.`,
    whatToCheck: 'Read the debt notes and the maturity ladder: what the new borrowing funded, and when it rolls over.'
  };
}

/**
 * Fragility: latest interest coverage < 3.0; red when < 1.5 or negative.
 * Abstains when coverage did not compute, including the healthy no-debt state
 * (data-model section 6, no-debt coverage note).
 */
function evaluateFragility(input: RuleInput): RuleResult | null {
  const latest = input.yearsAscending.at(-1);
  if (latest === undefined) return null;
  const coverage = okValue(input.series.interestCoverage, latest.fy);
  if (coverage === null) return null;
  if (coverage >= 3.0 - EPS) return null;

  const red = coverage < 1.5 - EPS;
  return {
    ruleId: 'fragility',
    name: 'Fragility',
    severity: red ? 'red' : 'orange',
    window: [latest.fy],
    firedWith: { coverage, coverageDisplay: formatCoverage(coverage) },
    explanation:
      coverage < 0
        ? `Operating income did not cover interest expense in ${latest.fy}: coverage was ${formatCoverage(coverage)}.`
        : `Operating income covered interest expense ${formatCoverage(coverage)} in ${latest.fy}. ` +
          `Below 3× there is little room for a bad year.`,
    whatToCheck: 'Read the interest notes: covenants, refinancing dates and floating-rate exposure.'
  };
}

/** Dilution: diluted-share CAGR over the latest 3 years > 2%/yr without commensurate revenue growth. */
function evaluateDilution(input: RuleInput): RuleResult | null {
  const window = consecutiveWindow(input, 4);
  if (window === null) return null;
  const shares = windowValues(window, 'dilutedShares');
  const revenue = windowValues(window, 'revenue');
  if (shares === null || revenue === null) return null;

  const sharesStart = shares[0] as number;
  const sharesEnd = shares.at(-1) as number;
  const revenueStart = revenue[0] as number;
  const revenueEnd = revenue.at(-1) as number;
  if (sharesStart <= 0 || sharesEnd <= 0 || revenueStart <= 0 || revenueEnd <= 0) return null;

  const shareCagr = (sharesEnd / sharesStart) ** (1 / 3) - 1;
  const revenueCagr = (revenueEnd / revenueStart) ** (1 / 3) - 1;
  if (shareCagr <= 0.02 + EPS) return null;
  if (revenueCagr >= 2 * shareCagr - EPS) return null;

  return {
    ruleId: 'dilution',
    name: 'Dilution',
    severity: 'orange',
    window: labels(window),
    firedWith: {
      shareCagr,
      revenueCagr,
      shareCagrDisplay: formatPercent(shareCagr),
      revenueCagrDisplay: formatPercent(revenueCagr)
    },
    explanation:
      `Diluted shares grew ${formatPercent(shareCagr)} a year over the last three years while ` +
      `revenue grew ${formatPercent(revenueCagr)} a year. Each share is buying a thinner slice ` +
      `of the business.`,
    whatToCheck: 'Read the share-based compensation note, and weigh issuance against buybacks.'
  };
}

/** Manufactured returns: latest ROE > 25% with latest D/E > 2.0; the copy directs to ROIC. */
function evaluateManufacturedReturns(input: RuleInput): RuleResult | null {
  const latest = input.yearsAscending.at(-1);
  if (latest === undefined) return null;
  const roe = okValue(input.series.roe, latest.fy);
  const de = okValue(input.series.debtToEquity, latest.fy);
  if (roe === null || de === null) return null;
  if (roe <= 0.25 + EPS || de <= 2.0 + EPS) return null;

  return {
    ruleId: 'manufacturedReturns',
    name: 'Manufactured returns',
    severity: 'orange',
    window: [latest.fy],
    firedWith: { roe: formatPercent(roe), debtToEquity: formatRatio(de) },
    explanation:
      `ROE of ${formatPercent(roe)} sits on debt-to-equity of ${formatRatio(de)}. A small equity ` +
      `base can manufacture a tall return; ROIC strips the leverage back out.`,
    whatToCheck: 'Check how far buybacks have shrunk the equity base, and read the return through ROIC rather than ROE.'
  };
}

/** Capital-intensity creep: revenue up and FCF down, in each of the latest 2 consecutive steps. */
function evaluateCapitalIntensityCreep(input: RuleInput): RuleResult | null {
  const window = consecutiveWindow(input, 3);
  if (window === null) return null;
  const revenue = windowValues(window, 'revenue');
  const ocf = windowValues(window, 'operatingCashFlow');
  const capex = windowValues(window, 'capex');
  if (revenue === null || ocf === null || capex === null) return null;

  const fcf = ocf.map((value, i) => value - (capex[i] as number));
  for (let i = 1; i < window.length; i += 1) {
    const revenueUp = (revenue[i] as number) > (revenue[i - 1] as number);
    const fcfDown = (fcf[i] as number) < (fcf[i - 1] as number);
    if (!revenueUp || !fcfDown) return null;
  }

  return {
    ruleId: 'capitalIntensityCreep',
    name: 'Capital-intensity creep',
    severity: 'orange',
    window: labels(window),
    firedWith: { years: joinLabels(labels(window)) },
    explanation:
      `Revenue rose in each of the last two years while free cash flow fell. Growth that ` +
      `consumes cash is worth understanding before trusting it.`,
    whatToCheck:
      'Compare the capex trajectory with depreciation and amortisation, and check what working capital swallowed.'
  };
}

const RULES = [
  evaluateEarningsQuality,
  evaluateErodingMoat,
  evaluateLeverageFlatteredReturns,
  evaluateFragility,
  evaluateDilution,
  evaluateManufacturedReturns,
  evaluateCapitalIntensityCreep
] as const;

/** Evaluates all rules; returns only fired results (abstentions are silent). */
export function evaluateRules(input: RuleInput): RuleResult[] {
  return RULES.map((rule) => rule(input)).filter((result): result is RuleResult => result !== null);
}
