"""The frozen holdout.

The final fifth of the calendar stays untouched until the validation
step, and it is used exactly once: selecting pairs on the full period and
then validating on its tail validates nothing, because the test data
already voted (pairs trading plan, Week 1). The split is frozen before
any statistics run, and everything in this package's scan uses dates at
or before it.
"""

from __future__ import annotations

from collections.abc import Mapping

import pandas as pd

TRAIN_FRACTION = 0.8


def union_calendar(closes: Mapping[str, pd.Series]) -> list[pd.Timestamp]:
    """Every date any series traded, sorted. Series list on different
    calendars (listing dates, halts), so the split rides the union."""
    dates: set[pd.Timestamp] = set()
    for series in closes.values():
        dates.update(series.index)
    return sorted(dates)


def freeze_split(
    calendar: list[pd.Timestamp], train_fraction: float = TRAIN_FRACTION
) -> pd.Timestamp:
    """The last training date. Dates at or before it are the training
    window; everything after is the holdout, untouched here."""
    if not calendar:
        raise ValueError("cannot freeze a split on an empty calendar")
    return calendar[int(len(calendar) * train_fraction)]


def align_pair(series1: pd.Series, series2: pd.Series) -> pd.DataFrame:
    """Inner-join two close series on their shared dates.

    Positional arrays from different listing calendars silently shift one
    series against the other, and cointegration on shifted series is
    noise (pairs trading plan, Week 1); alignment always precedes the
    statistics.
    """
    joined = pd.concat([series1, series2], axis=1, join="inner").dropna()
    joined.columns = ["price1", "price2"]
    return joined
