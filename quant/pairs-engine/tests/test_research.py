import numpy as np

from pairs_engine.research import (
    HALF_LIFE_CEILING_DAYS,
    SKIP_INSUFFICIENT_HISTORY,
    half_life,
    hedge_ratio,
    scan,
)
from pairs_engine.windows import freeze_split, union_calendar

from conftest import ar1_noise, cointegrated_pair, make_series, random_walk


def scan_two(series1, series2):
    closes = {"AAA": series1, "BBB": series2}
    calendar = union_calendar(closes)
    return scan(closes, freeze_split(calendar))


def test_scan_recovers_a_planted_cointegrated_pair():
    rng = np.random.default_rng(7)
    price1, price2 = cointegrated_pair(rng, 800, beta=2.5, phi=0.8)
    result = scan_two(make_series(price1, name="AAA"), make_series(price2, name="BBB"))

    assert result.pairs_tested == 1
    stats = result.pairs[0]
    assert stats.p_value < 0.05
    assert abs(stats.beta - 2.5) < 0.05
    assert stats.correlation > 0.99
    assert stats.half_life_valid
    # AR(1) noise at phi 0.8 mean-reverts with a half-life near three and
    # a half days (minus ln 2 over the regression slope, slope near
    # phi minus one); the scan must land in that neighbourhood.
    assert 2.0 < stats.half_life_days < 6.0
    assert stats.candidate
    assert result.candidates == [stats]


def test_independent_random_walks_are_never_candidates():
    rng = np.random.default_rng(11)
    walk1 = random_walk(rng, 800)
    walk2 = random_walk(rng, 800)
    result = scan_two(make_series(walk1, name="AAA"), make_series(walk2, name="BBB"))

    assert result.pairs_tested == 1
    assert not result.pairs[0].candidate
    assert result.candidates == []


def test_negative_hedge_ratio_fails_the_candidate_gate():
    rng = np.random.default_rng(23)
    price2 = random_walk(rng, 800)
    price1 = 400.0 - 1.5 * price2 + ar1_noise(rng, 800, phi=0.8)
    result = scan_two(make_series(price1, name="AAA"), make_series(price2, name="BBB"))

    stats = result.pairs[0]
    assert stats.beta < 0
    assert not stats.candidate


def test_hedge_ratio_matches_the_hand_computed_fit():
    beta, intercept = hedge_ratio(np.array([2.0, 4.0, 6.0]), np.array([1.0, 2.0, 3.0]))
    assert abs(beta - 2.0) < 1e-9
    assert abs(intercept) < 1e-9


def test_half_life_matches_a_planted_ar1_speed():
    rng = np.random.default_rng(3)
    spread = ar1_noise(rng, 2000, phi=0.8, sigma=1.0)
    days, valid = half_life(spread)
    # Regression slope estimates phi minus one, so the half-life sits
    # near minus ln 2 over that: about three and a half days.
    assert valid
    assert 2.5 < days < 4.5


def test_half_life_rejects_a_diverging_spread():
    days, valid = half_life(1.1 ** np.arange(60.0))
    assert days is None
    assert not valid


def test_half_life_never_validates_a_linear_trend():
    # A perfectly linear spread regresses to a slope of zero within
    # floating-point noise; whichever side of zero it lands, the result
    # must be invalid: either not mean-reverting at all, or a half-life
    # far past the ceiling.
    days, valid = half_life(np.arange(300.0))
    assert not valid
    assert days is None or days > HALF_LIFE_CEILING_DAYS


def test_half_life_rejects_a_constant_spread():
    days, valid = half_life(np.ones(100))
    assert days is None
    assert not valid


def test_insufficient_shared_history_is_skipped_not_tested():
    rng = np.random.default_rng(5)
    long_series = make_series(random_walk(rng, 800), name="AAA")
    short_series = make_series(random_walk(rng, 100), name="BBB")
    closes = {"AAA": long_series, "BBB": short_series}
    result = scan(closes, freeze_split(union_calendar(closes)))

    assert result.pairs_tested == 0
    assert len(result.skipped) == 1
    skipped = result.skipped[0]
    assert skipped.reason == SKIP_INSUFFICIENT_HISTORY
    assert skipped.shared_train_days < 500
