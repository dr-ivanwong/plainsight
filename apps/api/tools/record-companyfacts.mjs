#!/usr/bin/env node
/**
 * Records pruned EDGAR companyfacts documents as test fixtures for the mapping
 * golden tests (test/mapping.golden.test.ts): the same five companies as the
 * calc-engine golden corpus, reduced to exactly the mapping's field of view so
 * the fixtures stay small enough to commit.
 *
 * Pruning keeps: the top-level identity (cik, entityName), every concept the
 * mapping can consult (KEPT_CONCEPTS below; a test asserts this list covers
 * the mapping's candidates, so widening the mapping forces re-recording), and
 * within each concept only 10-K and 10-K/A facts with the six fields the
 * selection policy reads. Everything the mapping can never see is dropped;
 * nothing it can see is altered.
 *
 * EDGAR etiquette (backend spec section 9): declared User-Agent with a contact
 * address from the EDGAR_CONTACT environment variable (never hardcoded),
 * sequential requests with a delay, six requests total.
 *
 * Usage: EDGAR_CONTACT=you@example.com node tools/record-companyfacts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'companyfacts'
);

export const TICKERS = ['AAPL', 'MSFT', 'KO', 'COST', 'UNP'];

/**
 * Union of every candidate concept in src/edgar/mapping.ts, kept in the same
 * order as the mapping table for review. Plain Node cannot import the TS
 * source, so the list is duplicated here and pinned by a test instead.
 */
export const KEPT_CONCEPTS = [
  // revenue
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'SalesRevenueNet',
  'SalesRevenueGoodsNet',
  // costOfRevenue
  'CostOfGoodsAndServicesSold',
  'CostOfRevenue',
  'CostOfGoodsSold',
  'CostOfSales',
  // grossProfit
  'GrossProfit',
  // operatingIncome
  'OperatingIncomeLoss',
  // interestExpense
  'InterestExpense',
  'InterestExpenseNonoperating',
  'InterestExpenseDebt',
  // pretaxIncome
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomesticAndForeign',
  // taxExpense
  'IncomeTaxExpenseBenefit',
  // netIncome
  'NetIncomeLoss',
  // dilutedShares
  'WeightedAverageNumberOfDilutedSharesOutstanding',
  // cashAndEquivalents
  'CashAndCashEquivalentsAtCarryingValue',
  'ShortTermInvestments',
  'MarketableSecuritiesCurrent',
  'AvailableForSaleSecuritiesCurrent',
  'AvailableForSaleSecuritiesDebtSecuritiesCurrent',
  // currentAssets / totalAssets / currentLiabilities
  'AssetsCurrent',
  'Assets',
  'LiabilitiesCurrent',
  // shortTermDebt
  'DebtCurrent',
  'CommercialPaper',
  'ShortTermBorrowings',
  'OtherShortTermBorrowings',
  'LongTermDebtCurrent',
  'LongTermDebtAndCapitalLeaseObligationsCurrent',
  'SecuredDebtCurrent',
  // longTermDebt
  'LongTermDebtNoncurrent',
  'LongTermDebtAndCapitalLeaseObligations',
  // totalLiabilities
  'Liabilities',
  // totalEquity
  'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  'StockholdersEquity',
  // operatingCashFlow
  'NetCashProvidedByUsedInOperatingActivities',
  'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  // capex
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'PaymentsToAcquireProductiveAssets',
  // depreciationAmortisation
  'DepreciationDepletionAndAmortization',
  'DepreciationAmortizationAndAccretionNet',
  'Depreciation',
  // dividendsPaid
  'PaymentsOfDividends',
  'PaymentsOfDividendsCommonStock',
  // shareRepurchases
  'PaymentsForRepurchaseOfCommonStock'
];

/** Prunes one companyfacts document to the mapping's field of view. */
export function prune(companyfacts, recordedAt) {
  const usGaap = companyfacts.facts?.['us-gaap'] ?? {};
  const kept = {};
  for (const concept of KEPT_CONCEPTS) {
    const data = usGaap[concept];
    if (!data?.units) continue;
    const units = {};
    for (const [unit, facts] of Object.entries(data.units)) {
      const filtered = facts
        .filter((fact) => fact.form === '10-K' || fact.form === '10-K/A')
        .map(({ start, end, val, accn, form, filed }) =>
          start === undefined ? { end, val, accn, form, filed } : { start, end, val, accn, form, filed }
        );
      if (filtered.length > 0) units[unit] = filtered;
    }
    if (Object.keys(units).length > 0) kept[concept] = { units };
  }
  return {
    recorded: {
      at: recordedAt,
      note: 'Pruned EDGAR companyfacts: mapping-candidate concepts only, 10-K and 10-K/A facts only. Regenerate with tools/record-companyfacts.mjs.'
    },
    cik: companyfacts.cik,
    entityName: companyfacts.entityName,
    facts: { 'us-gaap': kept }
  };
}

const DELAY_MS = 600; // ~1.7 requests/second, under the 2 rps etiquette ceiling
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const contact = process.env.EDGAR_CONTACT;
  if (!contact || !contact.includes('@')) {
    console.error('Set EDGAR_CONTACT to a contact email address (SEC fair-access requirement).');
    process.exit(1);
  }
  const userAgent = `Plainsight mapping-fixture recorder (${contact})`;

  async function fetchJson(url) {
    for (let attempt = 1; ; attempt += 1) {
      const response = await fetch(url, {
        headers: { 'User-Agent': userAgent, 'Accept-Encoding': 'gzip, deflate' },
        signal: AbortSignal.timeout(60_000)
      });
      if (response.ok) return response.json();
      if (attempt >= 3) throw new Error(`${url}: HTTP ${response.status} after ${attempt} attempts`);
      await sleep(DELAY_MS * 2 ** attempt);
    }
  }

  console.log('Resolving CIKs from the SEC ticker index...');
  const tickerIndex = await fetchJson('https://www.sec.gov/files/company_tickers.json');
  const cikByTicker = new Map(
    Object.values(tickerIndex).map((row) => [row.ticker, String(row.cik_str).padStart(10, '0')])
  );

  await mkdir(OUT_DIR, { recursive: true });
  const recordedAt = new Date().toISOString();

  for (const ticker of TICKERS) {
    await sleep(DELAY_MS);
    const cik = cikByTicker.get(ticker);
    if (!cik) throw new Error(`${ticker}: not in the SEC ticker index`);
    console.log(`Recording ${ticker} (CIK ${cik})...`);
    const companyfacts = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    const pruned = prune(companyfacts, recordedAt);
    const outPath = path.join(OUT_DIR, `${ticker.toLowerCase()}.json`);
    await writeFile(outPath, `${JSON.stringify(pruned, null, 1)}\n`);
    const conceptCount = Object.keys(pruned.facts['us-gaap']).length;
    console.log(`  ${conceptCount} concepts kept -> ${outPath}`);
  }
  console.log('Done.');
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) await main();
