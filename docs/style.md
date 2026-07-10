# House style

Writing rules for everything in this repository: documentation, README, ADRs, skills, and (once code lands) all user-facing copy strings. The same spirit applies to commit messages, though those aren't machine-checked.

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
