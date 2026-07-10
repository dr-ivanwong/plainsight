# Plainsight

A hobby project: a financial statement analyzer for long-term value investors — the numbers were in plain sight all along. Designed and built in collaboration with [Claude](https://claude.com/claude-code).

## What it is

A single-user, local-first web app that helps a retail investor read financial statements like an owner: enter (or import) a company's financials, see ~12 quality metrics — margins, ROE/ROIC, leverage, free cash flow — computed and trended over ten years, get deterministic red-flag detection for eroding moats and leverage-flattered returns, compare companies side by side, and write a structured investment thesis.

The core design constraint: **everything works offline**. All analysis runs in the browser with data stored on-device (IndexedDB); a backend exists only for optional extras (SEC EDGAR import, sync, AI-assisted filing extraction), and every one of them degrades gracefully to the offline core. If every server on earth is down, the app still computes, charts, and stores.

## Status

**Planning.** The engineering plans in [`docs/plan/`](docs/plan/) are complete — product definition, design language, frontend/backend architecture, and AWS CDK infrastructure — and code has not started. Next up is Phase 0: monorepo scaffold, design tokens, and the calculation engine with golden-file tests against hand-verified 10-Ks.

| Document | Covers |
|---|---|
| [plainsight.md](docs/plan/plainsight.md) | Main engineering plan — product, design, architecture, roadmap |
| [plainsight-frontend.md](docs/plan/plainsight-frontend.md) | Every route, screen, and state; component and hook inventories |
| [plainsight-cdk.md](docs/plan/plainsight-cdk.md) | AWS CDK stacks, security invariants, pipelines, cost guardrails |

## How it's being built

This is a personal-tool-sized experiment in AI-assisted software development: the plans were drafted, argued over, and revised with Claude, and the implementation will be driven through [Claude Code](https://claude.com/claude-code). The repo doubles as a record of that process — [`CLAUDE.md`](CLAUDE.md) is the standing brief that keeps every session honest about the architecture's non-negotiables.

## Disclaimer

This is an educational tool for one person's own research. It computes ratios and flags things to investigate; it is **not investment advice**, and it never says buy or sell.
