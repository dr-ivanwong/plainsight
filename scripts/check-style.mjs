#!/usr/bin/env node
// House style checker (docs/style.md). A rule without a test is a suggestion.
// Zero dependencies; runs on any Node >= 18. Rules 1 to 3 scan git-tracked
// Markdown files; rule 4 scans every other tracked (source) file.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Rule 1: no em dashes (U+2014). Checked on raw lines, code included.
const EM_DASH = /—/g;

// Rule 2: AU/UK English. Checked on prose only: fenced code blocks and inline
// code spans are exempt, and only all-lowercase matches are flagged so that
// proper nouns (US tickers, company and product names, "AWS Organizations",
// "MIT License") pass untouched.
const AU_SPELLINGS = new Map(Object.entries({
  color: 'colour', colors: 'colours', colored: 'coloured', coloring: 'colouring', colorful: 'colourful',
  behavior: 'behaviour', behaviors: 'behaviours', behavioral: 'behavioural',
  center: 'centre', centers: 'centres', centered: 'centred', centering: 'centring',
  gray: 'grey', grays: 'greys', grayed: 'greyed',
  artifact: 'artefact', artifacts: 'artefacts',
  honor: 'honour', honors: 'honours', honored: 'honoured', honoring: 'honouring',
  favor: 'favour', favors: 'favours', favored: 'favoured', favorite: 'favourite', favorites: 'favourites',
  labor: 'labour', labors: 'labours',
  neighbor: 'neighbour', neighbors: 'neighbours',
  fiber: 'fibre', fibers: 'fibres',
  catalog: 'catalogue', catalogs: 'catalogues',
  dialog: 'dialogue', dialogs: 'dialogues',
  license: 'licence', licenses: 'licences', // nouns; the verb forms licensed/licensing are correct AU/UK
  defense: 'defence', offense: 'offence',
  fulfill: 'fulfil', fulfills: 'fulfils', fulfillment: 'fulfilment',
  enrollment: 'enrolment', installment: 'instalment',
  canceled: 'cancelled', canceling: 'cancelling',
  modeled: 'modelled', modeling: 'modelling',
  labeled: 'labelled', labeling: 'labelling',
  traveled: 'travelled', traveling: 'travelling',
  signaled: 'signalled', signaling: 'signalling',
  totaled: 'totalled', totaling: 'totalling',
}));

// Generic -ize/-yze detector (organize, optimize, analyze, memoization, ...),
// with an allowlist of words where "ize" is not the suffix being tested.
const IZE_PATTERN = /(?<![A-Za-z'-])[a-z]+(?:iz|yz)(?:es|ed|e|ing|ers|er|ations|ation)(?![A-Za-z'-])/g;
const IZE_ALLOW = new Set([
  'size', 'sizes', 'sized', 'sizing',
  'resize', 'resizes', 'resized', 'resizing',
  'downsize', 'downsized', 'downsizing', 'oversize', 'oversized', 'outsize', 'outsized',
  'prize', 'prizes', 'prized', 'seize', 'seizes', 'seized', 'seizing',
  'capsize', 'capsized', 'maize', 'baize',
]);

const WORD_PATTERN = /(?<![A-Za-z'-])[a-z][a-z'-]*(?![A-Za-z'-])/g;

// Rule 3: dates are YYYY-MM-DD. Checked on prose only. Anything naming a
// specific day must be ISO 8601 and zero-padded; month-year prose ("July
// 2026"), day-month recurring facts ("ends 30 June"), and fiscal-period
// labels (FY2025, H1 2026) carry no day+year pair and pass untouched.
const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const NON_ISO_DATES = [
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?(?: of)? ${MONTH}[,.]? \\d{4}\\b`, 'g'), // 11 July 2026
  new RegExp(`\\b${MONTH}\\.? \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}\\b`, 'g'),        // July 11, 2026
  /(?<![\d/])\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2})(?![\d/])/g, // 11/07/2026, 7/11/26; lookarounds spare slash chains like the 11/13/15px type scale
  /(?<![\d/])\d{4}\/\d{1,2}\/\d{1,2}(?![\d/])/g,           // 2026/07/11
  /(?<![\d-])\d{1,2}-\d{1,2}-\d{4}(?![\d-])/g,             // 11-07-2026
  /(?<![\d.])\d{1,2}\.\d{1,2}\.\d{4}(?!\.?\d)/g,           // 11.07.2026 (a trailing full stop is fine; a fourth dotted segment is not)
  /(?<![\d.])\d{4}\.\d{1,2}\.\d{1,2}(?!\.?\d)/g,           // 2026.07.11
];
// Matches ISO-shaped dates so unpadded ones (2026-7-1) can be flagged.
const ISO_SHAPED = /(?<![\d-])\d{4}-\d{1,2}-\d{1,2}(?![\d-])/g;
const ISO_PADDED = /^\d{4}-\d{2}-\d{2}$/;
// A **Date:** metadata field must carry a full ISO date (or the template's
// literal YYYY-MM-DD placeholder).
const DATE_FIELD = /\*\*Date:\*\*\s+(?!(?:\d{4}-\d{2}-\d{2}|YYYY-MM-DD)\b)/g;

// Rule 4: item codes stay in the documents that define them. Source files
// write the concept's name (the metric's, rule's, policy's, screen's) or the
// finding in words (a review's, an audit's) and cite the document by section;
// the letter-number codes are the documents' own vocabulary. Two shapes: the
// plans' single-letter item codes, and uppercase hyphenated families (the
// policy codes plus whatever dimensions a review or audit mints). Scanned raw
// (strings, comments, identifiers, fixtures alike), case-sensitively.
// The lookbehind skips codes embedded in hyphenated external identifiers
// (cdk-nag's "AwsSolutions-S1"): another system's id, not a document reference.
const PLAN_CODE = /\b(?<!-)(?:[MRNDS]\d{1,2}|[A-Z][A-Z0-9]{0,7}-\d{1,3})\b/g;
// Amazon S3 is a proper noun, not a screen code (the one real collision);
// exempting it mirrors rule 2's capitalisation heuristic.
const PLAN_CODE_ALLOW = new Set(['S3']);
// Well-known hyphenated technical terms, exempt by the leading letters of
// their first segment: UTF-8, SHA-256, ISO- and RFC-numbered standards,
// COVID-19, FY2024-25 ranges. Never name a review dimension after one.
const PLAN_CODE_ALLOW_PREFIXES = new Set(['UTF', 'SHA', 'ISO', 'RFC', 'COVID', 'FY']);

// Blank out SVG path data (d="M12 4v16" is drawing, not a metric) the way
// inline code spans are blanked: lengths preserved so columns stay right.
function stripSvgPathData(line) {
  return line.replace(/\bd\s*=\s*(["'])[MmZzLlHhVvCcSsQqTtAa][^"']*\1/g, (m) => ' '.repeat(m.length));
}

// Blank out inline code spans so their contents are never flagged.
function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
}

const allFiles = execSync('git ls-files -z', { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const files = allFiles.filter((file) => file.endsWith('.md'));
const sourceFiles = allFiles.filter((file) => !file.endsWith('.md'));

const findings = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inFence = false;
  lines.forEach((line, lineIdx) => {
    // Rule 1 runs on the raw line, code included.
    for (const match of line.matchAll(EM_DASH)) {
      findings.push(`${file}:${lineIdx + 1}:${match.index + 1}  em dash (U+2014): use a colon, comma, parentheses, or a new sentence (docs/style.md rule 1)`);
    }

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    // Rule 2 runs on prose only.
    const prose = stripInlineCode(line);
    for (const match of prose.matchAll(WORD_PATTERN)) {
      const suggestion = AU_SPELLINGS.get(match[0]);
      if (suggestion) {
        findings.push(`${file}:${lineIdx + 1}:${match.index + 1}  "${match[0]}" is US English: use "${suggestion}" (docs/style.md rule 2)`);
      }
    }
    for (const match of prose.matchAll(IZE_PATTERN)) {
      if (IZE_ALLOW.has(match[0])) continue;
      const suggestion = match[0].replace(/(i|y)z/, '$1s');
      findings.push(`${file}:${lineIdx + 1}:${match.index + 1}  "${match[0]}" is US English: use "${suggestion}" (docs/style.md rule 2)`);
    }

    // Rule 3 runs on prose only.
    for (const pattern of NON_ISO_DATES) {
      for (const match of prose.matchAll(pattern)) {
        findings.push(`${file}:${lineIdx + 1}:${match.index + 1}  "${match[0]}" is a non-ISO date: use YYYY-MM-DD (docs/style.md rule 3)`);
      }
    }
    for (const match of prose.matchAll(ISO_SHAPED)) {
      if (ISO_PADDED.test(match[0])) continue;
      findings.push(`${file}:${lineIdx + 1}:${match.index + 1}  "${match[0]}" needs zero padding: use YYYY-MM-DD (docs/style.md rule 3)`);
    }
    for (const match of prose.matchAll(DATE_FIELD)) {
      findings.push(`${file}:${lineIdx + 1}:${match.index + 1}  **Date:** field must carry a full YYYY-MM-DD date (docs/style.md rule 3)`);
    }
  });
}

// Rule 4 runs on every non-Markdown tracked file (binary files sniffed out).
let sourceFilesScanned = 0;
for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf8');
  if (content.includes('\0')) continue; // binary
  sourceFilesScanned += 1;
  content.split('\n').forEach((line, lineIdx) => {
    const scannable = stripSvgPathData(line);
    for (const match of scannable.matchAll(PLAN_CODE)) {
      if (PLAN_CODE_ALLOW.has(match[0])) continue;
      const leadingLetters = (match[0].split('-')[0] ?? '').replace(/\d+$/, '');
      if (match[0].includes('-') && PLAN_CODE_ALLOW_PREFIXES.has(leadingLetters)) continue;
      findings.push(`${file}:${lineIdx + 1}:${match.index + 1}  item code "${match[0]}" in source: write the concept or finding in words and cite its document by section (docs/style.md rule 4)`);
    }
  });
}

if (findings.length > 0) {
  console.error(`Style check failed with ${findings.length} finding(s):\n`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`Style check passed: ${files.length} Markdown files and ${sourceFilesScanned} source files clean.`);
