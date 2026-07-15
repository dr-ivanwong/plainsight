# Golden fixtures

The golden corpus (data-model spec section 11): one JSON file per company holding the canonical line items per fiscal year in integer minor units, per-year source references, and the expected `MetricsReport` at P-2 display precision together with the expected red-flag results. `test/golden.test.ts` asserts the engine reproduces every expectation exactly; the US five were the Phase 0 exit criterion, and the ASX companies join through Phase 2.5.

| Company | Ticker | FYs | Source | Generated |
|---|---|---|---|---|
| Apple | AAPL | 10 (FY2016 to FY2025) | EDGAR XBRL | 2026-07-11 |
| Microsoft | MSFT | 6 (FY2020 to FY2025) | EDGAR XBRL | 2026-07-11 |
| Coca-Cola | KO | 10 (FY2016 to FY2025) | EDGAR XBRL | 2026-07-11 |
| Costco | COST | 10 (FY2016 to FY2025) | EDGAR XBRL | 2026-07-11 |
| Union Pacific | UNP | 6 (FY2020 to FY2025) | EDGAR XBRL | 2026-07-11 |
| CSL | CSL | 10 (FY2016 to FY2025) | Annual reports, hand-transcribed | 2026-07-15 |

## Provenance and verification

- **Source:** SEC EDGAR `companyfacts` (XBRL), the primary source of record. Line items therefore equal the filed figures exactly (integer equality), satisfying the section 11 acceptance rule by construction.
- **Selection policy:** annual periods from 10-K filings, as-originally-reported: each period takes its value from the earliest 10-K reporting it, so later restatements and comparative re-presentations never overwrite what the year's own filing said. 10-K/A amendments are used only where no original carries the period.
- **Expected values** are computed by `tools/generate-fixtures.mjs`, a deliberately separate implementation of the pinned formulas (floats over dollars) that never imports engine code (integer minor units). A formula error must be made twice, independently, to survive the golden tests. During generation the balance identity is checked on every year within the P-2 tolerance.
- **Spot checks:** headline figures were verified against publicly known values (for example Apple FY2024 revenue 391,035 USD million, gross margin 46.2%, free cash flow about 109 USD billion; Coca-Cola gross margin about 61%; Costco current ratio about 1.0).
- **Owner ritual:** the spec calls these hand-verified; the intended follow-up is to spot-check a sample of line items against the printed 10-Ks and initial the pass. The `sourceRef.accessions` on every year name the filings to open.
- **Prices are synthetic.** Each fixture carries a plausible price with `asOf` 2026-07-10 purely so M12 to M14 exercise real arithmetic; they are not verified market data and the fixture says so.

Regenerate with:

```
EDGAR_CONTACT=you@example.com node tools/generate-fixtures.mjs
```

The contact address is required (SEC fair-access policy) and is never hardcoded in the repo. The script makes six requests total, sequentially, well under the SEC rate ceiling.

## Interpretation notes for owner review

Real filings exercised corners the spec leaves open. The choices below are implemented consistently in the engine and the generator; each is flagged so the review can pin or amend them in the data-model spec.

1. **Coca-Cola reports no total liabilities.** KO's balance sheet has no total-liabilities line (and tags no `us-gaap:Liabilities`), so `totalLiabilities` stays absent, as a user entering from the filing would leave it. Consequences, all spec-mechanical: the balance gate is not applicable; no KO year is "complete", so market cap is null under N3; and because P-4 keys the average basis on prior-year balance-sheet *completeness*, KO's ROE and ROIC stay on the ending basis despite ten years of data. If the P-4 trigger were "the items the metric needs are present in the prior year", KO would average. Worth an owner decision.
2. **Union Pacific reports no cost of revenue.** Railroad income statements have no cost-of-revenue or gross-profit line, so M1 is `insufficient_data` (missing `costOfRevenue`) in every UNP year, and UNP also has no complete year (market cap null). The S3 card will permanently offer "Add the missing number" for a number that does not exist; a possible refinement is a per-company "not applicable" assertion, which does not exist in the pinned schema.
3. **Apple stopped disclosing interest expense from FY2024.** The fixture asserts the not-reported-zero state from FY2024, as the entry flow invites; M8 renders "n/m: no interest burden" and R4 abstains from FY2024 on. Apple does carry term debt; the detail-sheet framing ("the filing does not break out an interest burden") is Phase 1 copy to keep honest. (Corrected 2026-07-12: the assertion originally started at FY2023, but the Phase 2 mapping golden cross-check found the FY2023 10-K still tags `us-gaap:InterestExpense`, 3,933 USD million, despite the changed income-statement presentation, so FY2023 is entered as filed.)
4. **Costco's stray gross-profit tag is excluded.** Costco prints no gross-profit line; a one-off `GrossProfit` tag in the FY2019 filing uses a net-sales basis (excluding membership fees) that disagrees with the total-revenue derivation by 3,352 USD million and would trip the P-8 gate. M1 therefore stays on the derived basis in all years. Note Costco's gross margin reads about 12.8% because total revenue includes membership fees; that is what the filing supports.
5. **Equity prefers the including-noncontrolling-interests total.** The section 2 hint says "Total stockholders' equity", but the P-2 balance gate (assets = liabilities + equity) only closes with the including-NCI total for filers with NCI (KO, early COST). The mapping prefers `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest` and falls back to the parent-only figure. Net income remains parent-attributable (`NetIncomeLoss`), so ROE for NCI-carrying filers mixes a parent numerator with a total-equity denominator; conservative, and immaterial for this corpus, but worth pinning.
6. **Rule window reading.** "Over the latest 3 years" (R3, R5) is implemented as the three-year span from t minus 3 to t (four consecutive labels, CAGR exponent one third). R1's magnitude test additionally requires positive cumulative net income; a loss-making three-year window stays silent rather than dividing by a degenerate base.
7. **No red flags fire in this corpus.** The US five and CSL are cash-generative large caps; the expected flag list is empty for each, and the golden tests assert exactly that. The rules' firing behaviour is covered by unit tests with synthetic series.

## The ASX corpus (Phase 2.5)

ASX companies have no EDGAR equivalent, so their fixtures are transcribed by hand from the lodged annual reports, never through the extraction pipeline: this corpus is the yardstick the pipeline is measured against. The hand-typed transcription (figures exactly as printed, in millions, with printed page numbers per statement) lives in [transcriptions/](transcriptions/); `tools/build-asx-fixture.mjs` checks it (balance identity and gross-profit identity within the P-2 tolerance, and net income over diluted shares must reproduce the PRINTED diluted EPS at its printed precision, which pins the transcription of all three figures together) and emits the fixture with expected values from the same independent implementation the EDGAR generator uses. Rebuild with `node tools/build-asx-fixture.mjs csl`.

### CSL interpretation notes for owner review

8. **CSL reports in US dollars and trades in Australian dollars.** All ten years are uniformly USD (the presentation-currency switch predates the corpus: even the FY2016 report is USD). The fixture price is synthetic USD so the valuation metrics exercise; entering a real AUD market price in the app renders them as the currency-mismatch state by design (data-model amendment of 2026-07-15).
9. **Each year is sourced from the annual report that carries it**: odd years from their own report, even years from the following report's comparative column. Two consequences, both owner-approved or noted: FY2016 comes from the FY2017 report's restated comparative (approved 2026-07-15; the original FY2016 face prints no operating-profit line and derives gross profit on a sales-revenue basis), and FY2020's balance column is as restated in the FY2021 report for the Vitaeris acquisition finalisation.
10. **Revenue is the printed Total Operating Revenue line**, the basis on which the filings compute gross profit; it includes the other income line (well under one percent of the total in every year).
11. **Interest expense is the face's Finance costs line for all ten years.** The note's composition shifts across the decade (lease interest joins under AASB 16 in FY2020, fair-value losses in FY2025), while the face line is printed every year; interest coverage is therefore marginally conservative.
12. **Net income is profit attributable to CSL shareholders; total equity includes non-controlling interests** (material from FY2023, CSL Vifor), the same mixed reading as note 5 and the figure on which the balance identity holds exactly in all ten years.
13. **The debt items are the face's interest-bearing liabilities lines**, which include lease liabilities from FY2020 under AASB 16; part of the FY2020 leverage step-up is that presentational change. Cash is the balance-sheet line (the cash-flow ending balance nets bank overdrafts).
14. **Depreciation and amortisation exists only from FY2020**: earlier cash flows use the direct method with no operating-section line, so the contextual item stays absent for FY2016 to FY2019. The FY2020 to FY2023 line is printed as depreciation, amortisation and impairment.
