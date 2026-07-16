# Dashboard Design Evolution

**Status:** Proposal · **Date:** 2026-07-13 · **Revised:** 2026-07-14 (corrections from a verification pass against the pinned specs and the codebase) · **Author:** ChatGPT-5.6, corrections Claude · **Type:** Design plan
**Companion to:** `plainsight.md` §4 (design language), `plainsight-frontend.md` §3 (screen inventory), `plainsight-data-model.md` (metric dictionary)

---

## 1. Purpose

The company dashboard (S3) is the heart of the app. It currently renders as a clean grid of twelve white cards on a light-grey background: typographically rigorous, structurally sound, but visually quiet compared to the professional financial dashboards (Morningstar, Koyfin, Simply Wall St) that the practitioner persona (main plan §3) is accustomed to. This plan describes a set of incremental changes to make the dashboard feel more like a financial analyst's instrument panel while staying true to Apple HIG principles: clarity, deference, and depth.

The visual reference is an energy-management dashboard (Figma Community, by arshiya.senselive) with a dark-green sidebar, coloured metric tiles, filter toolbars, donut charts, and line charts. We are not copying it. We are translating the qualities that make it feel like a dashboard (visual density, at-a-glance health, trend presence, structural grouping) through the lens of Apple's design language and financial dashboard conventions, where the numbers themselves are the content, trends are visible in figures (not just lines), and the interface defers to the data.

### 1.1 Governing constraints

This is a design evolution, not a pivot. The following remain unchanged:

- The 12-card budget and the pinned metric dictionary.
- The type scale (11/13/15/17/20/22/28/34), spacing scale (4/8/12/16/20/24/32/40/48/64), and system font stack.
- Single-column layout with no persistent sidebar.
- One accent colour (`#007AFF` family); green/orange/red reserved for semantic health.
- Progressive disclosure: the dashboard stays 12 metrics; depth is one tap away.
- Motion: springs only, `prefers-reduced-motion` honoured globally.
- The offline-first binding constraint.

One constraint is deliberately loosened: "the dashboard stays 12 numbers" now means 12 metrics, not 12 values. The practitioner table view (§5.4), multi-year card values (§4.6), and key-stats header (§5.3) show the same 12 metrics across multiple fiscal years. No new information is added; existing information is made visible without a tap.

This loosening is a change to pinned copy, not a footnote: the main plan's progressive-disclosure paragraph (§4) currently promises that historical depth is "one tap away, never on-screen by default", and multi-year rows put it on-screen by default. It therefore goes on the owner-review list, §11 names every pinned passage it amends, and the steps that depend on it (§8, steps 6 and 7) are blocked until that review lands.

## 2. What the reference does well (and how we adapt it)

| Reference quality | What it does | How we translate it |
|---|---|---|
| **At-a-glance health** | Coloured status pills on every card ("normal", "high", "optimal") | A small health-status dot on each card, using the existing semantic palette (§4.2) |
| **Trend presence** | Percentage change with directional arrows, prominent on each card | Coloured delta chips: direction-aware colour instead of the current neutral grey (§4.3) |
| **Visual density** | Four compact cards per row, tight spacing | Adjust the grid to favour four columns at the wide-column width (§5.1) |
| **Structural grouping** | Cards grouped under section headers (though the reference groups by device) | Group the 12 cards by metric category with light section labels (§5.2) |
| **Chart presence** | Donut and line charts below the card grid | A trend chart section below the grid with benchmark reference lines (§6) |
| **Card depth cues** | The reference uses dark backgrounds; the idea is visual weight | Subtle shadows in light mode; slightly elevated surfaces in dark mode (§3.1) |

### 2.1 Financial dashboard conventions (distinct from the reference)

The reference design is a generic analytics dashboard. Financial dashboards have their own conventions that the reference does not exemplify. This plan adopts five of them:

| Convention | What financial tools do | How we adopt it |
|---|---|---|
| **Multi-year visibility** | Show 3-10 years of values inline (Morningstar Key Ratios, Koyfin financials) | Cards show the last 3-5 years of values beneath the sparkline (§4.6) |
| **Density toggle** | Offer a compact tabular view alongside visual cards (Simply Wall St snowflake vs. table) | A practitioner table view toggled via segmented control (§5.4) |
| **Headline numbers** | Lead with 3-4 key figures before the full grid (Bloomberg quote header, Koyfin summary bar) | Key-stats header showing ROE, net margin, D/E, and FCF (§5.3) |
| **Compact notation** | Abbreviate absolute values: $1.2B, $450M (universal in financial UIs) | Already shipped: money renders compact to 3 significant figures everywhere, as pinned display precision (data-model §4); no change needed (§4.7) |
| **Benchmark lines** | Show thresholds and industry averages on charts (15% ROE line, sector-average margin) | User-settable benchmark reference lines on trend charts (§6.5) |

### 2.2 What we are not adopting

| Feature | Why not |
|---|---|
| **Dark sidebar navigation** | Three top-level destinations do not justify permanent chrome; a sidebar here competes with the content it should defer to (Apple HIG: deference) |
| **Dark-background coloured cards** | Inverting card surfaces requires a parallel contrast system and violates "colour is meaning, not decoration"; the visual weight comes from elevation and health indicators instead |
| **Filter/toolbar bar** | Plainsight shows historical data for one company; there is nothing to filter in real time |
| **Custom fonts** | The system font stack is a deliberate choice for platform coherence and zero-latency rendering |
| **Brand colour change** | The accent stays `#007AFF`; semantic colours stay reserved; a green brand would collide with "healthy" |
| **Radar charts or composite scores** | The compare screen (S7) is deliberately restrained: no radar charts, no scores; the user forms the judgement (main plan §4). The same principle applies here |

## 3. Token-level changes

All changes are additions to the existing token file (`tokens.css.ts`) and palette (`palette.ts`). No existing tokens are modified.

### 3.1 Elevation (new)

The current system uses no shadows; elevation in light mode is implied solely by white cards on `#F2F2F7` grey. This works but produces a flat visual plane where every card has equal weight. Apple's own apps (Stocks, Health, Weather) use barely perceptible shadows to separate content cards from the background.

```
elevation:
  card:
    light: '0 1px 3px rgba(0, 0, 0, 0.08)'
    dark:  'none'  (dark mode uses surface brightness stepping, unchanged)
  cardHover:
    light: '0 2px 8px rgba(0, 0, 0, 0.10)'
    dark:  'none'
```

The shadow values are intentionally subtle: 1px offset, low opacity. The hover shadow is slightly larger, providing interactive feedback that the card is tappable. Dark mode gets no shadow (it would look wrong against `#000000`); the existing `surface` to `surfaceElevated` stepping is sufficient.

A new `surfaceHover` token provides the dark-mode equivalent of the hover shadow:

```
surfaceHover:
  light: '#FFFFFF'  (same as surface; the shadow does the work)
  dark:  '#252527'  (one step between surface #1C1C1E and surfaceElevated #2C2C2E)
```

### 3.2 Sparkline colours (new)

Sparklines are currently `colour.textSecondary` (neutral grey). To communicate trend health at a glance, sparklines can optionally use directional colour:

```
sparkHealthy:
  light: '#248A3D'  (same as colour.healthy)
  dark:  '#30DB5B'
sparkInvestigate:
  light: '#C93400'  (same as colour.investigate)
  dark:  '#FFB340'
```

These are not new colours; they are aliases that make the existing semantic palette available in the sparkline context. The default remains `textSecondary`; colour applies only when the metric has a clear directional preference and the five-year delta is known.

### 3.3 Section label styling (new)

A new composite token for the metric-group section labels:

```
sectionLabel:
  fontSize: caption2 (11px)
  fontWeight: semibold (600)
  letterSpacing: +0.06em (wider than caption tracking for this all-caps micro-label)
  colour: textSecondary
  textTransform: uppercase
  marginBottom: space[8]
```

This follows Apple's grouped-list section header pattern (Settings, Health): small, quiet, uppercase, out of the way. The wide tracking keeps the small caps legible. In the grid, every label after the first also takes `marginTop: space[24]`: the uniform 12px gap alone would seat a label closer to the previous group's cards than to its own, and groups separate generously.

### 3.4 Table-view tokens (new)

The practitioner table view (§5.4) needs a few layout tokens:

```
table:
  rowHeight: 44px  (the touchTarget token; the frontend spec pins targets at 44pt or larger everywhere, grid cells included, so the first draft's 40px rows are out)
  cellPadding: '4px 12px'
  headerBackground:
    light: '#E8E8ED'  (one step darker than the app background #F2F2F7)
    dark:  '#141416'  (between the pure-black background and surface #1C1C1E)
```

## 4. Component-level changes

### 4.1 MetricCard: elevation and hover

**Current:** flat white surface, no shadow, no hover state.

**Change:** add the `elevation.card` shadow in light mode. On hover (pointer devices only, via `@media (hover: hover)`), transition to `elevation.cardHover` / `surfaceHover` with the spring curve at `durationFast`. This gives each card a subtle lift on hover, communicating interactivity without a colour change. Touch devices skip the hover state entirely (no sticky hover).

The card's existing `borderRadius: radius.large` (14px) clips the shadow correctly. No structural change to the component's markup.

Dark mode: the card background stays `colour.surface` (`#1C1C1E`). On hover, it transitions to `surfaceHover` (`#252527`). The brightness step is the depth cue.

### 4.2 MetricCard: health-status indicator

**Current:** no per-card health signal. Health information lives only in the red-flag section below the grid and in the DeltaChip's neutral-coloured direction arrow.

**Change:** add a small coloured dot (6px diameter, `border-radius: full`) to the right of the metric label. The dot colour maps to a three-state assessment derived from the metric's five-year delta direction and whether any red-flag rule references this metric:

| State | Colour | Meaning |
|---|---|---|
| Improving (delta up on a higher-is-better metric, or down on lower-is-better) | `colour.healthy` | Trend is moving in the right direction |
| Stable or insufficient data | No dot rendered | Nothing to communicate; absence of signal, not absence of data |
| Deteriorating, or a red-flag rule fires on this metric | `colour.investigate` | Worth a look; tapping the card reveals more |

This is not decoration: the dot communicates the same semantic information as the red-flag section, but at the card level, enabling the "squint test" (main plan §4: "a user should be able to squint at a company dashboard and read its health from colour distribution alone"). The dot is always paired with text (the delta chip and the red-flag explanation), satisfying the colour-blind accessibility requirement.

Three specifics the first draft left open:

- **Precedence: a fired rule wins.** A metric can be improving on its five-year delta while a rule fires on it (ROE under the manufactured-returns rule, say); the dot shows investigate. Improving renders only when no rule implicates the metric.
- **The rule-to-metric map does not exist yet.** A fired rule carries its id, severity, explanation, and what-to-check copy; nothing in the rule contract names the cards it implicates. The map below is this plan's draft, to be pinned at implementation alongside the education copy (owner review, §11): earnings quality → FCF conversion; eroding moat → gross margin and operating margin; leverage-flattered returns → debt to equity and ROE; fragility → interest coverage; dilution → no card (the banner carries it; no card shows share count); manufactured returns → ROE and debt to equity; capital-intensity creep → free cash flow.
- **The valuation cards are exempt.** P/E and FCF yield move with the price paid, not with the business; colouring them healthy or investigate reads as a view on the price, which this product does not offer. Their cards render no dot (see also §4.3).

Implementation: a new `healthDot` prop on `MetricCard`, computed by the `Dashboard` container from the delta direction, the fired-rules list, and the rule-to-metric map. The dot is a `<span role="img">` with an `aria-label` ("improving" or "worth investigating") placed inline after the label; a bare span with an `aria-label` is not reliably announced, so the role is part of the contract.

### 4.3 DeltaChip: directional colour

**Current:** always `colour.textSecondary`, with the code comment "deliberately neutral in colour; health colour belongs to the items-to-investigate section, not to every trend."

**Proposed change:** colour the delta chip by direction, using semantic colours:

| Direction | Colour | Rationale |
|---|---|---|
| `up` on a higher-is-better metric | `colour.healthy` | Improving |
| `down` on a lower-is-better metric | `colour.healthy` | Improving (e.g. debt-to-equity falling) |
| `flat` | `colour.textSecondary` | Neutral; no signal |
| Deteriorating (the inverse cases) | `colour.investigate` | Worth investigating |

This is a departure from the current recorded decision (the component's own comment: "deliberately neutral in colour; health colour belongs to the items-to-investigate section, not to every trend"). The justification: when a metric has an unambiguous directional preference, colouring the delta is semantic, not decorative, and the main plan's squint test (§4: read a company's health from colour distribution alone) anticipates exactly this kind of card-level signal.

Two corrections to the first draft's claims (2026-07-14). First, direction lives in the engine as `higherIsBetter`, a display hint whose own comment says it is not a pinned dictionary field, and which nothing consumes yet; the first draft called it `polarity` and claimed the data-model spec defines it, which it does not. Promoting the hint to user-facing colour means pinning per-metric direction in the dictionary (data-model §6), owner-reviewed, with current ratio the case to argue: the field defaults it to higher-is-better, and an ever-fatter current ratio is not obviously healthier. Second, not every direction is a health claim: P/E and FCF yield move with the price paid, so their chips stay neutral (§4.2's exemption). The red-flag section remains the authority for investigation context; the delta colour is a scan-level signal for the ten operating metrics, not a replacement.

**This change requires updating the DeltaChip component comment, its row in the frontend spec's component inventory (§5), the data-model §6 dictionary (pinning per-metric direction), and recording the decision change in the main plan's §12 log (§11).**

Implementation: `DeltaChip` receives a new optional `higherIsBetter?: boolean` prop, named after the existing field. The container passes `METRICS[id].higherIsBetter` for the ten operating metrics and omits it for the valuation pair, whose chips stay neutral. The chip's className resolves to one of three styles: `chipHealthy`, `chipInvestigate`, or the existing neutral `chip`.

### 4.4 Sparkline: area fill and health colour

**Current:** a 100x28 SVG polyline in `textSecondary`, no fill.

**Change:** add a subtle area fill beneath the polyline (a closed polygon from the line to the bottom edge of the viewBox) using the same stroke colour at ~0.10 opacity. This gives the sparkline more visual presence without adding information; the line is still the signal, the fill is grounding.

Optionally, when the metric's five-year delta is known and the sparkline has sufficient data, the stroke and fill colour changes from `textSecondary` to `sparkHealthy` or `sparkInvestigate` (§3.2). This is the same health signal as the dot (§4.2) and the delta chip (§4.3), computed once in the container and passed to all three, with the same valuation exemption. When the delta is flat or unknown, the sparkline stays neutral grey.

The viewBox stays `0 0 100 28`; the component gains an optional `health?: 'healthy' | 'investigate'` prop.

### 4.5 RedFlagBanner: no change

The red-flag banners are already well designed (4px coloured left border, clear hierarchy). No changes.

### 4.6 MetricCard: multi-year values

**Current:** each card shows only the latest fiscal year's value at 34px display size. Historical context is available only through the sparkline (decorative, no axis, no labels) and the delta chip (a single five-year summary). To see actual historical values, the user must tap into the detail sheet.

**Change:** beneath the sparkline, render a compact row of the last 3-5 fiscal years' values in `caption2` (11px) tabular figures, separated by `space[8]`. Each value is a plain formatted number through the existing formatter (money already renders compact, §4.7). The fiscal-year label sits above each value in `caption2` at reduced opacity.

Example rendering for ROE:

```
ROE                          ● (healthy dot)
22.4%                    ↑ 4.2 pp
▁▂▃▄▅▆▇█▇▆  (sparkline)
2020   2021   2022   2023   2024
18.2   19.8   20.1   21.1   22.4
```

Behaviour:
- When only 1-2 years exist: no year row rendered (the sparkline also suppresses below 2; the card shows just the latest value).
- When 3-5 years exist: all render.
- When 6+ years exist: show the latest 5; the sparkline still draws all available years.
- The year row wraps naturally on narrow cards (mobile); the values stay tabular within whatever fits.

This is the single most impactful change for making the dashboard feel financial. A financial analyst reads the trend in the numbers, not in a line; the sparkline confirms the shape, but the figures carry the analysis.

Implementation: `MetricCard` receives a new optional `history?: Array<{ fy: string; display: string }>` prop. The `Dashboard` container builds it from `report.metrics[id].values`, formatting each via the existing `formatMetricValue`. The year row is a flex container with `gap: space[8]`, each cell a `flex: 1` span.

### 4.7 Compact number formatting

**Correction (2026-07-14): the first draft proposed something that already exists.** It claimed money currently renders as full figures with thousands separators; it does not. `formatMoneyMinor` in the calc-engine already renders money compact to 3 significant figures with a currency symbol ("$9.65b", lowercase suffixes k/m/b/t; sub-thousand amounts plain), and that precision is pinned display policy (data-model §4), owner-confirmed in the display-precision review (its §12). The existing formatter even settles the boundary the first draft's test plan got wrong: a value like $999.50k deliberately prints as "$1.00m", never "$1000k".

So: no new formatter, no new display mode, no new tests. The card face, the multi-year row (§4.6), the key-stats header (§5.3), and the practitioner table (§5.4) all call the existing `formatMetricValue`. Percentages, ratios, and coverage are already compact under the same pinned policy.

The one idea worth keeping from the first draft is full-precision money somewhere reachable, in service of the reproduce-by-hand rule. That is a change to pinned display precision, so it is not adopted here; it goes on the owner-review list (§11) as a question: should the detail sheet's substituted-inputs line offer exact figures alongside the compact ones?

## 5. Layout evolution

### 5.1 Grid density

**Current:** `gridTemplateColumns: repeat(auto-fit, minmax(160px, 1fr))`, gap `12px`, in the 960px wide column. **Correction (2026-07-14): the first draft (and the frontend spec §7 parenthetical it echoed) had the arithmetic wrong.** The column is border-box with 20px side padding, so the grid's content width at full size is 920px, and auto-fit packs as many 160px tracks as fit: five columns of ~174px, not "3 to 4". Four columns actually occur only in the roughly 800-900px viewport window.

The first draft proposed lowering the minimum to 144px to "make four columns the common case". That does the opposite: 144px tracks still pack five columns at 920px (a sixth misses the fit by 4px, an uncomfortably fragile threshold), and the mid-width window moves from four columns to five. Narrower tracks also fight this plan's own §4.6, which asks every card to seat a five-year figure row.

**Change (corrected):** at the ≥900px breakpoint, where the wide column applies (frontend spec §7), set the grid to an explicit `repeat(4, 1fr)`: four deterministic columns of ~221px, with room for the year row. Below 900px, keep the existing `auto-fit, minmax(160px, 1fr)` behaviour unchanged (two columns on a 375px phone, as today). This amends the frontend spec §7 parenthetical (§11).

Keep the gap at `12px`. Increasing it (as some dashboard designs do) would lose the tight, scan-friendly grid that the reference dashboard achieves. Decreasing it would crowd the shadows.

With §5.2's grouping, a four-track grid renders the five sections as 3 / 2 / 3 / 2 / 2 cards per labelled row: one or two empty tracks per section, which is calm raggedness, not misalignment. Grouping is also why the first draft's extra-columns instinct was backwards; sections of two and three cards want fewer, wider tracks, not more.

### 5.2 Section grouping

**Current:** all 12 cards render in a flat grid with no visual structure beyond the card order.

**Change:** insert lightweight section labels above each metric group, breaking the grid into five groups that match the metric dictionary's categories:

| Section label | Cards |
|---|---|
| PROFITABILITY | Gross margin, operating margin, net margin |
| RETURNS | ROE, ROIC |
| SAFETY | Debt to equity, current ratio, interest coverage |
| CASH | Free cash flow, FCF conversion |
| VALUATION | P/E, FCF yield |

Each section label is a styled `<h2>` using the `sectionLabel` token (§3.3), placed above its group's cards. The cards within each section continue to flow in the same responsive grid; the section label spans the full grid width (`gridColumn: 1 / -1`).

The sections are not collapsible. Progressive disclosure happens at the card level (tap to open the detail sheet), not at the section level; hiding sections would break the "12 metrics, always visible" contract.

Implementation: **correction (2026-07-14): no category field exists.** The first draft claimed `METRICS[id].category` is "already available"; the metric definitions carry id, label, formula, format, and card placement only, and the pinned dictionary (data-model §6) has no category column. The five groups above are new vocabulary this plan introduces. They live as a UI-side constant in the dashboard feature (a `DASHBOARD_SECTIONS` map from section label to metric ids), which keeps the pinned dictionary untouched; the alternative, a category column in data-model §6, is heavier process for no rendering gain. The section names are user-facing copy and are reviewed as copy (§11). The `Dashboard` card loop renders a section label between groups.

One current-state omission the first draft made: when no price exists, the two valuation cards already collapse into a single double-width "Enter today's price" card. That card belongs to the Valuation section and spans two of its tracks; the table view mirrors the same collapse (§5.4).

### 5.3 Key-stats header

**Current:** no summary above the metric grid. The user must scan all 12 cards to form an impression.

**Change:** add a compact key-stats row between the hero header and the metric grid, showing the four headline numbers that a financial analyst reads first:

| Stat | Why this one |
|---|---|
| **ROE** | The bellwether return metric; the value-investing literature centres on it |
| **Net margin** | The bottom-line profitability signal; captures pricing power and cost discipline |
| **Debt to equity** | The single safety figure; high leverage is the most common value trap |
| **Free cash flow** | Earnings quality; the accounting-trick detector |

One from each of the first four metric categories (Profitability, Returns, Safety, Cash). Valuation is intentionally excluded: it requires a price input and is more situational than the quality metrics.

Layout: four values in a flex row with `gap: space[24]`, each as a vertical stack: label in `caption1` secondary colour above, value in `title2` (22px) semibold tabular primary colour below. On mobile (< 600px), the row wraps to 2x2. Each value opens its metric's detail sheet on tap, through the same search param as the card's link (the first draft said "scroll-to, then open the detail sheet"; a scroll-to under an opening sheet does nothing). A stat whose latest value is not computable renders its pinned n/m phrase, exactly as its card does.

The key-stats header is suppressed when no fiscal years exist (the dashboard shows the empty state instead).

This replaces the "summary health bar" concept (which counted improving metrics and flags). The meta-health information ("8 improving, 2 flags") is secondary to the actual numbers; the health dots on each card (§4.2) already communicate trend direction at the card level. A financial user wants to see ROE: 22.4% before they want to know that 8 metrics are improving.

### 5.4 Practitioner table view

**Current:** the dashboard has one view: the card grid. The practitioner persona (main plan §3: "knows the ratios already, wants a fast, clean tool to run the numbers") is served by the same layout as the learner. The education layer is dismissible (settings), but the visual density is not adjustable.

**Change:** add a "Cards / Table" segmented control to the dashboard chrome (the flex row that holds "< Library" and "Edit data"). Selecting "Table" replaces the card grid with a compact tabular view:

```
               2020      2021      2022      2023      2024    5y delta
PROFITABILITY
Gross margin   38.2%     39.1%     40.3%     41.0%     42.1%   ↑ 3.9 pp
Op. margin     24.5%     25.2%     26.8%     27.1%     28.4%   ↑ 3.9 pp
Net margin     21.1%     22.0%     23.4%     23.8%     24.7%   ↑ 3.6 pp
RETURNS
ROE            18.2%     19.8%     20.1%     21.1%     22.4%   ↑ 4.2 pp
ROIC           14.1%     14.9%     15.3%     16.0%     16.8%   ↑ 2.7 pp
...
```

Design:
- Metrics as rows, fiscal years as columns (last 5 by default; a "Show all" toggle expands to all available years, scrollable horizontally with a sticky metric-label column).
- Grouped by category with the same section labels as the card view (§5.2).
- Row height: `table.rowHeight` (44px, the pinned touch-target floor; §3.4). Cell padding: `table.cellPadding`.
- All values in `caption1` (13px) tabular figures. The delta column uses the coloured delta chip (§4.3).
- Health dots (§4.2) render before the metric label.
- Section header rows use `table.headerBackground` and `sectionLabel` styling.
- Tapping a metric row opens the same detail sheet as tapping a card.
- Money values render through the existing compact formatter (§4.7).

Cell states, mirroring the card grid's (the frontend spec's bar: if a state can occur, its rendering is specified):

- **Not meaningful:** the cell renders "n/m"; the full pinned phrase ("n/m: negative equity") is the cell's accessible name and appears in the row's detail sheet.
- **Insufficient data:** the cell renders "n/a" with an accessible "not enough data" name; when the latest year is the incomplete one, the row carries the same "Add the N missing numbers" deep link its card shows.
- **No price:** the two valuation rows collapse into one "Enter today's price" row spanning the year columns, mirroring the card collapse.
- **Single year:** one year column, delta column hidden, matching the card grid's single-year state.

The view choice persists in IndexedDB (`db.meta`, alongside the theme preference). The default is "Cards" (the learner's first experience should be the card grid). The key-stats header (§5.3) renders in both views; the trend chart section (§6) also renders in both views.

This is the Apple pattern for density adjustment: Health offers "Show All Health Data" as a table; Stocks offers a watchlist as cards or as a compact list. The toggle respects both personas without compromising either.

Accessibility: the table uses semantic `<table>`, `<thead>`, `<th scope="col">`, and `<th scope="row">` markup. Row headers carry the metric label; column headers carry the fiscal year. Screen readers get full cell-by-cell navigation. The table is keyboard-navigable with arrow keys (matching the data-entry grid's keyboard model from S5).

### 5.5 Year-range control

**Current:** the dashboard shows all available fiscal years in sparklines and (via §4.6) in the multi-year row.

**Change:** add a quiet year-range selector below the key-stats header: "Last 5 years" (default) / "Last 10 years" / "All." This controls which years appear in the multi-year card row (§4.6), the practitioner table (§5.4), and the trend chart (§6). The card grid always shows the latest value regardless of the selected range.

Implementation: a segmented control with three options, stored in component state (not persisted; it resets to "Last 5 years" on each visit). Rendered only when more than 5 fiscal years exist.

This is a standard financial dashboard control. Morningstar, Koyfin, and Bloomberg all default to 5 years and let the user expand.

## 6. Trend chart section

### 6.1 Purpose

The reference dashboard's donut and line charts provide visual depth that Plainsight's sparklines cannot. The sparklines are decorative micro-indicators (the spec says so: "decorative by contract"); the detail sheet's full chart requires a tap. Adding a visible trend chart section to the dashboard itself closes the gap between "scan the numbers" and "see the shape."

### 6.2 Design

Below the metric grid (and above the red-flag section), a new section renders the selected category's trends, one category at a time via a segmented control. **Correction (2026-07-14): the first draft overlaid a category's metrics on one chart, which only works for two of the five categories.** Cash mixes dollars with a percentage, Valuation mixes a ratio with a percentage, and Safety's interest coverage (tens of ×) flattens debt-to-equity (around 1.0) into the x-axis. One y-axis cannot carry them; and under the no-decorative-colour rule there are no three distinguishable neutral strokes for a legend anyway.

**Change (corrected): small multiples.** The section renders one mini chart per metric in the category (two or three), side by side on a shared x-axis of fiscal years within the selected range (§5.5): each a Recharts `AreaChart` with the same subtle fill as the enhanced sparkline, each with its own y-axis, its metric label above it in `caption1`. No overlay, no legend, every series in `textSecondary`.

Layout:
- Section header: "Trends" in `fontSize.title3`, `fontWeight.semibold`.
- Segmented control: the five category names (Profitability, Returns, Safety, Cash, Valuation).
- Chart row: mini charts at `height: 160px`, sharing the grid width equally; below 600px they stack vertically.
- Years whose value is not computable render as gaps in the line, never interpolated. A fully non-computable metric (valuation with no price entered) renders its pinned phrase in place of the plot.

The chart section is not present when the company has fewer than three fiscal years (trend shape needs at least three points to be meaningful; below that, the sparklines and delta chips carry the story).

### 6.3 Accessibility

The section has a "View as table" toggle (the table-fallback pattern from main plan §4): one `<table>` for the selected category, metrics as rows and fiscal years as columns, hiding the SVG charts. This is the same approach specified for the metric detail sheet (frontend spec §3), reused here.

### 6.4 Motion

Each mini chart draws its line on first render only (spring curve, 350ms), using Recharts' `isAnimationActive` prop. Data updates (switching categories via the segmented control) are instant: no transition, no morph. `prefers-reduced-motion` disables the draw-in entirely.

### 6.5 Benchmark reference lines

**Current:** trend charts show raw values with no context for what "good" looks like.

**Change:** overlay optional dashed reference lines on the trend charts representing benchmark values: user-settable reference values stored per metric in IndexedDB. A benchmark is the user's own reference line, not a rule: it fires nothing, and the deterministic red-flag rules remain the only authority that raises an item to investigate.

Default benchmarks (pre-populated, editable; **owner review required before any ships**, §11). These are editorial thresholds of exactly the class the red-flag thresholds were, and those went through an owner pass. Two need the owner's eye in particular: the proposed debt-to-equity default of 1.0 sits beside the manufactured-returns rule's pinned 2.0, so the app would draw a caution line at half the level its own rule fires at; and interest coverage's 3.0× duplicates the fragility rule's pinned threshold, which the chart should present as the rule's line rather than a coincidence.

| Metric | Proposed default | Source |
|---|---|---|
| ROE | 15% | The classic value-investing quality threshold |
| ROIC | 10% | Cost-of-capital proxy for most industries |
| Debt to equity | 1.0 | Conservative leverage ceiling (note the gap to the rule's 2.0, above) |
| Interest coverage | 3.0× | The fragility rule's pinned threshold, presented as such |
| FCF conversion | 1.0 | Net-income-to-FCF parity; above 1.0 is healthy |

Metrics without a natural universal threshold (margins, absolute values) have no default benchmark; the user can set one if they know their industry's typical range.

Rendering: a dashed horizontal line at the benchmark value, coloured `textSecondary` at 50% opacity, with a small label at the right edge ("15% reference"). The line renders behind the data series. When the series spends time on the **unfavourable side** of the line (below it for a higher-is-better metric, above it for debt-to-equity and any other lower-is-better case; the first draft only handled "below", which is backwards for its own debt-to-equity example), the area between line and series tints to `sparkInvestigate` at low opacity, drawing the eye to that period. The direction comes from the same pinned per-metric field as §4.3.

The benchmark is editable inline: tapping the label opens a small popover with a numeric input (the entry screen's parsing rules; invalid input shows an inline message and saves nothing). Changes save immediately to IndexedDB. A "Reset to default" option restores the pre-populated value; a "Remove" option clears the line.

Storage and the pinned schema (the first draft waved at this): one new Dexie table, `benchmarks`, keyed by metric id and global rather than per-company in v1 (a reference value is the user's stance, not the company's), added to the data-model §9 schema with the standard migration-plus-fixture test and Zod-on-read like every table. **The export enumeration is an allowlist**, so data-model §5 must add `benchmarks` explicitly or user-set thresholds silently fail to survive export/import; the addition is additive, so the format version does not bump. All of this is a pinned-spec amendment (§11).

The Owner's lens explains the feature where it lives: the benchmark popover carries one education paragraph on what a reference line is and is not (a lens for the user's own judgement, never a verdict; the app does not say buy or sell). With the education layer off, the paragraph hides and the line stays.

## 7. Dark mode notes

Every change in this plan has a dark-mode specification:

| Change | Light mode | Dark mode |
|---|---|---|
| Card shadow (§3.1) | `0 1px 3px rgba(0, 0, 0, 0.08)` | None; surface brightness stepping |
| Card hover (§4.1) | Deeper shadow | `surfaceHover` (`#252527`) |
| Health dot (§4.2) | `colour.healthy` / `colour.investigate` from light palette | Same tokens, dark-palette values (brighter, desaturated) |
| Delta chip colour (§4.3) | Same as dot | Same as dot |
| Sparkline health colour (§4.4) | `sparkHealthy` / `sparkInvestigate` from light palette | Dark-palette values |
| Multi-year values (§4.6) | `textSecondary` on `surface` | `textSecondary` on `surface` |
| Section labels (§5.2) | `colour.textSecondary` light | `colour.textSecondary` dark |
| Key-stats header (§5.3) | `textPrimary` values on `background` | `textPrimary` values on `background` |
| Table view (§5.4) | `table.headerBackground` light | `table.headerBackground` dark |
| Trend chart (§6) | Neutral strokes on white surface | Neutral strokes on `#1C1C1E` surface |
| Benchmark lines (§6.5) | `textSecondary` at 50% opacity | `textSecondary` at 50% opacity |

No new dark-mode-specific colours are introduced. Every colour resolves through the existing theme contract.

## 8. Implementation sequence

The changes are ordered by visual impact and implementation independence. Each step is shippable on its own; no step depends on a later step unless noted.

### Step 1: card elevation and hover state

- Add shadow and surfaceHover tokens to `tokens.css.ts` and `palette.ts`.
- Update `metricCard.css.ts` with the shadow and hover transition.
- Update the contrast test if shadow tokens interact with background calculations (they should not, but verify).
- Run the contrast test, visual check in both themes.

### Step 2: section grouping

- Add the `DASHBOARD_SECTIONS` map to the dashboard feature (§5.2); the section names are user-facing copy, reviewed as copy.
- Add the `sectionLabel` style to `dashboard.css.ts`.
- Refactor the `Dashboard` component's rendering loop to group cards through the map.
- Add the section `<h2>` elements.

### Step 3: coloured delta chips

- Pin per-metric direction in the data-model §6 dictionary first (owner review, §11); current ratio is the case to settle.
- Add the optional `higherIsBetter` prop to `DeltaChip`; valuation chips stay neutral (§4.3).
- Add `chipHealthy` and `chipInvestigate` style variants to `deltaChip.css.ts`.
- Update `Dashboard.tsx` to pass `METRICS[id].higherIsBetter` for the operating metrics.
- Record the decision change in main plan §12; update the DeltaChip code comment and its frontend spec §5 row.

### Step 4: health-status dots

- Pin the rule-to-metric map (§4.2) with the owner alongside the education copy.
- Add the `healthDot` style and optional prop to `MetricCard` (`role="img"` plus `aria-label`).
- Compute health state in `Dashboard.tsx` from delta direction, fired rules, and the map; a fired rule wins; valuation cards are exempt.

### Step 5: sparkline area fill and health colour

- Extend `Sparkline` with the area polygon and optional `health` prop.
- Update `sparkline.css.ts` with the fill and colour-variant styles.
- Update `Dashboard.tsx` to pass health state through.

### Step 6: multi-year values on cards

- Blocked on the owner reviewing the progressive-disclosure loosening (§1.1, §11).
- Add the `history` prop to `MetricCard`; build the array in `Dashboard.tsx` via the existing `formatMetricValue` (§4.7: no new formatter).
- Style the year row in `metricCard.css.ts`.
- Amend the frontend spec's S3 card-contents row and the main plan §4 wording in the same change.

### Step 7: key-stats header

- Blocked on the same review as step 6.
- New `KeyStats` component (four values in a flex row, responsive wrap; taps open the detail sheet).
- Render between the hero and the grid in `Dashboard.tsx`; suppress when `fyLabels.length === 0`.
- Add the component to the frontend spec §5 inventory.

### Step 8: grid density

- Add the ≥900px `repeat(4, 1fr)` rule to `dashboard.css.ts`; below 900px unchanged (§5.1).
- Amend the frontend spec §7 parenthetical, which currently claims 3 to 4 columns from `minmax(160px, 1fr)` (§11).
- Visual check at 960px, 840px, 720px, and 375px viewports.

### Step 9: year-range control

- Add the segmented control to the dashboard chrome.
- Thread the selected range through the card history, table, and chart rendering.
- Render only when more than 5 fiscal years exist.

### Step 10: practitioner table view

- Add table-view tokens to `tokens.css.ts` and `palette.ts` (44px rows, §3.4).
- New `MetricTable` component with semantic table markup and the §5.4 cell states.
- Add the "Cards / Table" segmented control to the dashboard chrome; persist the choice in `db.meta`.
- Accessibility: keyboard navigation, screen-reader-friendly table structure.
- Add the component to the frontend spec §5 inventory and the toggle to S3's states (§11).
- This is a large step; it introduces a second rendering mode for the same data.

### Step 11: trend chart section

- New `TrendChart` (one metric's mini chart) and `TrendSection` (category control, small-multiples row, table fallback) components (§6.2, corrected: no overlay).
- Render below the grid (or table), above the red-flag section, in `Dashboard.tsx`.
- Suppress when `fyLabels.length < 3`.
- Add both components to the frontend spec §5 inventory (§11).

### Step 12: benchmark reference lines

- Blocked on the owner reviewing the default thresholds (§6.5, §11).
- Add the `benchmarks` table to the Dexie schema with a migration fixture test; amend data-model §9 and the §5 export allowlist in the same change.
- Render dashed reference lines on the mini charts, tinting the unfavourable side per metric direction (§6.5).
- Add the inline-edit popover and its Owner's-lens paragraph.
- Depends on step 11 (the charts must exist).

## 9. Testing requirements

| Area | Test type | What it verifies |
|---|---|---|
| Contrast | Existing CI test (`contrast.test.ts`) | New tokens (sparkHealthy, sparkInvestigate, surfaceHover, table.headerBackground) pass the 3:1 / 4.5:1 floors in both themes |
| Storage | Vitest unit | The `benchmarks` migration lands with a prior-schema fixture; export/import round-trips a set threshold (allowlist amended per §6.5) |
| Component | React Testing Library | MetricCard renders the health dot with correct role and aria-label, and the multi-year row; DeltaChip resolves colour from direction and `higherIsBetter`, staying neutral for valuation; KeyStats renders four values and n/m phrases; MetricTable has correct th/td structure and the §5.4 cell states; TrendSection suppressed below threshold |
| View toggle | React Testing Library | Cards/Table segmented control switches rendering; choice persists across unmount/remount (mocked Dexie) |
| Visual | Manual + Playwright screenshot | Card shadows visible in light, absent in dark; hover state on pointer devices; section labels render above groups; table aligns columns; chart draws correctly; benchmark lines render |
| Accessibility | axe-core in Playwright | All new elements labelled; chart and table have fallbacks; dots are not the only channel for health info; table is keyboard-navigable |
| Motion | Manual | Hover transitions use spring curve; chart draw-in plays once; reduced-motion collapses to fades |

## 10. What does not change

This section exists so the plan is unambiguous about scope.

- **No sidebar.** Three destinations do not justify persistent chrome.
- **No filter toolbar.** Historical data for a single company has nothing to filter in real time.
- **No card background colouring.** Cards stay `colour.surface` (white/dark grey). Colour lives in small, meaningful elements: dots, delta text, sparkline strokes.
- **No custom fonts.** System font stack for platform coherence and performance.
- **No brand colour change.** The accent stays blue. Semantic colours stay semantic.
- **No new metrics.** The 12-metric budget is untouched. Multi-year display and table view show the same 12 metrics across time, not new ones.
- **No layout pivot.** Single centred column; no sidebar; no multi-panel layout.
- **No changes to the detail sheet, entry screen, library, or any other screen.** This plan scopes to the company dashboard (S3) only.
- **No changes to calc-engine computation.** The `higherIsBetter` display hint already exists in the metric definitions (unconsumed today); pinning it in the dictionary is a spec amendment, not a code change. No new formatter (§4.7). Benchmark thresholds are stored in Dexie, not in the calc-engine.
- **No composite scores or ratings.** The user forms the judgement; the tool shows the numbers.

## 11. Amendments to pinned documents

The plans are contracts: a decision that moves updates its document in the same change (CLAUDE.md). The first draft recorded only the delta-chip departure; this section names everything. Each amendment ships with the step that needs it, and none ships before its owner review where one is named.

| Document | Passage | Amendment | Trigger |
|---|---|---|---|
| Main plan | §4 progressive disclosure ("12 numbers... never on-screen by default") | Reword to 12 metrics with multi-year visibility; record the loosening in the §12 log | Steps 6-7 |
| Main plan | §12 decision log | New entries: the delta-chip colour departure; the 12-numbers loosening | Steps 3, 6 |
| Frontend spec | §3 S3 (card contents and states) | Section grouping, multi-year row, key-stats header, view toggle, year-range control, trends section, table-mode states | Steps 2, 6-11 |
| Frontend spec | §5 component inventory | DeltaChip contract change; add KeyStats, MetricTable, TrendChart/TrendSection | Steps 3, 7, 10, 11 |
| Frontend spec | §7 responsive rules | Replace the `minmax(160px, 1fr)` "3-4 columns" parenthetical with the ≥900px `repeat(4, 1fr)` rule | Step 8 |
| Data-model spec | §6 dictionary | Pin per-metric direction (`higherIsBetter`), today an explicitly unpinned display hint | Step 3 |
| Data-model spec | §9 Dexie schema and §5 export allowlist | Add the `benchmarks` table and its export enumeration | Step 12 |
| CLAUDE.md | Product discipline ("the dashboard stays 12 numbers") | Mirror the main plan §4 rewording | Steps 6-7 |

---

*Review focus for the owner, in the frontend spec's spirit: (1) the progressive-disclosure loosening: multi-year values and the key-stats header put historical figures on-screen by default, which the main plan currently forbids; (2) delta-chip and dot colour: a departure from the recorded neutral-chip stance, with per-metric direction pinned in the dictionary and current ratio the contestable default; (3) the rule-to-metric map behind the health dots (§4.2); (4) the benchmark defaults (§6.5), especially debt-to-equity 1.0 beside the manufactured-returns rule's pinned 2.0; (5) whether the detail sheet should offer exact money figures alongside the pinned compact display (§4.7). Everything else in this plan is buildable without moving a pinned decision.*
