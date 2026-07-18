# Data Model & Metric Dictionary

**Companion to:** `plainsight.md` (product definition §3, calc-engine rules §5) and `plainsight-frontend.md` (every value defined here is rendered there). **Status:** Reviewed and pinned; owner review pass completed 2026-07-11 · **Date:** 2026-07-11
**Purpose:** the build contract for `packages/calc-engine` and the client data layer: the canonical statement schema, the policies (P-0…P-8), the pinned formula for every metric (M1–M14), the red-flag rule thresholds (R1–R7), the storage/export schemas, and the golden corpus. Every displayed number must be reproducible by hand from this document; that is the product's credibility, so this is the contract that gets reviewed hardest.

---

## 1. Scope and how to read this document

- **"Pinned" means contract.** Changing a pinned formula, threshold, or policy requires updating this document in the same change, plus a regression test capturing the old and new behaviour. The calc engine implements this document; it does not interpret it.
- The engine is `(statements) → MetricsReport`: pure, zero-dependency, no I/O (main plan §5). It consumes the §2 line items typed per §3, applies the §4 policies, and emits §6 metric values and §7 rule results as discriminated unions. The UI renders unions; it never recomputes.
- Both §12 decisions are resolved (D1 the sample corpus, D2 the metric budget). Everything else in this draft is pinned pending the review pass.

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

Lease liabilities (shown as separate lines in post-IFRS 16 / ASC 842 filings): include them in the two debt items when a lease-inclusive view of leverage and ROIC is wanted; the choice is the user's, and detail sheets show exactly what was entered (confirmed with N1, 2026-07-11).

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
  | 'no_interest_expense' | 'zero_revenue' | 'zero_denominator' | 'no_price'
  | 'currency_mismatch';   // price currency ≠ statements' currency (amended 2026-07-15, §12)
```

Illegal states are unrepresentable end to end: a metric on incomplete inputs is `insufficient_data` by type; a degenerate denominator is `not_meaningful` by type; `StatusValue` (frontend §5) is the single component that renders this union, which is where the no-NaN rule lives.

## 4. Policies P-0…P-8 (pinned; owner-confirmed 2026-07-11)

| Id | Policy | Rule |
|---|---|---|
| **P-0** | Sign conventions | Items are stored as positive magnitudes with fixed semantic direction. The signed exceptions (may be negative): `grossProfit`, `operatingIncome`, `pretaxIncome`, `taxExpense`, `netIncome`, `operatingCashFlow`, `totalEquity`. The entry form rejects negatives elsewhere; extraction output is normalised to the same convention before gating. |
| **P-1** | Money representation | Integer minor units + ISO 4217 currency, always. `entryScale` converts at commit time and is retained only so the grid can re-display in the scale the user typed. Formatting is a separate, final display step. |
| **P-2** | Rounding tolerance & display precision | Cross-foot and balance gates pass when `abs(diff) <= max(3 × scaleUnit, 0.1% of the larger side)`, where scaleUnit is one unit at the year's entry scale (owner-confirmed 2026-07-11; tightened from 2 ×/0.5% so mega-cap identities cannot hide material typos, while the 3-unit floor covers all legitimate print-rounding drift on three-term identities). A breach warns in entry mode (P-8) and hard-fails in extraction. Display: percentages 1 dp; ratios 2 dp; coverage 1 dp with `×`; money compact to 3 significant figures with currency symbol. |
| **P-3** | Fiscal calendar | FY label = the calendar year containing `endDate` (CSL year ending 2025-06-30 → FY2025). Trends, deltas, and compare align by label; compare headers show each company's year-end. No pro-rating, no TTM in v1 (the per-year `endDate` leaves room for TTM later without schema breakage). |
| **P-4** | Denominator basis | Return metrics (M4, M5) use the average of opening and closing balances when the prior FY's balance sheet is complete, else the ending balance. The basis used is carried in the result and badged in S4. Point-in-time ratios (M6, M7) always use ending. |
| **P-5** | Not-meaningful rendering | Every degenerate case maps to a pinned reason (§3) with a pinned phrase: `negative_equity` → "n/m: negative equity"; `negative_earnings` → "n/m: negative earnings"; `negative_invested_capital` → "n/m: negative invested capital"; `no_interest_expense` → "n/m: no interest burden"; `zero_revenue` → "n/m: no revenue"; `zero_denominator` → "n/m: zero denominator"; `currency_mismatch` → "n/m: price currency differs"; `no_price` → the S3 enter-price card, not a metric state. Never blank, never 0, never NaN. |
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

All inputs by §2 id; basis per P-4; n/m per P-5. Percentages display per P-2. All 14 are pinned dictionary entries; **12 render as dashboard cards** and two are detail-sheet metrics (D2): M13 lives in M12's sheet, M10 in M11's. Compare (S7) shows the 12 card metrics.

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
| M10 | FCF margin (detail-sheet, D2) | M9 ÷ revenue | M9 inputs, `revenue` | | revenue = 0 |
| M11 | FCF conversion | M9 ÷ netIncome | M9 inputs, `netIncome` | | netIncome ≤ 0 |
| M12 | P/E | price ÷ (netIncome ÷ dilutedShares) | price record, `netIncome`, `dilutedShares` | | EPS ≤ 0; no price; price currency ≠ statements' |
| M13 | Earnings yield (detail-sheet, D2) | (netIncome ÷ dilutedShares) ÷ price | as M12 | | EPS ≤ 0; no price; price currency ≠ statements' |
| M14 | FCF yield | M9 ÷ (price × dilutedShares) | M9 inputs, price, `dilutedShares` | | no price; price currency ≠ statements' (negative FCF renders negative) |

\* `grossProfit` derived from `revenue` − `costOfRevenue` when not entered (P-8).

**Code identifiers (pinned; main plan §12.8).** The M-numbers are this document's labels and never appear in code (house-style rule 4); code, storage, exports, and search params identify each metric by its semantic id, which doubles as the `?metric=` slug: M1 `grossMargin`, M2 `operatingMargin`, M3 `netMargin`, M4 `roe`, M5 `roic`, M6 `debtToEquity`, M7 `currentRatio`, M8 `interestCoverage`, M9 `fcf`, M10 `fcfMargin`, M11 `fcfConversion`, M12 `pe`, M13 `earningsYield`, M14 `fcfYield`.

**N1: ROIC definition (pinned; owner-confirmed 2026-07-11).** NOPAT = operatingIncome × (1 − effective tax rate), where effective tax rate = taxExpense ÷ pretaxIncome clamped to [0, 0.45]; when pretaxIncome ≤ 0 the rate is taken as 0. Invested capital = shortTermDebt + longTermDebt + totalEquity − cashAndEquivalents, averaged per P-4. Deliberately simple: no lease capitalisation, no goodwill adjustments in v1; the detail sheet states this plainly.

**N2: FCF definition (pinned; owner-confirmed 2026-07-11).** operatingCashFlow − capex, where capex is purchases of property, plant and equipment only: no software or intangible add-backs, leases as-reported. The classic conservative definition, stated on the detail sheet. Two implementation notes for the M9 detail-sheet copy, recorded with the confirmation: the Owner's-lens paragraph names the SBC blind spot (FCF ignores share-based pay because OCF adds it back; R5 is the countervailing dilution flag), and the 2019 lease seam (IFRS 16 / ASC 842 moved lease principal repayments out of operating flows, boosting OCF for lease-heavy companies mid-way through ten-year trends). A `leaseRepayments` contextual line item was considered and declined for v1; the pinned revisit trigger fired at the start of the Phase 2.5 golden-file pass and the fork was **kept declined (owner, 2026-07-15)**: FCF stays the conservative pinned definition, the detail-sheet seam note carries the IFRS 16 context, and the addition remains schema-additive if Phase 3's uploaded filings ever argue for it.

**N3: price.** Manual entry with as-of date (main plan §12.1); one price record per company feeds M12–M14 and the staleness badge (S3). Market cap = price × latest complete FY's `dilutedShares`, null when the price currency differs from that year's statements. **The currency guard (amended 2026-07-15):** M12–M14 and market cap are `not_meaningful` (`currency_mismatch`) when the price currency differs from the statements' currency; no FX exists anywhere (P-7), so mixing would print a meaningless figure. The case is real, not theoretical: CSL trades in AUD and reports in USD, so its valuation metrics need a deliberately entered USD price. The enter-price card states the statements' currency (frontend S3).

**N4: per-share basis.** Diluted weighted-average shares everywhere; R5 uses the same series.

**N5: no-debt coverage.** When `interestExpense` is ∅0 or zero, M8 renders "n/m: no interest burden" (a healthy state, the explainer says so) and R4 abstains.

## 7. Red-flag rules R1–R7 (thresholds pinned; owner-confirmed 2026-07-11)

Common contract: each rule emits `{ ruleId, severity: 'orange' | 'red', firedWith, explanation, whatToCheck }`, phrased as items to investigate, never verdicts (main plan non-goal 2). A rule whose data window is not covered **abstains silently** (abstention is not a pass). Dismissals are keyed `(companyId, ruleId, latestFy)`: adding a new fiscal year invalidates the dismissal and the rule re-evaluates (frontend S3 "dismissible-but-persistent").

**Code identifiers (pinned; main plan §12.8).** The R-numbers are this document's labels and never appear in code (house-style rule 4); `ruleId` values, dismissal keys included, are the semantic ids: R1 `earningsQuality`, R2 `erodingMoat`, R3 `leverageFlatteredReturns`, R4 `fragility`, R5 `dilution`, R6 `manufacturedReturns`, R7 `capitalIntensityCreep`.

| Id | Name | Fires when (pinned) | Severity |
|---|---|---|---|
| R1 | Earnings quality | operatingCashFlow < netIncome in each of the latest 3 consecutive FYs, and cumulative OCF ÷ cumulative NI < 0.9 over the window (the magnitude test keeps working-capital wobble from firing) | orange |
| R2 | Eroding moat | gross margin or operating margin declines year-over-year for ≥ 3 consecutive steps (4 labelled years), with a cumulative decline ≥ 2 pp over the window (the floor keeps basis-point drift from firing) | orange; red at ≥ 5 steps |
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
| Costco | COST | NASDAQ | 10-K | 10 | 0 |
| Union Pacific | UNP | NYSE | 10-K | 6 | 0 |
| CSL | CSL | ASX | Annual report (IFRS) | 10 | 2.5 |
| Wesfarmers | WES | ASX | Annual report | 6 | 2.5 |
| Woolworths | WOW | ASX | Annual report | 6 | 2.5 |
| JB Hi-Fi | JBH | ASX | Annual report | 6 | 2.5 |
| Cochlear | COH | ASX | Annual report | 6 | 2.5 |

- **Fixture format:** one JSON file per company: canonical line items per FY in minor units, a per-statement source reference (filing id + page), the expected `MetricsReport` computed by hand at display precision, and the expected red-flag results.
- **Acceptance:** line items equal the filing exactly (integer equality); metric values equal the hand computation at P-2 display precision; every bug ever found adds a regression fixture (main plan §5).
- **Depth rationale (owner-confirmed 2026-07-11):** 10 FYs for sample-data companies (their fixtures back the S2/S3 ten-year sparklines end to end); 6 FYs minimum elsewhere, which covers the widest windows in the system (the 5-year delta chip needs 6 labels; R2 needs 4). Hand-verifying ten years for all ten companies (~6,000 figures) buys nothing the 6-year floor doesn't. CSL keeps 10 FYs because it joins the sample set with Phase 2.5 (D1). *(Amended, owner, 2026-07-18: with the ASX-first sample set, samples admit the 6-FY floor; the four six-year ASX fixtures join CSL, their sample sparklines showing six points rather than ten, and deepening them stays optional. The transcription economics above are unchanged.)*
- **Sample subset:** the S2 "See it with sample data" fixtures are generated from this corpus (frontend §4). The sample set is the ASX golden five: CSL, Wesfarmers, Woolworths, JB Hi-Fi, and Cochlear (D1 as amended twice on 2026-07-18 with the ASX-first steer; the US trio retired, then the depth rule was amended to admit the four six-year fixtures alongside CSL's ten). The US five remain golden fixtures for the engine.

## 12. Open decisions and the owner review list

**D1: the sample trio vs the Phase 0 corpus. Resolved (owner, 2026-07-11): option (a).** The Phase 1 sample set is **Apple, Coca-Cola, Costco**, generated from the Phase 0 golden files (Costco's fixture verified to 10 FYs accordingly, §11); CSL joins the sample set when Phase 2.5's ASX golden files land, making the samples the showcase for ASX support at exactly the moment it exists. Zero added Phase 0 scope. The declined alternatives, for the record: hand-verifying CSL in Phase 0 (strongest end-to-end test of AUD + 30 June year-ends, at the cost of a bigger week one) and shipping a US-only pair (weakest wow). Frontend §4 updated to match. *Amended (owner, 2026-07-18, with the ASX-first steer recorded in the hedge fund gap plan of the same date): the US trio retires from the sample set; CSL alone remains, being the ASX fixture with the ten-FY depth this spec's depth rationale requires of samples. The US five stay in the golden corpus as engine fixtures. Amended again the same day: the owner relaxed the depth rule (§11 rationale) so the four six-year ASX fixtures join, making the sample set the ASX golden five: CSL, Wesfarmers, Woolworths, JB Hi-Fi, Cochlear. Frontend §4 updated to match each time.*

**D2: the metric budget number. Resolved (owner, 2026-07-11): option (a).** The dictionary stays pinned at 14; **exactly 12 render as dashboard cards**. M13 (earnings yield: the inverse of M12 with identical inputs) renders inside M12's detail sheet, and M10 (FCF margin) inside M11's (conversion is the stronger earnings-quality signal). Ids stay stable; nothing is deleted; the compare grid mirrors the 12 card metrics; and the 12-card budget is the enforced discipline: adding a card requires removing or demoting one. The declined alternatives, for the record: restating the budget as 14, and deleting two metrics outright. Main plan §2–§4 copy, frontend S3/S4, and CLAUDE.md updated to match.

**Amendment (owner-confirmed 2026-07-15): the valuation currency guard.** Surfaced by the Phase 2.5 golden-file pass (CSL: AUD market price, USD statements): M12–M14 and market cap return `not_meaningful` with the new `currency_mismatch` reason when the price currency differs from the statements' currency, with the pinned phrase in P-5. Engine, phrases, and a regression test capturing the old silently-computed behaviour landed in the same change, per the §1 contract rule.

**Review list (per main plan §12.1):** the ROIC construction (N1): **confirmed 2026-07-11**, with the lease note added to §2; the FCF definition (N2): **confirmed 2026-07-11**, with two detail-sheet copy notes recorded and `leaseRepayments` declined for v1; the P-2 tolerance: **confirmed 2026-07-11**, tightened to `max(3 × scaleUnit, 0.1%)` with display precisions as drafted; the R1–R7 thresholds (§7): **confirmed 2026-07-11**, with two de-noising amendments (R1: cumulative OCF ÷ NI < 0.9; R2: cumulative decline ≥ 2 pp); policies P-0…P-8 and the §11 depth decision (10/6 FYs): **confirmed 2026-07-11**. The review pass is **complete**: every pinned item in this document is owner-reviewed.

---

*The owner review pass completed 2026-07-11: both §12 decisions resolved and every flagged item confirmed (N1; N2 with its Phase 2.5 revisit trigger; P-2 tightened; R1–R7 with two de-noising amendments; policies P-0…P-8; the §11 depth). This document is now pinned; changes from here follow the §1 contract rule.*
