# Hedge fund gap plan: a fund of one, own book first

**Date:** 2026-07-18
**Status:** draft gap analysis, awaiting owner review. Owner steer recorded 2026-07-18: the operating model is a **single operator running his own capital to a hedge fund standard**, with outside capital as an explicit later fork, not the base case. Nothing here is otherwise resolved: the audience decision (main plan §2) stands until a decision-log entry supersedes it, and this document is not part of the authority set (CLAUDE.md's plan table) unless the owner pins it. It maps the distance and proposes the order; it does not commit the build.

**Scope of the question it answers:** what must be built, bought, or reversed to take Plainsight from today's live product (one analyst, one library, annual statements, manual prices) to the screens, models, and operating discipline of a professional fund, run by one person on his own money first. The frame is the six gaps agreed on 2026-07-18 (data depth, coverage and screening, the portfolio domain, risk, compliance and records, infrastructure posture), re-read through the single-operator lens, with the outside-money fork isolated so its cost is paid only if that door is opened.

## 1. The operating model, and why it changes less than headcount suggests

The variable that forks this plan is not team size; it is whose money is at work. Single-operator collapses the people-scaffolding, leaves the three largest builds untouched, and promotes one idea from aesthetic to structural:

- **What collapses.** Identity, tenancy, roles, review workflows, and multi-writer sync semantics: gone from the base case. The happiest finding in this exercise is that the live architecture is already correct for a fund of one. The single-seat Cognito pool stands. Last-write-wins with Lamport clocks stands, because its one assumption (one human's devices) holds. Sign-in, sync, and the server-side source of truth (decision §12.9) carry over unchanged.
- **What is untouched.** Gaps 1, 2, and 4 are headcount-indifferent: point-in-time data, the entity master, licensed prices, the factor store, screens, backtests, and the risk engine neither know nor care how many people read them. Screening matters more solo, not less: screens are how one person covers a universe that teams cover with analysts.
- **What intensifies.** For a team, the platform supports the control environment; for a single operator, **the platform is the control environment**. There is no analyst checking the PM, no ops desk checking the trade, no risk committee. The deterministic limits engine is the risk committee; the reconciliation report is the ops desk; thesis-before-position and flags-acknowledged-before-sizing are the investment committee. Plainsight's credibility spine (deterministic, hand-verifiable, pre-commitment by design) stops being a style and becomes the substitute for colleagues. Two practical consequences: the automation bar rises, because nobody babysits pipelines (alerts stay symptom-based and rare, as the plans already insist), and continuity risk becomes the dominant operational question even before any investor asks it.

## 2. The live baseline, and what each piece seeds

What exists today is the research desk, single-seat, which is now also the target operating model's shape. Each live feature seeds a fund-grade capability, which is the argument for evolving this codebase rather than starting again.

| Live today (2026-07-18) | Fund-grade capability it seeds |
|---|---|
| calc-engine: pure, deterministic, integer-cents money, typed not-meaningful states, 100% branch coverage, ten-company golden corpus | The factor library. The audit posture funds pay for: every number reproducible by hand |
| Extraction pipeline: provider ladder, versioned prompts, field-level confidence, page-referenced provenance, validation gates, quarantine | Differentiated data sourcing where vendors are thin (ASX small caps, NZX, private companies), with lineage built in |
| EDGAR and ASX MAP ingestion with integer-equality mapping tests and the extract-once document cache | The canonical-data pipeline: the cache keyed by document is halfway to a point-in-time store |
| Thesis editor with append-only, server-protected version history | The pre-commitment record: what was believed, when, unrevisable after the fact |
| Red-flag rules: deterministic, explainable, "items to investigate" framing | The screening predicate language, and the shape of risk-limit breaches |
| Single-seat Cognito, sync with per-user keys, server as source of truth (§12.9) | Stands as-is for a fund of one; no tenancy work in the base case |
| Infra: CDK, invariant tests as CI blockers, OIDC-only credentials, PITR, budget alarms, deploy gated on e2e | The change-control story, in miniature |

## 3. The six gaps, single-operator reading

### Gap 1: data depth (unchanged by the operating model; the largest build)

**Today.** Annual fiscal years only, one snapshot of the truth (restatements overwrite), manual prices with an as-of date (decision §12.1), ten companies of hand-verified fixtures.

**Build.**

- **Interim periods.** Periodicity joins the period model: FY, half-year (ASX), quarterly (US). The engine gains a period calculus: trailing-twelve-month derivation, seasonally honest comparisons, stub-period and 52/53-week policies extended to interims. LTM metric bases join the dictionary as computed forms, not new cards; the 12-card budget stands.
- **Point-in-time correctness.** Every statement reading becomes a version keyed by (entity, period, statement, filedAt), never overwritten; two query modes, latest-restated and as-knowable-on(date). The document cache already stores per-filing readings with provenance; the change is to stop collapsing them at merge time and make the engine's input selection date-aware. This property cannot be retrofitted without re-ingesting history, which is why it anchors Stage A.
- **Entity master.** Stable internal entity ids (the UUID survives), symbology (ticker, exchange, ISIN or FIGI where licensed), listing status, and lineage for ticker changes, mergers, and delistings. Universe membership becomes a dated fact, so backtests are survivorship-honest.
- **Corporate actions and adjusted series.** Splits, consolidations, dividends; adjusted share counts; per-share series in adjusted and as-printed forms, cross-checked by the printed-EPS gate already in the pipeline.
- **Licensed market data.** End-of-day prices, volumes, actions, and FX behind the quote-adapter interface decision §12.1 reserved. A genuine own-money advantage: several vendors and exchanges price non-professional or private-investor use far below professional tiers, and managing only your own money often qualifies; taking outside capital typically reclassifies the subscription as professional. Start at the cheap EOD tier; the fork raises the licensing bill before it raises anything else.

**Flips.** Decision §12.1 reverses. The always-free DynamoDB ceiling (cdk spec §8) will not survive universe-scale ingestion; capacity gets revisited with measured load.

### Gap 2: coverage and screening (unchanged; more valuable solo)

**Today.** A library of tens, computed per company on the client; the engine is isomorphic and already runs in Lambda.

**Build.** Universe ingestion on the weekly-sweep skeleton (order of thousands of US and ASX listings); a server-side factor store holding the full MetricsReport per entity per period; a declarative screening layer where screens are predicates over factors and trends ("ROIC above 15% for five consecutive years, leverage falling, accruals flag quiet"), sharing the red-flag rules' explanatory grammar and tap-to-source discipline; and, once Gap 1 lands, screen backtesting as-of historical dates with dated universe membership: no lookahead, no survivorship bias. This is where "the algo" honestly begins, and the house rules extend to it: deterministic first, golden-file tested, hand-verifiable. Statistical or learned models, if they ever come, run in offline research pipelines and write provenanced outputs into the factor store; the standing constraint that nothing in the client serving path calls a model survives every stage of this plan.

### Gap 3: the portfolio domain (re-based onto the broker)

**Today.** Absent by design; a thesis attaches to a company, not a position.

**Own-money base case.** The books of record are the **broker accounts**. No administrator, no independent NAV, no prime broker. What gets built is the read side against broker data:

- **Positions store.** Daily broker statements or API exports land in S3, parse through the same gate-and-quarantine pattern the ingestion pipeline uses, and become positions, lots, cash, and transactions.
- **Reconciliation.** A daily automated compare of internal positions and cash against the broker's records, breaks surfaced the way quarantined data is surfaced today: loudly, itemised, never silently absorbed. The ops desk of one, automated.
- **Exposures and P&L.** Gross and net by name, sector, and currency; realised and unrealised P&L; attribution by position, sector, and thesis; a daily shadow-NAV series marked from licensed EOD data (this series also feeds Gap 4 drawdown).
- **Tax parcels.** An own-money feature funds outsource to administrators: CGT parcel tracking with acquisition dates (the twelve-month discount boundary in AU) and parcel-selection records. Record keeping, not advice; the accountant stays the authority.
- **The join that makes it Plainsight.** Every position links to its entity's dashboard, thesis, and flag state: "holdings whose red flags fired this quarter", "positions whose thesis has not been re-versioned in a year". For a fund of one this join is the investment committee memo.

**The fork.** Outside money adds, unavoidably: an external administrator as books of record (the internal store demotes to shadow), independent NAV, and prime-broker or custody reporting. OMS/EMS remains buy-not-build at any scale and enters only with the fork; a single operator trading his own book through a broker's own tools needs none of it.

### Gap 4: risk (unchanged in content; promoted in role)

A separate risk engine with calc-engine's discipline: (positions, prices, factors) in, RiskReport out, deterministic, typed, hand-verifiable. Concentration against self-declared mandate limits; liquidity as position size against average daily volume with days-to-liquidate at a participation cap; drawdown off the Gap 3 shadow-NAV series; deterministic stress scenarios first (rates, FX, sector shocks, replayed historical episodes once point-in-time prices exist). No value-at-risk theatre for a concentrated fundamental book. Breaches surface exactly like red flags: what fired, the numbers, why it matters, what to check.

The single-operator promotion: these limits are self-imposed, so the system enforces what a committee would. Limits are declared in advance (versioned like theses, changes logged with reasons), and the report is generated daily whether or not it is read, because a control that runs only when convenient is not a control.

### Gap 5: compliance and records (the gap the fork transforms)

**Own-money base case: small, but not empty.**

- **Substantial-holder obligations survive.** The 5% threshold on AU listed companies binds persons, not just funds, and a concentrated small-cap style can cross it. The threshold monitor stays in the base case, computed off Gap 3 positions, alerting before deadlines.
- **Insider-trading law binds everyone.** MNPI discipline is personal-legal hygiene: a simple tag on research notes and a personal rule set, no machinery.
- **Records for tax and for the future track record.** Broker statements, parcel records, and the append-only research history, retained indefinitely. Cheap insurance with a compounding payoff: a verifiable own-money track record, marked from licensed data with immutable timestamps, is the single most valuable asset if the fork is ever taken.
- **The event-log insurance.** One deliberately early build from the fork's world: every platform write streams to an append-only S3 archive from Stage A onward. It costs almost nothing at this scale, cannot be backfilled later, and converts the fork from a rebuild into a switch-flip. Retention formality (WORM object lock, record classes, the tombstone-purge carve-out in backend spec §4) is configured at the fork, on top of a log that already exists.

**The fork: the outside-money tripwire.** Echoing the plans' own tripwire language: none of the following is needed until the first external dollar, and all of it before: a licensing path (in AU, realistically a corporate authorised representative arrangement before any thought of a standalone AFSL), an engaged administrator, the retention regime switched from insurance to obligation, a compliance manual and calendar, and an operational due diligence pack sized for a fund of one (a known genre: allocators to emerging managers expect exactly this shape, with continuity risk as their first question). Counsel defines all of it; the platform's job is to have made the evidence trivial to produce.

### Gap 6: infrastructure posture (lighter tranches, same direction)

**Own-money base case.** The not-list exclusions were priced for one user, and a fund of one keeps most of that pricing. The base-case hardening is modest and mostly about protecting the research asset and the future track record: an organisation trail and centralised log archive with retention, GuardDuty, MFA on everything, tested restore of the DynamoDB table and the event archive (the DR that matters is "my research and records survive me being careless"), and runbooks good enough that future-you is the on-call. A separated log-archive account is worth it; a full multi-account organisation can wait for the fork. Cost floor moves from single digits to tens of dollars a month; the real Stage A bill is data licensing, not infrastructure.

**At the fork.** The remaining reversals land with their own dated ADR updates: multi-account organisation, Security Hub, Secrets Manager where rotation outgrows SSM SecureStrings, VPC only where a vendor feed demands private connectivity, penetration test, vendor risk register, and the SOC 2-shaped evidence pack, sized for investor diligence rather than a certificate until an allocator requires one. Continuity planning becomes formal: administrator standing instructions and what happens to the book if the operator is unreachable.

## 4. What dissolved: identity, tenancy, and multi-writer truth

The team plan's cross-cutting prerequisite is recorded here as deliberately absent from the base case, so its absence reads as a decision and not an oversight. The single-seat pool, the one-human sync semantics, and device-bound BYOK all stand. What would revive it, in order of likelihood: a collaborator (even one part-time analyst reintroduces multi-writer semantics and roles), outside money (auditors and ODD reviewers want attributed access even to a fund of one, which SSO and roles answer cheaply), or sale/succession of the platform itself. The revival cost is unchanged from the team plan and is not paid now.

## 5. Staging

| Stage | Contents | Exit criteria |
|---|---|---|
| **A: the research spine** | Gap 1 in full (interims, point-in-time, entity master, corporate actions, licensed EOD data at the non-professional tier); Gap 2 (universe, factor store, screens, backtests); Gap 6 base-case hardening; the Gap 5 event-log insurance | A screen runs across the full US and ASX universe as-of any date in the covered history with no lookahead and dated membership; a known restatement case reproduces both the as-filed and restated readings; the golden corpus extends to interim and point-in-time fixtures at 100% branch coverage; every platform write since Stage A start is in the append-only archive |
| **B: the book, read properly** | Gap 3 base case (broker ingestion, reconciliation, lots and parcels, exposures, P&L, shadow-NAV series, the research join); Gap 4 risk engine with declared limits; Gap 5 base case (substantial-holder monitor, MNPI tagging, retention habits) | Daily positions and cash reconcile to the broker with breaks surfaced same-day; the risk report generates daily, deterministically, every number traceable by hand; declared limits are versioned and their changes logged; "which holdings' flags fired this quarter" is one query; the shadow-NAV series is continuous and marked from licensed data |
| **C: the outside-money fork (optional, gated)** | The tripwire list in Gap 5 (licensing path, administrator, retention formalised, compliance program, ODD pack); Gap 3 fork items (administrator as books of record, OMS/EMS bought); Gap 6 fork tranche; §4 revival only if a collaborator also arrives | Crossed only if capital is accepted: a mock ODD pass by an external reviewer; a restricted name provably blocked; retention evidence produced on request; the administrator reconciliation replaces the broker as the authority the shadow tracks |

Order rationale: Stage A is the differentiator and the lowest-regret spend, and its two unretrofittable properties (point-in-time data, the event log) are exactly the things that must start early. Stage B turns the platform into the control environment. Stage C is a door, not a destination: everything before it is worth having even if it never opens.

## 6. Buy versus build register

| Capability | Disposition | Rationale |
|---|---|---|
| Factor computation, screens, backtests | Build | The engine and its audit posture are the differentiator |
| Statement extraction for thin-vendor markets | Build (exists) | Nobody sells page-referenced provenance on ASX small caps |
| Market data, corporate actions, FX | Buy | Never build; non-professional tier while own-money qualifies |
| Symbology and reference data | Buy, wrap | Curate lineage internally only where vendors are wrong |
| Broker data ingestion, reconciliation, parcels | Build | The ops desk of one; the gate-and-quarantine pattern reused |
| Risk engine (concentration, liquidity, drawdown, stress) | Build | Small, deterministic, mandate-shaped; it is the risk committee |
| OMS/EMS, execution, allocations | Buy, fork only | A single operator on his own book needs none of it; a fund buys it |
| Fund administration and NAV | Buy, fork only | The administrator is the books of record the moment money is outside |
| Compliance program | Buy expertise, fork only | Counsel and consultants define; the platform evidences |
| Security and audit infrastructure | Build, tranched | Base-case hardening now; ADR reversals at the fork, each dated |

## 7. Decision impact register

| Decision | Disposition under this plan |
|---|---|
| Main plan §2, single-user personal tool | Half stands, half supersedes: **single-user survives as the operating model**; "personal tool" grows into "personal fund instrument" at Stage A kickoff via a new charter entry. The cascade unwinds selectively: quotas and the single-seat pool stay, the legal tripwire is replaced by Gap 5's base case |
| §12.1 manual price entry | Reversed in Gap 1 behind the reserved adapter interface |
| §12.7 no living investor's name | Stands |
| §12.8 item codes stay in documents | Stands |
| §12.9 backend as source of truth | Stands; it is the foundation this plan builds on |
| §12.10 and §12.11 rail decisions | Stand |
| 12-card dashboard budget | Stands for the company view; screening, portfolio, and risk are new surfaces, not new cards |
| Never buy/sell copy rule (main plan §15) | Stands for research surfaces as house style; portfolio and risk surfaces speak plainly about positions, sizes, and limits, because they describe the owner's own decisions rather than advising anyone |
| cdk §8 not-list and ADRs 0001 to 0004 | Base-case hardening touches logging and monitoring now; the structural reversals (multi-account, Secrets Manager, VPC) wait for the fork, each with its own dated ADR update |
| Backend spec §4 tombstone purge | Unchanged in the base case; carve-out configured at the fork on top of the Stage A event log |
| calc-engine purity and coverage rules | Stand unamended; they extend to the risk engine |
| Nothing in the serving path calls a model | Stands at every stage; models write provenanced data offline |

## 8. What does not change

The credibility spine survives every stage because, for a fund of one, it is the control environment: deterministic engines, typed impossibility over silent NaN, every displayed number reproducible by hand, provenance to the page, append-only history for written judgement, limits declared before they are needed, invariant-tested infrastructure, and the calm one-accent design language with semantic colour reserved for meaning. Discipline made durable was the product's character as an instrument; it is the whole point of the fund of one.

## 9. Open questions for the owner (these gate the stages)

1. **Mandate, self-declared.** Long-only concentrated value, or do shorts, leverage, or derivatives ever enter? Gap 4's limits and Gap 3's broker ingestion both take their shape from this, and writing it down is itself a Stage B artefact (the limits document is versioned like a thesis).
2. **Data budget.** An annual licensing envelope for Stage A at the non-professional tier, and a view on which vendor class (EOD API versus reference-data feed) to start with. A number prunes vendor conversations early.
3. **Broker surface.** Which broker accounts and export mechanisms (statements versus API) constitute the books of record for Stage B; this decides the first ingestion adapter.
4. **The standing obligation.** Stage A moves the floor from dollars to tens of dollars a month plus licensing; Stage B adds daily pipelines that expect to run unattended. Confirm the appetite before Stage A commits.
5. **Fork criteria, in advance.** What would make outside money worth it, and from whom? Writing the tripwire's trigger down now (like every other pre-commitment in this product) prevents the fork being crossed casually later.
6. **Continuity, even own-money.** What should happen to the book, the research, and the platform if the operator is unreachable for a month? A one-page answer now; formal machinery only at the fork.
7. **This document's status.** If the direction is real, the next artefact is a §12 decision entry recording the fund-of-one charter and pinning Stage A's scope, at which point Stage A gets its own build plan with the same rigour as the existing phase plans.
