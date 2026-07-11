# House style

Writing rules for everything in this repository: documentation, README, ADRs, skills, all user-facing copy strings, and (rule 4) the vocabulary allowed in source code. The same spirit applies to commit messages, though those aren't machine-checked.

**Every rule here is enforced by a test.** The checker is [`scripts/check-style.mjs`](../scripts/check-style.mjs), run by CI on every push and pull request ([`.github/workflows/style.yml`](../.github/workflows/style.yml)). Run it locally with:

```
node scripts/check-style.mjs
```

**Adding a rule:** add it to this document and extend the checker in the same PR. A rule without a test is a suggestion.

## Rule 1: no em dashes (U+2014)

Write around them:

| Instead of an em dash for... | Use |
|---|---|
| a term and its definition ("Term U+2014 definition") | a colon: "Term: definition" |
| an appended thought or elaboration | a colon, semicolon, comma, or a new sentence |
| a paired aside mid-sentence | parentheses or paired commas |
| an empty or not-applicable table cell | "n/a" |

Related characters that are correct and allowed:

- The **en dash** (U+2013) for numeric ranges only: "3–4 weeks", "$0–1.50", "200–350ms". Never as a prose dash substitute.
- The **true minus** (U+2212) for negative numbers: "−0.02em".
- Arrows (→), hyphens, and Markdown `---` rules are untouched by this rule.

Why: plain punctuation reads calmer, which suits this product's voice; forced sentence structure beats a dash that papers over a vague connection; and the em dash is the signature tic of machine-written prose. This repo is open about being built with Claude, but it should read like it was written on purpose.

## Rule 2: AU/UK English

The product is en-AU (owner, market, and eventual UI copy), so all prose uses Australian/UK spelling: `-ise`/`-isation` over `-ize`/`-ization`, `-yse` over `-yze`, `colour`, `behaviour`, `centre`, `grey`, `artefact`, `licence` (noun), `defence`, `catalogue`, `dialogue`, `modelling`, `cancelled`.

**Exemptions, by design:**

- **Code is untouched.** Fenced code blocks and inline code spans are skipped by the checker; CSS properties, API fields, library names, and identifiers keep their canonical spelling.
- **Proper nouns keep their spelling.** US tickers, company and product names, and official titles ("AWS Organizations", "MIT License", "Union Pacific") are exempt. The checker implements this by flagging **lowercase matches only**; anything capitalised is presumed a proper noun.
- The flip side of that heuristic: an American spelling that starts a sentence (so, capitalised) escapes the machine. Catching those is the writer's job; the checker guards the common case, not every case.
- Verb forms `licensed`/`licensing` are correct in AU/UK English and are not flagged; only the noun `licence`/`licences` is (write `licence`/`licences`). If you genuinely need the bare verb, prefer an inflected form or rewrite.

Why: a single English variant keeps the UI, docs, and thesis-writing surface coherent, and en-AU is the one the product ships in. The tested list targets the words this domain actually uses; extend the checker's map when a new one shows up.

## Rule 3: dates are YYYY-MM-DD

Every date that names a specific day is written ISO 8601, zero-padded: `2026-07-11`. This applies to all documentation (a bug review, refactor review, or audit is headed with the date it was conducted: `**Date:** 2026-07-11`), to ADR and plan metadata, and, once code lands, to every date the app renders: "as of `2026-07-11`", never "as of `11 July 2026`".

The checker flags, in prose:

- Month-name dates that name a day, in either order, abbreviations included: `11 July 2026`, `July 11, 2026`, `3rd of May 2026`, `Jul 11 2026`.
- Numeric dates in any other arrangement: `11/07/2026`, `7/11/26`, `2026/07/11`, `11-07-2026`, `11.07.2026`.
- Unpadded ISO: `2026-7-1` (write `2026-07-01`).
- A `**Date:**` metadata field whose value is not a full ISO date. The literal `YYYY-MM-DD` placeholder, as in the ADR template, is allowed.

**Allowed, by design:**

- **Month-year in prose** where day precision doesn't exist or doesn't matter: "the naming decision of July 2026". Metadata fields are the exception: a `**Date:**` field always carries a full date.
- **Recurring day-month facts** with no year attached: "the ASX reporting year ends 30 June".
- **Fiscal-period labels**, which are names, not dates: FY2025, H1 2026, Q3.
- **Code and official titles.** Fenced blocks and inline code spans are skipped, as for rule 2; an external document's own title keeps its format (`Annual Report 30 June 2025`, cited as such).

Why: `YYYY-MM-DD` sorts lexicographically into chronological order in file listings, tables, and logs; it is the one common format immune to the AU/US day-month swap (`03/07` is a different day in Sydney and New York), which matters in a repo that reads US filings through AU English; and it is what the ADR template and eventual `<time datetime>` markup already use, so a single format serves prose, metadata, and code.

## Rule 4: plan-item codes stay in the plans

The plan documents label their pinned items with letter-number codes: metrics (M1–M14), policies (P-0…P-8), red-flag rules (R1–R7), dictionary notes (N1–N5), decisions (D1, D2), screens (S1–S12). Those codes are the plans' own cross-reference vocabulary, and only the plans may use it. Source code, in every form it takes (identifiers, string values, comments, test names, golden fixtures, and user-facing copy), writes the intention and the meaning instead: `roe`, not the metric's code; `erodingMoat`, not the rule's; "the averaging denominator basis (data-model section 4)", not the policy's.

When a comment needs the contract's authority, name the concept and then point at the document and section: "the pinned rounding tolerance (data-model section 4)". Section numbers are document coordinates and are fine; item codes are not. The pinned code-to-identifier mappings live beside the dictionaries they belong to (data-model spec §6 for metrics, §7 for rules).

Why: a code is a pointer into a document revision, not a meaning. The numbering can shift as the plans evolve, and a new developer reading a switch case on a metric code learns nothing without the right plan open at the right heading, while `case 'currentRatio':` is its own documentation. Names in code survive plan renumbering; bare codes rot silently.

**Scope and exemptions, by design:**

- The checker scans every tracked source file (everything that is not Markdown), case-sensitively, raw lines included: unlike rules 2 and 3 there is no prose/code distinction to make, because the rule is about code.
- **`S3` is exempt everywhere:** it is Amazon S3, a proper noun, throughout the infrastructure code (the same heuristic spirit as rule 2's capitalisation exemption). Write "the dashboard screen" when the screen is meant and the exemption never bites.
- **Hyphenated external identifiers are exempt:** a code reached through a hyphen, as in cdk-nag's `AwsSolutions-S1`, belongs to another system's vocabulary, not the plans'.
- **SVG path data is stripped before matching:** `d="M12 4v16"` is drawing, not a metric.
- **Markdown prose outside `docs/plan/` may still cite a code** when pointing into a plan, preferably next to the concept's name ("the metric-budget decision (data-model §12 D2)"). A citation beside its meaning is what these documents are for; code gets no such licence.
