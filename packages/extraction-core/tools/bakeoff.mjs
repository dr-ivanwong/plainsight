#!/usr/bin/env node
/**
 * The provider bake-off (main plan section 6: measured, not vibed): every
 * registered rung reads the golden-corpus annual reports, and the scorecard
 * says who read them right, at what pass rate, latency, and estimated cost.
 * The default ladder gets pinned from this output, and the run repeats
 * whenever the registry changes.
 *
 * Keys arrive ONLY by environment variable, never committed:
 *   ANTHROPIC_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY
 * Rungs without a key are skipped and reported. Documents download once
 * from the URLs the transcriptions record (EDGAR_CONTACT required for the
 * polite User-Agent) into the cache directory.
 *
 * Usage, from packages/extraction-core (build first: corepack pnpm build):
 *   EDGAR_CONTACT=you@example.com \
 *   GROQ_API_KEY=... node tools/bakeoff.mjs [--companies csl,jbh] [--rungs groq-llama-3.3-70b]
 *
 * Results land in bakeoff-results/ (gitignored; the pinned summary is
 * copied into the docs by hand once the owner accepts a run).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Re-exec with the dist resolver hook (tools/lib/use-dist.mjs) so the
// workspace's TS-source exports resolve to built output under plain node.
if (process.env['PLAINSIGHT_DIST_HOOK'] === undefined) {
  const { spawnSync } = await import('node:child_process');
  const hook = fileURLToPath(new URL('./lib/use-dist.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--import', hook, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, PLAINSIGHT_DIST_HOOK: '1' }
  });
  process.exit(result.status ?? 1);
}

const { REGISTRY, runExtraction } = await import('../dist/index.js');
const { preprocessPdf } = await import('../dist/pdf/index.js');
import { aggregateScores, expectedYearsByDocument, scoreDocument } from './lib/score.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIPTIONS_DIR = path.join(HERE, '..', '..', 'calc-engine', 'fixtures', 'transcriptions');
const RESULTS_DIR = path.join(HERE, '..', 'bakeoff-results');
const DOCS_DIR = path.join(RESULTS_DIR, 'documents');

const KEY_ENV = {
  'groq-llama-3.3-70b': 'GROQ_API_KEY',
  'deepseek-chat': 'DEEPSEEK_API_KEY',
  'gemini-2.5-flash': 'GEMINI_API_KEY',
  'anthropic-haiku-4.5': 'ANTHROPIC_API_KEY',
  'anthropic-sonnet-5': 'ANTHROPIC_API_KEY'
};

/** USD per million tokens, list prices, for the ESTIMATED cost column. */
const PRICE_PER_MTOK = {
  'groq-llama-3.3-70b': { input: 0.59, output: 0.79 },
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'anthropic-haiku-4.5': { input: 1, output: 5 },
  'anthropic-sonnet-5': { input: 3, output: 15 }
};

const ALL_COMPANIES = ['csl', 'wes', 'wow', 'jbh', 'coh'];

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const companies = (argValue('--companies') ?? ALL_COMPANIES.join(','))
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);
const rungFilter = argValue('--rungs')?.split(',').map((name) => name.trim());

const rungs = REGISTRY.filter((entry) => rungFilter === undefined || rungFilter.includes(entry.id));
const keyed = rungs.filter((entry) => process.env[KEY_ENV[entry.id]] !== undefined);
const skipped = rungs.filter((entry) => process.env[KEY_ENV[entry.id]] === undefined);
for (const entry of skipped) {
  console.log(`skipping ${entry.id}: ${KEY_ENV[entry.id]} is not set`);
}
if (keyed.length === 0) {
  console.error('No rung has a key; set at least one of the *_API_KEY variables.');
  process.exit(1);
}

async function ensureDocument(ticker, docKey, url) {
  await mkdir(DOCS_DIR, { recursive: true });
  const file = path.join(DOCS_DIR, `${ticker.toLowerCase()}-${docKey}.pdf`);
  if (existsSync(file)) return new Uint8Array(await readFile(file));
  const contact = process.env['EDGAR_CONTACT'];
  if (!contact) throw new Error('EDGAR_CONTACT must be set to download corpus documents');
  console.log(`downloading ${ticker} ${docKey}...`);
  const response = await fetch(url, {
    headers: { 'User-Agent': `Plainsight bake-off (${contact})` }
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(file, bytes);
  return bytes;
}

/** Rough token estimate for the cost column: characters over four. */
const estimateTokens = (text) => Math.ceil(text.length / 4);

const perRung = new Map(keyed.map((entry) => [entry.id, []]));
const failures = [];

for (const company of companies) {
  const module = await import(path.join(TRANSCRIPTIONS_DIR, `${company}.mjs`));
  const transcription = Object.values(module)[0];
  const byDocument = expectedYearsByDocument(transcription);

  for (const [docKey, expectedYears] of byDocument) {
    const documentMeta = transcription.meta.documents[docKey];
    const bytes = await ensureDocument(transcription.meta.ticker, docKey, documentMeta.url);
    const prepared = await preprocessPdf(bytes);
    if (!prepared.ok) {
      failures.push(`${company} ${docKey}: preprocess ${prepared.reason}`);
      continue;
    }
    const inputTokens = estimateTokens(
      prepared.document.sections.map((section) => section.text ?? '').join('\n')
    );

    for (const entry of keyed) {
      const startedAt = Date.now();
      let outcome;
      try {
        outcome = await runExtraction({
          document: prepared.document,
          ladder: [entry],
          credentialFor: () => process.env[KEY_ENV[entry.id]]
        });
      } catch (error) {
        outcome = { ok: false, attempts: [], crashed: String(error) };
      }
      const latencyMs = Date.now() - startedAt;
      const price = PRICE_PER_MTOK[entry.id];
      const outputTokens = outcome.ok ? estimateTokens(JSON.stringify(outcome.result)) : 0;
      // Estimates only, and only for calls a provider actually processed;
      // the repair retry doubles the spend when it ran.
      const estimatedCostUsd = outcome.ok
        ? ((inputTokens * price.input + outputTokens * price.output) / 1e6) *
          (outcome.attempts.at(-1)?.repaired ? 2 : 1)
        : 0;

      const score = outcome.ok
        ? scoreDocument(expectedYears, outcome.result, transcription.meta.currency)
        : scoreDocument(expectedYears, { years: [] }, transcription.meta.currency);
      perRung.get(entry.id).push({
        company,
        docKey,
        failed: !outcome.ok,
        failure: outcome.ok
          ? undefined
          : (outcome.crashed ?? outcome.attempts.map((a) => `${a.rungId} ${a.failure?.kind}`).join('; ')),
        latencyMs,
        estimatedCostUsd,
        score
      });
      const marker = outcome.ok ? `${(score.fieldsCorrect / Math.max(1, score.fieldsExpected) * 100).toFixed(1)}%` : 'FAILED';
      console.log(`${entry.id}  ${company} ${docKey}  ${marker}  ${(latencyMs / 1000).toFixed(1)}s`);
    }
  }
}

// ---------------------------------------------------------------------------
// The scorecard
// ---------------------------------------------------------------------------

const rows = [];
for (const [rungId, scores] of perRung) {
  const aggregate = aggregateScores(scores);
  const costUsd = scores.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0);
  rows.push({
    rungId,
    accuracy: aggregate.accuracy,
    gatePassRate: aggregate.gatePassRate,
    documents: aggregate.documents,
    failures: aggregate.failures,
    missingYears: aggregate.missingYears,
    meanLatencyMs: aggregate.meanLatencyMs,
    estimatedCostUsd: costUsd,
    detail: scores
  });
}
rows.sort((a, b) => b.accuracy - a.accuracy || a.estimatedCostUsd - b.estimatedCostUsd);

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
await mkdir(RESULTS_DIR, { recursive: true });
const resultPath = path.join(RESULTS_DIR, `scorecard-${stamp}.json`);
await writeFile(resultPath, `${JSON.stringify({ companies, rows, failures }, null, 2)}\n`);

console.log('\n| rung | accuracy | gate pass | docs | failed | missing FYs | mean s | est. cost |');
console.log('|---|---|---|---|---|---|---|---|');
for (const row of rows) {
  console.log(
    `| ${row.rungId} | ${(row.accuracy * 100).toFixed(2)}% | ${(row.gatePassRate * 100).toFixed(1)}% | ${row.documents} | ${row.failures} | ${row.missingYears} | ${(row.meanLatencyMs / 1000).toFixed(1)} | $${row.estimatedCostUsd.toFixed(3)} |`
  );
}
if (failures.length > 0) {
  console.log(`\npreprocess failures:\n${failures.map((line) => `  ${line}`).join('\n')}`);
}
console.log(`\nSuggested ladder (accuracy first, then estimated cost):`);
console.log(`  ${rows.map((row) => row.rungId).join(' -> ')}`);
console.log(`\nWrote ${resultPath}`);
console.log(
  'The 99.5% gate reads on post-validation accuracy of the LADDER, not one rung: cheap rungs may miss documents the escalation recovers.'
);
