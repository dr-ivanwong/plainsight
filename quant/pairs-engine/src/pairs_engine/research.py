"""The cointegration scan: statistics select pairs; fundamentals qualify
them later, on the research surface.

Method per the pairs trading plan, Weeks 1 and 2: Engle-Granger on price
levels over the training window only; the hedge ratio by ordinary least
squares on the same window (the same beta rides unchanged into
validation and live); half-life from regressing spread changes on the
lagged spread. Testing about twelve hundred pairs at the five per cent
level yields dozens of nominal positives by chance alone, so the report
records every tested pair and the candidate gate is stricter than the
nominal threshold: significance, a valid half-life inside the tradeable
band, and a positive hedge ratio.
"""

from __future__ import annotations

import itertools
from collections.abc import Mapping
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from statsmodels.tsa.stattools import coint

from .windows import align_pair

MIN_SHARED_TRAIN_DAYS = 500
MAX_P_VALUE = 0.05
MAX_CANDIDATE_HALF_LIFE_DAYS = 30.0
HALF_LIFE_CEILING_DAYS = 120.0
MIN_ABS_REGRESSION_R = 0.1

SKIP_INSUFFICIENT_HISTORY = "insufficientSharedHistory"
SKIP_TEST_FAILED = "cointegrationTestFailed"


@dataclass(frozen=True)
class PairStats:
    ticker1: str
    ticker2: str
    shared_train_days: int
    p_value: float
    beta: float
    intercept: float
    correlation: float
    half_life_days: float | None
    half_life_valid: bool

    @property
    def candidate(self) -> bool:
        return (
            self.p_value < MAX_P_VALUE
            and self.half_life_valid
            and self.half_life_days is not None
            and self.half_life_days <= MAX_CANDIDATE_HALF_LIFE_DAYS
            and self.beta > 0
        )


@dataclass(frozen=True)
class SkippedPair:
    ticker1: str
    ticker2: str
    shared_train_days: int
    reason: str


@dataclass(frozen=True)
class ScanResult:
    pairs: list[PairStats]
    skipped: list[SkippedPair]

    @property
    def pairs_tested(self) -> int:
        return len(self.pairs)

    @property
    def candidates(self) -> list[PairStats]:
        return [pair for pair in self.pairs if pair.candidate]


def hedge_ratio(price1: np.ndarray, price2: np.ndarray) -> tuple[float, float]:
    """Ordinary least squares of price1 on price2 with an intercept,
    exactly the plan's fit; returns (beta, intercept)."""
    design = np.column_stack([price2, np.ones(len(price2))])
    coefficients = np.linalg.lstsq(design, price1, rcond=None)[0]
    return float(coefficients[0]), float(coefficients[1])


def half_life(spread: np.ndarray) -> tuple[float | None, bool]:
    """Days for the spread to revert halfway, from the regression of
    spread changes on the lagged spread (pairs trading plan, Week 2).

    Returns (None, False) when the spread is not mean-reverting: a flat
    or positive slope, or a degenerate constant spread. The validity
    flag additionally requires the plan's sanity band: a half-life
    inside the ceiling, a significant regression, and some explanatory
    power.
    """
    deviation = np.std(spread)
    if deviation == 0:
        return None, False
    normalised = (spread - np.mean(spread)) / deviation
    changes = np.diff(normalised)
    lagged = normalised[:-1]
    regression = scipy_stats.linregress(lagged, changes)
    if regression.slope >= 0:
        return None, False
    days = float(-np.log(2) / regression.slope)
    valid = (
        0 < days < HALF_LIFE_CEILING_DAYS
        and regression.pvalue < 0.05
        and abs(regression.rvalue) > MIN_ABS_REGRESSION_R
    )
    return days, valid


def scan(
    closes: Mapping[str, pd.Series],
    split: pd.Timestamp,
    min_shared_train_days: int = MIN_SHARED_TRAIN_DAYS,
) -> ScanResult:
    """Every unordered pair in the universe, on the training window only."""
    pairs: list[PairStats] = []
    skipped: list[SkippedPair] = []
    for ticker1, ticker2 in itertools.combinations(sorted(closes), 2):
        joined = align_pair(closes[ticker1], closes[ticker2])
        train = joined[joined.index <= split]
        shared = len(train)
        if shared < min_shared_train_days:
            skipped.append(SkippedPair(ticker1, ticker2, shared, SKIP_INSUFFICIENT_HISTORY))
            continue
        price1 = train["price1"].to_numpy()
        price2 = train["price2"].to_numpy()
        try:
            _score, p_value, _crit = coint(price1, price2)
        except Exception:
            skipped.append(SkippedPair(ticker1, ticker2, shared, SKIP_TEST_FAILED))
            continue
        beta, intercept = hedge_ratio(price1, price2)
        spread = price1 - beta * price2
        days, valid = half_life(spread)
        pairs.append(
            PairStats(
                ticker1=ticker1,
                ticker2=ticker2,
                shared_train_days=shared,
                p_value=float(p_value),
                beta=beta,
                intercept=intercept,
                correlation=float(np.corrcoef(price1, price2)[0, 1]),
                half_life_days=days,
                half_life_valid=valid,
            )
        )
    return ScanResult(pairs=pairs, skipped=skipped)
