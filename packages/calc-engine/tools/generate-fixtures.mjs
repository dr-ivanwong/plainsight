#!/usr/bin/env node
/**
 * Golden fixture generator (data-model spec section 11).
 *
 * Fetches SEC EDGAR companyfacts for the five Phase 0 golden companies, maps
 * XBRL concepts onto the 22 canonical line items, and writes one fixture JSON
 * per company: line items per FY in integer minor units, per-year source
 * references (accession numbers), and the EXPECTED MetricsReport at display
 * precision plus expected red-flag results.
 *
 * INDEPENDENCE RULE: this script never imports from ../src. Expected values
 * are computed by a second, deliberately separate implementation of the pinned
 * formulas (floats over dollars here; integer minor units in the engine), so a
 * bug must be made twice, in two codebases, to slip through the golden tests.
 *
 * EDGAR etiquette (backend spec section 9): declared User-Agent with a contact
 * address from the EDGAR_CONTACT environment variable (never hardcoded),
 * sequential requests with a delay, no crawling: one companyfacts call per
 * company plus the ticker index.
 *
 * Usage: EDGAR_CONTACT=you@example.com node tools/generate-fixtures.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

const CONTACT = process.env.EDGAR_CONTACT;
if (!CONTACT || !CONTACT.includes('@')) {
  console.error('Set EDGAR_CONTACT to a contact email address (SEC fair-access requirement).');
  process.exit(1);
}
const USER_AGENT = `Plainsight golden-fixture generator (${CONTACT})`;

const DELAY_MS = 600; // ~1.7 requests/second, under the 2 rps etiquette ceiling
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate' },
      signal: AbortSignal.timeout(60_000)
    });
    if (response.ok) return response.json();
    if (attempt >= 3) throw new Error(`${url}: HTTP ${response.status} after ${attempt} attempts`);
    await sleep(DELAY_MS * 2 ** attempt);
  }
}

/**
 * Per-company configuration. `fys` matches the pinned corpus depth (10 for the
 * sample-set companies, 6 elsewhere). Prices are fixture prices chosen to
 * exercise the valuation metrics; they are NOT verified market data and the
 * fixture labels them as such.
 */
const COMPANIES = [
  { ticker: 'AAPL', name: 'Apple', exchange: 'NASDAQ', fys: 10, priceMinor: 27_000 },
  { ticker: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', fys: 6, priceMinor: 50_000 },
  {
    ticker: 'KO',
    name: 'Coca-Cola',
    exchange: 'NYSE',
    fys: 10,
    priceMinor: 7_000,
    notes: [
      'Coca-Cola presents no total-liabilities line on its balance sheet (and tags no us-gaap:Liabilities), so totalLiabilities stays absent: the balance gate is not applicable and, under N3, market cap has no complete FY to anchor on. Recorded for owner review.'
    ]
  },
  {
    ticker: 'COST',
    name: 'Costco',
    exchange: 'NASDAQ',
    fys: 10,
    priceMinor: 100_000,
    exclude: ['grossProfit'],
    notes: [
      'Costco prints no gross-profit line (membership fees sit inside total revenue); the one-off GrossProfit XBRL tag in the FY2019 filing uses a net-sales basis and is excluded so M1 stays on the derived, consistent basis (P-8).'
    ]
  },
  { ticker: 'UNP', name: 'Union Pacific', exchange: 'NYSE', fys: 6, priceMinor: 24_000 }
];

const PRICE_AS_OF = '2026-07-10';

/**
 * Concept mapping: canonical item -> ordered candidate us-gaap concepts
 * ('first' picks the first candidate reporting the period) or a sum of
 * component groups (each group first-match; optional groups contribute 0).
 * Reviewed against what each company actually files; the generator prints the
 * concept used per item per year so the mapping stays auditable.
 */
const GENERIC_MAPPING = {
  revenue: {
    kind: 'first',
    concepts: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet'
    ]
  },
  costOfRevenue: {
    kind: 'first',
    concepts: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold', 'CostOfSales'],
    optional: true
  },
  grossProfit: { kind: 'first', concepts: ['GrossProfit'], optional: true },
  operatingIncome: { kind: 'first', concepts: ['OperatingIncomeLoss'] },
  interestExpense: {
    kind: 'first',
    concepts: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt'],
    optional: true
  },
  pretaxIncome: {
    kind: 'first',
    concepts: [
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomesticAndForeign'
    ]
  },
  taxExpense: { kind: 'first', concepts: ['IncomeTaxExpenseBenefit'] },
  netIncome: { kind: 'first', concepts: ['NetIncomeLoss'] },
  dilutedShares: {
    kind: 'first',
    concepts: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
    unit: 'shares'
  },
  cashAndEquivalents: {
    kind: 'sum',
    groups: [
      { concepts: ['CashAndCashEquivalentsAtCarryingValue'], optional: false },
      {
        concepts: [
          'ShortTermInvestments',
          'MarketableSecuritiesCurrent',
          'AvailableForSaleSecuritiesCurrent',
          'AvailableForSaleSecuritiesDebtSecuritiesCurrent'
        ],
        optional: true
      }
    ]
  },
  currentAssets: { kind: 'first', concepts: ['AssetsCurrent'] },
  totalAssets: { kind: 'first', concepts: ['Assets'] },
  currentLiabilities: { kind: 'first', concepts: ['LiabilitiesCurrent'] },
  shortTermDebt: {
    kind: 'sum',
    groups: [
      { concepts: ['CommercialPaper', 'ShortTermBorrowings', 'OtherShortTermBorrowings'], optional: true, sumAll: true },
      {
        concepts: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent', 'SecuredDebtCurrent'],
        optional: true
      }
    ],
    preferSingle: ['DebtCurrent']
  },
  longTermDebt: {
    kind: 'first',
    concepts: [
      'LongTermDebtNoncurrent',
      // Union Pacific tags its "Debt due after one year" line this way before
      // FY2023; the noncurrent-only semantics match (current portion is tagged
      // separately and lands in shortTermDebt).
      'LongTermDebtAndCapitalLeaseObligations'
    ]
  },
  totalLiabilities: { kind: 'first', concepts: ['Liabilities'] },
  totalEquity: {
    kind: 'first',
    concepts: [
      // Prefer the including-NCI total: it is the figure that makes the P-2
      // balance gate hold (assets = liabilities + equity) for filers with
      // noncontrolling interests (KO, early COST). Recorded as an
      // interpretation note in the fixture README.
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
      'StockholdersEquity'
    ]
  },
  operatingCashFlow: {
    kind: 'first',
    concepts: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'
    ]
  },
  capex: { kind: 'first', concepts: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'] },
  depreciationAmortisation: {
    kind: 'first',
    concepts: ['DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'Depreciation'],
    optional: true
  },
  dividendsPaid: {
    kind: 'first',
    concepts: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'],
    optional: true
  },
  shareRepurchases: { kind: 'first', concepts: ['PaymentsForRepurchaseOfCommonStock'], optional: true }
};

const DURATION_ITEMS = new Set([
  'revenue',
  'costOfRevenue',
  'grossProfit',
  'operatingIncome',
  'interestExpense',
  'pretaxIncome',
  'taxExpense',
  'netIncome',
  'dilutedShares',
  'operatingCashFlow',
  'capex',
  'depreciationAmortisation',
  'dividendsPaid',
  'shareRepurchases'
]);

/**
 * Items the fixtures assert as "not reported -> 0" for specific companies and
 * years, with the rationale recorded in the fixture notes. Apple stopped
 * disclosing interest expense from FY2023 (folded into other income/expense as
 * immaterial); the user-facing entry flow would assert the known-zero state.
 */
const ZERO_ASSERTIONS = {
  AAPL: { interestExpense: { fromFyYear: 2023, note: 'Apple stopped disclosing interest expense from FY2023; asserted not-reported-zero as the entry flow would.' } }
};

// ---------------------------------------------------------------------------
// Fact selection: annual, as-originally-reported.
// ---------------------------------------------------------------------------

const dayspan = (start, end) => (new Date(end) - new Date(start)) / 86_400_000;

/**
 * All annual facts for one concept, keyed by period end date, taking the value
 * from the EARLIEST 10-K that reported the period (as-originally-reported
 * policy, recorded in the fixture meta). Facts from 10-K/A amendments are used
 * only when no original 10-K carries the period.
 */
function annualFactsByEnd(conceptData, { duration, unit }) {
  const units = conceptData?.units?.[unit];
  if (!units) return new Map();
  const byEnd = new Map();
  for (const fact of units) {
    if (fact.form !== '10-K' && fact.form !== '10-K/A') continue;
    if (duration) {
      if (!fact.start || !fact.end) continue;
      const days = dayspan(fact.start, fact.end);
      if (days < 300 || days > 400) continue;
    } else if (!fact.end || fact.start) {
      continue;
    }
    const existing = byEnd.get(fact.end);
    const rank = (f) => `${f.form === '10-K' ? 0 : 1}:${f.filed}`;
    if (!existing || rank(fact) < rank(existing)) {
      byEnd.set(fact.end, fact);
    }
  }
  return byEnd;
}

function resolveFirst(facts, spec, end, unit) {
  for (const concept of spec.concepts) {
    const fact = annualFactsByEnd(facts[concept], {
      duration: spec.duration,
      unit: spec.unit ?? unit
    }).get(end);
    if (fact !== undefined) return { fact, concept };
  }
  return null;
}

function resolveItem(facts, itemId, spec, end) {
  const duration = DURATION_ITEMS.has(itemId);
  if (spec.kind === 'first') {
    const resolved = resolveFirst(facts, { ...spec, duration }, end, 'USD');
    if (resolved === null) return null;
    return { valueUsd: resolved.fact.val, concepts: [resolved.concept], accn: resolved.fact.accn, filed: resolved.fact.filed };
  }

  // 'sum' spec, with an optional single-concept preference.
  if (spec.preferSingle) {
    const single = resolveFirst(facts, { concepts: spec.preferSingle, duration }, end, 'USD');
    if (single !== null) {
      return { valueUsd: single.fact.val, concepts: [single.concept], accn: single.fact.accn, filed: single.fact.filed };
    }
  }
  let total = 0;
  const used = [];
  let accn = null;
  let filed = null;
  let anyFound = false;
  for (const group of spec.groups) {
    if (group.sumAll) {
      for (const concept of group.concepts) {
        const fact = annualFactsByEnd(facts[concept], { duration, unit: 'USD' }).get(end);
        if (fact !== undefined) {
          total += fact.val;
          used.push(concept);
          accn ??= fact.accn;
          filed ??= fact.filed;
          anyFound = true;
        }
      }
      continue;
    }
    const resolved = resolveFirst(facts, { concepts: group.concepts, duration }, end, 'USD');
    if (resolved !== null) {
      total += resolved.fact.val;
      used.push(resolved.concept);
      accn ??= resolved.fact.accn;
      filed ??= resolved.fact.filed;
      anyFound = true;
    } else if (!group.optional) {
      return null;
    }
  }
  if (!anyFound) return null;
  return { valueUsd: total, concepts: used, accn, filed };
}

function toMinor(valueUsd, context) {
  const minor = Math.round(valueUsd * 100);
  if (Math.abs(valueUsd * 100 - minor) > 0.501) {
    throw new Error(`${context}: value ${valueUsd} is not a clean cent amount`);
  }
  if (!Number.isSafeInteger(minor)) throw new Error(`${context}: ${valueUsd} exceeds safe integer minor units`);
  return minor;
}

// ---------------------------------------------------------------------------
// Independent expected-value computation (floats over dollars; NOT the engine).
// ---------------------------------------------------------------------------

const MINUS = '−';

function fixed(value, dp) {
  let text = value.toFixed(dp);
  if (Number(text) === 0) text = (0).toFixed(dp);
  return text.startsWith('-') ? MINUS + text.slice(1) : text;
}
const pct = (fraction) => `${fixed(fraction * 100, 1)}%`;
const ratio = (value) => fixed(value, 2);
const coverage = (value) => `${fixed(value, 1)}×`;

function moneyCompact(minor, symbol = '$') {
  const major = minor / 100;
  const abs = Math.abs(major);
  if (abs === 0) return `${symbol}0`;
  const sign = major < 0 ? MINUS : '';
  const rounded = Number(abs.toPrecision(3));
  const parts = [
    [1e12, 't'],
    [1e9, 'b'],
    [1e6, 'm'],
    [1e3, 'k']
  ];
  let scaled = rounded;
  let suffix = '';
  for (const [divisor, s] of parts) {
    if (rounded >= divisor) {
      scaled = rounded / divisor;
      suffix = s;
      break;
    }
  }
  if (scaled >= 1000) return `${sign}${symbol}${Math.round(scaled)}t`;
  return `${sign}${symbol}${scaled.toPrecision(3)}${suffix}`;
}

const okDisplay = (display, basis) => (basis ? { status: 'ok', display, basis } : { status: 'ok', display });
const nm = (reason) => ({ status: 'not_meaningful', reason });
const insufficient = (missing) => ({ status: 'insufficient_data', missing });

const V = (year, id) => {
  const entry = year.values[id];
  if (entry === undefined) return undefined;
  return entry.kind === 'not_reported_zero' ? 0 : entry.amountMinor / 100;
};
const has = (year, id) => year.values[id] !== undefined;

const BALANCE_CORE = [
  'cashAndEquivalents',
  'currentAssets',
  'totalAssets',
  'currentLiabilities',
  'shortTermDebt',
  'longTermDebt',
  'totalLiabilities',
  'totalEquity'
];
const INCOME_CORE = [
  'revenue',
  'costOfRevenue',
  'operatingIncome',
  'interestExpense',
  'pretaxIncome',
  'taxExpense',
  'netIncome',
  'dilutedShares'
];
const CASHFLOW_CORE = ['operatingCashFlow', 'capex'];

const balanceComplete = (year) => BALANCE_CORE.every((id) => has(year, id));
const fullComplete = (year) => [...INCOME_CORE, ...BALANCE_CORE, ...CASHFLOW_CORE].every((id) => has(year, id));

const REQUIREMENTS = {
  M2: ['revenue', 'operatingIncome'],
  M3: ['revenue', 'netIncome'],
  M4: ['netIncome', 'totalEquity'],
  M5: ['operatingIncome', 'taxExpense', 'pretaxIncome', 'shortTermDebt', 'longTermDebt', 'totalEquity', 'cashAndEquivalents'],
  M6: ['shortTermDebt', 'longTermDebt', 'totalEquity'],
  M7: ['currentAssets', 'currentLiabilities'],
  M8: ['operatingIncome', 'interestExpense'],
  M9: ['operatingCashFlow', 'capex'],
  M10: ['operatingCashFlow', 'capex', 'revenue'],
  M11: ['operatingCashFlow', 'capex', 'netIncome'],
  M12: ['netIncome', 'dilutedShares'],
  M13: ['netIncome', 'dilutedShares'],
  M14: ['operatingCashFlow', 'capex', 'dilutedShares']
};

function missingFor(metric, year) {
  if (metric === 'M1') {
    const missing = [];
    if (!has(year, 'revenue')) missing.push('revenue');
    if (!has(year, 'grossProfit') && !has(year, 'costOfRevenue')) missing.push('costOfRevenue');
    return missing;
  }
  return REQUIREMENTS[metric].filter((id) => !has(year, id));
}

function investedCapital(year) {
  return V(year, 'shortTermDebt') + V(year, 'longTermDebt') + V(year, 'totalEquity') - V(year, 'cashAndEquivalents');
}

/** Expected value for one metric in one year; mirrors the pinned dictionary independently. */
function expectedMetric(metric, year, prior, priceMinor) {
  if (metric === 'M12' || metric === 'M13' || metric === 'M14') {
    if (priceMinor === undefined) return nm('no_price');
  }
  const missing = missingFor(metric, year);
  if (missing.length > 0) return insufficient(missing);

  const priceUsd = priceMinor === undefined ? undefined : priceMinor / 100;
  switch (metric) {
    case 'M1': {
      const revenue = V(year, 'revenue');
      if (revenue === 0) return nm('zero_revenue');
      const gp = has(year, 'grossProfit') ? V(year, 'grossProfit') : V(year, 'revenue') - V(year, 'costOfRevenue');
      return okDisplay(pct(gp / revenue));
    }
    case 'M2': {
      const revenue = V(year, 'revenue');
      if (revenue === 0) return nm('zero_revenue');
      return okDisplay(pct(V(year, 'operatingIncome') / revenue));
    }
    case 'M3': {
      const revenue = V(year, 'revenue');
      if (revenue === 0) return nm('zero_revenue');
      return okDisplay(pct(V(year, 'netIncome') / revenue));
    }
    case 'M4': {
      const average = prior !== undefined && balanceComplete(prior);
      const denom = average ? (V(year, 'totalEquity') + V(prior, 'totalEquity')) / 2 : V(year, 'totalEquity');
      if (denom <= 0) return nm('negative_equity');
      return okDisplay(pct(V(year, 'netIncome') / denom), average ? 'average' : 'ending');
    }
    case 'M5': {
      const pretax = V(year, 'pretaxIncome');
      const rate = pretax <= 0 ? 0 : Math.min(Math.max(V(year, 'taxExpense') / pretax, 0), 0.45);
      const nopat = V(year, 'operatingIncome') * (1 - rate);
      const average = prior !== undefined && balanceComplete(prior);
      const denom = average ? (investedCapital(year) + investedCapital(prior)) / 2 : investedCapital(year);
      if (denom <= 0) return nm('negative_invested_capital');
      return okDisplay(pct(nopat / denom), average ? 'average' : 'ending');
    }
    case 'M6': {
      const equity = V(year, 'totalEquity');
      if (equity <= 0) return nm('negative_equity');
      return okDisplay(ratio((V(year, 'shortTermDebt') + V(year, 'longTermDebt')) / equity));
    }
    case 'M7': {
      const cl = V(year, 'currentLiabilities');
      if (cl === 0) return nm('zero_denominator');
      return okDisplay(ratio(V(year, 'currentAssets') / cl));
    }
    case 'M8': {
      const interest = V(year, 'interestExpense');
      if (interest === 0) return nm('no_interest_expense');
      return okDisplay(coverage(V(year, 'operatingIncome') / interest));
    }
    case 'M9': {
      const fcfUsd = V(year, 'operatingCashFlow') - V(year, 'capex');
      return okDisplay(moneyCompact(Math.round(fcfUsd * 100)));
    }
    case 'M10': {
      const revenue = V(year, 'revenue');
      if (revenue === 0) return nm('zero_revenue');
      return okDisplay(pct((V(year, 'operatingCashFlow') - V(year, 'capex')) / revenue));
    }
    case 'M11': {
      const ni = V(year, 'netIncome');
      if (ni <= 0) return nm('negative_earnings');
      return okDisplay(pct((V(year, 'operatingCashFlow') - V(year, 'capex')) / ni));
    }
    case 'M12': {
      const shares = V(year, 'dilutedShares') * 100; // V() divides by 100; shares are counts
      if (shares === 0) return nm('zero_denominator');
      const epsUsd = V(year, 'netIncome') / shares; // dollars per share
      if (epsUsd <= 0) return nm('negative_earnings');
      return okDisplay(ratio(priceUsd / epsUsd));
    }
    case 'M13': {
      const shares = V(year, 'dilutedShares') * 100;
      if (shares === 0 || priceUsd === 0) return nm('zero_denominator');
      const epsUsd = V(year, 'netIncome') / shares;
      if (epsUsd <= 0) return nm('negative_earnings');
      return okDisplay(pct(epsUsd / priceUsd));
    }
    case 'M14': {
      const shares = V(year, 'dilutedShares') * 100;
      const marketCapUsd = priceUsd * shares;
      if (marketCapUsd === 0) return nm('zero_denominator');
      const fcfUsd = V(year, 'operatingCashFlow') - V(year, 'capex');
      return okDisplay(pct(fcfUsd / marketCapUsd));
    }
    default:
      throw new Error(`unknown metric ${metric}`);
  }
}

// Independent rule evaluation; same interpretation notes as the engine docs.
function expectedFlags(years) {
  const flags = [];
  const byYear = new Map(years.map((y) => [Number(y.fy.slice(2)), y]));
  const latest = years.at(-1);
  if (latest === undefined) return flags;
  const latestY = Number(latest.fy.slice(2));

  const win = (count) => {
    const out = [];
    for (let y = latestY - count + 1; y <= latestY; y += 1) {
      const yr = byYear.get(y);
      if (yr === undefined) return null;
      out.push(yr);
    }
    return out;
  };
  const vals = (window, id) => {
    const out = [];
    for (const yr of window) {
      const v = V(yr, id);
      if (v === undefined) return null;
      out.push(v);
    }
    return out;
  };
  const labels = (window) => window.map((y) => y.fy);
  const EPS = 1e-9;

  // R1
  {
    const window = win(3);
    if (window) {
      const ocf = vals(window, 'operatingCashFlow');
      const ni = vals(window, 'netIncome');
      if (ocf && ni && ocf.every((v, i) => v < ni[i])) {
        const cumOcf = ocf.reduce((a, b) => a + b, 0);
        const cumNi = ni.reduce((a, b) => a + b, 0);
        if (cumNi > 0 && cumOcf / cumNi < 0.9 - EPS) {
          flags.push({ ruleId: 'R1', severity: 'orange', window: labels(window) });
        }
      }
    }
  }

  // R2: margins from raw values.
  {
    const marginOf = (yr, kind) => {
      const revenue = V(yr, 'revenue');
      if (revenue === undefined || revenue === 0) return null;
      if (kind === 'gross') {
        const gp = has(yr, 'grossProfit')
          ? V(yr, 'grossProfit')
          : has(yr, 'costOfRevenue')
            ? revenue - V(yr, 'costOfRevenue')
            : null;
        return gp === null ? null : gp / revenue;
      }
      const oi = V(yr, 'operatingIncome');
      return oi === undefined ? null : oi / revenue;
    };
    const streaks = [];
    for (const kind of ['gross', 'operating']) {
      let steps = 0;
      let cursor = latestY;
      let firstLabelYear = latestY;
      for (;;) {
        const current = byYear.get(cursor);
        const prior = byYear.get(cursor - 1);
        if (!current || !prior) break;
        const cv = marginOf(current, kind);
        const pv = marginOf(prior, kind);
        if (cv === null || pv === null) break;
        if (!(cv < pv - EPS)) break;
        steps += 1;
        firstLabelYear = cursor - 1;
        cursor -= 1;
      }
      if (steps > 0) {
        const from = marginOf(byYear.get(firstLabelYear), kind);
        const to = marginOf(latest, kind);
        if (steps >= 3 && from - to >= 0.02 - EPS) {
          streaks.push({ steps, firstLabelYear });
        }
      }
    }
    if (streaks.length > 0) {
      streaks.sort((a, b) => b.steps - a.steps);
      const worst = streaks[0];
      const window = [];
      for (let y = worst.firstLabelYear; y <= latestY; y += 1) window.push(byYear.get(y).fy);
      flags.push({ ruleId: 'R2', severity: worst.steps >= 5 ? 'red' : 'orange', window });
    }
  }

  // Ratio helpers over raw values for R3..R7.
  const deOf = (yr) => {
    const equity = V(yr, 'totalEquity');
    const std = V(yr, 'shortTermDebt');
    const ltd = V(yr, 'longTermDebt');
    if (equity === undefined || std === undefined || ltd === undefined || equity <= 0) return null;
    return (std + ltd) / equity;
  };
  const roeOf = (yr, prior) => {
    const ni = V(yr, 'netIncome');
    const equity = V(yr, 'totalEquity');
    if (ni === undefined || equity === undefined) return null;
    const average = prior !== undefined && balanceComplete(prior);
    const denom = average ? (equity + V(prior, 'totalEquity')) / 2 : equity;
    return denom <= 0 ? null : ni / denom;
  };

  // R3
  {
    const window = win(4);
    if (window) {
      const [first, , , last] = window;
      const firstPrior = byYear.get(Number(first.fy.slice(2)) - 1);
      const lastPrior = byYear.get(latestY - 1);
      const deStart = deOf(first);
      const deEnd = deOf(last);
      const roeStart = roeOf(first, firstPrior);
      const roeEnd = roeOf(last, lastPrior);
      if (deStart !== null && deEnd !== null && roeStart !== null && roeEnd !== null) {
        if (deEnd - deStart >= 0.3 - EPS && roeEnd - roeStart <= 0.01 + EPS) {
          flags.push({ ruleId: 'R3', severity: 'orange', window: labels(window) });
        }
      }
    }
  }

  // R4
  {
    const interest = V(latest, 'interestExpense');
    const oi = V(latest, 'operatingIncome');
    if (interest !== undefined && interest !== 0 && oi !== undefined) {
      const cov = oi / interest;
      if (cov < 3.0 - EPS) {
        flags.push({ ruleId: 'R4', severity: cov < 1.5 - EPS ? 'red' : 'orange', window: [latest.fy] });
      }
    }
  }

  // R5
  {
    const window = win(4);
    if (window) {
      const shares = vals(window, 'dilutedShares');
      const revenue = vals(window, 'revenue');
      if (shares && revenue && shares[0] > 0 && shares.at(-1) > 0 && revenue[0] > 0 && revenue.at(-1) > 0) {
        const shareCagr = (shares.at(-1) / shares[0]) ** (1 / 3) - 1;
        const revenueCagr = (revenue.at(-1) / revenue[0]) ** (1 / 3) - 1;
        if (shareCagr > 0.02 + EPS && revenueCagr < 2 * shareCagr - EPS) {
          flags.push({ ruleId: 'R5', severity: 'orange', window: labels(window) });
        }
      }
    }
  }

  // R6
  {
    const prior = byYear.get(latestY - 1);
    const roe = roeOf(latest, prior);
    const de = deOf(latest);
    if (roe !== null && de !== null && roe > 0.25 + EPS && de > 2.0 + EPS) {
      flags.push({ ruleId: 'R6', severity: 'orange', window: [latest.fy] });
    }
  }

  // R7
  {
    const window = win(3);
    if (window) {
      const revenue = vals(window, 'revenue');
      const ocf = vals(window, 'operatingCashFlow');
      const capex = vals(window, 'capex');
      if (revenue && ocf && capex) {
        const fcf = ocf.map((v, i) => v - capex[i]);
        let fires = true;
        for (let i = 1; i < window.length; i += 1) {
          if (!(revenue[i] > revenue[i - 1] && fcf[i] < fcf[i - 1])) fires = false;
        }
        if (fires) flags.push({ ruleId: 'R7', severity: 'orange', window: labels(window) });
      }
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const METRIC_IDS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13', 'M14'];

async function main() {
  console.log('Resolving CIKs from the SEC ticker index...');
  const tickerIndex = await fetchJson('https://www.sec.gov/files/company_tickers.json');
  const cikByTicker = new Map(
    Object.values(tickerIndex).map((row) => [row.ticker, String(row.cik_str).padStart(10, '0')])
  );

  await mkdir(OUT_DIR, { recursive: true });

  for (const company of COMPANIES) {
    await sleep(DELAY_MS);
    const cik = cikByTicker.get(company.ticker);
    if (!cik) throw new Error(`${company.ticker}: not in the SEC ticker index`);
    console.log(`\n=== ${company.ticker} (CIK ${cik}) ===`);
    const companyfacts = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    const facts = companyfacts.facts?.['us-gaap'];
    if (!facts) throw new Error(`${company.ticker}: no us-gaap facts`);

    // Anchor the FY set on net income annual durations.
    const anchor = annualFactsByEnd(facts.NetIncomeLoss, { duration: true, unit: 'USD' });
    const ends = [...anchor.keys()].sort().slice(-company.fys);
    if (ends.length < company.fys) {
      throw new Error(`${company.ticker}: only ${ends.length} annual periods found, need ${company.fys}`);
    }
    console.log(`Fiscal years: ${ends[0]} .. ${ends.at(-1)} (${ends.length})`);

    const notes = [...(company.notes ?? [])];
    const mappingUsed = {};
    const years = [];
    for (const end of ends) {
      const fyYear = Number(end.slice(0, 4));
      const fy = `FY${fyYear}`;
      const values = {};
      const accessions = new Set();
      for (const [itemId, spec] of Object.entries(GENERIC_MAPPING)) {
        if (company.exclude?.includes(itemId)) continue;
        const zeroAssertion = ZERO_ASSERTIONS[company.ticker]?.[itemId];
        if (zeroAssertion && fyYear >= zeroAssertion.fromFyYear) {
          values[itemId] = { kind: 'not_reported_zero' };
          continue;
        }
        const resolved = resolveItem(facts, itemId, spec, end);
        if (resolved === null) {
          if (!spec.optional) {
            console.log(`  MISSING ${fy} ${itemId}`);
          }
          continue;
        }
        const isShares = itemId === 'dilutedShares';
        const amountMinor = isShares ? Math.round(resolved.valueUsd) : toMinor(resolved.valueUsd, `${fy} ${itemId}`);
        values[itemId] = { kind: 'entered', amountMinor };
        accessions.add(resolved.accn);
        const key = resolved.concepts.join('+');
        mappingUsed[itemId] ??= new Set();
        mappingUsed[itemId].add(key);
      }
      years.push({
        fy,
        endDate: end,
        currency: 'USD',
        entryScale: 'millions',
        values,
        sourceRef: { system: 'EDGAR', accessions: [...accessions].sort() }
      });
    }

    for (const [ticker, items] of Object.entries(ZERO_ASSERTIONS)) {
      if (ticker !== company.ticker) continue;
      for (const assertion of Object.values(items)) notes.push(assertion.note);
    }

    // Generator-side validation: the balance identity must hold on every year.
    for (const year of years) {
      const a = V(year, 'totalAssets');
      const l = V(year, 'totalLiabilities');
      const e = V(year, 'totalEquity');
      if (a === undefined || l === undefined || e === undefined) {
        console.log(`  WARN ${year.fy}: balance identity unchecked (missing totals)`);
        continue;
      }
      const diff = Math.abs(a - (l + e));
      const tolerance = Math.max(3_000_000, 0.001 * Math.max(a, l + e)); // 3 units at millions scale, in dollars
      if (diff > tolerance) {
        throw new Error(`${company.ticker} ${year.fy}: balance identity off by $${diff.toLocaleString()} (tolerance $${Math.round(tolerance).toLocaleString()})`);
      }
    }

    // Expected metrics and flags, computed independently of the engine.
    const expectedMetrics = {};
    for (const metric of METRIC_IDS) {
      expectedMetrics[metric] = {};
      for (let i = 0; i < years.length; i += 1) {
        const prior = i > 0 && Number(years[i].fy.slice(2)) - Number(years[i - 1].fy.slice(2)) === 1 ? years[i - 1] : undefined;
        expectedMetrics[metric][years[i].fy] = expectedMetric(metric, years[i], prior, company.priceMinor);
      }
    }

    const fixture = {
      meta: {
        name: company.name,
        ticker: company.ticker,
        exchange: company.exchange,
        cik,
        edgarEntityName: companyfacts.entityName,
        currency: 'USD',
        source: 'SEC EDGAR companyfacts (XBRL)',
        selectionPolicy:
          'Annual periods from 10-K filings, as-originally-reported: each period takes its value from the earliest 10-K reporting it; 10-K/A only where no original exists.',
        generatedAt: new Date().toISOString(),
        mapping: Object.fromEntries(Object.entries(mappingUsed).map(([k, v]) => [k, [...v].sort()])),
        notes
      },
      price: {
        amountMinor: company.priceMinor,
        currency: 'USD',
        asOf: PRICE_AS_OF,
        note: 'Fixture price chosen to exercise the valuation metrics; not verified market data.'
      },
      years,
      expected: { metrics: expectedMetrics, flags: expectedFlags(years) }
    };

    const outPath = path.join(OUT_DIR, `${company.ticker.toLowerCase()}.json`);
    await writeFile(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`Wrote ${outPath}`);
    console.log(`Flags expected: ${fixture.expected.flags.map((f) => `${f.ruleId}(${f.severity})`).join(', ') || 'none'}`);
    const itemCounts = years.map((y) => Object.keys(y.values).length);
    console.log(`Items per year: ${itemCounts.join(', ')}`);
  }
  console.log('\nDone.');
}

await main();
