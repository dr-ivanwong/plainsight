# Hedge fund gap plan: from personal instrument to fund-grade research and operations

**Date:** 2026-07-18
**Status:** draft gap analysis, awaiting owner review. Nothing in this document is resolved. The audience decision (main plan §2: a single-user personal tool) stands until a decision-log entry supersedes it, and this document is not part of the authority set (CLAUDE.md's plan table) unless the owner pins it. It maps the distance and proposes the order; it does not commit the build.

**Scope of the question it answers:** what must be built, bought, or reversed to take Plainsight from today's live product (one analyst, one library, annual statements, manual prices) towards the screens, models, and operating spine a hedge fund runs on. The frame is the six gaps agreed on 2026-07-18: data depth, coverage and screening, the portfolio domain, risk, compliance and records, and infrastructure posture, plus one cross-cutting prerequisite (identity and tenancy) that several of the six silently depend on.

## 1. The live baseline, and what each piece seeds

What exists today is not a toy; it is the research desk, single-seat. Each live feature below is the seed of a fund-grade capability, which is the argument for evolving this codebase rather than starting again.

| Live today (2026-07-18) | Fund-grade capability it seeds |
|---|---|
| calc-engine: pure, deterministic, integer-cents money, typed not-meaningful states, 100% branch coverage, ten-company golden corpus | The factor library. Funds pay for exactly this audit posture: every number reproducible by hand |
| Extraction pipeline: provider ladder, versioned prompts, field-level confidence, page-referenced provenance, validation gates, quarantine | Differentiated data sourcing where vendors are thin (ASX small caps, NZX, private companies), with lineage built in |
| EDGAR and ASX MAP ingestion with integer-equality mapping tests and the extract-once document cache | The canonical-data pipeline: the cache keyed by document is halfway to a point-in-time store |
| Thesis editor with append-only, server-protected version history | Research-note governance: authorship, immutability, review trails |
| Red-flag rules: deterministic, explainable, "items to investigate" framing | The screening predicate language, and the shape of risk-limit breaches |
| Sync protocol with per-user keys, idempotent replays, server as source of truth (decision §12.9) | Multi-seat server-side library; the hardest migration (authority moved off the device) already landed |
| Infra: CDK, invariant tests as CI blockers, OIDC-only credentials, PITR, budget alarms, deploy gated on e2e | The compliance-friendly change-control story, in miniature |

What is absent is absent by design, and the plans say so in their own words: the audience decision cascades into quotas, legal posture, cost ceilings, and the single-seat Cognito pool. This plan treats those as conscious decisions to reverse in order, not as omissions.

## 2. The six gaps

Each gap states what exists, what gets built, what gets bought, which pinned decisions flip, and what it depends on.

### Gap 1: data depth

The largest true build item, and the one that is a genuine evolution of what exists.

**Today.** Annual fiscal years only; the canonical line items and policies (data-model spec §3 to §5) assume one statement per (company, FY, statement). One snapshot of the truth: a restated figure overwrites the as-filed reading (the ASX merge rule is newest-document-wins). Prices are manual with an as-of date (decision §12.1). Ten companies of hand-verified fixtures.

**Build.**

- **Interim periods.** The period model gains periodicity: FY, half-year (ASX reports H1/FY), and quarterly (US 10-Q). The engine gains a period calculus: trailing-twelve-month derivation, seasonally honest YoY comparisons, and policies for stub periods and 52/53-week years extended to interims. New metric variants (LTM margins, LTM ROIC) join the dictionary as computed bases, not as new cards; the 12-card budget stands.
- **Point-in-time correctness.** Every statement reading becomes a version keyed by (entity, period, statement, filedAt), never overwritten. Two query modes: latest-restated (today's behaviour) and as-knowable-on(date). The document cache already stores per-filing readings with provenance; the change is to stop collapsing them at merge time and to make the engine's input selection date-aware. This single property is what makes screens backtestable and compliance questions answerable, and it cannot be retrofitted later without re-ingesting history, which is why it sits in the first stage.
- **Entity master.** A stable internal entity id (the UUID company id generalises), with symbology (ticker, exchange, ISIN or FIGI where licensed), listing status, and lineage for ticker changes, mergers, and delistings. Universe membership becomes a dated fact, so backtests are survivorship-honest.
- **Corporate actions and adjusted series.** Splits and consolidations, dividends, and adjusted share counts; per-share series carry an adjusted and an as-printed form. The printed-EPS checksum gate already in the pipeline becomes the cross-check that adjustment logic is right.
- **Licensed market data.** End-of-day prices, volumes, corporate actions, and FX first; intraday only if the mandate ever needs it. Built behind the quote-adapter interface that decision §12.1 explicitly reserved, so the first vendor is swappable. Licensing is a real workstream: internal-use display data, derived-data rights for storing computed factors, and redistribution restrictions all differ by vendor. Cost is tiered: EOD API vendors run tens to a few hundred dollars a month; institutional terminals and datafeeds run tens of thousands per seat or feed per year. Start at the EOD tier; upgrade when a use case, not a wish, demands it.

**Buy.** The market data itself, always. Possibly a symbology or corporate-actions reference feed rather than curating one by hand.

**Flips.** Decision §12.1 (manual price entry) reverses. The 25 RCU/WCU always-free DynamoDB ceiling (cdk spec §8) will not survive universe-scale ingestion; capacity mode gets revisited with real load numbers.

**Depends on.** Nothing upstream; everything downstream depends on it.

### Gap 2: coverage and screening

**Today.** A library of tens, computed on demand per company, on the client. The engine is isomorphic and pure, which means it already runs server-side unmodified; the golden corpus proves it in Lambda today.

**Build.**

- **Universe ingestion.** From on-demand tickers to the whole coverage universe (order of thousands of US and ASX listings), on the weekly-sweep skeleton that already exists, scaled and paced against real capacity rather than the free tier.
- **The factor store.** A batch fan-out computes the full MetricsReport per entity per period and stores the results server-side: metric values, trend series, and flag states as queryable rows. This is the factor table every quantitative process starts from, and it is the engine's existing output persisted, not new mathematics.
- **The screening layer.** Screens are declarative predicates over the factor store ("ROIC above 15% for five consecutive years, leverage falling, accruals flag quiet"). The red-flag rules generalise into this same predicate language, which keeps screens explainable the way flags are: every screen result can show its inputs, the same tap-to-source discipline the dashboard has.
- **Backtesting, once Gap 1 lands.** Run any screen as-of historical dates against point-in-time data and dated universe membership: no lookahead, no survivorship. This is where "the algo" honestly begins, and the house discipline extends to it: deterministic first, golden-file tested, hand-verifiable. Statistical or learned models, if they ever come, live in research pipelines and write their outputs into the factor store as provenanced data; the standing constraint that nothing in the client serving path calls a model survives unchanged.

**Buy.** Nothing structural; optionally a benchmark constituent history feed for universe definitions.

**Flips.** Nothing pinned; this is the most decision-compatible gap. The screening surface is a new screen, not more dashboard cards; the 12-card budget stands.

**Depends on.** Gap 1 for interims, point-in-time, and the entity master; identity work (§3) for anything shared.

### Gap 3: the portfolio domain

**Today.** Entirely absent, by design. A thesis attaches to a company, not to a position; the product has no concept of money at work.

**Buy, not build: the operating core.** Order and execution management (FIX connectivity, broker integration, allocations), fund administration (the official NAV, investor accounting), custody and prime-broker reporting. These are Enfusion and Eze-class purchases plus an external administrator. Building them is the classic way small funds destroy themselves; this plan does not propose it at any stage.

**Build: the read side.** What no vendor sells is your research joined to your book:

- **Positions store.** Daily position, transaction, and cash files from the administrator and broker land in S3, parse through the same gate-and-quarantine pattern the ingestion pipeline uses, and become internal positions with lots and cost basis for analytics. Shadow records only: the administrator remains the books of record, and this boundary is stated in code and copy.
- **Reconciliation.** A daily automated compare of internal positions and cash against the administrator's files, with breaks surfaced the way quarantined data is surfaced today: loudly, itemised, never silently absorbed.
- **Exposures and P&L.** Gross and net exposure by name, sector, and currency; realised and unrealised P&L; simple attribution (by position, by sector, by thesis).
- **The join that makes it Plainsight.** Every position links to its entity's dashboard, thesis, and flag state: "holdings whose red flags fired this quarter", "positions whose thesis has not been re-versioned in a year". This is the report a value-discipline PM actually wants and cannot buy.

**Flips.** The education-layer legal posture (main plan §15) is written for a public-facing personal tool; an internal professional tool keeps the items-to-investigate framing (it is good IC-memo discipline) but the never-buy/sell copy rule stops being a legal shield and becomes a style choice the moment the user is a licensed professional. Counsel reviews this boundary in Gap 5.

**Depends on.** Gap 1 for prices (P&L needs marks), the entity master (broker symbology maps to internal entities), and Gap 5's retention regime (trade-adjacent records have statutory lives).

### Gap 4: risk

**Today.** The flags are company-quality signals. Portfolio risk does not exist because portfolios do not exist.

**Build.** A separate risk engine with the same purity discipline as calc-engine: (positions, prices, factors) in, RiskReport out, deterministic, typed, hand-verifiable.

- **Concentration:** name, sector, and issuer weights against mandate limits.
- **Liquidity:** position size against average daily volume, days-to-liquidate at participation caps (needs Gap 1 volume data).
- **Drawdown:** portfolio and per-position series, peak-to-trough, once a daily NAV or shadow-NAV series exists (Gap 3).
- **Stress:** deterministic scenario shocks first (rates, FX, sector drawdowns, historical episodes replayed once point-in-time prices exist). No value-at-risk theatre for a concentrated fundamental book unless the mandate demands it; limits that map to how the fund actually loses money come first.
- **Breaches as flags.** Limit breaches surface exactly like red flags: what fired, the numbers, why it matters, what to check. One explanatory grammar across research and risk.

**Buy.** Nothing at first; a risk vendor becomes worth discussing only if derivatives or factor-model attribution enter the mandate.

**Depends on.** Gaps 1 and 3. This is deliberately the smallest gap: it is downstream plumbing plus discipline, not novel invention.

### Gap 5: compliance and records

**Today.** The plans' own words: the legal section is "a tripwire list (revisit before ever sharing a URL with anyone)". Sharing with one colleague fires it. Two live mechanisms actively oppose a records regime: deletes become 90-day tombstones that purge, and quarantined rows can be discarded; both are correct for a personal tool and wrong for regulated records.

**Build into the platform (systems support; counsel defines).**

- **Immutable audit trail.** Every write event streams to an append-only archive (DynamoDB streams into S3 with object lock, WORM-style). Retrofitting this is miserable, which is why the event log lands in the first stage even though the compliance program that reads it comes last.
- **Record classes and retention.** Research notes, thesis versions, screens run, data snapshots consulted, and (later) trade-adjacent records each get a class and a retention schedule (AU AFSL record-keeping runs to seven years; US equivalents similar). Retention overrides deletion: tombstone purging and hard deletes are disabled for regulated classes.
- **Restricted-list and MNPI support.** A restricted-entities store with an enforcement API: research on a restricted name locks distribution, and the eventual OMS consumes the same list pre-trade. MNPI tagging on notes with access consequences.
- **Threshold monitors.** Substantial-holder maths (5% in AU) and 13F-style aggregation computed deterministically off Gap 3 positions, alerting before filing deadlines, not after.
- **Personal-trading and attestation workflows.** Light system support (declarations, approvals, logs); mostly process.

**Buy and retain.** Counsel for structure and licensing (AFSL or authorised representative in AU, RIA if US investors appear), a compliance consultant for the manual and monitoring calendar, and eventually an off-the-shelf compliance platform if headcount grows.

**Flips.** The tripwire list retires in favour of a real compliance program. The export allowlist grows into firm data governance. Tombstone TTL semantics (backend spec §4) get a carve-out for regulated classes.

**Depends on.** Identity (§3) for attribution of every action to a person; Gap 3 for anything trade-adjacent.

### Gap 6: infrastructure posture

**Today.** Single account 679345828813 in ap-southeast-2, zero VPC, no CloudTrail trail, no GuardDuty, SSM SecureStrings over Secrets Manager, no standing staging. Every exclusion is recorded and priced in the ADRs and the cdk spec §8 not-list, for one user. The ADRs' own framing anticipated this document: priced and declined is not never.

**Build and reverse, in tranches.**

- **Tranche one (with the first shared seat):** AWS Organizations with separated accounts (prod, non-prod, security, log archive), an organisation CloudTrail, centralised logging with retention, GuardDuty and Security Hub, IAM Identity Center SSO with enforced MFA, and the return of a standing non-prod environment (ADR 0001 reverses; the rehearsal-stack pattern remains for infra changes).
- **Tranche two (with real data feeds and vendors):** Secrets Manager where rotation or cross-account access outgrows SSM SecureStrings (ADR 0003 reverses in part), VPC only where a dependency demands private connectivity such as vendor feeds or FIX sessions (ADR 0002 reverses narrowly, still not by default), vendor risk register, penetration test.
- **Tranche three (with outside money):** tested DR with declared RTO/RPO and game days, on-call with escalation, backup immutability evidence, endpoint and email security posture for the team, and a SOC 2-shaped control pack (policies, evidence, access reviews) sized for investor operational due diligence rather than a certificate for its own sake, until an allocator requires the certificate.

**Cost honesty.** Today's bill is single-digit dollars a month by design. Tranche one alone moves the floor to hundreds a month before any data licensing, and Stage C operations imply thousands, before headcount. This is the standing-obligation trade §12.9 made once already, an order of magnitude up; it should be accepted with the same eyes-open framing or not at all.

## 3. The cross-cutting prerequisite: identity, tenancy, and multi-writer truth

The six gaps quietly assume a seventh piece of work. Every audit trail needs a person behind an action; every shared library needs authorisation; and several single-user design decisions invert:

- **Seats.** The single-seat Cognito pool with an admin-created account becomes SSO-backed multi-seat with roles (analyst, PM, operations, compliance). The `SYNC#{userId}` key design already partitions by user, which helps; row-level authorisation and shared-versus-private records are new.
- **Multi-writer semantics.** Last-write-wins with Lamport clocks is correct for one human's devices and wrong for two analysts editing one note. Shared records move to server-arbitrated editing (the §12.9 direction taken to its conclusion), with the client's IndexedDB fully demoted to cache. The wire survives; the conflict philosophy does not.
- **Credentials.** BYOK keys that never leave the device invert for shared pipelines: firm-held credentials, centrally stored and rotated, per-user attribution of usage. The device-local BYOK path can remain for personal experimentation, but the canonical pipelines stop depending on it.

This work rides inside Stage A because nothing shared ships without it.

## 4. Staging

Three stages, each with exit criteria in the phase-table tradition. Order rationale: the research platform first because it is the differentiator and the lowest-regret spend; the portfolio read side second because it needs the data spine; regulated operations last because they are mostly external purchases, process, and counsel, and because they depend on a fund structure existing, which is an owner decision outside engineering.

| Stage | Contents | Exit criteria |
|---|---|---|
| **A: team research platform** | Gap 1 in full (interims, point-in-time, entity master, corporate actions, licensed EOD data); Gap 2 (universe, factor store, screens, backtests); §3 identity and tenancy; Gap 6 tranche one; Gap 5 foundations (event log to WORM archive, record classes, retention over deletion) | A screen runs across the full US and ASX universe as-of any date in the covered history with no lookahead and dated membership; a known restatement case reproduces both the as-filed and restated readings; two analysts work one shared library with authorship, roles, and a complete audit trail; the golden corpus extends to interim and point-in-time fixtures and stays at 100% branch coverage |
| **B: portfolio read side and risk** | Gap 3 read side (administrator and broker ingestion, reconciliation, exposures, P&L, the research join); Gap 4 risk engine; Gap 5 threshold monitors | Daily positions and cash reconcile to the administrator within tolerance with breaks surfaced same-day; the risk report is deterministic and every number traces to inputs by hand; the holdings-to-thesis-and-flags join answers "which holdings' flags fired this quarter" in one query |
| **C: regulated operations** | OMS/EMS and administrator selected and integrated (buy); compliance program operational (manual, restricted list enforced pre-trade in the OMS and research-side in the platform, attestations, filing calendar); Gap 6 tranches two and three | A mock operational due diligence pass by an external reviewer finds no critical gaps; a restricted name is provably blocked in both systems; retention and audit evidence produced on request for a sampled record; DR tested against declared RTO/RPO |

## 5. Buy versus build register

| Capability | Disposition | Rationale |
|---|---|---|
| Factor computation, screens, backtests | Build | The engine and its audit posture are the differentiator |
| Statement extraction for thin-vendor markets | Build (exists) | Nobody sells page-referenced provenance on ASX small caps |
| Market data, corporate actions, FX | Buy | Never build; licence at the cheapest tier the use case allows |
| Symbology and reference data | Buy, wrap | Curate lineage internally only where vendors are wrong |
| OMS/EMS, execution, allocations | Buy | Regulatory-grade connectivity is a product, not a feature |
| Fund administration and NAV | Buy | The administrator is the books of record; shadow, never replace |
| Portfolio read side, reconciliation, research join | Build | The join to theses and flags is unpurchasable |
| Risk engine (concentration, liquidity, drawdown, stress) | Build | Small, deterministic, mandate-shaped; vendors oversell here |
| Compliance program | Buy expertise, build support | Counsel and consultants define; the platform evidences |
| Security and audit infrastructure | Build (reverse ADRs) | Standard AWS organisation work, already patterned in CDK |

## 6. Decision impact register

Pinned decisions this trajectory touches, and their disposition. None of these flip until a §12 decision-log entry says so.

| Decision | Disposition under this plan |
|---|---|
| Main plan §2, single-user personal tool | Superseded at Stage A kickoff by a new charter entry; the cascade (quotas, legal posture, single-seat pool) unwinds with it |
| §12.1 manual price entry | Reversed in Gap 1 behind the reserved adapter interface |
| §12.7 no living investor's name | Stands, more important than ever |
| §12.8 item codes stay in documents | Stands |
| §12.9 backend as source of truth | Stands; it is the foundation this plan builds on |
| §12.10 and §12.11 rail decisions | Stand; UI conventions are unaffected |
| 12-card dashboard budget | Stands for the company view; screening and portfolio are new surfaces, not new cards |
| Never buy/sell copy rule (main plan §15) | Re-scoped by counsel in Gap 5: education framing stays as house style for research surfaces; portfolio surfaces speak plainly about positions |
| cdk §8 not-list and ADRs 0001 to 0004 | Reverse in Gap 6 tranches, each with its own dated ADR update, not silently |
| Backend spec §4 tombstone purge | Carve-out for regulated record classes in Gap 5 |
| calc-engine purity and coverage rules | Stand unamended; they extend to the risk engine |
| Nothing in the serving path calls a model | Stands at every stage; models write provenanced data offline |

## 7. What does not change

The credibility spine survives every stage, because it is the fund-grade property: deterministic engines, typed impossibility over silent NaN, every displayed number reproducible by hand from its detail surface, provenance to the page, append-only history for written judgement, invariant-tested infrastructure, and the calm one-accent design language with semantic colour reserved for meaning. A fund's edge in this style of investing is discipline made durable; the product's whole character is already that.

## 8. Open questions for the owner (these gate the stages)

1. **Structure and jurisdiction.** Is the destination an AFSL-holding AU fund, an authorised-representative arrangement, or something US-facing? Gap 5's shape and Stage C's calendar hang on this, and it is a counsel conversation before an engineering one.
2. **Seats.** How many analysts in Stage A? One collaborator and five imply the same architecture but different SSO, licensing, and review-workflow depth.
3. **Mandate.** Long-only concentrated value, or does anything (shorts, derivatives, leverage) enter? Gap 4's scope doubles the moment the answer is not "long-only".
4. **Data budget.** An annual licensing envelope for Stage A (EOD tier) versus Stage B ambitions (volumes, benchmarks, possibly a reference-data feed): a number here prunes vendor conversations early.
5. **The standing obligation.** §12.9 accepted a kept-deployed backend for one user at dollars a month. Stage A accepts hundreds a month plus licensing; Stage C accepts an operations function. Confirm the appetite before Stage A commits, because the reversal story shrinks at each stage.
6. **This document's status.** If the direction is real, the next artefact is a §12 decision entry superseding the audience decision and pinning Stage A's scope, at which point Stage A gets its own build plan with the same rigour as the existing phase plans.
