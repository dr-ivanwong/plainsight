#!/usr/bin/env node
// House style checker (docs/style.md). A rule without a test is a suggestion.
// Zero dependencies; runs on any Node >= 18. Scans git-tracked Markdown files.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const RULES = [
  {
    name: 'no em dashes',
    pattern: /—/g,
    message: 'em dash (U+2014): use a colon, comma, parentheses, or a new sentence (docs/style.md rule 1)',
  },
];

const files = execSync('git ls-files -z -- "*.md"', { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const findings = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, lineIdx) => {
    for (const rule of RULES) {
      for (const match of line.matchAll(rule.pattern)) {
        findings.push(`${file}:${lineIdx + 1}:${match.index + 1}  ${rule.message}`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error(`Style check failed with ${findings.length} finding(s):\n`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`Style check passed: ${files.length} Markdown files clean.`);
