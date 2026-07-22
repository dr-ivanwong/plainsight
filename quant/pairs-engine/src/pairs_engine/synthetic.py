"""Synthetic series with planted, hand-checkable properties.

Shared by the test suite and the golden-fixture generator: a
cointegrated pair is built from a known hedge ratio and a known
mean-reversion speed, so whatever consumes these series can assert the
statistics recover what was planted. Never used by the scan itself.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def make_series(values: np.ndarray, start: str = "2021-01-04", name: str = "TICK") -> pd.Series:
    index = pd.bdate_range(start=start, periods=len(values))
    return pd.Series(np.asarray(values, dtype=float), index=index, name=name)


def random_walk(rng: np.random.Generator, n: int, start: float = 100.0, sigma: float = 0.5) -> np.ndarray:
    return start + np.cumsum(rng.normal(0.0, sigma, size=n))


def ar1_noise(rng: np.random.Generator, n: int, phi: float = 0.8, sigma: float = 0.5) -> np.ndarray:
    noise = np.zeros(n)
    shocks = rng.normal(0.0, sigma, size=n)
    for i in range(1, n):
        noise[i] = phi * noise[i - 1] + shocks[i]
    return noise


def cointegrated_pair(
    rng: np.random.Generator,
    n: int,
    beta: float = 2.5,
    offset: float = 10.0,
    phi: float = 0.8,
    noise_sigma: float = 0.5,
) -> tuple[np.ndarray, np.ndarray]:
    """price1 = beta * price2 + offset + stationary AR(1) noise: the pair
    is cointegrated by construction with hedge ratio beta, and the spread
    mean-reverts at the speed phi implies."""
    price2 = random_walk(rng, n)
    price1 = beta * price2 + offset + ar1_noise(rng, n, phi=phi, sigma=noise_sigma)
    return price1, price2
