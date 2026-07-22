"""The position rule, one code path for backtest and live.

The state machine the pairs trading plan pins (Week 2's engine and the
live system alike): enter beyond the entry threshold, hold until the
z-score returns inside the exit band, abandon on the z-stop or the time
stop, and after either stop stand down until the spread has actually
normalised, so a still-stretched spread cannot re-enter on the next bar.
The backtest module consumes this over history; the live compute job
consumes it over the trailing window. Splitting that arithmetic is the
live-trades-a-different-strategy risk the plan warns against, which is
why it lives here once.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

LOOKBACK_DAYS = 60
ENTRY_Z = 2.0
EXIT_Z = 0.5
STOP_Z = 3.5
MAX_HOLD_DAYS = 60

EXIT_BAND = "exitBand"
Z_STOP = "zStop"
TIME_STOP = "timeStop"
WINDOW_END = "windowEnd"


@dataclass(frozen=True)
class PositionPath:
    """Per-day position in spread units, plus the close reasons keyed by
    the day the position returned to zero."""

    position: np.ndarray
    close_reasons: dict[int, str]


def position_path(
    z: np.ndarray,
    first_tradeable: int,
    entry_z: float = ENTRY_Z,
    exit_z: float = EXIT_Z,
    stop_z: float = STOP_Z,
    max_hold_days: int = MAX_HOLD_DAYS,
) -> PositionPath:
    """Walk the z-score series and decide the held units per day.

    first_tradeable is the first index with valid rolling statistics
    (the lookback boundary); everything before it stays flat.
    """
    position = np.zeros(len(z))
    close_reasons: dict[int, str] = {}
    stood_down = False
    days_held = 0
    for t in range(first_tradeable, len(z)):
        held = position[t - 1] if t > 0 else 0.0
        if stood_down:
            if abs(z[t]) < exit_z:
                stood_down = False
            continue
        if held == 0:
            days_held = 0
            if z[t] > entry_z:
                position[t] = -1.0
            elif z[t] < -entry_z:
                position[t] = 1.0
        else:
            days_held += 1
            if abs(z[t]) >= stop_z:
                position[t] = 0.0
                stood_down = True
                close_reasons[t] = Z_STOP
            elif days_held >= max_hold_days:
                position[t] = 0.0
                stood_down = True
                close_reasons[t] = TIME_STOP
            elif abs(z[t]) < exit_z:
                position[t] = 0.0
                close_reasons[t] = EXIT_BAND
            else:
                position[t] = held
    return PositionPath(position=position, close_reasons=close_reasons)


def rolling_z(spread: np.ndarray, lookback: int = LOOKBACK_DAYS) -> np.ndarray:
    """The rolling z-score, sample deviation, exactly the plan's
    spread.rolling(lookback) statistics; the first lookback minus one
    entries are not-a-number and never tradeable."""
    import pandas as pd

    series = pd.Series(spread, dtype=float)
    mean = series.rolling(lookback).mean()
    std = series.rolling(lookback).std()
    return ((series - mean) / std).to_numpy()
