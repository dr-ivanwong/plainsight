# The finance look: staging the instrument panel

**Status:** Proposal · **Date:** 2026-07-19 · **Author:** Claude · **Type:** Design gap analysis and staging
**Companion to:** `2026-07-13-dashboard-design.md` (the step plan this stages), `plainsight.md` §4 (design language), `plainsight-frontend.md` §3 (screens)

---

## 1. The ask, and what it translates to

The owner wants Plainsight to look like a finance dashboard: a broker's screen, Yahoo Finance, an analyst's instrument panel. Today it reads as a calm reading app that happens to contain numbers.

Two readings of that ask have to be separated before anything is built:

- **The aesthetic:** dense figures, colour that signals direction, charts beside numbers, tabular layouts, a headline strip up top. This is buildable, and most of it is already planned: the dashboard design evolution plan (2026-07-13) translates Morningstar, Koyfin and Bloomberg conventions into this design system in twelve steps.
- **The content:** live quotes, intraday charts, news, movers, volume. Yahoo Finance is a market-data product. Plainsight is a financial-statement product with no live feed anywhere in its architecture, and the main plan's non-goals keep it that way. No styling produces a ticker tape, and this plan does not smuggle one in.

The honest target is therefore **the fundamentals half of a professional terminal**: Morningstar's key-ratios page, Koyfin's financials tab, the research pane of a broker, rendered in this product's own design language. Not the quote-and-news half.

One recorded decision bends. The main plan's design philosophy (§4) observes that financial tools "default to dense, intimidating, terminal-like interfaces" and answers that we apply the opposite. The dashboard design plan already loosened that reading in practice (its stated purpose is to feel "more like a financial analyst's instrument panel"); the owner's ask makes the loosening explicit. The first stage below records the amended direction in the main plan's §12 decision log, in the same change as the first code that acts on it.

## 2. What is already true

A walkthrough on 2026-07-19 (the ASX sample library, dashboard and library screens, both themes) against the dashboard design plan's implementation sequence (§8):

| Step (dashboard design plan §8) | Delivers | State |
|---|---|---|
| 1. Card elevation and hover | Depth cues on cards | Landed |
| 2. Section grouping | Five quiet category labels over the grid | Landed |
| 5 (first half). Sparkline area fill | Visual presence for the microtrends | Landed |
| 8. Grid density | Four deterministic columns at width | Landed |
| 3. Coloured delta chips | Direction reads as colour | Not built; gated on an owner confirmation |
| 4. Health-status dots | Card-level squint test | Not built; same gate |
| 5 (second half). Sparkline health colour | Trend shape carries the same signal | Not built; same gate |
| 6. Multi-year values on cards | The figures carry the history | Not built; gated on the disclosure loosening |
| 7. Key-stats header | The headline strip | Not built; same gate |
| 9. Year-range control | 5y/10y/all scope control | Not built; lands with its first consumer |
| 10. Practitioner table view | The dense tabular mode | Not built; ungated |
| 11. Trend chart section | Real charts on the dashboard | Not built; ungated |
| 12. Benchmark reference lines | Thresholds drawn on the charts | Not built; gated on default-threshold review |

In short: the quiet foundations landed and every step that changes the feel is still on the shelf. The dashboard today is structurally ready for the instrument panel and visually still the calm reading app.

Two observations from the walkthrough sharpen the gap:

- On the Woolworths sample, net margin falling 0.8 pp and debt-to-equity rising 0.68 render in the same grey as ROE improving 5.4 pp. Three signals an analyst reads instantly, dressed identically. This is the squint test (main plan §4) failing by construction, and it is exactly what steps 3 to 5 exist to fix.
- The library shows no figures at all: name, ticker, flag dot, a grey microsparkline, a date. A broker's watchlist leads with numbers; our home screen leads with typography. The dashboard design plan deliberately scoped the library out (§10), so this gap is unplanned; §5 below sketches the missing piece.

## 3. The gap, itemised

What finance dashboards do, against what Plainsight does today, and which step closes each:

1. **Direction has colour.** Every delta on a finance screen is red or green. Ours are all neutral grey. Steps 3, 4 and 5 (second half) close this with the semantic palette and a per-metric direction pin; valuation stays exempt (a P/E moving is not health).
2. **The figures carry the history.** Morningstar and Koyfin show the years inline; we show one value per card and hide the rest behind a tap. Step 6 puts the last five years on each card face; the plan itself calls it the single most impactful change.
3. **A headline strip.** Quote pages lead with a summary bar. We lead with the full grid. Step 7's key-stats header (ROE, net margin, debt to equity, FCF) is the fundamentals analogue.
4. **Charts beside numbers.** Our only chart on the dashboard is a decorative sparkline. Step 11's small-multiples trend section, scoped by step 9's year-range control and later annotated by step 12's benchmarks, is the missing instrument.
5. **A dense tabular mode.** Every professional tool offers the table. Step 10's cards/table toggle is that mode, grouped and keyboard-navigable.
6. **The watchlist leads with numbers.** Unplanned anywhere: the library's rows carry no figures. §5 below.

And the deliberate non-gaps, so the target stays honest. These stay declined (dashboard design plan §2.2 and §10): live market data, news, a dark sidebar, filter toolbars, coloured card backgrounds, custom fonts, composite scores, a brand-colour change. The rail that landed with the source-of-truth migration already carries desktop wayfinding; it does not become a Bloomberg sidebar.

## 4. Staging

Grouped by gate, not by size; every stage is shippable alone and arrives in slices. Steps cite the dashboard design plan §8; its per-step details are not repeated here.

**Stage 1: the instruments (no approvals needed).** The trend chart section (step 11) with the year-range control (step 9) landing alongside as its first consumer, then the practitioner table view (step 10). The main plan §12 log entry recording the amended design direction (§1 above) ships with the first commit. Biggest visible change available today; zero pinned decisions moved.

**Stage 2: colour (one confirmation).** Coloured delta chips (step 3), health dots (step 4), sparkline health colour (step 5, second half), landing together because they share one computed health signal. Needs the owner to confirm: the per-metric direction pin (data-model §6 amendment), the rule-to-metric map, and the valuation exemption (§6 below). The compare screen's delta chips inherit the colour through the shared component in the same change. *(Landed 2026-07-19, owner-approved with the recommended readings; main plan §12 entry 13 and data-model §6 note N6 record them. One correction to this paragraph's last sentence: the compare screen renders no delta chips, so nothing inherited there; its best-in-row tick keeps the separate peer-ranking field, deliberately untouched.)*

**Stage 3: figures density (one confirmation).** Multi-year values on cards (step 6) and the key-stats header (step 7). Needs the owner to confirm the progressive-disclosure loosening: "12 numbers, one tap away" becomes "12 metrics, history visible". Amends the main plan §4 wording, the frontend spec's dashboard rows, and CLAUDE.md's product-discipline line in the same change (dashboard design plan §11 names every passage). *(Landed 2026-07-19, the loosening owner-approved; main plan §12 entry 14 and the dashboard design plan §4.6 and §5.3 build notes record the readings.)*

**Stage 4: benchmarks (one confirmation).** Reference lines (step 12), after the owner settles the default thresholds (§6 below). Depends on stage 1's charts. *(Landed 2026-07-22 with the resolved defaults; the dashboard design plan §6.5 build note records the readings. With it, every stage of this plan is landed and the dashboard design plan's twelve steps are complete.)*

**Stage 5: the library as watchlist (new scope).** §5 below; amends the frontend spec's library screen in the same change. Benefits from stage 2 (coloured deltas in its columns) but does not require it. *(Landed 2026-07-22: the row figure and the desktop screener per §5's sketch, with two build readings: the screener is flat, sorting and sector bands being rival orderings, and its reports assemble in one live pass because sortable columns need their values above the row components, where per-company hooks cannot reach.)*

Stages 2 and 3 are small builds behind large confirmations; if the confirmations arrive together, colour and density can leapfrog the larger stage 1 build. The order above optimises for starting without waiting.

## 5. The library, read as a watchlist

Today's row: name, sample chip, ticker and exchange, flag dot, microsparkline, updated date. Nothing an analyst can compare.

Proposal: the dashboard's cards/table pattern, applied at home.

- **Rows stay the default** and stay calm; they gain one compact figure block on the trailing edge: latest ROE in 13px tabular figures with its five-year delta chip (coloured once stage 2 lands). One number, not a data dump; the microsparkline already tells the shape.
- **A rows/table toggle appears at desktop width** (persisted in `db.meta` beside the dashboard's). The table is the screener reading: one company per row; columns for ticker, latest FY, ROE, net margin, debt to equity, flag count, and the ROE microsparkline; 13px tabular figures; client-side column sort (the library is tens of rows at most). Tapping a row opens the dashboard, as today.
- **Mobile keeps today's rows.** A screener table has no honest phone rendering at these column counts, and the phone is the reading device, not the scanning device.
- Sample chips, sync placeholders, the empty hero, and the filter-past-twelve behaviour are unchanged in both modes.

Data cost: none. The rows already hold each company's metrics report (the ROE sparkline reads it today); the columns read the same report. Amendments: the frontend spec's library states and component inventory (a `LibraryTable`), and the `db.meta` key, all in the build's own change.

## 6. Open questions for the owner (these gate the stages)

1. **Record the direction shift?** The main plan §4 philosophy is reworded to the instrument-panel reading and logged in §12 (stage 1's first commit). Recommendation: yes; this document is the argument.
2. **Per-metric direction pin (gates stage 2).** The engine's `higherIsBetter` display hint is promoted to the pinned dictionary. Recommendation: pin the nine unambiguous operating metrics as hinted; pin **current ratio as direction-neutral** (an ever-fatter current ratio is not obviously healthier, so its chip stays grey); valuation pair exempt from colour entirely. *(Resolved 2026-07-19 as recommended, with one build finding: `higherIsBetter` already serves the compare screen's best-in-row ranking, so the health pin landed as its own dictionary field, `healthDirection`; data-model §6 note N6.)*
3. **Rule-to-metric map (gates stage 2).** The draft in the dashboard design plan §4.2. Recommendation: adopt as drafted. *(Resolved 2026-07-19 as drafted.)*
4. **Progressive-disclosure loosening (gates stage 3).** Recommendation: yes; without it the dashboard cannot show a year of history without a tap, and that tap is the distance between reading app and instrument. *(Resolved 2026-07-19 as recommended; main plan §12 entry 14.)*
5. **Benchmark defaults (gates stage 4).** The two flagged conflicts: recommendation: ship interest coverage's line at 3.0× presented as the fragility rule's own threshold; ship ROE at 15%; leave debt-to-equity with **no default** (1.0 beside the rule's pinned 2.0 draws a caution line the rules do not own; the owner can set one). *(Resolved 2026-07-22 as recommended: ROE and the rule-presented coverage floor ship as the only defaults; debt-to-equity and every other metric start unset and stay settable.)*
6. **Library columns (stage 5).** Recommendation: ROE, net margin, debt to equity, flags; add more only after living with four. *(Resolved 2026-07-22 as recommended.)*
7. Unchanged and still open from the dashboard design plan's footer: whether the detail sheet offers exact money figures beside the pinned compact display.

## 7. What does not change

The product discipline survives the look. The 12-card budget; never buy or sell language; every displayed number reproducible by hand from its detail sheet; both themes designed, not inverted; WCAG AA floors and the table fallbacks behind every chart; the system font stack; one accent; green, orange and red spent only on meaning. The finance look is achieved by finishing the planned instruments and extending them to the library, not by loosening any of these.
