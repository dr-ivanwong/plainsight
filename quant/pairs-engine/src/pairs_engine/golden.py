"""The cross-language contract fixtures.

Deterministic reports, seeded and fixed-clock, committed to the
api-contract package as the golden fixtures both sides test against:
the engine's suite asserts its own serialisation still matches the
committed bytes (write-side drift fails there), and the api-contract
suite parses the same bytes with the Zod schemas (read-side drift fails
there). Schema drift therefore fails a test, never a render.

Regenerate after an intended schema change, from quant/pairs-engine:

    uv run python -m pairs_engine.golden > ../../packages/api-contract/fixtures/pair-scan.golden.json
    uv run python -m pairs_engine.golden backtest > ../../packages/api-contract/fixtures/backtest.golden.json

and land the fixtures, the pydantic change, and the Zod change in the
same commit.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .artefacts import (
    BacktestReport,
    PairScanReport,
    build_backtest_report,
    build_report,
)
from .backtest import backtest_pair
from .research import scan
from .synthetic import cointegrated_pair, make_series, random_walk
from .windows import TRAIN_FRACTION, freeze_split, union_calendar

GOLDEN_SEED = 17
GOLDEN_GENERATED_AT = datetime(2026, 7, 22, 9, 30, 0, tzinfo=timezone.utc)


def golden_closes() -> dict[str, pd.Series]:
    """Five tickers: one planted cointegrated pair, two independent
    walks, one short-history ticker whose pairs are all skipped, so the
    fixtures exercise every row shape the schemas carry."""
    rng = np.random.default_rng(GOLDEN_SEED)
    price1, price2 = cointegrated_pair(rng, 800, beta=2.5)
    return {
        "AAA": make_series(price1, name="AAA"),
        "BBB": make_series(price2, name="BBB"),
        "CCC": make_series(random_walk(rng, 800), name="CCC"),
        "DDD": make_series(random_walk(rng, 800), name="DDD"),
        "EEE": make_series(random_walk(rng, 300), name="EEE"),
    }


def golden_report() -> PairScanReport:
    closes = golden_closes()
    calendar = union_calendar(closes)
    split = freeze_split(calendar)
    result = scan(closes, split)
    return build_report(
        result,
        calendar=calendar,
        split=split,
        train_fraction=TRAIN_FRACTION,
        min_shared_train_days=500,
        generated_at=GOLDEN_GENERATED_AT,
    )


def golden_backtest_report() -> BacktestReport:
    """The scan's candidates backtested over the same closes, train and
    holdout separate, exactly the shape slice 4's surface reads."""
    closes = golden_closes()
    scan_report = golden_report()
    split = pd.Timestamp(scan_report.window.split_date)
    stats_by_pair = {(row.ticker1, row.ticker2): row for row in scan_report.pairs}
    results = [
        backtest_pair(
            closes[candidate.ticker1],
            closes[candidate.ticker2],
            beta=candidate.beta,
            split=split,
            scan_p_value=stats_by_pair[(candidate.ticker1, candidate.ticker2)].p_value,
            scan_half_life_days=stats_by_pair[
                (candidate.ticker1, candidate.ticker2)
            ].half_life_days,
        )
        for candidate in scan_report.candidates
    ]
    return build_backtest_report(results, scan_report, GOLDEN_GENERATED_AT)


def golden_json() -> str:
    return golden_report().model_dump_json(by_alias=True, indent=2) + "\n"


def golden_backtest_json() -> str:
    return golden_backtest_report().model_dump_json(by_alias=True, indent=2) + "\n"


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "pair-scan"
    print(golden_backtest_json() if which == "backtest" else golden_json(), end="")
