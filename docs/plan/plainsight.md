# Plainsight: Engineering Plan

*A financial statement analyser for long-term value investors.*

**Status:** Draft v1.0 · **Date:** 2026-07-10 · **Type:** Design document
**Disciplines applied:** Apple UI/UX design · Meta-calibre frontend engineering · Google-calibre backend engineering · AWS cloud infrastructure

---

## 1. Context

The classic long-term value-investing approach rests on reading financial statements: identifying durable competitive advantages ("moats") through consistent ROE, healthy margins, low leverage, and strong free cash flow; then buying at a margin of safety and holding long term. For a non-finance person, the barrier isn't the math (the ratios are simple division); it's knowing *which* numbers matter, *where* to find them, and *what patterns* signal quality versus risk.

This plan describes a web application that guides a retail investor through that analysis: enter (or import) a company's financials, see the value-investing ratios computed and trended over time, compare companies side by side, get automated red-flag detection, and draft a structured investment thesis.

**The binding constraint, stated by the product owner:** the app must remain fully functional independent of any AI service's availability. This drives the single most important architectural decision in this document: **the app is local-first**. All core analysis (ratio computation, trend charting, red-flag rules, comparison, thesis templates) runs entirely in the browser with data persisted locally. A backend exists only for optional enhancements (live market data, SEC filing ingestion, cross-device sync, AI-assisted narrative analysis), and every one of those enhancements degrades gracefully to the offline core.

## 2. Goals and Non-Goals

> **Audience decision (resolved):** this is a **single-user personal tool**. Cascades: the legal section reduces to a tripwire list (revisit before ever sharing a URL with anyone); Phase 3 auth becomes a single-user Cognito pool with an admin-created account and no signup flow; per-user extraction quotas are replaced by global budget alarms + kill switch; success criteria are personal utility, not growth metrics; naming stakes drop, though anything shareable should still avoid any investor's surname (resolved: §12.7).

### Goals

1. A non-finance user can go from "I have a company's 10-K numbers" to "I understand its quality signals" in under 10 minutes.
2. 100% of core analysis functions work offline / with zero backend dependency. If every server on earth is down, the app still computes, charts, and stores.
3. Support 10 years of annual data per company, unlimited companies, side-by-side comparison of up to 4.
4. Deterministic, auditable calculations: every displayed ratio can be tapped to reveal its formula and the exact inputs used. Trust is the product.
5. Educational scaffolding built in: every metric explained in plain language, with Owner's-lens context ("why this matters") one interaction away.
6. Production-grade quality: performant on mid-range mobile devices, accessible (WCAG AA), tested, observable.

### Non-Goals

1. **Not a brokerage or trading tool.** No order execution, no portfolio P&L tracking against live prices (v1).
2. **Not investment advice.** The app computes and educates; it never says "buy" or "sell." Red flags are labelled as "items to investigate," not verdicts. A persistent disclaimer covers this.
3. **Not a Bloomberg terminal.** We deliberately support 12 dashboard metrics (from a pinned 14-metric dictionary, data-model §12 D2) done excellently, not 400 done shallowly. Scope discipline is a feature.
4. **Not real-time.** Value analysis works on annual/quarterly statements. We never need sub-day data freshness; this dramatically simplifies infrastructure.
5. **No user-generated content sharing / social features** in any planned phase.

## 3. Product Definition

### Personas

**Primary ("The Learner"):** professionally successful, non-finance background, has read *The Intelligent Investor*, wants to analyse 3–10 companies before making their first considered stock purchase. Needs guidance and explanation at every step.

**Secondary ("The Practitioner"):** knows the ratios already, wants a fast, clean tool to run the numbers on a candidate and keep a research log. Needs speed and density, not hand-holding (education layer must be dismissible).

### Core user journeys

**Journey A: Analyse a company (manual entry).** User creates a company → enters 5–10 years of line items from the income statement, balance sheet, and cash flow statement (guided form, one statement at a time, with "where to find this in a 10-K" hints) → app computes the ratio dashboard → user reviews trends, taps into explanations, notes red flags → saves.

**Journey B: Analyse a company (import).** User pastes a ticker → app fetches standardised financials from the backend (SEC EDGAR–derived) → pre-fills the same model → user reviews and proceeds as in Journey A. *Requires connectivity; falls back to Journey A when offline.*

**Journey C: Compare.** User selects 2–4 saved companies → side-by-side ratio table and overlaid trend charts → identifies the strongest moat signals.

**Journey D: Thesis.** User opens a saved company → structured thesis template (What does the business do? Why is the moat durable? What's the valuation logic? What kills this investment?) → writes, saves, revisits over time with versioned snapshots.

**Journey E: Upload a filing.** User taps "Import from file" on a company → uploads an annual report PDF or a spreadsheet of the financials (XLSX/CSV): ASX small cap, NZX, LSE, private company, any filing → extraction returns structured statements with per-field confidence and page/cell references → results land in the data-entry grid in review mode → user verifies against the source and confirms → saved to their library. *Requires connectivity; sign-in is needed only when routing via the server proxy (non-CORS providers). Falls back to Journey A when offline.*

### The metric set (v1: deliberately small)

| Category | Metrics | Quality signal |
|---|---|---|
| Profitability | Gross margin, operating margin, net margin | Pricing power; moat evidence |
| Returns | ROE, ROIC | Capital efficiency; ≥15% ROE sustained = quality |
| Safety | Debt-to-equity, current ratio, interest coverage | Survivability; low leverage preferred |
| Cash | Free cash flow, FCF margin, FCF conversion (FCF ÷ net income) | Earnings quality; accounting-trick detector |
| Valuation | P/E, earnings yield, FCF yield | Margin of safety inputs |

> Exact pinned formulas, input requirements, and edge-case handling for every metric are specified in the companion document **`plainsight-data-model.md`** (Data Model & Metric Dictionary). The dictionary pins 14 metrics; 12 render as dashboard cards, with FCF margin (M10) and earnings yield (M13) as detail-sheet metrics (resolved: data-model §12, D2).

### Red-flag rules engine (v1: deterministic, client-side)

Runs as pure functions over the stored data; each rule outputs severity + plain-language explanation + "what to check in the 10-K":

1. Operating cash flow persistently below net income (earnings quality).
2. Gross or operating margin declining ≥3 consecutive years (eroding moat).
3. Debt-to-equity rising while ROE flat or falling (leverage-flattered returns).
4. Interest coverage < 3× (fragility).
5. Share count rising >2%/year (dilution) without commensurate growth.
6. ROE > 25% with debt-to-equity > 2 (returns manufactured by leverage; recompute as ROIC).
7. Revenue growing while FCF shrinking ≥2 years (capital intensity creep).

## 4. Design and UX (Apple design discipline)

### Design philosophy

Financial tools default to dense, intimidating, terminal-like interfaces. That aesthetic actively harms the primary persona. We apply the opposite: **clarity, deference, depth**. The numbers are the content; the interface recedes. The test for every screen: *does this feel inevitable, like it couldn't have been designed any other way?*

Three governing decisions:

1. **Typography is the interface.** Financial data is text and numbers. We invest the design budget in a rigorous type system rather than decorative chrome. Tabular figures (`font-variant-numeric: tabular-nums`) everywhere numbers align vertically. Non-negotiable for scannable financial tables.
2. **Nearly monochrome, colour as meaning.** Neutrals dominate. Exactly one accent (system blue `#007AFF` family) for interactive elements. Semantic colour is reserved and consistent: green = healthy signal, orange = investigate, red = red flag. Colour is never decoration; a user should be able to squint at a company dashboard and read its health from colour distribution alone.
3. **Progressive disclosure.** The Learner sees a clean dashboard of 12 numbers with sparklines. Every deeper layer (formula, inputs, 10-year table, Owner's-lens essay) is one tap away, never on-screen by default. The Practitioner can collapse the education layer globally.

### Type scale and spacing tokens

- **Type scale (px):** 11, 13, 15, 17, 20, 22, 28, 34. No freestyle sizes. Weight carries hierarchy: semibold for primary values, regular for labels, no more than two weights per screen.
- **Tracking:** −0.02em on the 28/34 display sizes (hero numbers like "ROE 22.4%"), +0.01em on 11/13 caption text.
- **Spacing scale (px):** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Used religiously. Related items grouped tightly; groups separated generously. The whitespace *is* the information hierarchy.
- **Line height:** 1.5 body, 1.15 for display numbers.

### Key screens

> The five screens below define the design language by example. The complete inventory (all routes, twelve screens with their empty/loading/error states, the first-run flow, and the component/hook contracts) is specified in the companion document **`plainsight-frontend.md`**.

**1. Library (home).** A calm list of saved companies. Each row: company name, ticker, a single composite quality indicator (small coloured dot: count of active red flags), last-updated date, and a 10-year ROE microsparkline. Generous 64px row height, no borders: separation by spacing alone. Pull-to-refresh triggers a sync when online; silently does nothing when offline.

**2. Company dashboard.** The heart of the app. A hero header (company name, sector, latest fiscal year), then metric cards in a responsive grid. Each card: metric name (13px, secondary colour), current value (34px display, tabular), 10-year sparkline, and a subtle delta chip (▲ improving / ▼ deteriorating over 5y). Tapping a card opens the metric detail sheet: full 10-year chart, formula with live inputs highlighted, plain-language explanation, and the "Owner's lens" paragraph. Red flags, if any, appear as a dismissible-but-persistent section beneath the grid: orange/red cards with the rule's explanation and "what to check."

**3. Data entry.** The most craft-critical screen: this is where the app wins or loses the non-finance user. One statement at a time (segmented control: Income / Balance / Cash Flow), one fiscal year per column, large touch targets (≥44pt), numeric keypad, automatic thousands separators as-you-type, and an inline hint per line item ("Find this as 'Total revenue' on the first line of the income statement"). Derived subtotals compute live and are shown greyed (immediate feedback that the numbers hang together). Sticky save; every keystroke persists to local storage (no lost work, ever).

**4. Compare.** Up to 4 companies as columns, metrics as rows, best-in-row subtly highlighted. Overlaid trend charts beneath, one metric at a time via segmented control. Deliberately restrained: no radar charts, no scores; the user forms the judgment.

**5. Thesis editor.** A focused, distraction-free writing surface with the four structured prompts as section headers. Serif optional for long-form comfort. Autosaved, versioned (see data model), with a "snapshot financials with this thesis" toggle so future-you can see what the numbers looked like when you wrote it.

### Motion and interaction

- Spring curves only (`cubic-bezier(0.2, 0.8, 0.2, 1)`), 200–350ms. Metric detail sheets slide up from the tapped card (spatial continuity); dismissing returns them there.
- Dashboard cards stagger in at 30ms intervals on first load (once, subtly).
- Buttons scale to 0.97 on press. Charts animate their draw-in only on first render, never on data updates (updates should feel instant, not theatrical).
- `prefers-reduced-motion` honoured globally: all transitions become opacity fades ≤150ms.

### Dark mode and accessibility

- Dark mode from day one, designed not inverted: elevated surfaces at `#1C1C1E`-family greys, never pure black cards on pure black. Chart palettes re-derived for dark backgrounds (desaturated, higher luminance).
- WCAG AA contrast minimum (4.5:1 body, 3:1 large text) verified in CI via automated checks on the token palette.
- Full keyboard operability; focus rings designed as part of the aesthetic, never stripped. Charts have table-fallback views for screen readers (every chart is backed by the same data grid, exposed via an accessible toggle).
- Dynamic type: layout tested at 130% text scale.

## 5. Frontend Architecture (Meta-calibre engineering)

### Stack selection and rationale

| Choice | Selection | Why |
|---|---|---|
| Framework | **React 19 + TypeScript (strict)** | Team familiarity (established from prior agent-system work); ecosystem for charts/PWA; TS strict mode makes illegal financial states unrepresentable |
| Build | **Vite** | Sub-second HMR (fast feedback loops are a productivity multiplier), first-class PWA plugin, small config surface |
| Routing | **TanStack Router** | Fully type-safe routes and, the deciding feature, **typed search params**: sheet and modal state lives in query params (frontend spec §1.1), so `?metric=roe` becomes a typed contract instead of string parsing. React Router is the safe fallback if it ever chafes |
| Monorepo | **pnpm workspaces** | `apps/web` + `packages/*` + `infra` in one repo, one lockfile; no Nx/Turborepo until build times argue for it |
| Styling | **Vanilla Extract (zero-runtime CSS-in-JS)** | Type-safe design tokens (the Apple token system becomes a typed API), zero runtime cost, atomic output. Tailwind was considered; rejected because the bespoke type/spacing system is the product's soul and deserves first-class typed tokens rather than utility-class approximation |
| Client state | **Zustand** (UI state) + **TanStack Query** (server state, Phase 2+) | Deliberate separation: server cache ≠ app state. Redux rejected as overweight for this domain size |
| Local persistence | **IndexedDB via Dexie.js** | The primary datastore (see local-first section). localStorage rejected: 5MB limit and synchronous API are both disqualifying |
| Charts | **Recharts** for dashboard sparklines/cards; **visx** if/when custom interactions outgrow it | Recharts is fast to ship and adequate for v1's chart complexity |
| Validation | **Zod** | Single schema source: validates form input, IndexedDB reads, API responses, and import files. Types inferred, never duplicated |
| Testing | **Vitest + React Testing Library + Playwright** | Unit (calc engine), component (behaviour), E2E (journeys) |
| PWA | **vite-plugin-pwa (Workbox)** | Installability + offline shell caching; this is how "works when everything is down" is actually delivered |

### The local-first data layer (the availability answer)

This is the architectural centerpiece, and it directly answers the product owner's uptime concern. Complexity is deliberately concentrated here, in one well-tested boundary, so the component surface stays simple.

- **IndexedDB is the source of truth**, not a cache. Every company, every statement, every thesis lives on-device first. The app boots, reads, computes, and writes with zero network calls.
- **Service worker (Workbox)** precaches the app shell (HTML/JS/CSS/fonts) with a stale-while-revalidate strategy. After first visit, the app cold-starts offline, forever, until the user clears storage. The PWA is installable to home screen / dock.
- **Sync is an optional overlay (Phase 3).** When enabled and online, a sync engine reconciles IndexedDB with the backend using last-write-wins per record with Lamport timestamps and a device-id tiebreak (single-user data → no complex CRDT needed; conflicts only arise from the user's own multiple devices). Sync failures are silent-and-retried; the UI never blocks on them.
- **Import/export as the trust escape hatch:** one-tap export of the entire library to a versioned JSON file (Zod-schema'd), and import of the same. The user's research is never hostage to us, to a browser profile, or to any service.

**Degradation matrix (every feature has a no-network story):**

| Feature | Online | Offline |
|---|---|---|
| Ratio dashboard, charts, red flags, compare, thesis | ✓ | ✓ (identical) |
| Manual data entry | ✓ | ✓ (identical) |
| Ticker import (EDGAR-derived) | ✓ | Hidden with hint: "Available when online, or enter manually" |
| Live price (for P/E) | ✓ auto | User enters price manually; P/E card shows "as of ⟨YYYY-MM-DD⟩" |
| Cross-device sync | ✓ | Queued locally, reconciles on reconnect |
| Filing upload + extraction (Phase 3) | ✓ | Hidden with hint: "Available when online, or enter manually" |
| AI thesis critique (Phase 4) | ✓ | Feature not shown; thesis editor unaffected |

### The calculation engine: pure, isolated, exhaustively tested

`packages/calc-engine` is a **zero-dependency TypeScript package** with no React, no DOM, no I/O. Pure functions: `(statements: FinancialStatements[]) → MetricsReport`. This is where correctness lives, so it gets the strictest treatment:

- Discriminated unions make illegal states unrepresentable: a fiscal year either has a complete balance sheet or the type is `IncompleteYear`; components physically cannot ask for ROE on incomplete data; the type system forces the "insufficient data" UI path.
- All money in **integer cents (or a decimal library), never floats**, with explicit currency and unit (thousands/millions) metadata carried through the type. Display formatting is a separate, final step.
- Division-by-zero, negative-equity ROE, and missing-year gaps are handled as typed results (`{ status: 'not_meaningful', reason: 'negative_equity' }`), never as `NaN` leaking to the UI.
- **Test regime:** property-based tests (fast-check) for algebraic invariants (e.g., margin always ∈ [−∞, 1] with revenue > 0), golden-file tests against 5 hand-verified real companies (numbers cross-checked to their actual 10-Ks), and a regression test for every bug ever found. Target: 100% branch coverage on this package alone; it's small enough that this is cheap, and it's the product's credibility.

### Component architecture

Strict smart/presentational split, with the container role played by hooks:

- **Presentational:** `MetricCard`, `TrendChart`, `RedFlagBanner`, `StatementGrid`, `ComparisonTable`: pure functions of props, no data fetching, no store access. Storybook-driven development; visual regression via Playwright screenshots (free) on the design-token layer.
- **Container hooks:** `useCompany(id)`, `useMetrics(companyId)`, `useRedFlags(companyId)`, `useSyncStatus()`: own Dexie reads (via `dexie-react-hooks` live queries, so the UI is reactively bound to IndexedDB), memoise calc-engine invocations, and expose typed results.
- **Compound components** where shared state warrants it: `<Comparison>` / `<Comparison.Column>` / `<Comparison.MetricRow>`.
- Component budget discipline: any component crossing ~8 props triggers a design review; it's probably two components.

### Performance engineering

Budgets set now, enforced in CI (Lighthouse CI + `size-limit`):

- **Initial JS ≤ 180KB gzipped.** Route-level code splitting (Library shell loads first; charts, compare, and thesis editor are lazy chunks). Recharts is the biggest line item; it loads with the dashboard chunk, not the shell.
- **TTI < 2s on a mid-range Android over 4G; < 1s repeat visits** (service worker shell).
- Calc engine invocations memoised per `(companyId, dataVersion)`; a full 10-year, 14-metric computation is microseconds, but memoisation prevents chart re-render cascades.
- **State colocation over memoisation:** data-entry keystrokes update per-field local state; the statement grid commits to Dexie on blur/debounce. A keystroke must never re-render the dashboard.
- Virtualised lists if the library grows past ~100 companies (react-virtuoso), deferred until measured need.

### Error handling

- **Granular error boundaries** per feature region (a chart crash must never take down the data grid holding unsaved work). Each boundary: friendly message + retry + "export my data" escape hatch.
- Zod validation at every boundary: form → engine, Dexie → app (guards against schema drift across app versions, with versioned migrations in Dexie), API → app (Phase 2).
- Every write is transactional in Dexie; the entry form is optimistic with rollback on write failure (rare, but storage-quota exhaustion exists, detected and surfaced with an export prompt).

## 6. Backend Architecture (Google-calibre engineering)

### The most important backend decision: Phase 1 has no backend

Applying "the best backend is the one you don't operate": the entire v1 product ships as a static PWA. There is nothing to page anyone about, the availability story is CloudFront's (~100% in practice) rather than ours, and the cost is dollars per month. The backend earns its existence only when Journey B (ticker import) and sync justify it.

When it does exist (Phase 2+), it follows the principles below.

### API design: resource-oriented, versioned, boring

The API is a product for the client, not a mirror of storage. Resources and standard methods only:

```
GET  /v1/companies/{ticker}                      → company profile (name, sector, CIK)
GET  /v1/companies/{ticker}/financials           → standardised annual statements
       ?years=10&statements=income,balance,cashflow
GET  /v1/companies/{ticker}/quote                → delayed price (deferred to Phase 3+, §12.1)
GET  /v1/search?q=apple                          → ticker search, paginated (opaque page tokens)

POST /v1/sync/push        (auth)                 → client changes since checkpoint, idempotency-key required
GET  /v1/sync/pull        (auth)                 → server changes since checkpoint

POST /v1/uploads          (auth)                 → presigned S3 PUT URL for a filing PDF
POST /v1/extractions      (auth)                 → { jobId } for an uploaded document, idempotency-key required
GET  /v1/extractions/{jobId}  (auth)             → status | structured statements + confidence + page refs
```

Contract rules: full resources returned from mutations; opaque page tokens (never offsets); standard error envelope (`code`, `message`, `details[]`, `requestId`) treated as part of the contract; additive changes never bump the version; breaking changes get `/v2/` with a published parallel-run and sunset timeline. **Idempotency is mandatory on sync pushes**: clients on flaky mobile networks *will* retry, and a duplicated push must be a no-op.

> Implementation contract (the DynamoDB key design and access patterns, Lambda inventory, sync protocol (tombstones included), extraction job lifecycle, BYOK proxy target allowlist, and external-client etiquette) lives in the companion document **`plainsight-backend.md`**.

### Data ingestion pipeline (the real backend work)

Financial data quality is the hard problem; the API is trivial by comparison.

- **Source:** SEC EDGAR `companyfacts` XBRL API (free, canonical, US-listed companies). Standardisation layer maps XBRL concepts (`us-gaap:Revenues`, `us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax`, …) onto our 22 canonical line items (data-model spec §2); this mapping table is the crown-jewel asset and is version-controlled with golden tests against hand-verified filings.
- **Pipeline shape: on-demand first.** Annual reports change once a year; a nightly sweep pays for freshness nobody uses. A ticker's first request triggers fetch → normalise → validate → store; thereafter a **weekly** EventBridge sweep checks only watched tickers for new filings. Validation is unchanged (Zod-equivalent in the pipeline; reject-and-quarantine on anomaly, e.g., balance sheet that doesn't balance beyond rounding tolerance). Failures go to a DLQ with alerting; a poisoned filing must never block the pipeline (blast radius = that one company).
- **Serving store:** **DynamoDB**, single-table: `PK=TICKER#{t}`, `SK=FY#{year}#STMT#{type}`, plus a `PROFILE` item. Access patterns are exactly "all years for one ticker" and "one profile": key-value at its purest, and the data model is small enough that DynamoDB lock-in risk is acceptable against its operational silence. (Aurora was considered; rejected: no relational queries exist in the serving path.)
- **Quote data (deferred to Phase 3+; resolved §12.1: v1 price entry is manual):** a market-data API (e.g., Polygon/Twelve Data tier; both cover ASX quotes) behind a 15-minute-TTL cache; delayed quotes are explicitly fine (non-goal #4).

### Multi-market strategy: US + ASX

**US (Phase 2, as planned):** SEC EDGAR XBRL `companyfacts`. Free, canonical, structured. Unchanged.

**ASX (Phase 2.5):** Australia has no EDGAR equivalent. As of this writing, listed-company financial reports are not lodged in mandatory structured XBRL/iXBRL (voluntary SBR lodgement exists with negligible uptake); annual and half-year reports arrive on the **ASX Market Announcements Platform (MAP) as PDFs**. Three sourcing options were evaluated:

1. **Commercial fundamentals API** (e.g., EOD Historical Data covers ASX). Fastest path, but it would become the plan's dominant recurring cost (~US$50–80/month), redistribution/caching licence terms are restrictive and need legal reading, and provenance is the vendor's standardisation rather than the filing itself, which cuts against the product's core trust promise.
2. **LLM-assisted PDF extraction from MAP filings** (*chosen*). The source is canonical (the actual lodged annual report) and free; the extraction is the hard part, and modern document-capable models make it tractable inside the existing batch pipeline.
3. **Manual entry**: already exists as the universal fallback (Journey A) and remains the day-one answer for anything the pipeline hasn't covered.

**Chosen design: extraction in the batch pipeline, on-demand per ticker.** When a user first requests an ASX ticker (or via the weekly sweep for watched tickers): fetch the annual/half-year report PDF from MAP → locate the financial-statements section → LLM extraction (Claude, table-aware) into the canonical line-item schema with per-field confidence → **hard validation gates** (balance sheet cross-foots within rounding tolerance, subtotals recompute, YoY deltas sanity-checked) → anything failing a gate is quarantined to a human review queue and *never served* → validated data written to DynamoDB with provenance. Filings are immutable, so extraction happens once per document and is cached forever; cost scales with usage, not with the ~2,000-company ASX universe.

**Why this doesn't violate the availability constraint:** the constraint governs the *client runtime*, not the ingestion path. AI here is an offline batch dependency. If the extraction service is down, the blast radius is "this ASX ticker isn't pre-fillable yet; enter it manually," which is identical to the app's existing offline behaviour. The app itself cannot break, because nothing in the serving or client path calls a model.

**IFRS mapping variant:** ASX reporters file under AASB/IFRS, not US GAAP: different statement presentation and terminology ("profit for the year," classification differences), June 30 fiscal year-ends dominate, reporting cadence is half-yearly rather than quarterly, and the currency is AUD. This is a second mapping table alongside the XBRL one, **not an engine change**; the calc engine already carries currency, unit, and fiscal-calendar metadata by design. Golden-file tests extend to 5 hand-verified ASX annual reports across sectors.

**Dual-listed shortcut:** ASX companies with US ADR programs that file 20-Fs already appear in EDGAR and flow through the existing pipeline unchanged.

**Provenance upgrade:** every extracted figure stores a reference to its source document (MAP announcement ID + page number), so the dashboard's tap-to-see-formula transparency extends to **tap-to-see-source-filing**, a stronger trust story than any commercial aggregator can offer.

**Scope decision: launch large-cap-only.** The automated pipeline covers ASX large caps (ASX 200) at launch (the cleanest, most standardised reports, and the right corpus to learn on), expanding down-market only as measured extraction accuracy proves out. The prototype gate stands: 10 large caps, proceed only at ≥ 99.5% post-validation field accuracy; the fallback ladder (revisit commercial API on licence terms → manual entry) remains. The small-cap tail is served from day one by user-uploaded filings, below.

### User-uploaded filings: covering the small-cap tail (and everything else)

Everything outside the automated pipeline (ASX small caps, NZX, LSE, unlisted companies, even scanned reports) is covered by letting the user bring the document (Journey E). Design decisions:

- **Same extraction engine, second entry point.** The Phase 2.5 extraction service gains an `uploaded_document` source alongside `map_fetch`: same prompt, same canonical schema, same validation gates, same confidence scoring. The marginal build is the upload path and the review UX, not a new system.
- **The user is the reviewer.** The automated pipeline earns trust through our validation gates plus a human review queue on our side; uploads earn it by making *the user* the reviewer. Extracted values pre-fill the existing data-entry grid in review mode (low-confidence fields flagged, page references shown, the live client-side gates (cross-footing, balance checks) running as always), and nothing saves without explicit confirmation. For "The Learner" persona this is a feature, not a chore: verifying extracted figures against the source pages is precisely the filing literacy the product exists to teach.
- **Private-library isolation: the integrity boundary.** Upload-derived data writes only to the requesting user's own library, never to the shared canonical store. Provenance is labelled `source: user_upload (filename, extraction date)` and rendered visually distinct from `EDGAR` / `ASX MAP` data. A mistaken (or doctored) PDF can never contaminate the canonical dataset or any other user.
- **Upload mechanics:** presigned S3 PUT (annual reports run 5–30MB+, which rules out proxying through API Gateway's 10MB limit) → magic-byte and size validation (PDF/XLSX/CSV only, ≤50MB) → async extraction job (`POST /v1/extractions` returns a job id; client polls; 30–120s typical). Uploaded files are transient by default (lifecycle-deleted after 7 days); an optional "keep source document" toggle stores it in the user's partition to power tap-to-see-source on uploaded data too.
- **Auth-gated, quota'd, budget-capped.** Each extraction spends real model tokens, so the endpoint ships in Phase 3 behind Cognito with a per-user quota (e.g., 10 extractions/month) and a global monthly budget alarm wired to a feature-flag kill switch. (It *can* ship earlier with per-IP throttles and the same kill switch, at higher abuse risk: an anonymous endpoint that spends tokens is a cost-abuse magnet.)
- **Scanned documents work.** The extraction path rasterising pages for the model, so image-only PDFs (common among micro-caps) are handled, at lower confidence, which review mode surfaces prominently.

### Multi-provider extraction layer

The extraction service treats the model as a swappable component behind a narrow interface, for three reasons: **cost** (budget providers price extraction at 10–30× below frontier models; free tiers price it at zero), **resilience** (no single provider outage, price change, or ToS shift blocks ingestion), and **honest evaluation** (providers get measured against the golden corpus, not assumed). Provider specifics (free-tier limits, model availability, terms) churn quickly, which is exactly why everything below is registry configuration rather than code.

- **One interface, three adapters.** `ExtractionProvider.extract(document, schemaVersion) → candidate statements + per-field confidence`. Most target providers (DeepSeek, Alibaba Qwen (DashScope), Moonshot Kimi, Zhipu GLM, Groq, Mistral, OpenRouter) expose **OpenAI-compatible APIs**, so a single `openai-compatible` adapter covers nearly the whole registry; native `anthropic` and `gemini` adapters complete the set. Adding a provider is a config entry (base URL, model id, capabilities, cost tier, data policy), not a deployment.
- **Prompting is lowest-common-denominator by design.** Schema-first "respond only with JSON matching this schema" prompting plus Zod parsing with a single repair retry works on every provider; per-provider structured-output and tool-calling features vary too much to build against. Prompts are versioned (`promptVersion` in provenance).
- **Capability-aware routing.** The preprocessor normalises every document up front (PDF → page images + extracted text layer; XLSX/CSV → parsed sheets + compact text tables), and the router matches document needs to declared provider capabilities. Scanned PDFs and complex statement tables require **vision-capable** models (Claude, Gemini, Qwen-VL, GLM-4V); born-digital text layers and spreadsheet label-mapping run happily on cheap **text-only** models.
- **Spreadsheets are the cheap case, deliberately.** XLSX/CSV is already structured: SheetJS parses cells deterministically, and the model's only job is *semantic mapping* (which row label corresponds to which canonical line item) over a small text snippet. Cell values are copied from the parse, never retyped by a model, which eliminates transcription hallucination entirely for spreadsheets. Any provider on the registry can do this; token cost is near-nil.
- **Cheap-first escalation ladder.** Routing policy: free tier → budget provider → frontier, escalating automatically when a rung errors, rate-limits, or, crucially, produces output that **fails the validation gates**. Clean large-cap reports mostly extract on the cheap rungs; hard documents earn frontier tokens. Free-tier rate limits that would cripple a batch product are a non-issue for a single user extracting one filing at a time.
- **The gates are what make this safe.** Cross-footing, balance checks, confidence thresholds, quarantine, and review-before-save are provider-agnostic and unchanged. Provider quality therefore affects *pass rate and review burden*, never the correctness of served data: a weak model costs retries, not trust. This is precisely why free-tier and budget-provider experimentation is risk-free here when it wouldn't be in an unvalidated pipeline.
- **Sensitivity routing.** Listed-company filings are **public documents**, so the usual confidentiality objections to free tiers and offshore providers don't apply: route them to whatever's cheapest. But Journey E also accepts private-company accounts: each registry entry declares a data policy (free tiers commonly reserve training rights on inputs; some providers process data offshore), and documents the user marks confidential route **only to paid, no-training endpoints**. The trade-off is priced, visibly, instead of hidden.
- **Auditable provenance.** Every extraction records `{provider, model, promptVersion}` into the provenance object (schema extended in the companion spec). "Which model read this filing" is part of the audit trail, and mixed-provider libraries stay honest.
- **Measured, not vibed.** The Phase 2.5 prototype becomes a **bake-off**: the golden corpus runs through every registered provider, producing a scorecard (field-level accuracy, gate pass-rate, cost per filing, latency). The default ladder is set from that data and re-run whenever the registry changes.

**BYOK: the user's own keys, entered in Settings.** The registry supports a second credential source beyond the server's SSM SecureString store: keys the user pastes into a Settings → Providers screen. For a single-user local-first app this is the natural pattern, and it changes the architecture for the better:

- **Device-local by design.** Keys live in a dedicated IndexedDB table on the device and are **excluded from the export file and from sync by construction** (re-entered per device, deliberately), so a shared backup or a synced library can never leak a credential. Masked display, reveal toggle, and a per-provider "test connection" button.
- **Client-direct calls where the provider allows it.** With the user's own key, the browser calls the provider directly. No backend involved. CORS support is provider-dependent: Anthropic supports browser calls behind an explicit opt-in header designed for exactly this pattern (`anthropic-dangerous-direct-browser-access`), Gemini, OpenRouter, and Groq allow browser origins; several others (DeepSeek, DashScope, Moonshot, Zhipu) are unverified and churn. The registry carries a `browserCors` flag, and the test-connection button doubles as a runtime CORS probe.
- **Proxy fallback for the rest.** Providers without browser CORS route through an authenticated Lambda pass-through: the key travels per-request in a header, is **never stored and never logged**, and the response streams back. The proxy stays behind Cognito (an unauthenticated key-relay is an abuse magnet: stolen keys laundered through our egress IP), but per-user quotas vanish: it's the user's key and the user's spend. The budget kill switch now guards only the canonical pipeline's own keys.
- **Preprocessing moves client-side in direct mode.** PDF.js rasterising pages in-browser (a lazy-loaded chunk, never in the shell bundle) and SheetJS already runs in the browser, so in client-direct mode the document goes **device → chosen provider and never touches our infrastructure**, the strongest possible privacy posture for confidential uploads. Adapters, prompts, Zod schemas, and validation gates live in an isomorphic `extraction-core` package consumed identically by the browser and by Lambda: one implementation, two runtimes.
- **CSP consequence.** `connect-src` widens from self + our API to a **fixed allowlist** of registered provider origins (CloudFront response-headers policy). Adding a provider is an ops change that includes the CSP update; nothing becomes dynamic.
- **Key hygiene guidance in the UI.** Settings copy nudges the practices that actually matter: create a dedicated key per app, set the provider-side monthly spend cap, rotate if a device is lost. At-rest passphrase encryption (WebCrypto) was considered and deferred: the key must be plaintext in memory to be used, device compromise defeats it anyway, and the effective controls are the strict CSP, device security, and provider-side spend caps.
- **Same keys power Phase 4.** The optional AI thesis-critique layer rides the identical registry and BYOK credentials (client-direct where possible), so even the AI garnish never requires our backend.

### SLOs, reliability, failure modes

- **SLOs (Phase 2):** availability 99.9% on read endpoints (error budget ≈ 43 min/month; funds our deploy cadence); p50 < 100ms, p99 < 400ms on `GET financials` (single-digit-ms DynamoDB read + Lambda overhead makes this comfortable).
- **The client is the ultimate circuit breaker:** because the frontend is local-first, total backend failure degrades the product to… the fully functional offline app. This is the deepest reliability property in the design and it's free: it falls out of the local-first decision.
- Standard hygiene regardless: timeouts on every outbound call (EDGAR, market data) with exponential backoff + jitter + retry budgets; graceful degradation on partial data (serve 8 of 10 years with a `gaps[]` annotation rather than 500); load shedding via API Gateway throttles.
- **Sync conflict semantics documented up front:** single-user, multi-device → last-write-wins per record using Lamport timestamps with a device-id tiebreak (per the backend spec §4: identical user-visible guarantees to vector clocks at a fraction of the machinery); deletions travel as 90-day tombstones; thesis documents additionally keep server-side version history (append-only) so LWW can never destroy writing.

### Observability

Structured JSON logs (requestId propagated from edge to Lambda to DynamoDB annotations); the four golden signals dashboarded per endpoint; alerts are symptom-based only (elevated 5xx rate, p99 breach, DLQ depth > 0, weekly sweep failure). X-Ray tracing on the ingestion path where multi-hop debugging will actually happen.

## 7. Infrastructure and Deployment (AWS discipline)

### Guiding tension

Reliability vs. cost vs. operational burden, resolved for a solo-maintainer product: **minimum architecture meeting requirements, managed services only, serverless because the workload is genuinely spiky** (weekly ingestion bursts, sparse daytime reads). No containers, no VPC, no load balancer, no WAF: nothing that idles and nothing that pages; every serving-path component (CloudFront → S3, API Gateway → Lambda, DynamoDB) is pay-per-request.

### Architecture by phase

**Phase 1 (static PWA, no backend):**
- S3 (private, versioned) + **CloudFront** with OAC. `index.html` no-cache; hashed assets `max-age=1y, immutable`; service worker script no-cache (stale SWs are a classic PWA foot-gun).
- Security headers (CSP, HSTS) via CloudFront response-headers policy. Route 53 + ACM exist only in custom-domain mode, which is resolved off (§12.6): the app lives on the default `*.cloudfront.net` origin.
- Cost: **≈ $1–5/month.** Availability story: CloudFront's, i.e., better than anything we could build.

**Phase 2 (read API + ingestion):**
- **API Gateway (HTTP API) → Lambda (Node 22, TypeScript) → DynamoDB** (provisioned within the always-free tier; see the CDK spec §8).
- Ingestion: EventBridge Scheduler → Step Functions (map over changed CIKs, per-item retry/catch) → Lambdas → DynamoDB; SQS DLQ; CloudWatch alarm on DLQ depth.
- CloudFront in front of API Gateway for edge caching of `GET financials` (data changes at most weekly per ticker; cache TTL 6h, invalidated by the pipeline on write). This alone absorbs most read traffic at the edge.
- Cost at hobby scale: **≈ $10–30/month** (DynamoDB on-demand + Lambda + market-data API subscription being the swing factor).

**Phase 3 (auth + sync):** Cognito (hosted UI, no password handling by us) + sync Lambdas + a `SYNC#{userId}` item collection in the same DynamoDB table. DynamoDB PITR turned on the day user data lands (RPO ≈ 5 min; RTO: hours, acceptable; the authoritative copy is on the user's device, which inverts the usual DR anxiety).

### IaC, environments, CI/CD

- **AWS CDK (TypeScript)**: same language end to end; typed constructs; `cdk diff` as the review artefact. All resources tagged (`project`, `env`, `owner`) from day one for cost attribution. Stack decomposition, environment wiring, conventions, security invariants, and the budget kill-switch wiring are specified in the companion document **`plainsight-cdk.md`**.
- **One account, one environment** (owner's call: single user, cost priority; no standing staging). Compensating controls replace the second environment: PR-time `cdk diff` + CI-blocking invariant tests, an IAM permission boundary on the deploy role standing in for SCPs, PITR on user-touching data, and **ephemeral rehearsal stacks** (a prefixed throwaway copy deployed for a day when an infra change deserves rehearsal, then destroyed). The deeper insurance is architectural: the client is local-first, so the blast radius of a bad backend deploy is "online extras degrade," never "the app breaks" or "data is lost."
- **GitHub Actions with OIDC role assumption: zero long-lived AWS credentials anywhere.** Pipelines: (a) app pipeline: lint → typecheck (`tsc --noEmit`, blocking) → unit + component tests → build → Playwright E2E against the local preview build → deploy prod (S3 sync + targeted invalidation) → smoke check; (b) infra pipeline: separate, `cdk diff` posted to PR; on merge, stateless stacks deploy directly, while changes touching the stateful stacks (`Data`, `Auth`) pass a one-click GitHub environment gate. Infrastructure and app changes never ride the same pipeline.
- Rollback: app = redeploy previous immutable build artefact (< 5 min); infra = `cdk deploy` of previous tag; DynamoDB = PITR.
- Frontend observability: none paid; the only user files his own bug reports. Errors surface through the error-boundary UI and the console; free-tier Sentry is an optional add if silent errors ever become a nuisance. RUM at an audience of one is a dashboard about yourself.

### Security posture

- Least-privilege IAM per Lambda (single-table access scoped by key-prefix conditions where sensible); **SSM Parameter Store SecureStrings (standard tier: free, KMS-encrypted) for the canonical pipeline's own provider keys**, rotated manually; no secrets in the client bundle, ever. BYOK keys are user data on the user's device, not bundle secrets; the browser talks only to our API and, in BYOK client-direct mode, to the fixed allowlist of provider origins.
- Client data is the sensitive asset and it lives **on the user's device**, a materially better privacy posture than warehousing everyone's research. Sync (Phase 3) is opt-in; server-side thesis/data encrypted at rest (DynamoDB default) and access-logged.
- CSP: `script-src` remains self-only (no third-party scripts in v1); `connect-src` = self + our API + the fixed allowlist of registered provider origins for BYOK client-direct calls.

## 8. Phased Roadmap

| Phase | Scope | Effort (focused) | Exit criteria |
|---|---|---|---|
| **0: Foundations** | Repo, CDK skeleton, design tokens, calc-engine package with golden tests, CI green | 1 wk | Calc engine passes golden files for 5 real 10-Ks |
| **1: Offline core (MVP)** | PWA shell, Library, data entry, dashboard, metric details, red-flag engine, export/import, dark mode, S3+CF deploy | 3–4 wks | Full Journey A completable in airplane mode; Lighthouse PWA ✓; budgets met |
| **2: Import** | EDGAR pipeline (on-demand + weekly sweep of watched tickers), standardisation mapping, read API, ticker search, edge caching | 3 wks | Journey B: ticker → pre-filled 10-year model in < 10 s; on-demand ingest and weekly sweep exercised end to end |
| **2.5: ASX import** | MAP filing fetcher, LLM extraction (batch, on-demand per ticker), **multi-provider adapter layer (registry + 3 adapters) with cheap-first escalation**, IFRS mapping table, validation gates + review queue, ASX golden files, provider bake-off harness, tap-to-source-filing provenance | 3 wks | 10-company prototype ≥ 99.5% field accuracy post-validation; Journey B works for ASX tickers; every figure links to its source page; **provider scorecard produced and default ladder configured from measured results** |
| **3: Compare + Thesis + Sync + Uploads** | Comparison view, thesis editor with versioned snapshots, Cognito auth, multi-device sync, BYOK provider settings screen, filing upload + extraction review mode (client-direct BYOK by default; auth'd server-proxy pass-through for non-CORS providers) | 3–4 wks | Two devices converge after offline edits on both; thesis history immutable; uploaded annual report → reviewed and saved company in < 5 min; export file verified key-free |
| **4: Optional AI layer** | Clearly-separated enhancement: thesis critique, red-flag narrative, "explain this trend"; via Anthropic API, feature-flagged, invisible when unreachable | 2 wks | Killing the AI endpoint leaves zero broken UI |

Total to a genuinely complete product: **~16 weeks** of focused effort, with a usable, shippable app at the end of Phase 1 (week ~5). Phase 2.5 is independently deferrable; nothing downstream depends on it.

## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Calc or mapping error erodes trust** (the existential risk) | Med | High | Golden-file tests vs. hand-verified 10-Ks; tap-to-see-formula transparency; property tests; quarantine-on-anomaly in pipeline; every displayed number traceable to its inputs |
| XBRL standardisation is messier than planned (custom extensions, restatements) | High | Med | Start with large-cap filers (cleanest tags); surface "source: as-reported / standardised" provenance; manual-override always available (Journey A is the fallback) |
| **ASX PDF extraction errors** (LLM-parsed figure is wrong) | Med | High | Hard validation gates (cross-footing, balance checks, YoY sanity); quarantine + human review queue (unvalidated data is never served); per-field confidence scores; tap-to-source-filing lets users verify; 10-company prototype gate before committing to Phase 2.5 |
| **User-uploaded filing risks** (wrong/doctored document; token-cost abuse) | Med | Med | Private-library isolation (uploads never touch the canonical store); distinct provenance labelling; review-before-save (user confirms every figure); auth + per-user quotas + global budget kill switch; PDF magic-byte and size validation |
| **Provider sprawl risks** (quality variance; free-tier ToS and rate-limit churn; offshore data policies) | Med | Low–Med | Gates are provider-agnostic (bad output fails validation and never serves); bake-off scorecard sets the ladder empirically; registry-as-config makes provider churn an ops tweak, not a release; sensitivity routing keeps confidential documents on paid, no-training endpoints |
| **BYOK key exposure** (XSS theft; accidental inclusion in backups) | Low | Med | Keys are device-local IndexedDB records excluded from export and sync by construction (asserted by test); strict CSP with fixed connect-src allowlist is the XSS control; masked UI; guidance toward dedicated, spend-capped keys; proxy mode never stores or logs keys |
| IndexedDB eviction / storage loss on device | Low | High | `navigator.storage.persist()` requested; prominent export habit built into UX (periodic "back up your library" nudge); Phase 3 sync as belt-and-braces |
| Regulatory perception: "is this investment advice?" | Low | High | Non-goal #2 enforced in copy review: no buy/sell language anywhere, education framing, persistent disclaimer; red flags phrased as questions to investigate |
| Scope creep toward "Bloomberg junior" | High | Med | Non-goal #3; metric additions require removing or demoting something (the 12-card budget is a design constraint, not a starting point) |
| Market-data API cost/terms change | Med | Low | Quote layer is one adapter behind an interface; P/E degrades to manual-price entry (already the offline path) |
| Solo-maintainer bus factor / ops burden | Med | Med | Serverless-only, no pageable infrastructure, IaC-complete rebuildability, runbook in repo |

## 10. Alternatives Considered

1. **Full-stack from day one (server-rendered app + Postgres).** Rejected: violates the availability requirement at its root, adds standing cost and operational surface, and the domain (single-user analytical records) simply doesn't need server-side truth.
2. **Native iOS/Android (SwiftUI/Compose).** Best-possible feel, but doubles-to-triples effort, and the PWA delivers offline + installability + one codebase. Revisit if the product finds an audience; the calc engine and API are reusable as-is.
3. **Local files (no IndexedDB): "just a spreadsheet, but pretty."** Simplicity is attractive, but loses live queries, transactions, migrations, and the reactive UI binding. Export/import keeps the file-based escape hatch anyway.
4. **AI-first architecture (Claude analyses pasted 10-K text as the core loop).** Explicitly rejected per the product owner's constraint: AI availability must never gate core function. Inverted instead: deterministic core, AI as Phase 4 garnish.
5. **Scraping Yahoo or other third-party financial sites instead of EDGAR.** Rejected: ToS risk, brittleness, and unverifiable provenance. EDGAR is the primary source of record; provenance is a trust feature.
6. **CRDTs for sync.** Overkill for single-user multi-device; LWW + server-side version history for prose achieves the same user-visible guarantees at a fraction of the complexity.
7. **Next.js (or Remix) instead of Vite + React.** Rejected: Next is a server-rendering framework, and this product's centerpiece is the opposite: a fully static, local-first PWA with zero backend in Phase 1 and no SEO to serve at an audience of one. Static export (`output: 'export'`) neuters the features that justify Next's complexity (SSR/RSC, middleware, ISR, image optimisation), while deploying it un-neutered on AWS means OpenNext/Lambda@Edge machinery the CDK plan deliberately refuses. Vite delivers exactly the needed subset (instant HMR, the PWA plugin, lazy route chunks, plain static output to S3) with nothing installed-but-disabled.

## 11. Cost Model (steady state, hobby scale)

| Item | Phase 1 | Phase 2–3 |
|---|---|---|
| S3 + CloudFront (always-free tier: 1TB egress, 10M requests) | $0–1 | $0.50–2 |
| Domain + Route 53 (optional: $0 on the default `*.cloudfront.net` origin) | $0–1.50 | $0–1.50 |
| Lambda + API Gateway (Lambda always-free tier; API GW pennies at this volume) | n/a | $0–0.50 |
| DynamoDB (provisioned 25 RCU/WCU, inside the always-free tier; PITR pennies from Phase 3) | n/a | $0 |
| Cognito (single user) | n/a | $0 |
| LLM APIs (on-demand extraction only, cheap-first ladder; Journey E uploads bill to the user's own BYOK keys) | n/a | $0–1 |
| **Total / month** | **≈ $0–1.50** | **≈ $0.50–4** |

Single environment, no staging; no market-data subscription (prices are manual, OQ #1); no containers, no VPC, no NAT, nothing idling. The always-free tiers (CloudFront, Lambda, DynamoDB provisioned 25/25, Cognito, SSM) cover essentially all steady-state usage; the floor is ~$0 plus the optional domain, and the bill only moves when filings are actually extracted.

## 12. Open Questions and Decision Log

1. **Resolved: manual price entry for v1.** No market-data provider; the user enters the current price (with as-of date) per company. This removes the only mandatory paid dependency and is already the offline path. Auto-quotes become a Phase 3+ nicety behind the same adapter interface.
2. **Resolved: both US and ASX are supported.** US via EDGAR XBRL (Phase 2); ASX via LLM-assisted PDF extraction from ASX MAP filings (Phase 2.5), gated on a 10-company accuracy prototype. Launch coverage is **large-cap-only (ASX 200)**; the small-cap tail (and any other market) is covered by user-uploaded filings (Journey E, Phase 3). See §6, "Multi-market strategy."
3. **Resolved: annual-only for v1.** Matches the long-term philosophy, halves the ASX extraction surface (annual reports only, skip half-years), and the fiscal-period model in the companion spec leaves room for TTM later without schema breakage.
4. **Resolved: thesis export ships in Phase 3.** Markdown export (near-free); PDF rides the same path.
5. **Resolved: single-user personal tool.** See the audience decision note in §2.
6. **Resolved: no custom domain; the app lives on the default `*.cloudfront.net` origin.** `EdgeCert` and Route 53 never deploy; the CDK config pins `domain: null`. Known cost accepted: IndexedDB is origin-bound, so any later move to a custom domain requires a manual export → import and PWA re-install per device (survivable via one-tap export, but a chore). Realistic revisit trigger: the legal-tripwire event of ever sharing the app, which forces a naming pass anyway.
7. **Resolved: the app is named Plainsight (July 2026), and no investor is named anywhere.** The naming pass from §15 tripwire #1 was run early, since the repository is public: the name avoids the surname of the famous investor whose published philosophy inspired this product, preventing any implied-endorsement / passing-off reading. By the owner's extension of the same decision, the repository's documentation and the in-app education copy also stay surname-free: the philosophy is described in concept terms (moats, margin of safety, owner mindset), and the educational layer is branded the **"Owner's lens."** Repository and plan filenames renamed to match.
8. **Resolved: plan-item codes are documentation labels; code identifiers carry meaning (2026-07-11).** The letter-number codes these plans use for their pinned items (metrics, policies, rules, notes, decisions, screens) never appear in source code, tests, fixtures, or UI copy. Code writes the semantic identifier (`roe`, `erodingMoat`, `currentRatio`) and, when a comment needs the contract's authority, names the concept and cites the plan by document and section. Rationale: the codes renumber as the plans evolve and mean nothing to a reader without the document open; names are their own documentation and survive both. The pinned code-to-identifier mappings live beside the dictionaries (data-model §6 and §7); house-style rule 4 enforces the ban in CI. Decided while the rename was still cheap: nothing persists identifiers until Phase 1's storage layer lands.

### Remaining to complete the plan

1. **Data model & metric dictionary**: ✅ `plainsight-data-model.md`; owner review pass completed 2026-07-11 (D1/D2 resolved; policies P-0…P-8, the ROIC/FCF definitions, and the rule thresholds confirmed, with two rules amended: see its §12).
2. **Screen inventory + first-run design**: ✅ `plainsight-frontend.md`: routes, twelve screens with empty/loading/error states, first-run flow with the sample-data decision pinned, component and hook inventories, responsive and accessibility rules, folder structure.
3. **Doc hygiene**: ✅ added below: §13 success criteria, §14 browser support & storage durability, §15 legal tripwires.
4. **Golden-company confirmation**: ✅ confirmed: Apple, Microsoft, Coca-Cola, Costco, Union Pacific (US); CSL, Wesfarmers, Woolworths, JB Hi-Fi, Cochlear (ASX). Locked in the data-model spec §11.
5. **CDK implementation plan**: ✅ `plainsight-cdk.md`: stack decomposition, account/region wiring (Sydney primary, us-east-1 cert), code conventions, security invariants as tests, pipelines, and the budget kill-switch wiring.
6. **Backend implementation plan**: ✅ `plainsight-backend.md`: DynamoDB access patterns and key design, Lambda inventory, in-memory ticker search, sync protocol with tombstones, extraction job lifecycle, BYOK proxy target allowlist, EDGAR/MAP client etiquette, and the error contract.

**Planning is complete.** Every decision is made, every build contract exists, and the data-model review pass finished 2026-07-11; the backend spec's short review list (its footer) can wait until Phase 2 approaches. Phase 0 begins.

## 13. Success criteria (personal-tool definition of "working")

Activation: a first real company fully entered and analysed within the first week after Phase 1 ships. Depth: ten-year data for at least five companies within a month, and a written thesis for every company owned or seriously considered. Trust, the non-negotiable one: **zero instances of a displayed number the owner cannot reproduce by hand from the detail sheet**; any such instance is a P0 bug regardless of size. Habit: the app is opened before any buy/sell decision, the honest personal test of whether the tool earns its place. Hygiene: a full export taken at least quarterly, and the calc-engine golden tests green on every dependency update.

## 14. Browser support and storage durability

Support matrix: evergreen Chrome, Edge, and Firefox, plus Safari 17+ on macOS and iOS (in practice, the owner's desktop and phone). Playwright E2E runs Chromium and WebKit.

The caveat that genuinely threatens the local-first premise: **WebKit's Intelligent Tracking Prevention deletes all script-writable storage, including IndexedDB, after 7 days without interaction, for web apps not installed to the home screen.** Installed PWAs are exempt. Layered mitigations, in order: (1) on iOS Safari, a one-time, dismissible, honestly-worded "Add to Home Screen" explainer on the Library screen; (2) `navigator.storage.persist()` requested wherever honoured; (3) a storage-status readout in Settings → Data (persisted?, usage vs quota via `storage.estimate()`); (4) an export nudge when no backup has been taken in 30 days; (5) Phase 3 sync as belt-and-braces. Quota exhaustion is detected proactively and surfaced with an export prompt before writes begin failing.

## 15. Legal tripwires (personal-use posture)

As a personal tool analysing public filings on the owner's own devices, nothing is currently required. The tripwire list (events that trigger action *before* proceeding, not after):

1. **Sharing the URL with anyone, even one friend** → add not-financial-advice disclaimer copy, keep investor surnames out of the name and copy (done early: §12.7), and sanity-check the data-redistribution posture for EDGAR/MAP-derived figures.
2. **Storing anyone else's data server-side** → privacy policy and Australian Privacy Act basics.
3. **Charging money or launching publicly** → professional legal review: the Australian financial-services perimeter (general advice vs factual information under the Corporations Act), terms of use, and data-source licensing.
4. **Publishing extracted datasets** → licensing and provenance review: facts aren't copyrightable, but compilations and source terms of use are a real consideration.

This is a checklist of *when to get advice*, not the advice itself.

---

*The plan optimises for one thing above all: an app whose core promise (help me read financial statements like an owner) survives with zero dependencies on any service, including ours. Everything networked is an enhancement; nothing networked is a requirement.*
