#!/usr/bin/env node
/**
 * ASX golden fixture builder (data-model spec section 11, the Phase 2.5
 * corpus): turns a hand-typed transcription (fixtures/transcriptions/*.mjs)
 * into a fixture JSON of the same shape as the EDGAR-generated ones, with
 * the expected metrics and flags computed by the shared independent
 * implementation (tools/lib/expected.mjs; never the engine).
 *
 * The builder is also the transcription's checker. Before writing anything
 * it verifies, per year: the balance identity and the gross-profit identity
 * within the pinned tolerance (the gross-profit check is skipped when the
 * filing prints no cost-of-sales or gross-profit line, the expenses-by-nature
 * case); netIncome ÷ dilutedShares reproduces the PRINTED diluted EPS at the
 * printed precision (which pins all three figures together); clean cent
 * conversion; and safe-integer minor units.
 *
 * Transcription vocabulary beyond plain printed numbers:
 * - a value of 'nrz' marks a line the filing does not print, entered as the
 *   not-reported-zero state (a printed dash is a printed nil: enter 0);
 * - eps.unit is 'cents' for filings that print EPS in cents ('dollars' when
 *   omitted), and meta.valuesDp is the decimal places of the printed
 *   millions (default 1), which sets the net-income print-rounding grain;
 * - year.sharesDisclosedTo (in shares) widens the checksum by the share
 *   count's disclosure grain when the note rounds the denominator (JB Hi-Fi
 *   discloses to 0.1 million; Wesfarmers to whole millions);
 * - eps.printSlack (printed EPS units) is an explicit, documented allowance
 *   for a filing whose own printed figures do not reconcile; it requires
 *   eps.slackNote and the residual is reported at build time.
 *
 * Usage: node tools/build-asx-fixture.mjs csl
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expectedFlags, expectedMetricsFor } from './lib/expected.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, '..', 'fixtures');

const name = process.argv[2];
if (!name) {
  console.error('Usage: node tools/build-asx-fixture.mjs <transcription name, e.g. csl>');
  process.exit(1);
}
const transcriptionModule = await import(
  path.join(FIXTURES_DIR, 'transcriptions', `${name}.mjs`)
);
const company = Object.values(transcriptionModule)[0];

/** US$m (or A$m) printed figure to integer minor units: millions x 100 cents. */
function millionsToMinor(valueMillions, context) {
  const minor = Math.round(valueMillions * 1e8);
  if (Math.abs(valueMillions * 1e8 - minor) > 0.01) {
    throw new Error(`${context}: ${valueMillions} is not clean at printed precision`);
  }
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`${context}: ${valueMillions} exceeds safe integer minor units`);
  }
  return minor;
}

const failures = [];
const valuesDp = company.meta.valuesDp ?? 1;
const years = company.years.map((year) => {
  const values = {};
  for (const [itemId, printed] of Object.entries(year.values)) {
    if (printed === 'nrz') {
      values[itemId] = { kind: 'not_reported_zero' };
      continue;
    }
    const amountMinor =
      itemId === 'dilutedShares'
        ? printed
        : millionsToMinor(printed, `${year.fy} ${itemId}`);
    if (!Number.isSafeInteger(amountMinor)) {
      failures.push(`${year.fy} ${itemId}: not a safe integer`);
    }
    values[itemId] = { kind: 'entered', amountMinor };
  }

  // Printed value in millions for the identity checks, with the
  // not-reported-zero sentinel resolving to 0 (its meaning in sums).
  const pv = (itemId) => (year.values[itemId] === 'nrz' ? 0 : year.values[itemId]);

  // Identity gates at the pinned tolerance: max(3 units at millions scale,
  // 0.1% of the larger side), in printed millions here.
  const tolerance = (larger) => Math.max(3, 0.001 * Math.abs(larger));
  const totalAssets = pv('totalAssets');
  const liabilitiesPlusEquity = pv('totalLiabilities') + pv('totalEquity');
  const balanceDiff = Math.abs(totalAssets - liabilitiesPlusEquity);
  if (balanceDiff > tolerance(Math.max(totalAssets, liabilitiesPlusEquity))) {
    failures.push(`${year.fy}: balance identity off by ${balanceDiff.toFixed(1)}m`);
  }
  if (year.values.costOfRevenue !== undefined && year.values.grossProfit !== undefined) {
    const grossProfit = pv('grossProfit');
    const derivedGp = pv('revenue') - pv('costOfRevenue');
    if (Math.abs(grossProfit - derivedGp) > tolerance(Math.max(grossProfit, derivedGp))) {
      failures.push(`${year.fy}: gross profit ${grossProfit} vs derived ${derivedGp.toFixed(1)}`);
    }
  }

  // The printed-EPS checksum pins netIncome, dilutedShares, and the
  // transcription of both: net income in millions x 1e6 over the share
  // count, in the printed unit. The filing computes EPS from unrounded
  // figures while the face prints rounded millions, so the tolerance
  // carries the print-rounding grains on top of the EPS print rounding:
  // net income to half its printed decimal, the share count to its
  // disclosure grain where the note rounds it, plus any documented
  // print slack (see the header).
  const unitFactor = (year.eps.unit ?? 'dollars') === 'cents' ? 100 : 1;
  const dilutedShares = year.values.dilutedShares;
  const computedEps = (pv('netIncome') * 1e6 * unitFactor) / dilutedShares;
  const printSlack = year.eps.printSlack ?? 0;
  if (printSlack > 0 && !year.eps.slackNote) {
    failures.push(`${year.fy}: eps.printSlack requires eps.slackNote`);
  }
  const epsTolerance =
    0.5 * 10 ** -year.eps.dp +
    (0.5 * 10 ** -valuesDp * 1e6 * unitFactor) / dilutedShares +
    (Math.abs(year.eps.diluted) * (year.sharesDisclosedTo ?? 0)) / dilutedShares +
    printSlack;
  const epsResidual = Math.abs(computedEps - year.eps.diluted);
  if (epsResidual > epsTolerance) {
    failures.push(
      `${year.fy}: diluted EPS computes to ${computedEps.toFixed(year.eps.dp + 1)}, printed ${year.eps.diluted}`
    );
  } else if (printSlack > 0) {
    console.log(
      `${year.fy}: printed EPS residual ${epsResidual.toFixed(year.eps.dp + 2)} against slack ${printSlack} (${year.eps.slackNote})`
    );
  }

  return {
    fy: year.fy,
    endDate: year.endDate,
    currency: company.meta.currency,
    entryScale: 'millions',
    values,
    sourceRef: {
      system: 'ASX_MAP',
      document: year.document,
      title: company.meta.documents[year.document].title,
      printedPages: year.pages
    }
  };
});

if (failures.length > 0) {
  console.error('Transcription checks failed:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

const fixture = {
  meta: {
    name: company.meta.name,
    ticker: company.meta.ticker,
    exchange: company.meta.exchange,
    currency: company.meta.currency,
    source: company.meta.source,
    selectionPolicy: company.meta.selectionPolicy,
    documents: company.meta.documents,
    generatedAt: new Date().toISOString(),
    notes: company.meta.notes
  },
  price: company.price,
  years,
  expected: {
    metrics: expectedMetricsFor(years, company.price.amountMinor),
    flags: expectedFlags(years)
  }
};

const outPath = path.join(FIXTURES_DIR, `${company.meta.ticker.toLowerCase()}.json`);
await writeFile(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
console.log(`Years: ${years.map((year) => year.fy).join(', ')}`);
console.log(
  `Flags expected: ${fixture.expected.flags.map((flag) => `${flag.ruleId}(${flag.severity})`).join(', ') || 'none'}`
);
