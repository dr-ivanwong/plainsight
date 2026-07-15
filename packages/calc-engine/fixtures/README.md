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
| Wesfarmers | WES | 6 (FY2020 to FY2025) | Annual reports, hand-transcribed | 2026-07-15 |
| Woolworths | WOW | 6 (FY2020 to FY2025) | Annual reports, hand-transcribed | 2026-07-15 |
| JB Hi-Fi | JBH | 6 (FY2020 to FY2025) | Financial reports, hand-transcribed | 2026-07-15 |
| Cochlear | COH | 6 (FY2020 to FY2025) | Annual reports, hand-transcribed | 2026-07-15 |

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
7. **Three red flags fire in this corpus, all in the ASX set.** The US five, CSL, Wesfarmers, and Cochlear expect no flags; JB Hi-Fi expects the eroding-moat flag (orange, FY2022 to FY2025: three consecutive operating-margin declines totalling just over two points), and Woolworths expects leverage-flattered returns (orange, FY2022 to FY2025: the demerger-gain return base collapsing while borrowings rose) and fragility (orange, FY2025: interest coverage 2.7×). All three are the rules reading real statements, asserted exactly by the golden tests; the rules' full firing behaviour remains covered by unit tests with synthetic series.

## The ASX corpus (Phase 2.5)

ASX companies have no EDGAR equivalent, so their fixtures are transcribed by hand from the lodged annual reports, never through the extraction pipeline: this corpus is the yardstick the pipeline is measured against. The hand-typed transcription (figures exactly as printed, in millions, with printed page numbers per statement) lives in [transcriptions/](transcriptions/); `tools/build-asx-fixture.mjs` checks it (balance identity and gross-profit identity within the P-2 tolerance, and net income over diluted shares must reproduce the PRINTED diluted EPS at its printed precision, which pins the transcription of all three figures together) and emits the fixture with expected values from the same independent implementation the EDGAR generator uses. Rebuild with `node tools/build-asx-fixture.mjs <csl|wes|wow|jbh|coh>`.

The EPS checksum adapts to how each filing prints (the builder header documents the vocabulary): EPS in cents where printed so (all four FY2020-to-FY2025 companies), the net-income rounding grain from the printed decimal places (whole millions for Wesfarmers and Woolworths, one decimal elsewhere), a share-count disclosure grain where the note rounds the denominator (JB Hi-Fi to 0.1 million, Wesfarmers to whole millions, Woolworths to 0.1 million), and an explicit, noted print slack for the one year whose filing does not reconcile with itself (Woolworths FY2020, note 22). A line the filing does not print is transcribed as `'nrz'` and lands in the fixture as the not-reported-zero state; a printed dash is a printed nil, entered 0.

### CSL interpretation notes for owner review

8. **CSL reports in US dollars and trades in Australian dollars.** All ten years are uniformly USD (the presentation-currency switch predates the corpus: even the FY2016 report is USD). The fixture price is synthetic USD so the valuation metrics exercise; entering a real AUD market price in the app renders them as the currency-mismatch state by design (data-model amendment of 2026-07-15).
9. **Each year is sourced from the annual report that carries it**: odd years from their own report, even years from the following report's comparative column. Two consequences, both owner-approved or noted: FY2016 comes from the FY2017 report's restated comparative (approved 2026-07-15; the original FY2016 face prints no operating-profit line and derives gross profit on a sales-revenue basis), and FY2020's balance column is as restated in the FY2021 report for the Vitaeris acquisition finalisation.
10. **Revenue is the printed Total Operating Revenue line**, the basis on which the filings compute gross profit; it includes the other income line (well under one percent of the total in every year).
11. **Interest expense is the face's Finance costs line for all ten years.** The note's composition shifts across the decade (lease interest joins under AASB 16 in FY2020, fair-value losses in FY2025), while the face line is printed every year; interest coverage is therefore marginally conservative.
12. **Net income is profit attributable to CSL shareholders; total equity includes non-controlling interests** (material from FY2023, CSL Vifor), the same mixed reading as note 5 and the figure on which the balance identity holds exactly in all ten years.
13. **The debt items are the face's interest-bearing liabilities lines**, which include lease liabilities from FY2020 under AASB 16; part of the FY2020 leverage step-up is that presentational change. Cash is the balance-sheet line (the cash-flow ending balance nets bank overdrafts).
14. **Depreciation and amortisation exists only from FY2020**: earlier cash flows use the direct method with no operating-section line, so the contextual item stays absent for FY2016 to FY2019. The FY2020 to FY2023 line is printed as depreciation, amortisation and impairment.

### Wesfarmers interpretation notes for owner review

15. **No cost of sales or gross profit exists.** Wesfarmers presents expenses by nature, so both items stay absent and the gross margin is insufficient-data in every year: the Union Pacific shape (note 2) on the ASX side. The face does print an operating line (earnings before finance costs and income tax expense) and a depreciation and amortisation expense line, so both are transcribed; the gross-profit identity check is skipped for this company.
16. **Interest expense is the sum of the two printed face lines** (interest on lease liabilities plus other finance costs): the face prints no combined total. This is the one place in the corpus where a transcribed figure is a sum of two printed lines rather than one line; the transcription notes record it, and the alternative single-line readings would either drop lease interest or drop borrowing costs.
17. **FY2020 mixes bases, as the filing does.** The income items are the continuing-operations basis re-presented in the FY2021 report's comparative column; net income is the total attributable to members (1,697, including 75 of discontinued-operations profit), matching the printed total-basis EPS the checksum verifies. The balance sheet and cash flow are whole-of-group.
18. **Capex is a combined line** (property, plant and equipment plus intangibles, plus mineral exploration from FY2025); the filings print no split.

### Woolworths interpretation notes for owner review

19. **The calendar is 52/53 weeks.** End dates are the exact period ends printed in the statement headings (FY2021 ended 2021-06-27, FY2023 2023-06-25, FY2025 2025-06-29); FY2024 is the 53-week year, which flatters its comparisons by about a week of trading.
20. **The Endeavour demerger shapes FY2021 and FY2022.** FY2021: continuing-basis income face, net income total attributable (2,074 including 468 discontinued), Endeavour inside held-for-distribution assets and liabilities, and the 7,870 demerger distribution already deducted from equity (hence total equity of 1,739); operating cash flow and capex include Endeavour. FY2022 (from the FY2023 report's comparative) carries the 6,387 demerger gain in discontinued operations: net income 7,934, printed diluted EPS 644.8 cents. The leverage-flattered-returns flag the corpus expects over FY2022 to FY2025 is that return base collapsing while borrowings rose; with fragility on FY2025 coverage of 2.7×, these are the corpus's first naturally fired flags (note 7).
21. **FY2022 is as reclassified in the FY2023 report** (2,071 moved from branch and administration expenses into cost of sales; originally filed gross profit 18,042, re-presented 15,971), the even-year sourcing rule applied to a re-presentation rather than a restatement.
22. **FY2020's restated-comparative EPS does not reconcile with its own printed inputs**: every FY2020 EPS figure in the FY2021 report sits about 0.13 to 0.16 cents above net income over the printed share counts (the wage-remediation restatement's EPS row appears not to have been recomputed). The transcription records the printed figures and carries an explicit 0.1-cent print slack, declared in the transcription with its reason rather than hidden in a wider general tolerance; the builder prints the residual on every rebuild.
23. **Interest expense is the face's net finance costs line** (finance income netted against costs, labelled finance costs in the FY2021 report), so coverage is marginally flattered relative to a gross reading; cash and dividends follow the CSL readings (balance-sheet cash line; cash dividends to parent-entity holders, so the dividend reinvestment plan makes them smaller than declared dividends).

### JB Hi-Fi interpretation notes for owner review

24. **Operating income is the directors' report five-year-summary EBIT**: the statement of profit or loss runs expenses by function straight to profit before tax with no operating line. The printed EBIT reconciles to profit before tax plus finance costs less interest revenue exactly in five of six years (within 0.1m in FY2025, accrued versus received interest), so the figure is the filing's own and remains hand-traceable.
25. **Debt is the borrowings lines only; leases are presented separately** and stay inside total liabilities but out of the debt items. JB Hi-Fi's borrowings dance across the face: no line at all in FY2020 and FY2021 (entered not reported), non-current only in FY2022 and FY2023, current only in FY2024, and a printed dash (entered 0) in FY2025. Leverage therefore reads near zero against a fleet of leased stores, which is what the filings support.
26. **EPS is printed in cents and the share denominators to 0.1 million**, so the checksum carries the disclosure grain; the printed FY2022 diluted denominator (114.2m) is itself a sum of rounded components. Share repurchases is the off-market buy-back line alone (FY2022's 250.0; the separately printed buy-back costs and employee-share-trust purchases are excluded).
27. **Non-controlling interests first arise in FY2025**; net income is the owners' share and total equity includes the non-controlling 5.2, the corpus reading (note 5). Direct-method cash flows leave depreciation and amortisation absent in all six years.

### Cochlear interpretation notes for owner review

28. **The first Australian-dollar company in the corpus**, and the cleanest ASX transcription: a printed operating line (results from operating activities), a separated finance expense, interest line, and exact diluted share counts with exact net profit in the EPS note, so the checksum runs at full precision.
29. **FY2020 is the corpus's first loss year** (the 503.7 patent litigation expense): negative operating income, a tax benefit entered as negative tax expense, negative operating cash flow (the settlement was paid in the year), diluted loss per share equal to basic, and litigation-funding borrowings (393.1 current, 79.9 non-current) repaid over the following years while the equity raising (about 1,075.6) rebuilt the balance sheet. This year exercises the engine's negative-base states end to end against real figures.
30. **Debt is the loans and borrowings lines only** (leases separate, the JB Hi-Fi reading); by FY2024 no loans line prints at all, entered not reported. Capex is the property acquisitions line; the separately printed IT-system and other-intangible acquisition lines are excluded, so free cash flow is marginally flattered and consistently traceable.
31. **The FY2021 report is read from the annualreports.com archive mirror** (the lodged original's content, verified page for page); the FY2023 and FY2025 documents are the ASX-lodged originals.
