"""Seeded synthetic series with planted, hand-checkable properties.

The builders live in pairs_engine.synthetic (shared with the golden
fixture generator); this module re-exports them for the tests, which
own their seeds so the suite is deterministic end to end.
"""

from pairs_engine.synthetic import (  # noqa: F401
    ar1_noise,
    cointegrated_pair,
    make_series,
    random_walk,
)
