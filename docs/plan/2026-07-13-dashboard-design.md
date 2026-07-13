# Dashboard Design Evolution

**Status:** Proposal · **Date:** 2026-07-13 · **Author:** Ivan Wong · **Type:** Design plan
**Companion to:** `plainsight.md` §4 (design language), `plainsight-frontend.md` §3 (screen inventory), `plainsight-data-model.md` (metric dictionary)

---

## 1. Purpose

The company dashboard (S3) is the heart of the app. It currently renders as a clean grid of twelve white cards on a light-grey background: typographically rigorous, structurally sound, but visually quiet compared to the professional analytics dashboards that the practitioner persona (main plan §3) is accustomed to. This plan describes a set of incremental changes to make the dashboard feel more like an analyst's instrument panel while staying true to Apple HIG principles: clarity, deference, and depth.

The reference design is an energy-management dashboard (Figma Community, by arshiya.senselive) with a dark-green sidebar, coloured metric tiles, filter toolbars, donut charts, and line charts. We are not copying it. We are translating the qualities that make it feel like a dashboard (visual density, at-a-glance health, trend presence, structural grouping) through the lens of Apple's design language, where typography carries hierarchy, colour is meaning, and the interface defers to content.

### 1.1 Governing constraint

This is a design evolution, not a pivot. The following remain unchanged and are not up for discussion:

- The 12-card budget and the pinned metric dictionary.
- The type scale (11/13/15/17/20/22/28/34), spacing scale (4/8/12/16/20/24/32/40/48/64), and system font stack.
- Single-column layout with no persistent sidebar.
- One accent colour (`#007AFF` family); green/orange/red reserved for semantic health.
- Progressive disclosure: the dashboard stays 12 numbers; depth is one tap away.
- Motion: springs only, `prefers-reduced-motion` honoured globally.
- The offline-first binding constraint.

## 2. What the reference does well (and how we adapt it)

| Reference quality | What it does | How we translate it |
|---|---|---|
| **At-a-glance health** | Coloured status pills on every card ("normal", "high", "optimal") | A small health-status dot on each card, using the existing semantic palette (§4.2) |
| **Trend presence** | Percentage change with directional arrows, prominent on each card | Coloured delta chips: direction-aware colour instead of the current neutral grey (§4.3) |
| **Visual density** | Four compact cards per row, tight spacing | Adjust the grid to favour four columns at the wide-column width (§5.1) |
| **Structural grouping** | Cards grouped under section headers (though the reference groups by device) | Group the 12 cards by metric category with light section labels (§5.2) |
| **Chart presence** | Donut and line charts below the card grid | A trend chart section below the grid, one metric at a time via segmented control (§6) |
| **Card depth cues** | The reference uses dark backgrounds; the idea is visual weight | Subtle shadows in light mode; slightly elevated surfaces in dark mode (§3.1) |

### 2.1 What we are not adopting

| Reference feature | Why not |
|---|---|
| **Dark sidebar navigation** | Three top-level destinations do not justify permanent chrome; a sidebar here competes with the content it should defer to (Apple HIG: deference) |
| **Dark-background coloured cards** | Inverting card surfaces requires a parallel contrast system and violates "colour is meaning, not decoration"; the visual weight comes from elevation and health indicators instead |
| **Filter/toolbar bar** | Plainsight shows historical data for one company; there is nothing to filter in real time |
| **Custom fonts** | The system font stack is a deliberate choice for platform coherence and zero-latency rendering |
| **Brand colour change** | The accent stays `#007AFF`; semantic colours stay reserved; a green brand would collide with "healthy" |

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

This follows Apple's grouped-list section header pattern (Settings, Health): small, quiet, uppercase, out of the way. The wide tracking keeps the small caps legible.

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

Implementation: a new `healthDot` prop on `MetricCard`, computed by the `Dashboard` container from the delta direction and the fired-rules list. The dot is a `<span>` with an `aria-label` ("improving" or "investigate") placed inline after the `<h3>` label.

### 4.3 DeltaChip: directional colour

**Current:** always `colour.textSecondary`, with the code comment "deliberately neutral in colour; health colour belongs to the items-to-investigate section, not to every trend."

**Proposed change:** colour the delta chip by direction, using semantic colours:

| Direction | Colour | Rationale |
|---|---|---|
| `up` on a higher-is-better metric | `colour.healthy` | Improving |
| `down` on a lower-is-better metric | `colour.healthy` | Improving (e.g. debt-to-equity falling) |
| `flat` | `colour.textSecondary` | Neutral; no signal |
| Deteriorating (the inverse cases) | `colour.investigate` | Worth investigating |

This is a departure from the current recorded decision. The justification: Apple's Stocks app colours price deltas green/red on every row; the pattern is that when a metric has an unambiguous directional preference, colouring the delta is semantic, not decorative. Plainsight's metrics all have a clear directional preference (the data-model spec defines polarity for every metric). The red-flag section remains the authority for detailed investigation context; the delta colour is a scan-level signal, not a replacement.

**This change requires updating the DeltaChip component comment and recording the decision change in the main plan's §12 log.**

Implementation: `DeltaChip` receives a new `polarity: 'higher_better' | 'lower_better'` prop. The container passes it from `METRICS[id].polarity` (already part of the metric definition in the calc-engine). The chip's className resolves to one of three styles: `chipHealthy`, `chipInvestigate`, or the existing neutral `chip`.

### 4.4 Sparkline: area fill and health colour

**Current:** a 100x28 SVG polyline in `textSecondary`, no fill.

**Change:** add a subtle area fill beneath the polyline (a closed polygon from the line to the bottom edge of the viewBox) using the same stroke colour at ~0.10 opacity. This gives the sparkline more visual presence without adding information; the line is still the signal, the fill is grounding.

Optionally, when the metric's five-year delta is known and the sparkline has sufficient data, the stroke and fill colour changes from `textSecondary` to `sparkHealthy` or `sparkInvestigate` (§3.2). This is the same health signal as the dot (§4.2) and the delta chip (§4.3), reinforcing the at-a-glance scan. When the delta is flat or unknown, the sparkline stays neutral grey.

The viewBox stays `0 0 100 28`; the component gains an optional `health?: 'healthy' | 'investigate'` prop.

### 4.5 RedFlagBanner: no change

The red-flag banners are already well designed (4px coloured left border, clear hierarchy). No changes.

## 5. Layout evolution

### 5.1 Grid density

**Current:** `gridTemplateColumns: repeat(auto-fit, minmax(160px, 1fr))`, gap `12px`, in a `960px` wide column. This yields 3 to 4 columns depending on the viewport, but at the full 960px it tends toward 4 columns with generous card widths.

**Change:** reduce the card minimum from `160px` to `144px`. This makes four columns the common case at 960px and still degrades gracefully to three on narrower viewports and to two on mobile. The 16px reduction recovers space for the card shadows and hover states.

Keep the gap at `12px`. Increasing it (as some dashboard designs do) would lose the tight, scan-friendly grid that the reference dashboard achieves. Decreasing it would crowd the shadows.

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

The sections are not collapsible. Progressive disclosure happens at the card level (tap to open the detail sheet), not at the section level; hiding sections would break the "12 numbers, always visible" contract.

Implementation: the `Dashboard` component's card-rendering loop groups `CARD_IDS` by category (already available from `METRICS[id].category`) and renders a section label between groups.

### 5.3 Summary health bar

**Current:** no aggregate health signal. The user must scan all 12 cards individually and scroll to the red-flag section to assess overall quality.

**Change:** add a compact summary bar between the hero header and the metric grid. It renders three quiet stats in a single row:

| Stat | Source | Display |
|---|---|---|
| Improving metrics | Count of cards where delta direction is healthy | "8 improving" in `colour.healthy` |
| Flags fired | Count of active (non-dismissed) red flags | "2 to investigate" in `colour.investigate`, or "No flags" in `colour.textSecondary` |
| Years of data | `report.fyLabels.length` | "7 years" in `colour.textSecondary` |

The bar uses `fontSize.caption1`, `tabular-nums`, flex row with `gap: space[24]`. Each stat is a `<span>` with a dot prefix in the stat's colour, matching the health-dot pattern from §4.2.

This bar is the dashboard equivalent of the Figma's "Real-time monitoring active" status indicator: a one-line ambient signal that the user absorbs without reading. It is not interactive; it adds no tap targets. It is suppressed when only one year of data exists (the dashboard already shows a "Add more years to see trends" hint in that state).

## 6. Trend chart section

### 6.1 Purpose

The reference dashboard's donut and line charts provide visual depth that Plainsight's sparklines cannot. The sparklines are decorative micro-indicators (the spec says so: "decorative by contract"); the detail sheet's full chart requires a tap. Adding a visible trend chart section to the dashboard itself closes the gap between "scan the numbers" and "see the shape."

### 6.2 Design

Below the metric grid (and above the red-flag section), a new section renders a single trend chart: one metric at a time, selectable via a segmented control. The chart is a Recharts `LineChart` (or `AreaChart` with the same subtle fill as the sparkline) showing all available fiscal years on the x-axis and the metric value on the y-axis.

Layout:
- Section header: "Trends" in `fontSize.title3`, `fontWeight.semibold`.
- Segmented control: the five category names (Profitability, Returns, Safety, Cash, Valuation). Selecting a category shows its metrics overlaid.
- Chart area: `height: 200px`, full grid width, with a y-axis label and x-axis fiscal-year labels.
- Legend: metric names in `caption1`, using distinct neutral strokes (no semantic colour; the chart shows shape, not health).

The chart section is not present when the company has fewer than three fiscal years (trend shape needs at least three points to be meaningful; below that, the sparklines and delta chips carry the story).

### 6.3 Accessibility

The chart has a "View as table" toggle (the table-fallback pattern from main plan §4). The table renders the same data in a standard `<table>` with row and column headers, hiding the SVG chart and showing the grid. This is the same approach specified for the metric detail sheet (frontend spec §3), reused here.

### 6.4 Motion

The chart draws its line on first render only (spring curve, 350ms), using Recharts' `isAnimationActive` prop. Data updates (switching metrics via the segmented control) are instant: no transition, no morph. `prefers-reduced-motion` disables the draw-in entirely.

## 7. Dark mode notes

Every change in this plan has a dark-mode specification:

| Change | Light mode | Dark mode |
|---|---|---|
| Card shadow (§3.1) | `0 1px 3px rgba(0, 0, 0, 0.08)` | None; surface brightness stepping |
| Card hover (§4.1) | Deeper shadow | `surfaceHover` (`#252527`) |
| Health dot (§4.2) | `colour.healthy` / `colour.investigate` from light palette | Same tokens, which resolve to the dark-palette values (brighter, desaturated) |
| Delta chip colour (§4.3) | Same as dot | Same as dot |
| Sparkline health colour (§4.4) | `sparkHealthy` / `sparkInvestigate` from light palette | Dark-palette values |
| Section labels (§5.2) | `colour.textSecondary` light | `colour.textSecondary` dark |
| Summary bar (§5.3) | Light palette colours | Dark palette colours |
| Trend chart (§6) | Neutral strokes on white surface | Neutral strokes on `#1C1C1E` surface |

No new dark-mode-specific colours are introduced. Every colour resolves through the existing theme contract.

## 8. Implementation sequence

The changes are ordered by visual impact and implementation independence. Each step is shippable on its own; no step depends on a later step.

### Step 1: card elevation and hover state

- Add shadow and surfaceHover tokens to `tokens.css.ts` and `palette.ts`.
- Update `metricCard.css.ts` with the shadow and hover transition.
- Update the contrast test if shadow tokens interact with background calculations (they should not, but verify).
- Run the contrast test, visual check in both themes.

### Step 2: section grouping

- Add the `sectionLabel` style to `dashboard.css.ts`.
- Refactor the `Dashboard` component's rendering loop to group cards by category.
- Add the section `<h2>` elements.
- No new components needed; this is a layout change in one file.

### Step 3: coloured delta chips

- Add `polarity` to the `DeltaChip` props.
- Add `chipHealthy` and `chipInvestigate` style variants to `deltaChip.css.ts`.
- Update `Dashboard.tsx` to pass polarity from the metric definition.
- Record the decision change in main plan §12.

### Step 4: health-status dots

- Add the `healthDot` style and optional prop to `MetricCard`.
- Compute health state in `Dashboard.tsx` from delta direction and fired rules.
- Pair the dot with `aria-label` for accessibility.

### Step 5: sparkline area fill and health colour

- Extend `Sparkline` with the area polygon and optional `health` prop.
- Update `sparkline.css.ts` with the fill and colour-variant styles.
- Update `Dashboard.tsx` to pass health state through.

### Step 6: summary health bar

- New `SummaryBar` component (simple presentational; three stats in a flex row).
- Render between the hero and the grid in `Dashboard.tsx`.
- Suppress when `fyLabels.length < 2`.

### Step 7: grid density

- Change the card minimum from `160px` to `144px` in `dashboard.css.ts`.
- Visual check at 960px, 720px, and 375px viewports.

### Step 8: trend chart section

- New `TrendChart` component wrapping Recharts `LineChart`.
- New `TrendSection` component with segmented control and table fallback.
- Render below the grid, above the red-flag section, in `Dashboard.tsx`.
- Suppress when `fyLabels.length < 3`.
- This is the largest single step; it introduces the first visible Recharts usage beyond the sparklines.

## 9. Testing requirements

| Area | Test type | What it verifies |
|---|---|---|
| Contrast | Existing CI test (`contrast.test.ts`) | New tokens (sparkHealthy, sparkInvestigate, surfaceHover) pass the 3:1 / 4.5:1 floors in both themes |
| Component | React Testing Library | MetricCard renders health dot with correct aria-label; DeltaChip resolves colour from polarity and direction; SummaryBar counts match; TrendSection suppressed below threshold |
| Visual | Manual + Playwright screenshot | Card shadows visible in light, absent in dark; hover state on pointer devices; section labels render above groups; chart draws correctly |
| Accessibility | axe-core in Playwright | All new elements labelled; chart has table fallback; dots are not the only channel for health info |
| Motion | Manual | Hover transitions use spring curve; chart draw-in plays once; reduced-motion collapses to fades |

## 10. What does not change

This section exists so the plan is unambiguous about scope.

- **No sidebar.** Three destinations do not justify persistent chrome.
- **No filter toolbar.** Historical data for a single company has nothing to filter.
- **No card background colouring.** Cards stay `colour.surface` (white/dark grey). Colour lives in small, meaningful elements: dots, delta text, sparkline strokes.
- **No custom fonts.** System font stack for platform coherence and performance.
- **No brand colour change.** The accent stays blue. Semantic colours stay semantic.
- **No new metrics.** The 12-card budget is untouched.
- **No layout pivot.** Single centred column; no sidebar; no multi-panel layout.
- **No changes to the detail sheet, entry screen, library, or any other screen.** This plan scopes to the company dashboard (S3) only.
- **No changes to the calc-engine or data model.** The metric `polarity` field already exists; no new fields are needed.
