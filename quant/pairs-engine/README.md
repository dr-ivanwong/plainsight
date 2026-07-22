# pairs-engine

The Plainsight pairs sleeve's quant engine. The build contract is [the pairs research integration plan](../../docs/plan/2026-07-22-pairs-research-integration.md); the language decision is [ADR 0005](../../docs/adr/0005-python-for-the-quant-engine.md). The division of labour is one sentence: this package computes and writes artefacts; the app renders them, never trades, and never writes sleeve data. Nothing here is imported by any serving path.

## What exists (slice 1)

- **Data module**: end-of-day adjusted closes for the audited fifty-ticker ASX universe (audited 2026-07-22 against the ASX listed-companies directory; re-run that audit after any gap), cached one CSV per ticker. The refresh rule is whole-window replacement, never append: adjustment factors move on every ex-dividend date, and an appended raw close silently mixes two series.
- **Research module**: the Engle-Granger scan over every pair, on the frozen training window only. The final fifth of the calendar is the holdout; it stays untouched until the validation slice and is used exactly once. Hedge ratio by ordinary least squares on the same window; half-life from the lagged-spread regression with the pairs plan's validity band. The candidate gate is stricter than nominal significance: significance, a valid half-life inside the tradeable band, and a positive hedge ratio.
- **The artefact**: a versioned pair scan report (camelCase JSON, schema version 1) carrying the universe, the window and criteria, every tested pair's statistics, every skipped pair with its reason, and the candidate set. The read-side Zod schemas land in `packages/api-contract` with the transport slice.

Backtesting and the live jobs are later slices of the contract's staging, deliberately absent here.

## Commands

From this directory, with [uv](https://docs.astral.sh/uv/):

```
uv sync
uv run pytest
```

The first live fetch and scan (the vendor key lives in the environment only, never in a file):

```
EODHD_API_KEY=... uv run pairs-engine fetch
uv run pairs-engine scan
```

`fetch` refreshes the whole five-year window for all fifty tickers and aborts loudly, all failures listed, if any ticker is missing: a downloader that skips failures quietly shrinks the universe. `scan` reads the cache, freezes the split, runs the statistics, and writes `artefacts/pair-scan-<runDate>.json`. Both `data/` and `artefacts/` are operator-local working state, ignored by git.

Publishing to the app's API (slice 2) rides the same environment-only rule: `PLAINSIGHT_API_URL`, `PLAINSIGHT_COGNITO_CLIENT_ID` and `PLAINSIGHT_COGNITO_REFRESH_TOKEN`, then `uv run pairs-engine publish`. The refresh token is minted once via the runbook's pairs publish step; the PUT is idempotent by run date, and artefacts travel in this direction only (the app renders and never writes sleeve data).

## Determinism and tests

Same cached closes, same statistics, byte for byte; `generatedAt` is the only field that moves between reruns over the same inputs. The suite plants what it asserts: a synthetic cointegrated pair with a known hedge ratio and mean-reversion speed that the scan must recover, independent walks that must never become candidates, a hand-computed least-squares fit, and an end-to-end scan whose tested-plus-skipped counts reconcile exactly. Seeded throughout; no network anywhere in the tests.

## Licensing

The EOD data plan is personal-use; its terms, the tripwires at any scale-up, and the vendor pricing live in the pairs trading plan (Week 1, data licensing). Nothing in this package redistributes vendor data: artefacts carry derived statistics, and the raw close cache never leaves the operator's machine in this slice.
