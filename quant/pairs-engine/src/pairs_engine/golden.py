"""The cross-language contract fixture.

One deterministic pair scan report, seeded and fixed-clock, committed to
the api-contract package as the golden fixture both sides test against:
the engine's suite asserts its own serialisation still matches the
committed bytes (write-side drift fails there), and the api-contract
suite parses the same bytes with the Zod schemas (read-side drift fails
there). Schema drift therefore fails a test, never a render.

Regenerate after an intended schema change, from quant/pairs-engine:

    uv run python -m pairs_engine.golden > ../../packages/api-contract/fixtures/pair-scan.golden.json

and land the fixture, the pydantic change, and the Zod change in the
same commit.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from .artefacts import PairScanReport, build_report
from .research import scan
from .synthetic import cointegrated_pair, make_series, random_walk
from .windows import TRAIN_FRACTION, freeze_split, union_calendar

GOLDEN_SEED = 17
GOLDEN_GENERATED_AT = datetime(2026, 7, 22, 9, 30, 0, tzinfo=timezone.utc)


def golden_report() -> PairScanReport:
    """Five tickers: one planted cointegrated pair, two independent
    walks, one short-history ticker whose pairs are all skipped, so the
    fixture exercises every row shape the schema carries."""
    rng = np.random.default_rng(GOLDEN_SEED)
    price1, price2 = cointegrated_pair(rng, 800, beta=2.5)
    closes = {
        "AAA": make_series(price1, name="AAA"),
        "BBB": make_series(price2, name="BBB"),
        "CCC": make_series(random_walk(rng, 800), name="CCC"),
        "DDD": make_series(random_walk(rng, 800), name="DDD"),
        "EEE": make_series(random_walk(rng, 300), name="EEE"),
    }
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


def golden_json() -> str:
    return golden_report().model_dump_json(by_alias=True, indent=2) + "\n"


if __name__ == "__main__":
    print(golden_json(), end="")
