# 0005: Python for the quant engine

**Status:** Accepted · **Date:** 2026-07-22
**Deviates from:** the project's one-language posture, TypeScript end to end (main plan §5 and §7; the cdk spec's §9 weighs it as a virtue of the chosen toolchain). No skill mandates a single language; the posture is this project's own, which is exactly why breaching it is recorded rather than assumed.

## Context

The pairs sleeve (main plan §12 entry 17; build contract `docs/plan/2026-07-22-pairs-research-integration.md`) needs cointegration testing, half-life estimation, backtesting with costs and stops, and an Interactive Brokers execution loop. The reference implementations are Python (statsmodels for the statistics; the maintained IB client libraries for the broker), and the sleeve's correctness rule is that live signals and the backtest share one code path: splitting that arithmetic across two languages manufactures the live-trades-a-different-strategy risk the pairs trading plan warns against.

## Decision

Build the quant engine as a uv-managed Python package at `quant/pairs-engine`, beside the pnpm workspace rather than inside it. Python ends where artefacts are written: the engine emits versioned JSON artefacts validated by pydantic on write and by the Zod schemas in `packages/api-contract` on read, and the two definitions are tested against each other. Everything the owner sees stays TypeScript, no display-side arithmetic duplicates engine logic (a surface needing a number means the engine puts it in an artefact), and no Python runs in any serving path: the engine is operator-run, deterministic, and offline from the app's point of view.

## Alternatives considered

- **TypeScript end to end**: rewriting the unit-root and cointegration tests is a numerical-correctness project with no user-visible payoff and real silent-wrongness risk, the broker clients are thin, and the one code path the strategy's validity depends on would split anyway.
- **Python wherever the sleeve touches, API routes included**: spreads a second runtime into the Lambda estate and the serving path for no gain; the transport is two ordinary TypeScript routes.
- **A separate repository for the engine**: the pairs plan's original posture. It hides the artefact contract from the consumer that depends on it; one repository makes schema drift a CI failure instead of a discovery.

## Consequences

Buys the reference statistics, the maintained broker client, and one code path from research to live. Costs a second toolchain: uv-pinned dependencies, a Python CI job, and the discipline that the language boundary stays a validated wire rather than a convention. The containment is the artefact contract plus the sleeve's standing invariant (the app never trades and never writes sleeve data), so the deviation's blast radius is the engine directory and a schema package both languages already treat as the boundary.

## Revisit when

The engine's scope grows past the sleeve (a factor store or a risk engine reopens build-versus-buy and language per component); the sleeve retires at the pairs plan's go/no-go gate, at which point the package archives with it; or a maintained TypeScript equivalent of the statistics surface genuinely appears and migrating would collapse the toolchain without splitting the code path.

**Full argument:** [plan/2026-07-22-pairs-research-integration.md](../plan/2026-07-22-pairs-research-integration.md) §5.
