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
 * within the pinned tolerance; netIncome ÷ dilutedShares reproduces the
 * PRINTED diluted EPS at the printed precision (which pins all three figures
 * together); clean cent conversion; and safe-integer minor units.
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
const years = company.years.map((year) => {
  const values = {};
  for (const [itemId, printed] of Object.entries(year.values)) {
    const amountMinor =
      itemId === 'dilutedShares'
        ? printed
        : millionsToMinor(printed, `${year.fy} ${itemId}`);
    if (!Number.isSafeInteger(amountMinor)) {
      failures.push(`${year.fy} ${itemId}: not a safe integer`);
    }
    values[itemId] = { kind: 'entered', amountMinor };
  }

  // Identity gates at the pinned tolerance: max(3 units at millions scale,
  // 0.1% of the larger side), in printed millions here.
  const tolerance = (larger) => Math.max(3, 0.001 * Math.abs(larger));
  const { totalAssets, totalLiabilities, totalEquity, revenue, costOfRevenue, grossProfit } =
    year.values;
  const balanceDiff = Math.abs(totalAssets - (totalLiabilities + totalEquity));
  if (balanceDiff > tolerance(Math.max(totalAssets, totalLiabilities + totalEquity))) {
    failures.push(`${year.fy}: balance identity off by ${balanceDiff.toFixed(1)}m`);
  }
  const derivedGp = revenue - costOfRevenue;
  if (Math.abs(grossProfit - derivedGp) > tolerance(Math.max(grossProfit, derivedGp))) {
    failures.push(`${year.fy}: gross profit ${grossProfit} vs derived ${derivedGp.toFixed(1)}`);
  }

  // The printed-EPS checksum pins netIncome, dilutedShares, and the
  // transcription of both: net income in millions x 1e6 over the share
  // count. The filing computes EPS from unrounded figures while the face
  // prints millions, so the tolerance carries the print rounding of net
  // income (±0.05m over the share count) on top of the EPS print rounding.
  const computedEps = (year.values.netIncome * 1e6) / year.values.dilutedShares;
  const epsTolerance = 0.5 * 10 ** -year.eps.dp + 0.05e6 / year.values.dilutedShares;
  if (Math.abs(computedEps - year.eps.diluted) > epsTolerance) {
    failures.push(
      `${year.fy}: diluted EPS computes to ${computedEps.toFixed(year.eps.dp + 1)}, printed ${year.eps.diluted}`
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
