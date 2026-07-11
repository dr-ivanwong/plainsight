# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

**Plainsight**, a value-investing financial statement analyser: a **single-user, local-first PWA** that computes 12 dashboard metrics from a pinned 14-metric dictionary (margins, ROE/ROIC, leverage, FCF, valuation) from entered or imported financial statements, with deterministic red-flag rules and a structured thesis editor. (Recorded decision, plan §12.7: the name, all repo copy, and the in-app education layer avoid naming any living investor; keep it that way in code, copy, and docs. The educational layer is called the **"Owner's lens."**)

**Current state: planning complete, no code yet.** The `docs/plan/` directory is the build contract; Phase 0 (monorepo scaffold, design tokens, calc-engine package with golden tests, CI, CDK skeleton) is the next work. There are no build/test commands yet; update this file when Phase 0 lands them.

## The plans are the authority

Read the relevant plan before building; each is a contract, not a suggestion:

| Document | Governs |
|---|---|
| [docs/plan/plainsight.md](docs/plan/plainsight.md) | Product scope, design language, frontend/backend/infra architecture, phased roadmap, decision log |
| [docs/plan/plainsight-frontend.md](docs/plan/plainsight-frontend.md) | Every route and screen (S1–S12) with empty/loading/error states, component & hook inventories, folder structure |
| [docs/plan/plainsight-data-model.md](docs/plan/plainsight-data-model.md) | Canonical line items, calc-engine types, policies P-0…P-8, metric dictionary M1–M14, red-flag rules R1–R7, Dexie/export schemas, golden corpus |
| [docs/plan/plainsight-backend.md](docs/plan/plainsight-backend.md) | API contract and error envelope, DynamoDB key design, sync protocol (§4), ingestion, extraction jobs, BYOK proxy |
| [docs/plan/plainsight-cdk.md](docs/plan/plainsight-cdk.md) | CDK stack decomposition, config shape, security invariants as tests, pipelines, cost guardrails |

**Draft status (2026-07-11):** the data-model and backend specs are drafted but awaiting the owner's review pass. **D1 and D2 are both resolved** (sample set: Apple, Coca-Cola, Costco, with CSL joining at Phase 2.5; metric budget: 12 dashboard cards from the pinned 14-metric dictionary, M10/M13 in detail sheets). Do not freeze calc-engine formulas until the owner review pass lands (ROIC/FCF definitions, P-2 tolerance, R1–R7 thresholds; data-model §12 review list).

Decisions in the plans (see §12 decision log) are **resolved**; do not relitigate them in code. If a decision must change, update the plan in the same change.

**Decision layering:** the skills in [.claude/skills/](.claude/skills/) state general engineering standards (project-agnostic by design); [docs/adr/](docs/adr/) records where this project consciously deviates from them. Check the ADR index before proposing a best-practice addition, because it may already be priced and declined. When new work requires a new deviation, propose an ADR (there's a template) rather than deviating silently.

**House style:** [docs/style.md](docs/style.md) governs all prose in this repo (docs now, UI copy later). Headline rules: no em dashes; AU/UK English spelling (code, US tickers, and company/product names keep theirs); dates as YYYY-MM-DD wherever a specific day is named, in docs and in the app. CI enforces all three; run `node scripts/check-style.mjs` locally and write to the rules the first time rather than after the check fails.

## The binding constraint

**Every core feature works offline with zero backend dependency.** IndexedDB (via Dexie) is the source of truth, not a cache. The backend and AI are optional enhancements that degrade gracefully; nothing in the client serving path may ever call a model, and a total backend outage must leave the app fully functional. Every networked feature needs a no-network story (degradation matrix, main plan §5).

## Architecture (decided, not up for debate)

- **Monorepo:** pnpm workspaces: `apps/web` (React 19 + TypeScript strict, Vite, TanStack Router), `packages/calc-engine`, `packages/extraction-core` (isomorphic: browser + Lambda), `infra/` (CDK).
- **Styling:** Vanilla Extract typed design tokens. Type scale 11/13/15/17/20/22/28/34px, spacing 4/8/12/16/20/24/32/40/48/64px; no freestyle values. `tabular-nums` wherever numbers align. One accent (#007AFF family); green/orange/red reserved for semantic health only.
- **State:** Zustand (UI) + TanStack Query (server, Phase 2+); Dexie live queries bind UI to IndexedDB. Zod validates every boundary (form → engine, Dexie → app, API → app).
- **Testing:** Vitest + React Testing Library + Playwright (Chromium and WebKit).

### calc-engine rules (the product's credibility)

- Zero-dependency, pure TypeScript: no React, no DOM, no I/O. `(statements) → MetricsReport`.
- **Money is integer cents (or a decimal library) with explicit currency and unit metadata, never floats.** Formatting is a separate final step.
- Illegal states unrepresentable: incomplete years are typed as such; division-by-zero and negative-equity cases return typed `{ status: 'not_meaningful', reason }`; **NaN must never reach the UI**.
- Test regime: property-based tests (fast-check), golden-file tests against hand-verified filings (US: Apple, Microsoft, Coca-Cola, Costco, Union Pacific; ASX: CSL, Wesfarmers, Woolworths, JB Hi-Fi, Cochlear), a regression test per bug found. Target 100% branch coverage on this package.

### Infrastructure rules

- CDK TypeScript in `ap-southeast-2`, single account/environment, default `*.cloudfront.net` origin (no custom domain; `config.domain = null`).
- **Zero VPC**: adding one is a design review, not a default. Secrets only in SSM SecureStrings, referenced by name; never in code, state, or the client bundle.
- Lambdas: `NodejsFunction`, Node 22, ARM64, explicit `timeout` and `logRetention` on every function.
- `cdk-nag` + the invariant assertion tests (cdk spec §6) are CI-blocking; suppressions require inline justification.
- Cost discipline is architectural: consult the not-list (cdk spec §8) before adding any AWS service; most "best practice" additions (WAF, GuardDuty, NAT, Secrets Manager, CloudTrail trail) are deliberately excluded.

## Product discipline

- **12-card budget** (data-model §12 D2): the dictionary pins M1–M14; exactly 12 render as dashboard cards (M10 and M13 live in their siblings' detail sheets); adding a card requires removing or demoting one.
- **Never buy/sell language** anywhere in copy; red flags are "items to investigate," education framing throughout (legal posture, main plan §15).
- Every displayed number must be reproducible by hand from its detail sheet; a number the owner can't trace to inputs is a P0 bug.
- Progressive disclosure: the dashboard stays 12 numbers; depth (formula, inputs, Owner's-lens context) is one tap away, never on-screen by default.
