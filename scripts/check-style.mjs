#!/usr/bin/env node
// House style checker (docs/style.md). A rule without a test is a suggestion.
// Zero dependencies; runs on any Node >= 18. Scans git-tracked Markdown files.
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

// Blank out inline code spans so their contents are never flagged.
function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
}

const files = execSync('git ls-files -z -- "*.md"', { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

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
  });
}

if (findings.length > 0) {
  console.error(`Style check failed with ${findings.length} finding(s):\n`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`Style check passed: ${files.length} Markdown files clean.`);
