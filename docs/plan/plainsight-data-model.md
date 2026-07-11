# Data Model & Metric Dictionary

**Companion to:** `plainsight.md` (product definition §3, calc-engine rules §5) and `plainsight-frontend.md` (every value defined here is rendered there). **Status:** Draft for owner review · **Date:** 2026-07-11
**Purpose:** the build contract for `packages/calc-engine` and the client data layer: the canonical statement schema, the policies (P-0…P-8), the pinned formula for every metric (M1–M14), the red-flag rule thresholds (R1–R7), the storage/export schemas, and the golden corpus. Every displayed number must be reproducible by hand from this document; that is the product's credibility, so this is the contract that gets reviewed hardest.

---

## 1. Scope and how to read this document

- **"Pinned" means contract.** Changing a pinned formula, threshold, or policy requires updating this document in the same change, plus a regression test capturing the old and new behaviour. The calc engine implements this document; it does not interpret it.
- The engine is `(statements) → MetricsReport`: pure, zero-dependency, no I/O (main plan §5). It consumes the §2 line items typed per §3, applies the §4 policies, and emits §6 metric values and §7 rule results as discriminated unions. The UI renders unions; it never recomputes.
- Two decisions are deliberately left open for the owner (§12: D1 sample corpus, D2 metric budget). Everything else in this draft is pinned pending the review pass.

## 2. Canonical line items

22 items across three statements. **Core** items define statement completeness (§10); contextual items enrich detail sheets and validation but block nothing. "Find it as" hints render inline in S5 (frontend §3). Sign class per P-0.

### Income statement

| Id | Label | Find it as | Core | Signed |
|---|---|---|---|---|
| `revenue` | Revenue | `Total revenue` / `Net sales`, first line of the income statement | ✓ | |
| `costOfRevenue` | Cost of revenue | `Cost of sales` / `Cost of revenue` / `Cost of goods sold` | ✓ | |
| `grossProfit` | Gross profit | `Gross profit` / `Gross margin`; derived as revenue − cost of revenue when the filing omits it (P-8) | derived | ✓ |
| `operatingIncome` | Operating income | `Operating income` / `Income from operations`; IFRS: `Profit from operations` / `EBIT` | ✓ | ✓ |
| `interestExpense` | Interest expense | `Interest expense`; IFRS: within `Finance costs` | ✓ (∅0-able) | |
| `pretaxIncome` | Pre-tax income | `Income before income taxes`; IFRS: `Profit before tax` | ✓ | ✓ |
| `taxExpense` | Income tax expense | `Provision for income taxes` / `Income tax expense` (negative in benefit years) | ✓ | ✓ |
| `netIncome` | Net income | `Net income`; IFRS: `Profit for the year attributable to owners of the parent` | ✓ | ✓ |
| `dilutedShares` | Diluted shares | `Weighted-average diluted shares outstanding`, near EPS | ✓ | |

### Balance sheet

| Id | Label | Find it as | Core | Signed |
|---|---|---|---|---|
| `cashAndEquivalents` | Cash & equivalents | `Cash and cash equivalents` plus `Short-term investments` / `marketable securities` where listed separately | ✓ | |
| `currentAssets` | Current assets | `Total current assets` | ✓ | |
| `totalAssets` | Total assets | `Total assets` | ✓ | |
| `currentLiabilities` | Current liabilities | `Total current liabilities` | ✓ | |
| `shortTermDebt` | Short-term debt | `Short-term borrowings` + `Current portion of long-term debt` (∅0 when genuinely debt-free) | ✓ (∅0-able) | |
| `longTermDebt` | Long-term debt | `Long-term debt`; IFRS: non-current `Borrowings` (∅0 when genuinely debt-free) | ✓ (∅0-able) | |
| `totalLiabilities` | Total liabilities | `Total liabilities` (feeds the balance gate: assets = liabilities + equity) | ✓ | |
| `totalEquity` | Total equity | `Total stockholders' equity`; IFRS: `Equity attributable to owners of the parent` | ✓ | ✓ |

### Cash flow statement

| Id | Label | Find it as | Core | Signed |
|---|---|---|---|---|
| `operatingCashFlow` | Operating cash flow | `Net cash provided by operating activities` | ✓ | ✓ |
| `capex` | Capital expenditure | `Purchases of property, plant and equipment` (entered positive; it is an outflow by definition) | ✓ | |
| `depreciationAmortisation` | D&A | `Depreciation and amortisation` in the operating section | | |
| `dividendsPaid` | Dividends paid | `Dividends paid` in the financing section | | |
| `shareRepurchases` | Buybacks | `Repurchases of common stock` / `Payments for share buy-back` | | |

## 3. Core types

Sketches, not the final code; the shapes are pinned, names may vary in review.

```ts
type CurrencyCode = string;                       // ISO 4217: 'USD', 'AUD'
type Scale = 'ones' | 'thousands' | 'millions' | 'billions';
type FyLabel = `FY${number}`;                     // P-3: 'FY2024'

// All money is integer minor units (cents). Number.isSafeInteger is asserted
// at every boundary; NaN and Infinity are unrepresentable in storage (Zod int).
type EntryValue =
  | { kind: 'entered'; amountMinor: number }
  | { kind: 'not_reported_zero' };                // the ∅0 state, §8
// An absent key is the third state: unknown (§8). Never encoded as null or 0.

interface StatementYear {
  fy: FyLabel;
  endDate: string;                                // ISO date, e.g. '2025-06-30'
  currency: CurrencyCode;
  entryScale: Scale;                              // UI convenience only; storage is minor units
  values: Partial<Record<LineItemId, EntryValue>>;
  provenance: Provenance;                         // §9
}

type MetricValue =
  | { status: 'ok'; value: number; basis?: 'average' | 'ending' }
  | { status: 'not_meaningful'; reason: NotMeaningfulReason }
  | { status: 'insufficient_data'; missing: LineItemId[] };   // drives §10

type NotMeaningfulReason =
  | 'negative_equity' | 'negative_earnings' | 'negative_invested_capital'
  | 'no_interest_expense' | 'zero_revenue' | 'zero_denominator' | 'no_price';
```

Illegal states are unrepresentable end to end: a metric on incomplete inputs is `insufficient_data` by type; a degenerate denominator is `not_meaningful` by type; `StatusValue` (frontend §5) is the single component that renders this union, which is where the no-NaN rule lives.

## 4. Policies P-0…P-8 (pinned)

| Id | Policy | Rule |
|---|---|---|
| **P-0** | Sign conventions | Items are stored as positive magnitudes with fixed semantic direction. The signed exceptions (may be negative): `grossProfit`, `operatingIncome`, `pretaxIncome`, `taxExpense`, `netIncome`, `operatingCashFlow`, `totalEquity`. The entry form rejects negatives elsewhere; extraction output is normalised to the same convention before gating. |
| **P-1** | Money representation | Integer minor units + ISO 4217 currency, always. `entryScale` converts at commit time and is retained only so the grid can re-display in the scale the user typed. Formatting is a separate, final display step. |
| **P-2** | Rounding tolerance & display precision | Cross-foot and balance gates pass when `abs(diff) <= max(2 × scaleUnit, 0.5% of the larger side)`, where scaleUnit is one unit at the year's entry scale. Display: percentages 1 dp; ratios 2 dp; coverage 1 dp with `×`; money compact to 3 significant figures with currency symbol. |
| **P-3** | Fiscal calendar | FY label = the calendar year containing `endDate` (CSL year ending 2025-06-30 → FY2025). Trends, deltas, and compare align by label; compare headers show each company's year-end. No pro-rating, no TTM in v1 (the per-year `endDate` leaves room for TTM later without schema breakage). |
| **P-4** | Denominator basis | Return metrics (M4, M5) use the average of opening and closing balances when the prior FY's balance sheet is complete, else the ending balance. The basis used is carried in the result and badged in S4. Point-in-time ratios (M6, M7) always use ending. |
| **P-5** | Not-meaningful rendering | Every degenerate case maps to a pinned reason (§3) with a pinned phrase: `negative_equity` → "n/m: negative equity"; `negative_earnings` → "n/m: negative earnings"; `negative_invested_capital` → "n/m: negative invested capital"; `no_interest_expense` → "n/m: no interest burden"; `zero_revenue` → "n/m: no revenue"; `zero_denominator` → "n/m: zero denominator"; `no_price` → the S3 enter-price card, not a metric state. Never blank, never 0, never NaN. |
| **P-6** | Data sufficiency | A metric computes only when every required input (§10) is present. Sparklines need ≥ 2 labelled years. The delta chip compares the latest FY against the FY five labels prior and is hidden unless both endpoints compute. Rule streaks (§7) require consecutive labels; a missing year breaks the streak. Nothing is ever interpolated. |
| **P-7** | Currency comparability | Ratios and percentages compare across currencies; absolute money rows (revenue, FCF, market cap) never do: S7 hides them in mixed-currency comparisons with a one-line note. No FX conversion exists anywhere in v1. |
| **P-8** | As-reported precedence | An entered (as-reported) value beats a derived one. Derived values recompute live and render grey. Disagreement beyond P-2 tolerance is a visible warning in entry mode and a hard gate failure in extraction review. The engine never "corrects" a filing. |

## 5. Export and import file format

```jsonc
{
  "format": "plainsight-export",
  "formatVersion": 1,
  "exportedAt": "2026-07-11T09:30:00Z",
  "appVersion": "1.0.0",
  "data": {
    "companies": [], "statements": [], "prices": [],
    "theses": [], "thesisVersions": [], "flagDismissals": [],
    "settings": {}
  }
}
```

- **Allowlist, not blocklist.** The exporter enumerates exactly the tables above. `providerCredentials` and `quarantine` are not in the enumeration and therefore cannot appear; a unit test exports a fully populated database and asserts the output contains no key material (main plan §6 BYOK, risk table).
- Sample records export like any data, carrying their `sample: true` flag.
- **Import:** parse → Zod against the versioned schema → dry-run summary (counts per table, shown in S11's sheet) → Merge (per-record, newer `updatedAt` wins) / Replace (wipe then load) / Cancel. Same-major versions accepted; older majors migrate through the same functions as Dexie migrations; newer majors are rejected with "update the app first".
- `formatVersion` bumps only on breaking shape changes; additive fields never bump it.

## 6. Metric dictionary (M1–M14, pinned)

All inputs by §2 id; basis per P-4; n/m per P-5. Percentages display per P-2.

| Id | Metric | Formula (pinned) | Inputs | Basis | Not meaningful when |
|---|---|---|---|---|---|
| M1 | Gross margin | grossProfit ÷ revenue | `grossProfit`\*, `revenue` | | revenue = 0 |
| M2 | Operating margin | operatingIncome ÷ revenue | `operatingIncome`, `revenue` | | revenue = 0 |
| M3 | Net margin | netIncome ÷ revenue | `netIncome`, `revenue` | | revenue = 0 |
| M4 | ROE | netIncome ÷ totalEquity | `netIncome`, `totalEquity` | P-4 | equity ≤ 0 |
| M5 | ROIC | NOPAT ÷ invested capital (note N1) | see N1 | P-4 | invested capital ≤ 0 |
| M6 | Debt-to-equity | (shortTermDebt + longTermDebt) ÷ totalEquity | debt items, `totalEquity` | ending | equity ≤ 0 |
| M7 | Current ratio | currentAssets ÷ currentLiabilities | both | ending | currentLiabilities = 0 |
| M8 | Interest coverage | operatingIncome ÷ interestExpense | both | | interestExpense = 0 or ∅0 (note N5) |
| M9 | Free cash flow | operatingCashFlow − capex (note N2) | both | | never (money value) |
| M10 | FCF margin | M9 ÷ revenue | M9 inputs, `revenue` | | revenue = 0 |
| M11 | FCF conversion | M9 ÷ netIncome | M9 inputs, `netIncome` | | netIncome ≤ 0 |
| M12 | P/E | price ÷ (netIncome ÷ dilutedShares) | price record, `netIncome`, `dilutedShares` | | EPS ≤ 0; no price |
| M13 | Earnings yield | (netIncome ÷ dilutedShares) ÷ price | as M12 | | EPS ≤ 0; no price |
| M14 | FCF yield | M9 ÷ (price × dilutedShares) | M9 inputs, price, `dilutedShares` | | no price (negative FCF renders negative) |

\* `grossProfit` derived from `revenue` − `costOfRevenue` when not entered (P-8).

**N1: ROIC definition (pinned; flagged for owner review).** NOPAT = operatingIncome × (1 − effective tax rate), where effective tax rate = taxExpense ÷ pretaxIncome clamped to [0, 0.45]; when pretaxIncome ≤ 0 the rate is taken as 0. Invested capital = shortTermDebt + longTermDebt + totalEquity − cashAndEquivalents, averaged per P-4. Deliberately simple: no lease capitalisation, no goodwill adjustments in v1; the detail sheet states this plainly.

**N2: FCF definition (pinned; flagged for owner review).** operatingCashFlow − capex, where capex is purchases of property, plant and equipment only: no software or intangible add-backs, leases as-reported. The classic conservative definition, stated on the detail sheet.

**N3: price.** Manual entry with as-of date (main plan §12.1); one price record per company feeds M12–M14 and the staleness badge (S3). Market cap = price × latest complete FY's `dilutedShares`.

**N4: per-share basis.** Diluted weighted-average shares everywhere; R5 uses the same series.

**N5: no-debt coverage.** When `interestExpense` is ∅0 or zero, M8 renders "n/m: no interest burden" (a healthy state, the explainer says so) and R4 abstains.

## 7. Red-flag rules R1–R7 (thresholds pinned; all flagged for owner review)

Common contract: each rule emits `{ ruleId, severity: 'orange' | 'red', firedWith, explanation, whatToCheck }`, phrased as items to investigate, never verdicts (main plan non-goal 2). A rule whose data window is not covered **abstains silently** (abstention is not a pass). Dismissals are keyed `(companyId, ruleId, latestFy)`: adding a new fiscal year invalidates the dismissal and the rule re-evaluates (frontend S3 "dismissible-but-persistent").

| Id | Name | Fires when (pinned) | Severity |
|---|---|---|---|
| R1 | Earnings quality | operatingCashFlow < netIncome in each of the latest 3 consecutive FYs | orange |
| R2 | Eroding moat | gross margin or operating margin declines year-over-year for ≥ 3 consecutive steps (4 labelled years) | orange; red at ≥ 5 steps |
| R3 | Leverage-flattered returns | M6 rises ≥ 0.3 absolute over the latest 3 years while M4 rises ≤ 1 pp over the same window | orange |
| R4 | Fragility | latest M8 < 3.0× | orange; red when < 1.5× or negative (abstains per N5) |
| R5 | Dilution | dilutedShares CAGR over the latest 3 years > 2%/yr and revenue CAGR over the same window < 2 × that share CAGR | orange |
| R6 | Manufactured returns | latest M4 > 25% and latest M6 > 2.0 | orange; copy directs to M5 |
| R7 | Capital-intensity creep | revenue up year-over-year and M9 down year-over-year, in each of the latest 2 consecutive steps | orange |

"What to check" copy per rule (pinned at implementation with the education layer): R1 → receivables growth and accrual notes vs the cash flow statement; R2 → pricing power, competition, mix shift in the MD&A; R3 → debt notes and maturity ladder; R4 → interest notes, covenants, refinancing dates; R5 → the share-based compensation note, issuance vs buybacks; R6 → equity base shrinkage from buybacks, recompute as ROIC; R7 → capex trajectory vs D&A, working-capital swallow.

## 8. Null, zero, and not-reported (the three-state rule)

| State | Meaning | Completeness | Computes as | Renders as |
|---|---|---|---|---|
| absent (no key) | unknown; not yet entered | blocks | never computes | empty field |
| entered `0` | the filing reports zero | counts | 0 | `0` |
| `not_reported_zero` (∅0) | the filing omits the line; the user asserts it is nil/immaterial | counts | 0 | `∅0` chip |

- Only the user can assert ∅0 (the S5 overflow menu, "Not reported → 0"). Extraction never invents one: a field missing from a document stays absent and surfaces in S6 review as missing. Import carries ∅0 through faithfully.
- Interactions worth pinning: `interestExpense` ∅0 → N5 behaviour (healthy n/m, R4 abstains). `capex` ∅0 → M9 equals operatingCashFlow and the detail sheet says why. Debt items ∅0 → M6 computes as 0.00 (genuinely unlevered), not n/m.

## 9. Client storage: Dexie schema, provenance, migrations

Dexie v1 tables (key paths abridged; `[a+b]` is a compound primary key):

```
companies             id, name, ticker?, exchange?, sector?, currency, sample, createdAt, updatedAt, dataVersion
statements            [companyId+fy+statement], endDate, entryScale, values, provenance, updatedAt
prices                companyId, amountMinor, currency, asOf, updatedAt
theses                companyId, sections{business, moat, valuation, kills}, updatedAt
thesisVersions        ++id, companyId, savedAt, sections, financialsSnapshot?
flagDismissals        [companyId+ruleId], dismissedAtFy, dismissedAt
providerCredentials   providerId, key, label, addedAt      // never exported, never synced (§5)
quarantine            ++id, table, raw, reason, quarantinedAt
meta                  key, value                            // onboardingDone, lastExportAt, theme, educationLayerOff, schemaVersion
```

- **dataVersion** increments in the same Dexie transaction as any `statements`/`prices` write for that company; `useMetrics` memoises on `(companyId, dataVersion)` (main plan §5).
- **sample flag:** `sample: true` on the company; S11's one-tap removal deletes by flag across all tables via `companyId`.
- **Provenance (pinned shape):**

```ts
interface Provenance {
  source: 'manual' | 'sample' | 'edgar' | 'asx_map' | 'user_upload';
  recordedAt: string;                                   // ISO datetime
  filing?: { system: 'EDGAR' | 'ASX_MAP'; documentId: string; url?: string };
  extraction?: {
    provider: string; model: string; promptVersion: string;
    fields?: Record<LineItemId, { confidence: number; page?: number; cell?: string }>;
  };
  mappingVersion?: string;                              // XBRL / IFRS mapping table version
}
```

Field-level page/cell references power tap-to-see-source (S4 provenance chips, S6 jump-to-source). `user_upload` provenance renders visually distinct from `edgar`/`asx_map` (main plan §6 private-library isolation).

- **Migrations:** Dexie-versioned, additive-first. Every read passes Zod; a record failing Zod-on-read moves to `quarantine` (S11 badge + per-record export-raw/discard) and never crashes a screen. Every migration lands with a test that imports a fixture of the previous schema version.

## 10. Insufficient data and deep-linking

Statement completeness = every core §2 item present (entered or ∅0). Metric computability is finer-grained: each metric requires exactly its input list; the union of missing items drives the S3 card copy ("Add the 2 missing numbers") and the deep link.

**Deep-link format (pinned):** `/company/:id/entry?stmt=<income|balance|cashflow>&fy=<label>&focus=<lineItemId>`, targeting the first missing item. These extend S5's typed search params (frontend §1.1); S6's jump-to-field reuses the same params.

| Metric | Requires (§2 ids) |
|---|---|
| M1 | `revenue` + (`grossProfit` or `costOfRevenue`) |
| M2 | `revenue`, `operatingIncome` |
| M3 | `revenue`, `netIncome` |
| M4 | `netIncome`, `totalEquity` (prior-year `totalEquity` optional: affects basis only, P-4) |
| M5 | `operatingIncome`, `taxExpense`, `pretaxIncome`, `shortTermDebt`, `longTermDebt`, `totalEquity`, `cashAndEquivalents` (prior year optional, P-4) |
| M6 | `shortTermDebt`, `longTermDebt`, `totalEquity` |
| M7 | `currentAssets`, `currentLiabilities` |
| M8 | `operatingIncome`, `interestExpense` |
| M9 | `operatingCashFlow`, `capex` |
| M10 | M9 inputs + `revenue` |
| M11 | M9 inputs + `netIncome` |
| M12, M13 | price record + `netIncome`, `dilutedShares` |
| M14 | price record + M9 inputs + `dilutedShares` |

A missing **price** is not `insufficient_data`: it renders as S3's "Enter today's price" collapse (price is a sibling record, not a line item).

## 11. Golden corpus (locked; main plan §12.4)

| Company | Ticker | Exchange | Filing basis | FYs verified | Phase |
|---|---|---|---|---|---|
| Apple | AAPL | NASDAQ | 10-K | 10 | 0 |
| Microsoft | MSFT | NASDAQ | 10-K | 6 | 0 |
| Coca-Cola | KO | NYSE | 10-K | 10 | 0 |
| Costco | COST | NASDAQ | 10-K | 6 | 0 |
| Union Pacific | UNP | NYSE | 10-K | 6 | 0 |
| CSL | CSL | ASX | Annual report (IFRS) | 10 | 2.5 (or 0, per D1) |
| Wesfarmers | WES | ASX | Annual report | 6 | 2.5 |
| Woolworths | WOW | ASX | Annual report | 6 | 2.5 |
| JB Hi-Fi | JBH | ASX | Annual report | 6 | 2.5 |
| Cochlear | COH | ASX | Annual report | 6 | 2.5 |

- **Fixture format:** one JSON file per company: canonical line items per FY in minor units, a per-statement source reference (filing id + page), the expected `MetricsReport` computed by hand at display precision, and the expected red-flag results.
- **Acceptance:** line items equal the filing exactly (integer equality); metric values equal the hand computation at P-2 display precision; every bug ever found adds a regression fixture (main plan §5).
- **Depth rationale:** 10 FYs for sample-data companies (their fixtures back the S2/S3 ten-year sparklines end to end); 6 FYs minimum elsewhere, which covers the widest windows in the system (the 5-year delta chip needs 6 labels; R2 needs 4). Hand-verifying ten years for all ten companies (~6,000 figures) buys nothing the 6-year floor doesn't.
- **Sample subset:** the S2 "See it with sample data" fixtures are generated from this corpus (frontend §4). Which three companies constitute the sample set is decision D1.

## 12. Open decisions and the owner review list

**D1: the sample trio vs the Phase 0 corpus.** Frontend §4 pins the sample set as Apple, Coca-Cola, CSL, generated from Phase 0 golden files; but the Phase 0 exit criterion covers the five US 10-Ks, and CSL's golden file is Phase 2.5 scope. Options:

- **(a) Swap CSL for Costco in the Phase 1 sample trio** (recommended): zero added Phase 0 scope; CSL joins the samples when Phase 2.5 lands and the sample set becomes the showcase for ASX support at exactly the moment it exists. One-line frontend §4 update.
- **(b) Hand-verify CSL in Phase 0:** pulls AUD, a 2025-06-30 style year-end, and IFRS presentation through the entire Phase 1 render path early (roughly a day of verification work; the IFRS mapping table itself stays in 2.5). Strongest end-to-end test, mildly bigger week one.
- **(c) Ship the sample set as the US pair only.** Two companies still demonstrate compare; weakest wow.

**D2: the metric budget number.** This dictionary pins 14 metrics; the main plan says "~12" and CLAUDE.md enforces a "12-metric budget". Options:

- **(a) Budget the dashboard at 12 cards, keep the dictionary at 14** (recommended): demote M13 (earnings yield: the inverse of M12 with identical inputs) into M12's detail sheet, and M10 (FCF margin) into M11's detail sheet (conversion is the stronger earnings-quality signal). The dashboard reads exactly 12; ids stay stable; nothing is deleted; frontend S3's valuation-card copy adjusts from three cards to two.
- **(b) Keep all 14 on the dashboard** and restate the budget as "the pinned dictionary M1–M14"; one-line CLAUDE.md edit.
- **(c) Delete two metrics outright.** Loses real information for tidiness; not recommended.

**Review list (per main plan §12.1):** policies P-1…P-8 as pinned in §4, with the P-2 tolerance numbers first; the ROIC construction (N1: NOPAT, the tax-rate clamp, the invested-capital formula); the FCF definition (N2); every R1–R7 threshold in §7; and the §11 depth decision (10/6 FYs).

---

*Review focus for the owner: D1 and D2 (§12), the ROIC and FCF definitions (§6, notes N1/N2), the P-2 tolerance, and the R1–R7 thresholds. Everything else here is the mechanical consequence of decisions already recorded in the main plan.*
