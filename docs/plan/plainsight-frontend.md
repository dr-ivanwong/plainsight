# Frontend Specification: Routes, Screens, States & First-Run

**Companion to:** `plainsight.md` (design language, §4; frontend architecture, §5) and `plainsight-data-model.md` (every value rendered here). **Status:** Draft for owner review · **Date:** 2026-07-10
**Purpose:** the build contract for Phase 1–3 UI work. The main plan pins the design language (type scale, spacing, colour, motion); this document pins *what exists*: every route, every screen, every screen's empty/loading/error states, the first-run flow, and the component and hook inventories. If a state can occur, its rendering is specified here; "we'll figure out the empty state later" is how craft dies.

---

## 1. Information architecture

### 1.1 Routes

| Route | Screen | Lazy chunk | Notes |
|---|---|---|---|
| `/` | S2 Library | shell | Root of the navigation stack |
| `/onboarding` | S1 First-run | onboarding | Auto-redirect target on true first launch only |
| `/company/:id` | S3 Dashboard | dashboard (incl. Recharts) | `?metric=roe` opens S4 detail sheet |
| `/company/:id/entry` | S5 Data entry | entry | `?job=:jobId` renders S6 review mode |
| `/company/:id/thesis` | S8 Thesis | thesis | `?history=1` opens version list |
| `/compare?ids=a,b,c` | S7 Compare | compare | 2–4 comma-separated company ids |
| `/settings` | S9 Settings root | settings | |
| `/settings/providers` | S10 Providers (BYOK) | settings | |
| `/settings/data` | S11 Data & storage | settings | |

**Router: TanStack Router.** Chosen for fully typed routes and, decisively, **typed search params**: since sheets and modals encode their state in query params (below), `?metric=roe` and `?job=:jobId` become typed contracts the compiler checks rather than strings the runtime parses.

**URL rules.** Everything needed to render a screen is recoverable from URL + IndexedDB: every route is bookmarkable and PWA-relaunch-safe. **Sheets and modals encode in query params** (`?metric=`, `?history=`, `?job=`) so the system back button/gesture closes them instead of exiting the screen; Android back-button correctness is a launch requirement, not a polish item.

### 1.2 Navigation model

Stack-based, Library at root. Top bar per screen: back affordance, title, at most one contextual action. Compare and Settings are reached from the Library toolbar; **no persistent tab bar**, deliberately: two of the three top-level areas are visited occasionally, and a tab bar would spend ~49pt of every mobile screen on low-frequency destinations. Desktop uses the same single centred column (720px content width; 960px for S3 and S7) with no sidebar in v1. This is a focused instrument, not a dashboard sprawl.

## 2. Global chrome and cross-cutting states

- **Offline indicator:** a small "Offline" pill appears in the top bar *only* on screens where an online-only affordance was hidden (S2's ticker import, S5's file import, S10). Elsewhere, offline is silent: it's a normal operating mode, not an alarm.
- **Error boundaries** per feature region (per main plan §5): friendly message, retry, and an "Export my data" escape hatch. A crashed chart never takes down a grid holding unsaved keystrokes.
- **Quarantine surface:** records failing Zod-on-read appear as a badge + row in S11, never as a crash.
- **iOS install explainer:** on iOS Safari when not installed, a one-time dismissible card on S2 states the real reason plainly ("iOS deletes this app's data after 7 days of non-use unless it's added to your Home Screen"). Re-surfaceable from S11's storage status. Never modal, never nagging.
- **Autosave feedback:** no toasts. A quiet "Saved · just now" ticker in the S5/S8 header. Toast queues are where calm interfaces go to die.

## 3. Screen inventory

Format per screen: purpose → key elements → states. Design language per main plan §4 throughout.

### S1: First-run (onboarding)

Three panes, hard-capped, skippable, never shown twice (flag in `meta`), re-openable from S9 → About. Pane 1: what this is (read statements like an owner, one paragraph, no feature tour). Pane 2: where your data lives (on this device, exportable anytime, nothing leaves without you). Pane 3: choose your start. **"Add a company"** / **"See it with sample data"** / "Import a file" (Phase 3+, hidden before). Exit lands on S2 in the corresponding state.

### S2: Library

Purpose: calm home; one row per company (name, ticker/exchange badge, red-flag dot count, last-updated, 10-yr ROE microsparkline). 64px rows, separation by spacing.

| State | Rendering |
|---|---|
| True empty (first run) | Hero empty state: one-line promise + two buttons, "Add a company" (accented) and "See it with sample data" |
| Populated | Rows sorted by last-updated; "+ Add" in toolbar |
| Sample data present | Sample rows carry a quiet "Sample" chip; one-line dismissible banner links to S11 removal |
| >12 companies | A filter field appears (progressive: invisible until useful) |
| Loading | None in steady state (Dexie live queries are ~ms); skeleton rows only on cold service-worker start |

### S3: Company dashboard

Purpose: the heart; hero header (name, sector, latest FY, currency), metric-card grid (12 cards grouped under five quiet section labels per the dashboard design plan §5.2; M10 and M13 render in their siblings' detail sheets per companion §12 D2), red-flag section, entry points to S4/S5/S8.

| State | Rendering |
|---|---|
| Complete years | Cards: label (13px secondary), value (34px tabular), sparkline, 5-yr delta chip |
| Partial year(s) | Affected cards render `insufficient_data` as "Add the 2 missing numbers"; tappable, deep-links into S5 at those fields (companion §10) |
| No price entered | The two valuation cards (M12, M14) collapse into one "Enter today's price" card; on entry, they expand in place |
| Stale price | Valuation cards show "as of ⟨YYYY-MM-DD⟩" badge; amber past 90 days |
| Flags fired | Orange/red cards beneath the grid: what fired (with numbers), why it matters, what to check |
| Flags dismissed | Collapsed "1 dismissed" link; tap to review/undo |
| Single year only | Sparklines and delta chips hidden; gentle "Add more years to see trends" hint |
| n/m values | Per companion P-5: "n/m: negative earnings" etc., never blank, never 0 |

### S4: Metric detail sheet (query-param addressable)

Slides up from the tapped card (spatial continuity); Escape/back closes. Contents, top to bottom: 10-yr chart; the pinned formula with **this year's actual inputs substituted**; denominator-basis badge (average/ending, P-4); plain-language explanation; Owner's-lens paragraph (hidden when education layer is off); per-input provenance chips (tap → source filing/page where available). Companion metrics per D2 render here as a secondary value row: M12's sheet carries M13 (earnings yield), M11's carries M10 (FCF margin), each with its own formula disclosure. States mirror S3's value states; an n/m year shows the reason inline with a one-sentence explainer.

### S5: Data entry

Purpose: the craft-critical screen. Segmented control (Income / Balance / Cash flow); fiscal years as columns; canonical line items as rows with the "find it as…" hints from companion §2.

Key behaviours: `MoneyField` formats thousands separators as-you-type; the FY header shows unit scale ("figures in millions, AUD") set once per year; negative entry allowed only on P-0 signed items; derived rows (gross profit, totals) compute live in grey; a completeness meter ("9 of 11 core items") sits in the header; per-statement provenance chip; **known-zero affordance**: each field's overflow menu offers "Not reported → 0", rendering a `∅0` chip (companion §8's null-vs-zero distinction, surfaced).

| State | Rendering |
|---|---|
| New year | Blank grid, first field focused, hint visible |
| Autosave | "Saved · just now" ticker; every blur commits a Dexie transaction |
| Storage quota low | Non-blocking banner with export prompt (main plan §14) |
| Review handoff | `?job=` present → S6 takes over this layout |

### S6: Extraction review mode (S5 variant, Phase 3)

Banner: "Extracted from *AR2024.pdf* via *DeepSeek*. Review before saving." Desktop: two columns, source page image left (PDF) or sheet snippet (XLSX), extracted grid right. Mobile: grid with a collapsible source peek per field.

Confidence rendering: fields ≥0.9 normal; 0.7–0.9 amber; <0.7 amber with **mandatory individual confirmation**. Actions: accept field, "Accept all ≥ 0.9", jump-to-source (page/cell ref from provenance). The live validation gates run continuously: a cross-foot failure marks the offending fields, not a modal. **Save stays disabled until every low-confidence field is confirmed**; Discard requires one confirm.

| State | Rendering |
|---|---|
| Job running | Progress with honest stage labels ("Reading pages… Mapping line items…") + live region announcement |
| Job failed | Provider error surfaced plainly; "Retry" offers the next ladder rung by name |
| Partial extraction | Found statements populate; missing ones fall back to blank manual columns |

### S7: Compare

Picker state first (chips, pick 2–4). Then: metric rows × company columns, best-in-row subtly ticked; below, one overlaid trend chart with a metric segmented control.

| State | Rendering |
|---|---|
| <2 companies in library | Empty prompt linking back to S2 |
| Mixed currencies | Absolute rows (revenue, FCF, market cap) auto-hidden + one-line note (P-7); ratios compare freely |
| 4 columns on mobile | Horizontal scroll with a sticky metric-label column |

### S8: Thesis editor

Four structured sections (business / moat / valuation / what kills it), distraction-free, optional serif body. Version history via `?history=1`: list of snapshots (date, word-count delta), read-only view of any version, "financials snapshot attached" indicator. Save offers the snapshot toggle. Empty sections show their prompt question as placeholder, not lorem.

### S9: Settings root

Groups: **Appearance** (theme auto/light/dark; education layer on/off, the Practitioner switch), **Providers →**, **Data & storage →**, **Sync** (signed out: a sign-in row stating plainly that nothing needs it, online-only; signed in: the email, a sign-out, and the quiet sync line: the last-synced time, or the live count of changes waiting to sync while local writes await the server (main plan §12.9: pending is surfaced, never silently equal); the hosted UI does the password handling, and the session lives in device-local meta outside the export allowlist. Amendments 2026-07-18 with the Phase 3 sign-in slice and the server-wins reconciliation slice), **About** (version, licences, replay onboarding).

### S10: Settings → Providers (BYOK)

One row per registry provider: name; data-policy label in plain words ("may train on inputs; public documents only" / "no-training endpoint"); key state (none / `••••` with reveal); **Test** button whose result chip is the runtime CORS probe: "Direct", "Via proxy", or "Failed"; delete. Ladder order displayed read-only (set from the bake-off scorecard; reordering UI deferred). Footer: the key-hygiene copy (dedicated key, provider-side spend cap, rotate on device loss).

### S11: Settings → Data & storage

Export (with last-export date; feeds the 30-day nudge); Import (file → **dry-run summary sheet**: "3 companies, 28 fiscal years, 2 theses: Merge / Replace / Cancel", schema version checked per companion §5); storage status (persisted ✓/✗, usage vs quota bar, iOS install nudge when applicable); remove sample data; quarantined records list (export-raw / discard per record); danger zone: wipe everything, type-the-app-name to confirm.

### S12: Import pickers (sheets, not routes)

**Ticker search** (Phase 2): debounced search sheet, results with exchange badges, hidden offline with the standard hint. **File upload** (Phase 3): drop/browse; type/size validation messages inline; provider select showing data-policy labels; a **"This document is confidential" toggle that filters the provider list to paid, no-training endpoints** (main plan §6 sensitivity routing, made tactile); kickoff → S6.

## 4. First-run and sample data: decision pinned

**One-tap sample load, not silent preload.** The empty Library offers "See it with sample data"; tapping it loads **four** golden-corpus companies: Apple (US mega-cap), Coca-Cola (the classic value-investing case study), Costco (the membership-moat case study), and CSL (the ASX showcase, joined 2026-07-15 with the Phase 2.5 golden files per companion §12, D1 resolved), as `sample: true` records (schema flag per companion §9), each badged, all removable with one action in S11.

Rationale: a library that starts full lies about whose research it is: ownership of the analysis *is* the product's psychology, and an auto-populated home undermines it. The one-tap path preserves the five-second "living dashboard" wow while keeping the default state honest. Mechanics: fixtures are a lazy ~30KB JSON chunk generated from the Phase 0 golden files, meaning the demo data is *real, hand-verified* data, and the sample dashboard doubles as an acceptance test of the whole render path. Sample records sync and export like any data; they're just flagged.

## 5. Component inventory (presentational; props are contracts)

| Component | Responsibility | Key props (sketch) |
|---|---|---|
| `MetricCard` | One metric tile | `label, value: MetricValue, spark?: Series, delta?: Delta, onOpen` |
| `StatusValue` | Renders the `MetricValue` union (the no-NaN rule lives here) | `value, formatKind` |
| `Sparkline` / `TrendChart` | 10-yr micro / full chart | `series, currency?, emphasisYear?` |
| `DeltaChip` | 5-yr direction | `direction, magnitudeLabel` |
| `RedFlagBanner` | One fired rule | `rule, firedWith, onDismiss, onExplain` |
| `StatementGrid` | S5/S6 table shell | `rows, years, mode: 'entry'\|'review', onCommit` |
| `MoneyField` | Numeric input: separators, sign rules, known-zero menu | `value: MonetaryInt\|null\|'zero', signed, onChange` |
| `ConfidenceBadge` | Review-mode field state | `confidence, confirmed, onConfirm` |
| `SourcePeek` | Page image / sheet-cell snippet | `provenance` |
| `CompanyRow` | Library row | `company, flagsCount, roeSpark` |
| `ComparisonTable` | S7 grid | `companies, metrics, hideAbsolutes` |
| `ProviderRow` | S10 row | `provider, keyState, probeResult, onTest, onDelete` |
| `EmptyState` | All empties, one component | `title, body, primary, secondary?` |
| `InstallExplainer` | iOS card | `onDismiss` |
| `SheetShell` | Query-param-bound sheet with focus trap | `paramKey, children` |

Any component crossing ~8 props triggers the design review per main plan §5.

## 6. Container hooks and data flow

| Hook | Feeds | Source |
|---|---|---|
| `useCompanies()` / `useCompany(id)` | S2 / S3–S8 headers | Dexie live query |
| `useMetrics(companyId)` | S3, S4, S7 | calc-engine, memoised per `(companyId, dataVersion)` |
| `useRedFlags(companyId)` | S3 | calc-engine rules + `flagDismissals` |
| `useThesis(companyId)` | S8 | Dexie live query + version writes |
| `useComparison(ids)` | S7 | `useMetrics` fan-out + P-7 currency check |
| `useExtractionJob(jobId)` | S6 | client-direct: in-page job runner; proxy: polling `GET /v1/extractions/:id` |
| `useProviderKeys()` | S10, S12 | `providerCredentials` table (never leaves device) |
| `useStorageStatus()` | S11, quota banner | `navigator.storage` persist/estimate |
| `useOnlineStatus()` | offline pill, feature-hiding | `navigator.onLine` + listener |

Keystrokes never cross feature boundaries: `MoneyField` holds local state, commits on blur; the S3 dashboard cannot re-render from S5 typing (state colocation, main plan §5).

## 7. Responsive rules

Breakpoints: <600 (single column; sheets full-screen; entry grid shows 2 year-columns with horizontal scroll and a sticky label column), 600–899 (sheets become centred 560px panels; metric grid auto-fits `minmax(160px, 1fr)`), ≥900 (720px column; 960px for S3/S7; metric grid `repeat(4, 1fr)`, four deterministic columns per the dashboard design plan §5.1). Touch targets ≥44pt everywhere including grid cells. No layout reads differently enough to need separate designs: one design, fluid.

## 8. Accessibility per screen (deltas beyond the global WCAG AA baseline)

S2: rows are single buttons with composite labels ("Apple, 2 flags, updated yesterday"). S3/S4/S7: every chart has the table-fallback toggle; values announced via `StatusValue`'s text form ("not meaningful: negative equity"), never symbol-only. S4/S12/S8-history: focus moves into the sheet on open, returns to trigger on close (`SheetShell` owns this). S5/S6: full arrow-key spreadsheet navigation, Enter commits-and-moves-down, live region announces autosave and extraction-job stages. S1/iOS card: dismissible, non-modal, focus-order-neutral. `prefers-reduced-motion`: all sheet/stagger animation becomes ≤150ms fades (main plan §4).

## 9. Frontend folder structure

```
apps/web/src/
  routes/            # one file per route above, lazy boundaries here
  features/
    library/  dashboard/  entry/  review/  compare/  thesis/  settings/
  components/        # §5 inventory: presentational only
  hooks/             # §6 inventory: containers
  db/                # Dexie schema, migrations, export/import (allowlist!)
  styles/tokens.css.ts   # Vanilla Extract: main plan §4 scales as typed tokens
packages/
  calc-engine/       # schema + metrics + rules (companion spec)
  extraction-core/   # isomorphic adapters, prompts, gates (main plan §6)
infra/               # CDK
```

## 10. Explicitly deferred

Desktop side-panel metric detail (sheet everywhere in v1); command palette; drag-to-reorder provider ladder; thesis print styles (rides Markdown export); search across theses; i18n beyond en-AU; any theming beyond light/dark.

---

*Review focus for the owner: the no-tab-bar navigation call (§1.2), the one-tap sample-data decision (§4), the confidence thresholds and save-gating in review mode (S6), and the iOS install-explainer wording (§2); these four carry the most opinion.*
