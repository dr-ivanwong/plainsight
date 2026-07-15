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

import { expectedFlags, expectedMetricsFor, V } from './lib/expected.mjs';

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
      'Coca-Cola presents no total-liabilities line on its balance sheet (and tags no us-gaap:Liabilities), so totalLiabilities stays absent: the balance gate is not applicable and, market cap being defined off the latest complete FY, it has no year to anchor on. Recorded for owner review.'
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
      'Costco prints no gross-profit line (membership fees sit inside total revenue); the one-off GrossProfit XBRL tag in the FY2019 filing uses a net-sales basis and is excluded so gross margin stays on the derived, consistent basis (as-reported precedence).'
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
      // Prefer the including-NCI total: it is the figure that makes the
      // balance gate hold within tolerance (assets = liabilities + equity)
      // for filers with noncontrolling interests (KO, early COST). Recorded
      // as an interpretation note in the fixture README.
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
 * disclosing interest expense from FY2024 (folded into other income/expense as
 * immaterial); the user-facing entry flow would assert the known-zero state.
 * (Originally asserted from FY2023; the Phase 2 mapping golden cross-check
 * found the FY2023 10-K still tags us-gaap:InterestExpense, 3,933 USD million,
 * despite the changed income-statement presentation, so FY2023 is entered as
 * filed. Corrected 2026-07-12.)
 */
const ZERO_ASSERTIONS = {
  AAPL: { interestExpense: { fromFyYear: 2024, note: 'Apple stopped disclosing interest expense from FY2024 (the FY2023 10-K still tags it in the notes); asserted not-reported-zero from FY2024 as the entry flow would.' } }
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
// The independent expected-value computation lives in lib/expected.mjs,
// shared with the ASX fixture builder.
// ---------------------------------------------------------------------------

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
    const expectedMetrics = expectedMetricsFor(years, company.priceMinor);

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
