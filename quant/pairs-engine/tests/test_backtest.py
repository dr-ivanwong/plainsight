import json

import numpy as np
import pandas as pd
import pytest

from pairs_engine.artefacts import write_backtest_report
from pairs_engine.backtest import _daily_pnl, backtest_pair
from pairs_engine.cli import main
from pairs_engine.golden import golden_backtest_report, golden_closes
from pairs_engine.signals import EXIT_BAND, TIME_STOP, WINDOW_END, Z_STOP, position_path
from pairs_engine.windows import freeze_split, union_calendar

from conftest import cointegrated_pair, make_series, random_walk

from pairs_engine.golden import GOLDEN_GENERATED_AT


def test_position_rule_walks_every_state_by_hand():
    # Enter short past +2, hold outside the exit band, exit inside it;
    # enter long past -2, abandon on the z-stop, stand down while the
    # spread is still stretched, and only re-enter after it normalises.
    z = np.array([0.0, 2.5, 1.0, 0.4, -2.5, -3.6, -2.6, 0.3, 2.2])
    path = position_path(z, first_tradeable=1)
    assert list(path.position) == [0.0, -1.0, -1.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0]
    assert path.close_reasons == {3: EXIT_BAND, 5: Z_STOP}


def test_time_stop_closes_and_stands_down():
    z = np.array([0.0, 2.5, 1.5, 1.5, 1.5, 1.5, 0.3, 2.4])
    path = position_path(z, first_tradeable=1, max_hold_days=3)
    # Held three days after entry, the time stop closes it; the pair
    # stands down until the z-score first re-enters the exit band.
    assert list(path.position) == [0.0, -1.0, -1.0, -1.0, 0.0, 0.0, 0.0, -1.0]
    assert path.close_reasons == {4: TIME_STOP}


def planted_series(seed: int = 7, n: int = 800, noise_sigma: float = 0.5):
    rng = np.random.default_rng(seed)
    price1, price2 = cointegrated_pair(rng, n, beta=2.5, noise_sigma=noise_sigma)
    return make_series(price1, name="AAA"), make_series(price2, name="BBB")


def test_costs_and_borrow_reduce_the_pnl_by_construction():
    series1, series2 = planted_series()
    frame = pd.concat([series1, series2], axis=1).dropna()
    price1 = frame.iloc[:, 0].to_numpy()
    price2 = frame.iloc[:, 1].to_numpy()

    free, _path, _gross = _daily_pnl(price1, price2, 2.5, 60, cost_bps=0.0, borrow_bps_pa=0.0)
    costed, _path2, gross = _daily_pnl(price1, price2, 2.5, 60, cost_bps=15.0, borrow_bps_pa=0.0)
    carried, path3, _gross3 = _daily_pnl(price1, price2, 2.5, 60, cost_bps=15.0, borrow_bps_pa=50.0)

    traded = np.abs(np.diff(path3.position, prepend=0.0))
    expected_costs = float((traded * gross * (15.0 / 10_000)).sum())
    assert free.sum() - costed.sum() == pytest.approx(expected_costs)
    # The borrow fee charges only while a position is open, so the carried
    # run is strictly cheaper than the merely costed one.
    assert carried.sum() < costed.sum()


def test_backtest_recovers_the_planted_reversion_and_reconciles():
    # A wide planted spread: at the default noise scale the plan's cost
    # model rightly eats the edge (fifteen basis points a side on a
    # three-hundred-dollar notional), which is itself the point of
    # backtesting net; tripling the spread's amplitude leaves reversion
    # the costs cannot erase.
    series1, series2 = planted_series(noise_sigma=3.0)
    closes = {"AAA": series1, "BBB": series2}
    split = freeze_split(union_calendar(closes))
    result = backtest_pair(
        series1, series2, beta=2.5, split=split, scan_p_value=0.0005, scan_half_life_days=3.5
    )

    # A strongly reverting planted spread earns its keep on both windows.
    assert result.train.annual_sharpe > 1.5
    assert result.holdout.annual_sharpe > 1.2
    assert result.train.trade_count > 5
    assert result.selected

    # The holdout warm-starts on training data but scores only true
    # holdout days: its first scored day is after the split.
    assert pd.Timestamp(result.holdout.start) > split
    assert pd.Timestamp(result.train.end) <= split

    # Round trips reconcile to the day-by-day P&L exactly: no day outside
    # a trade earns or costs anything.
    for window in (result.train, result.holdout):
        assert len(window.equity_dates) == len(window.equity_values)
        total = window.equity_values[-1] - window.capital_per_unit
        assert sum(trade.pnl for trade in window.trades) == pytest.approx(total, abs=1e-6)
        for trade in window.trades:
            assert trade.exit_reason in {EXIT_BAND, Z_STOP, TIME_STOP, WINDOW_END}


def test_unrelated_walks_fail_the_stated_gates():
    rng = np.random.default_rng(11)
    series1 = make_series(random_walk(rng, 800), name="AAA")
    series2 = make_series(random_walk(rng, 800), name="BBB")
    closes = {"AAA": series1, "BBB": series2}
    split = freeze_split(union_calendar(closes))
    result = backtest_pair(
        series1, series2, beta=1.0, split=split, scan_p_value=0.41, scan_half_life_days=None
    )
    assert not result.gates["significance"]
    assert not result.selected


def test_backtest_report_serialises_deterministically(tmp_path):
    report = golden_backtest_report()
    first = write_backtest_report(report, tmp_path / "one")
    second = write_backtest_report(golden_backtest_report(), tmp_path / "two")
    assert first.name == f"backtest-{report.run_date.isoformat()}.json"
    assert first.read_bytes() == second.read_bytes()

    parsed = json.loads(first.read_text())
    assert parsed["artefact"] == "backtestReport"
    assert parsed["scanRunDate"] == parsed["runDate"]
    pair = parsed["pairs"][0]
    for key in ("scanPValue", "scanHalfLifeDays", "train", "holdout", "gates", "selected"):
        assert key in pair
    assert len(pair["train"]["equity"]["dates"]) == len(pair["train"]["equity"]["values"])
    assert parsed["assumptions"]["costBpsPerSide"] == 15.0
    assert parsed["criteria"]["holdoutMinSharpe"] == 1.2


def test_cli_backtest_runs_from_the_scan_artefact(tmp_path, capsys):
    from pairs_engine.data import CloseStore

    store = CloseStore(tmp_path / "data")
    for ticker, series in golden_closes().items():
        store.save(ticker, series)
    out_dir = tmp_path / "artefacts"

    assert main(["scan", "--data-dir", str(store.root), "--out-dir", str(out_dir)]) == 0
    capsys.readouterr()
    assert main(["backtest", "--data-dir", str(store.root), "--out-dir", str(out_dir)]) == 0

    output = capsys.readouterr().out
    assert "holdout is spent once" in output
    artefacts = list(out_dir.glob("backtest-*.json"))
    assert len(artefacts) == 1
    parsed = json.loads(artefacts[0].read_text())
    assert parsed["pairs"][0]["ticker1"] == "AAA"


def test_cli_backtest_without_a_scan_fails_loudly(tmp_path, capsys):
    exit_code = main(["backtest", "--data-dir", str(tmp_path), "--out-dir", str(tmp_path)])
    assert exit_code == 1
    assert "run scan first" in capsys.readouterr().err
