#!/usr/bin/env node
/**
 * The bundle budget (main plan §5): initial JS stays at or under 180 KB
 * gzipped. "Initial" means what the browser loads before first render: the
 * entry module plus its modulepreload graph, exactly as the built
 * index.html names them. Route chunks, Recharts, pdf.js, and the extraction
 * runner are lazy by design and sit outside the sum; this check exists so
 * the first accidental static import of one of them fails CI instead of
 * landing silently. Hand-rolled and dependency-free, like the contrast and
 * style gates.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 180;
const dist = resolve(process.cwd(), 'apps/web/dist');

let html;
try {
  html = readFileSync(join(dist, 'index.html'), 'utf8');
} catch {
  console.error('check-bundle: apps/web/dist/index.html is missing; build first.');
  process.exit(1);
}

const sources = new Set();
for (const match of html.matchAll(/<script[^>]*\btype="module"[^>]*\bsrc="([^"]+\.js)"/g)) {
  sources.add(match[1]);
}
for (const match of html.matchAll(/<link[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+\.js)"/g)) {
  sources.add(match[1]);
}

if (sources.size === 0) {
  console.error(
    'check-bundle: no module scripts found in index.html; the build shape changed and this check needs updating.'
  );
  process.exit(1);
}

let totalBytes = 0;
const rows = [];
for (const source of [...sources].sort()) {
  const bytes = readFileSync(join(dist, source.replace(/^\//, '')));
  const gzipped = gzipSync(bytes).length;
  totalBytes += gzipped;
  rows.push(`${(gzipped / 1024).toFixed(1).padStart(7)} KB  ${source}`);
}

const totalKb = totalBytes / 1024;
console.log('Initial JS, gzipped (the entry module and its modulepreload graph):');
for (const row of rows) console.log(`  ${row}`);
console.log(`  ${(totalKb).toFixed(1).padStart(7)} KB  total, against the ${BUDGET_KB} KB budget`);

if (totalBytes > BUDGET_KB * 1024) {
  console.error(
    `\ncheck-bundle: over budget by ${(totalKb - BUDGET_KB).toFixed(1)} KB. ` +
      'The usual suspect is a lazy boundary going static: Recharts, pdf.js, and the ' +
      'extraction runner must load behind user actions, never with the shell.'
  );
  process.exit(1);
}
console.log('Bundle budget holds.');
