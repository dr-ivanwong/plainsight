# Hedge fund gap plan: a fund of one, own book first, ASX first

**Date:** 2026-07-18
**Status:** draft gap analysis, awaiting owner review. Owner steers recorded 2026-07-18, in order: the operating model is a **single operator**; the capital is **his own, with outside money as an explicit later fork**; the universe is **ASX only to start**, with other markets as a scoped later expansion. Nothing here is otherwise resolved: the audience decision (main plan §2) stands until a decision-log entry supersedes it, and this document is not part of the authority set (CLAUDE.md's plan table) unless the owner pins it. It maps the distance and proposes the order; it does not commit the build.

**Scope of the question it answers:** what must be built, bought, or reversed to take Plainsight from today's live product (one analyst, one library, annual statements, manual prices) to the screens, models, and operating discipline of a professional fund, run by one person, on his own money, over the ASX. The frame is the six gaps agreed on 2026-07-18 (data depth, coverage and screening, the portfolio domain, risk, compliance and records, infrastructure posture), read through the single-operator and single-market lens, with the outside-money fork isolated so its cost is paid only if that door is opened.

## 1. The operating model and the universe

**Single operator.** The variable that forks this plan is not team size; it is whose money is at work. Single-operator collapses the people-scaffolding (identity, tenancy, roles, review workflows, multi-writer sync: all absent from the base case, recorded as a decision in §4), leaves the three largest builds untouched, and promotes one idea from aesthetic to structural: for a team, the platform supports the control environment; for a fund of one, **the platform is the control environment**. The deterministic limits engine is the risk committee; the reconciliation report is the ops desk; thesis-before-position and flags-acknowledged-before-sizing are the investment committee. Two practical consequences: the automation bar rises, because nobody babysits pipelines, and continuity risk becomes the dominant operational question before any investor exists to ask it.

**ASX first.** Not a compromise; the natural scope. It is the home market, home currency, and home tax regime, and it is where the codebase's differentiated asset already lives: the extraction pipeline is the only audit-grade, page-referenced fundamental source for the thin-vendor end of the ASX. What the scope buys and costs:

- **Buys:** a universe of roughly two thousand listings rather than ten thousand; half-yearly periodicity instead of quarterly machinery; one exchange's symbology and corporate-events feed; single-exchange EOD licensing at the cheap tier; a handful of FX pairs instead of fifty; franking-aware records that a global plan would never bother with. It also dodges the hardest engineering in the data gap: point-in-time reconstruction of US as-filed history. The ASX side is point-in-time by construction, because every extracted reading is already keyed to a dated document.
- **Costs:** opportunity set. Two thousand listings filter to a few hundred investable names under liquidity and quality screens, with a heavy financials-and-materials skew. The screens work identically; the funnel is narrower. That is a mandate judgement, not an engineering one.
- **Makes critical:** extraction at scale. The pipeline stops being the exotic sidecar and becomes the primary fundamental source for the whole universe. This moves the pending provider bake-off onto Stage A's critical path (§5).

**Kept warm, out of scope.** The EDGAR path is built, free, and costs nothing to keep. ASX-only scopes the *universe* (factors, screens, backtests); US companies remain addable by hand to the library exactly as today, and the US golden five remain the corpus's cross-check. Universe expansion to other markets is a later, separately scoped decision.

## 2. The live baseline, and what each piece seeds

| Live today (2026-07-18) | Fund-grade capability it seeds |
|---|---|
| calc-engine: pure, deterministic, integer-cents money, typed not-meaningful states, 100% branch coverage, ten-company golden corpus | The factor library. The audit posture funds pay for: every number reproducible by hand |
| Extraction pipeline: provider ladder, versioned prompts, field-level confidence, page-referenced provenance, validation gates, quarantine, extract-once document cache | **The primary fundamental source for the ASX universe**, with lineage built in; the per-document cache is point-in-time by construction |
| ASX MAP client with etiquette, statutory-report resolution, three-report backfill (six fiscal years per company) | The universe backfill mechanism already exists in miniature |
| EDGAR ingestion with integer-equality mapping tests | Kept warm for on-demand library adds; the corpus cross-check |
| Thesis editor with append-only, server-protected version history | The pre-commitment record: what was believed, when, unrevisable after the fact |
| Red-flag rules: deterministic, explainable, "items to investigate" framing | The screening predicate language, and the shape of risk-limit breaches |
| Single-seat Cognito, sync with per-user keys, server as source of truth (§12.9) | Stands as-is for a fund of one; no tenancy work in the base case |
| Infra: CDK, invariant tests as CI blockers, OIDC-only credentials, PITR, budget alarms, deploy gated on e2e | The change-control story, in miniature |

## 3. The six gaps, ASX-first reading

### Gap 1: data depth (the largest build; simpler on one exchange)

**Today.** Annual fiscal years only, one snapshot of the truth (restatements overwrite; the ASX merge rule is newest-document-wins), manual prices (decision §12.1), ten companies of fixtures.

**Build.**

- **Interim periods, half-yearly.** ASX reports half-years and full years (Appendix 4D and 4E plus the statutory reports the pipeline already reads). The period model gains H1/FY periodicity and the engine gains a period calculus: trailing-twelve-month bases from two half-years, seasonally honest comparisons, stub and 52/53-week policies extended to interims. Quarterly cash reports (4C and 5B, the resources and early-stage corner) are an optional later layer, in only if the mandate wants that corner. US 10-Q machinery is not built in the base case. LTM metric bases join the dictionary as computed forms, not new cards; the 12-card budget stands.
- **Point-in-time correctness, mostly by unlocking what exists.** Every extracted reading is already tied to a dated document in the extract-once cache; the build is to stop collapsing readings at merge time, version statements by (entity, period, statement, filedAt), and make the engine's input selection date-aware, with two query modes: latest-restated and as-knowable-on(date). This cannot be backfilled if discarded, which is why it anchors Stage A. Point-in-time for non-ASX markets is deferred with the universe expansion.
- **Entity master, one exchange.** Stable internal entity ids, ASX code history, listing status, and lineage for renames, mergers, and delistings, sourced from the MAP announcements feed the client already speaks. Universe membership becomes a dated fact, so backtests are survivorship-honest. ISIN/FIGI joins only when a licensed feed makes it free.
- **Corporate actions, franking included.** Splits and consolidations (common at the small end), dividends with **franking percentage** on every record, because after-tax return is the own-money number that matters in this jurisdiction; adjusted share counts and per-share series cross-checked by the printed-EPS gate already in the pipeline.
- **Licensed market data, single exchange.** EOD prices, volumes, and actions for the ASX at a non-professional tier while own-money qualifies, behind the quote-adapter interface decision §12.1 reserved. FX shrinks to a handful of pairs (a meaningful minority of ASX companies report in USD, some in NZD or EUR; presentation currency stays explicit as the engine already requires).

**Extraction at scale: the named critical path.** Backfilling the universe is roughly six thousand documents (the existing resolver's three-reports-per-company design yields six fiscal years), then roughly four thousand documents a year ongoing. Three design points follow:

1. **Cost is gated by the bake-off.** The cheap-first ladder's per-document cost decides whether the backfill is hundreds or thousands of dollars. The Phase 2.5 bake-off (runbook; awaiting the owner's provider keys) is therefore a Stage A gating dependency, not a background chore.
2. **Reporting season is a throughput problem.** Most of the universe reports in a few weeks of August and February. The sweep and the extraction budget must clear a season's documents inside the season, which ten companies never tested.
3. **Quarantine review becomes a queue.** A five per cent gate-failure rate across two thousand companies is on the order of a hundred documents per season needing the operator's eyes. The review surface and its pacing are part of the build, not an afterthought.

**Flips.** Decision §12.1 reverses. The always-free DynamoDB ceiling (cdk spec §8) is revisited against measured universe load, which on ASX-only numbers may yet fit far longer than the team plan assumed.

### Gap 2: coverage and screening (small universe, same rigour)

**Build.** Universe ingestion across all ASX listings on the weekly-sweep skeleton; a server-side factor store holding the full MetricsReport per entity per period (at ASX scale this is a small table by any standard); a declarative screening layer where screens are predicates over factors and trends ("ROIC above 15% for five consecutive years, leverage falling, accruals flag quiet"), sharing the red-flag rules' explanatory grammar and tap-to-source discipline; and, once point-in-time lands, screen backtests as-of historical dates with dated membership: no lookahead, no survivorship bias. One ASX-specific design note: with financials and materials dominating the index, screens should support sector-relative forms alongside absolute thresholds, or the same three sectors will fill every result. The standing constraint survives every stage: statistical or learned models, if they ever come, run offline and write provenanced outputs into the factor store; nothing in the client serving path calls a model.

### Gap 3: the portfolio domain (broker as books of record, CHESS as anchor)

**Own-money base case.** The books of record are the broker accounts; for ASX holdings, CHESS holding statements are the natural reconciliation anchor. Build the read side:

- **Positions store.** Daily broker statements or API exports land in S3, parse through the gate-and-quarantine pattern the ingestion pipeline uses, and become positions, lots, cash, and transactions.
- **Reconciliation.** Daily automated compare of internal positions and cash against the broker (and holdings against CHESS statements), breaks surfaced loudly and itemised. The ops desk of one, automated.
- **Exposures and P&L.** Gross and net by name and sector; realised and unrealised P&L; attribution by position, sector, and thesis; a daily shadow-NAV series marked from licensed EOD data, feeding Gap 4 drawdown.
- **Tax parcels, franking-aware.** CGT parcel tracking with acquisition dates (the twelve-month discount boundary), parcel-selection records, and franking credits carried on dividend records into an after-tax P&L view. Record keeping, not advice; the accountant stays the authority.
- **The join.** Every position links to its entity's dashboard, thesis, and flag state: "holdings whose flags fired this half", "positions whose thesis has not been re-versioned in a year". The investment committee memo, generated.

**The fork.** Outside money adds an external administrator as books of record (the internal store demotes to shadow), independent NAV, custody or prime-broker reporting, and bought OMS/EMS. None of it exists in the base case.

### Gap 4: risk (liquidity is the binding limit on this exchange)

A separate risk engine with calc-engine's discipline: (positions, prices, factors) in, RiskReport out, deterministic, typed, hand-verifiable. On an ASX-only concentrated book the limit that binds first is **liquidity**: position size against average daily volume, days-to-liquidate at a participation cap, computed from the Gap 1 volume feed and watched more closely than any other number. Then concentration (name, sector, and issuer weights against self-declared mandate limits, with the sector limits doing real work against the index's financials-and-materials skew), drawdown off the shadow-NAV series, and deterministic stress scenarios (rates, FX, sector shocks, replayed historical episodes once point-in-time prices exist). No value-at-risk theatre. Breaches surface exactly like red flags: what fired, the numbers, why it matters, what to check. Limits are declared in advance, versioned like theses with changes logged, and the report generates daily whether or not it is read, because a control that runs only when convenient is not a control.

### Gap 5: compliance and records (single jurisdiction; one monitor promoted)

**Own-money base case.**

- **The substantial-holder monitor, promoted.** The 5% threshold on AU listed companies binds persons, and on ASX small caps it is reachable: five per cent of a twenty-million-dollar microcap is a position a serious own-money book actually takes. The monitor computes daily off Gap 3 positions and alerts before deadlines. This is now a Stage B deliverable, not a fork item.
- **Insider-trading law binds everyone.** MNPI discipline as personal-legal hygiene: a tag on research notes and a personal rule set, no machinery.
- **Records for tax and the future track record.** Broker and CHESS statements, parcel and franking records, and the append-only research history, retained indefinitely. A verifiable own-money track record, marked from licensed data with immutable timestamps, is the most valuable asset if the fork is ever taken.
- **The event-log insurance.** Every platform write streams to an append-only S3 archive from Stage A onward: nearly free at this scale, impossible to backfill, and it converts the fork from a rebuild into a switch-flip. Retention formality (object lock, record classes, the tombstone-purge carve-out in backend spec §4) is configured at the fork on top of a log that already exists.

**The fork: the outside-money tripwire.** Nothing below is needed until the first external dollar, and all of it before: a licensing path (in AU, realistically a corporate authorised representative arrangement before any thought of a standalone AFSL), an engaged administrator, retention formalised, a compliance manual and calendar, and an operational due diligence pack sized for a fund of one, with continuity risk as its first chapter. Counsel defines; the platform's job is to have made the evidence trivial to produce. Single-jurisdiction scope means no US-facing obligations enter at any stage of this plan.

### Gap 6: infrastructure posture (lighter still)

**Own-money base case.** Modest hardening aimed at protecting the research asset and the future track record: an organisation trail and centralised log archive with retention, GuardDuty, MFA on everything, tested restore of the DynamoDB table and the event archive, and runbooks good enough that future-you is the on-call. A separated log-archive account is worth it now; the full multi-account organisation waits for the fork. The cost floor moves from single digits to tens of dollars a month; at ASX-only scale the real Stage A bill is extraction spend and data licensing, not infrastructure.

**At the fork.** The remaining reversals land with their own dated ADR updates: multi-account organisation, Security Hub, Secrets Manager where rotation outgrows SSM SecureStrings, VPC only where a vendor feed demands it, penetration test, vendor risk register, the SOC 2-shaped evidence pack, and formal continuity machinery.

## 4. What dissolved: identity, tenancy, and multi-writer truth

Recorded as deliberately absent so the absence reads as a decision. The single-seat pool, the one-human sync semantics, and device-bound BYOK all stand; the live architecture is already correct for a fund of one. What would revive the work, in order of likelihood: a collaborator (even one part-time analyst reintroduces multi-writer semantics and roles), outside money (attributed access answers diligence cheaply), or succession of the platform itself. The revival cost is unchanged from the team-shaped draft of this document and is not paid now.

## 5. Staging

| Stage | Contents | Exit criteria |
|---|---|---|
| **A: the research spine, ASX-wide** | Gap 1 (half-yearly periodicity, point-in-time versioning, entity master, corporate actions with franking, licensed single-exchange EOD data); **the bake-off run and the ladder pinned (gating dependency, owner keys required)**; universe backfill through the extraction pipeline; Gap 2 (factor store, screens, backtests); Gap 6 base-case hardening; the Gap 5 event log | A screen runs across the full ASX universe as-of any date in the covered history with no lookahead and dated membership; a known restatement case reproduces both readings; a reporting-season load test clears a season's documents inside the season's window with the quarantine queue worked to zero; the golden corpus extends to half-year and point-in-time fixtures at 100% branch coverage; every platform write since Stage A start is in the append-only archive |
| **B: the book, read properly** | Gap 3 base case (broker and CHESS ingestion, reconciliation, franking-aware parcels, exposures, P&L, shadow-NAV, the research join); Gap 4 risk engine with declared limits, liquidity first; Gap 5 base case (substantial-holder monitor live, MNPI tagging, retention habits) | Daily positions and cash reconcile to the broker with breaks surfaced same-day; the risk report generates daily, deterministically, every number traceable by hand; declared limits are versioned and changes logged; the substantial-holder monitor alerts ahead of deadlines on test scenarios; "which holdings' flags fired this half" is one query; the shadow-NAV series is continuous and marked from licensed data |
| **C: the outside-money fork (optional, gated)** | The tripwire in Gap 5 (licensing path, administrator, retention formalised, compliance program, ODD pack); Gap 3 fork items (administrator as books of record, OMS/EMS bought); Gap 6 fork tranche; §4 revival only if a collaborator also arrives | Crossed only if capital is accepted: a mock ODD pass by an external reviewer; a restricted name provably blocked; retention evidence produced on request; the administrator reconciliation replaces the broker as the authority the shadow tracks |

Order rationale: Stage A is the differentiator and the lowest-regret spend, and its unretrofittable properties (point-in-time versioning, the event log) plus its gating dependency (the bake-off) all argue for starting it first. Stage B turns the platform into the control environment. Stage C is a door, not a destination: everything before it is worth having even if it never opens. Universe expansion beyond the ASX is a separate later decision with its own scoping, and nothing in Stages A or B forecloses it.

## 6. Buy versus build register

| Capability | Disposition | Rationale |
|---|---|---|
| Factor computation, screens, backtests | Build | The engine and its audit posture are the differentiator |
| ASX fundamental data | Build (extraction, exists; scale it) | The only audit-grade, page-referenced source for the thin-vendor end of the ASX; vendor alternatives are institutional-priced and not point-in-time |
| Market data, corporate actions, FX | Buy | Single-exchange EOD at the non-professional tier while own-money qualifies |
| Symbology and reference data | Buy, wrap | MAP announcements already carry the corporate events; licensed identifiers only when free with the data feed |
| Broker and CHESS ingestion, reconciliation, parcels | Build | The ops desk of one; the gate-and-quarantine pattern reused |
| Risk engine (liquidity, concentration, drawdown, stress) | Build | Small, deterministic, mandate-shaped; it is the risk committee |
| OMS/EMS, execution, allocations | Buy, fork only | A single operator on his own book through a broker needs none of it |
| Fund administration and NAV | Buy, fork only | The administrator is the books of record the moment money is outside |
| Compliance program | Buy expertise, fork only | Counsel defines; the platform evidences |
| Security and audit infrastructure | Build, tranched | Base-case hardening now; ADR reversals at the fork, each dated |

## 7. Decision impact register

| Decision | Disposition under this plan |
|---|---|
| Main plan §2, single-user personal tool | Half stands, half supersedes: **single-user survives as the operating model**; "personal tool" grows into "personal fund instrument" at Stage A kickoff via a new charter entry. Quotas and the single-seat pool stay; the legal tripwire is replaced by Gap 5's base case |
| §12.1 manual price entry | Reversed in Gap 1 behind the reserved adapter interface, single exchange first |
| §12.7 no living investor's name | Stands |
| §12.8 item codes stay in documents | Stands |
| §12.9 backend as source of truth | Stands; it is the foundation this plan builds on |
| §12.10 and §12.11 rail decisions | Stand |
| Phase 2.5 two-market ingestion and `.AX` routing | Stands; the US path is kept warm for on-demand library adds and the corpus cross-check, outside the universe scope |
| 12-card dashboard budget | Stands for the company view; screening, portfolio, and risk are new surfaces, not new cards |
| Never buy/sell copy rule (main plan §15) | Stands for research surfaces as house style; portfolio and risk surfaces speak plainly about positions, sizes, and limits, describing the owner's own decisions rather than advising anyone |
| cdk §8 not-list and ADRs 0001 to 0004 | Base-case hardening touches logging and monitoring now; structural reversals wait for the fork, each with its own dated ADR update |
| Backend spec §4 tombstone purge | Unchanged in the base case; carve-out configured at the fork on top of the Stage A event log |
| calc-engine purity and coverage rules | Stand unamended; they extend to the risk engine |
| Nothing in the serving path calls a model | Stands at every stage; models write provenanced data offline |

## 8. What does not change

The credibility spine survives every stage because, for a fund of one, it is the control environment: deterministic engines, typed impossibility over silent NaN, every displayed number reproducible by hand, provenance to the page, append-only history for written judgement, limits declared before they are needed, invariant-tested infrastructure, and the calm one-accent design language with semantic colour reserved for meaning. Discipline made durable was the product's character as an instrument; it is the whole point of the fund of one.

## 9. Open questions for the owner (these gate the stages)

1. **Universe definition inside the ASX.** All listings, or filtered at ingestion (a liquidity floor, an ex-resources carve, externally managed vehicles out)? Ingest-everything-screen-later maximises backtest honesty; filtering cuts extraction spend. A stance here sizes the backfill.
2. **The quarterly corner.** Are 4C/5B quarterly reporters (resources, early-stage) inside the mandate? If out, the interim build is half-years only and the extraction volume drops.
3. **The bake-off.** Stage A's gating dependency and an outstanding owner action already on CLAUDE.md's list: the four provider keys, then the ladder pinning. Per-document cost from the bake-off sizes the universe backfill in dollars.
4. **Mandate, self-declared.** Long-only concentrated value, or do shorts, leverage, or derivatives ever enter? Gap 4's limits document is a Stage B artefact, versioned like a thesis.
5. **Data budget.** An annual envelope for single-exchange EOD licensing at the non-professional tier plus extraction spend; a number prunes vendor conversations early.
6. **Broker surface.** Which broker (and whether CHESS statements or API exports are the reconciliation source) constitutes the books of record for Stage B; this decides the first ingestion adapter.
7. **The standing obligation.** Stage A moves the floor to tens of dollars a month plus licensing and seasonal extraction spend; Stage B adds daily pipelines that expect to run unattended. Confirm the appetite before Stage A commits.
8. **Fork criteria, in advance.** What would make outside money worth it, and from whom? Writing the trigger down now prevents the fork being crossed casually later.
9. **Continuity, even own-money.** What should happen to the book, the research, and the platform if the operator is unreachable for a month? A one-page answer now; formal machinery only at the fork.
10. **This document's status.** If the direction is real, the next artefact is a §12 decision entry recording the fund-of-one, ASX-first charter and pinning Stage A's scope, at which point Stage A gets its own build plan with the same rigour as the existing phase plans.
