# Plainsight

A hobby project: a financial statement analyser for long-term value investors. The numbers were in plain sight all along. Designed and built in collaboration with [Claude](https://claude.com/claude-code).

## What it is

A single-user web app that helps a retail investor read financial statements like an owner: enter (or import) a company's financials, see 12 quality metrics (margins, ROE/ROIC, leverage, free cash flow) computed and trended over ten years, get deterministic red-flag detection for eroding moats and leverage-flattered returns, compare companies side by side, and write a structured investment thesis.

The core design constraints: **all analysis runs in the browser, and no AI service is ever load-bearing**. The backend is the source of truth for the library (the 2026-07-18 decision, main plan §12.9); the client keeps a synchronised working copy in IndexedDB, so reading, entry, and every computation work offline and queued writes catch up when the connection returns. Model-backed features (filing extraction) are enhancements that degrade to a working app.

## Status

**Live since 2026-07-18, with Phase 3 code-complete the same day.** The pnpm monorepo carries `packages/calc-engine` (the full pinned metric dictionary and red-flag rules, 100% branch coverage, golden-file tests against ten real companies' filings: five US from as-filed EDGAR data, five ASX hand-transcribed), `packages/extraction-core` (the isomorphic provider registry, escalation ladder, and PDF preprocessor), `packages/api-contract` (the wire contract as Zod schemas), `apps/api` (EDGAR and ASX ingestion, the sync protocol, the upload and extraction-job routes, the BYOK proxy), `apps/web` (the installable PWA: library, dashboard, entry, extraction review, compare, thesis, settings), and `infra/` (seven CDK stacks, deployed, with cdk-nag and invariant suites). The engineering plans in [`docs/plan/`](docs/plan/) remain the build contracts.

| Document | Covers |
|---|---|
| [plainsight.md](docs/plan/plainsight.md) | Main engineering plan: product, design, architecture, roadmap |
| [plainsight-frontend.md](docs/plan/plainsight-frontend.md) | Every route, screen, and state; component and hook inventories |
| [plainsight-data-model.md](docs/plan/plainsight-data-model.md) | Canonical schema, policies, pinned metric formulas, red-flag thresholds, golden corpus |
| [plainsight-backend.md](docs/plan/plainsight-backend.md) | API contract, DynamoDB key design, sync protocol, extraction jobs, BYOK proxy |
| [plainsight-cdk.md](docs/plan/plainsight-cdk.md) | AWS CDK stacks, security invariants, pipelines, cost guardrails |

## How it's being built

This is a personal-tool-sized experiment in AI-assisted software development: the plans were drafted, argued over, and revised with Claude, and the implementation will be driven through [Claude Code](https://claude.com/claude-code). The repo doubles as a record of that process, with [`CLAUDE.md`](CLAUDE.md) as the standing brief that keeps every session honest about the architecture's non-negotiables.

## Disclaimer

This is an educational tool for one person's own research. It computes ratios and flags things to investigate; it is **not investment advice**, and it never says buy or sell.
