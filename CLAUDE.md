# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

**Plainsight** — a value-investing financial statement analyzer: a **single-user, local-first PWA** that computes ~12 investment-quality metrics (margins, ROE/ROIC, leverage, FCF, valuation) from entered or imported financial statements, with deterministic red-flag rules and a structured thesis editor. (By recorded decision — plan §12.7 — the name, all repo copy, and the in-app education layer avoid naming any living investor; keep it that way in code, copy, and docs. The educational layer is called the **"Owner's lens."**)

**Current state: planning complete, no code yet.** The `plan/` directory is the build contract; Phase 0 (monorepo scaffold, design tokens, calc-engine package with golden tests, CI, CDK skeleton) is the next work. There are no build/test commands yet — update this file when Phase 0 lands them.

## The plans are the authority

Read the relevant plan before building; each is a contract, not a suggestion:

| Document | Governs |
|---|---|
| [plan/plainsight.md](plan/plainsight.md) | Product scope, design language, frontend/backend/infra architecture, phased roadmap, decision log |
| [plan/plainsight-frontend.md](plan/plainsight-frontend.md) | Every route and screen (S1–S12) with empty/loading/error states, component & hook inventories, folder structure |
| [plan/plainsight-cdk.md](plan/plainsight-cdk.md) | CDK stack decomposition, config shape, security invariants as tests, pipelines, cost guardrails |

**Missing from the repo:** the main plan marks `plainsight-data-model.md` (pinned metric formulas, schema, policies P-0…P-8) and `plainsight-backend.md` (DynamoDB keys, sync protocol, extraction jobs) as complete, but they are not committed. Ask the owner for them before building anything they govern — especially the calc engine, whose formulas are pinned there.

Decisions in the plans (see §12 decision log) are **resolved** — do not relitigate them in code. If a decision must change, update the plan in the same change.

**Decision layering:** the skills in [.claude/skills/](.claude/skills/) state general engineering standards (project-agnostic by design); [docs/adr/](docs/adr/) records where this project consciously deviates from them. Check the ADR index before proposing a best-practice addition — it may already be priced and declined. When new work requires a new deviation, propose an ADR (there's a template) rather than deviating silently.

## The binding constraint

**Every core feature works offline with zero backend dependency.** IndexedDB (via Dexie) is the source of truth, not a cache. The backend and AI are optional enhancements that degrade gracefully; nothing in the client serving path may ever call a model, and a total backend outage must leave the app fully functional. Every networked feature needs a no-network story (degradation matrix, main plan §5).

## Architecture (decided, not up for debate)

- **Monorepo:** pnpm workspaces — `apps/web` (React 19 + TypeScript strict, Vite, TanStack Router), `packages/calc-engine`, `packages/extraction-core` (isomorphic: browser + Lambda), `infra/` (CDK).
- **Styling:** Vanilla Extract typed design tokens. Type scale 11/13/15/17/20/22/28/34px, spacing 4/8/12/16/20/24/32/40/48/64px — no freestyle values. `tabular-nums` wherever numbers align. One accent (#007AFF family); green/orange/red reserved for semantic health only.
- **State:** Zustand (UI) + TanStack Query (server, Phase 2+); Dexie live queries bind UI to IndexedDB. Zod validates every boundary (form → engine, Dexie → app, API → app).
- **Testing:** Vitest + React Testing Library + Playwright (Chromium and WebKit).

### calc-engine rules (the product's credibility)

- Zero-dependency, pure TypeScript: no React, no DOM, no I/O. `(statements) → MetricsReport`.
- **Money is integer cents (or a decimal library) with explicit currency and unit metadata — never floats.** Formatting is a separate final step.
- Illegal states unrepresentable: incomplete years are typed as such; division-by-zero and negative-equity cases return typed `{ status: 'not_meaningful', reason }` — **NaN must never reach the UI**.
- Test regime: property-based tests (fast-check), golden-file tests against hand-verified filings (US: Apple, Microsoft, Coca-Cola, Costco, Union Pacific; ASX: CSL, Wesfarmers, Woolworths, JB Hi-Fi, Cochlear), a regression test per bug found. Target 100% branch coverage on this package.

### Infrastructure rules

- CDK TypeScript in `ap-southeast-2`, single account/environment, default `*.cloudfront.net` origin (no custom domain — `config.domain = null`).
- **Zero VPC** — adding one is a design review, not a default. Secrets only in SSM SecureStrings, referenced by name; never in code, state, or the client bundle.
- Lambdas: `NodejsFunction`, Node 22, ARM64, explicit `timeout` and `logRetention` on every function.
- `cdk-nag` + the invariant assertion tests (cdk spec §6) are CI-blocking; suppressions require inline justification.
- Cost discipline is architectural: consult the not-list (cdk spec §8) before adding any AWS service — most "best practice" additions (WAF, GuardDuty, NAT, Secrets Manager, CloudTrail trail) are deliberately excluded.

## Product discipline

- **12-metric budget:** adding a metric requires removing or demoting one.
- **Never buy/sell language** anywhere in copy — red flags are "items to investigate," education framing throughout (legal posture, main plan §15).
- Every displayed number must be reproducible by hand from its detail sheet — a number the owner can't trace to inputs is a P0 bug.
- Progressive disclosure: the dashboard stays ~12 numbers; depth (formula, inputs, Owner's-lens context) is one tap away, never on-screen by default.
