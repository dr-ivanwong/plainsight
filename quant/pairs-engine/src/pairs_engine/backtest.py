"""The backtest: the pairs trading plan's Week 3 engine and Week 4
holdout, verbatim in accounting.

Dollar P&L per spread unit (one unit: long one share of the first
ticker against beta shares of the second, reversed when short);
yesterday's position earns today's change in the spread; never a
percentage return on a zero-crossing series. Costs charge per side on
the gross notional of every entry and exit, and the short leg pays to
borrow. Metrics come off the dollar equity curve against the capital
carrying one unit. The holdout runs the identical rolling engine,
warm-started with the last lookback days of training so its first day
has statistics, scored only on true holdout days, and it is spent
once: iterate inside the training window only.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .signals import (
    EXIT_BAND,
    LOOKBACK_DAYS,
    WINDOW_END,
    PositionPath,
    position_path,
    rolling_z,
)
from .windows import align_pair

COST_BPS_PER_SIDE = 15.0
BORROW_BPS_PER_ANNUM = 50.0
TRADING_DAYS_PER_YEAR = 252

MAX_PRESELECTION_P_VALUE = 0.01
TRAIN_MIN_SHARPE = 1.5
TRAIN_MAX_DRAWDOWN_PCT = -15.0
TRAIN_MIN_WIN_RATE_PCT = 45.0
HOLDOUT_MIN_SHARPE = 1.2


@dataclass(frozen=True)
class Trade:
    entry_date: str
    exit_date: str | None
    direction: int
    days_held: int
    pnl: float
    exit_reason: str


@dataclass(frozen=True)
class WindowResult:
    start: str
    end: str
    total_return_pct: float
    annual_sharpe: float
    max_drawdown_pct: float
    win_rate_pct: float
    trade_count: int
    profit_factor: float
    capital_per_unit: float
    equity_dates: list[str]
    equity_values: list[float]
    trades: list[Trade]


def _daily_pnl(
    price1: np.ndarray,
    price2: np.ndarray,
    beta: float,
    lookback: int,
    cost_bps: float,
    borrow_bps_pa: float,
) -> tuple[np.ndarray, PositionPath, np.ndarray]:
    """The plan's pair_daily_pnl: (pnl, position path, gross_notional),
    all full-window arrays; the caller slices past the lookback."""
    spread = price1 - beta * price2
    z = rolling_z(spread, lookback)
    path = position_path(z, first_tradeable=lookback)
    position = path.position

    pnl = np.zeros(len(spread))
    pnl[1:] = position[:-1] * np.diff(spread)

    gross_notional = price1 + beta * price2
    traded_units = np.abs(np.diff(position, prepend=0.0))
    pnl -= traded_units * gross_notional * (cost_bps / 10_000)

    short_leg = np.where(
        position > 0, beta * price2, np.where(position < 0, price1, 0.0)
    )
    pnl[1:] -= short_leg[:-1] * (borrow_bps_pa / 10_000 / TRADING_DAYS_PER_YEAR)

    return pnl, path, gross_notional


def _trades(
    pnl: np.ndarray,
    position: np.ndarray,
    dates: list[str],
    close_reasons: dict[int, str],
) -> list[Trade]:
    """Round trips, the plan's accounting: a trade opens when the
    position leaves zero and closes when it returns there; its P&L is
    every day in between, entry and exit costs included."""
    trades: list[Trade] = []
    open_index: int | None = None
    for t in range(len(position)):
        if open_index is None and position[t] != 0:
            open_index = t
        elif open_index is not None and position[t] == 0:
            trades.append(
                Trade(
                    entry_date=dates[open_index],
                    exit_date=dates[t],
                    direction=int(np.sign(position[open_index])),
                    days_held=t - open_index,
                    pnl=float(pnl[open_index : t + 1].sum()),
                    exit_reason=close_reasons.get(t, EXIT_BAND),
                )
            )
            open_index = None
    if open_index is not None:
        last = len(position) - 1
        trades.append(
            Trade(
                entry_date=dates[open_index],
                exit_date=None,
                direction=int(np.sign(position[open_index])),
                days_held=last - open_index,
                pnl=float(pnl[open_index:].sum()),
                exit_reason=WINDOW_END,
            )
        )
    return trades


def _window_result(
    pnl: np.ndarray,
    position: np.ndarray,
    capital: float,
    dates: list[str],
    close_reasons: dict[int, str],
) -> WindowResult:
    equity = capital + np.cumsum(pnl)
    daily = pnl / capital
    sharpe = 0.0
    if daily.std() > 0:
        sharpe = float(daily.mean() / daily.std() * np.sqrt(TRADING_DAYS_PER_YEAR))
    running_max = np.maximum.accumulate(equity)
    max_drawdown = float(((equity - running_max) / running_max).min() * 100)
    trades = _trades(pnl, position, dates, close_reasons)
    wins = sum(1 for trade in trades if trade.pnl > 0)
    win_rate = wins / len(trades) * 100 if trades else 0.0
    gross_profit = sum(trade.pnl for trade in trades if trade.pnl > 0)
    gross_loss = abs(sum(trade.pnl for trade in trades if trade.pnl < 0))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0.0
    return WindowResult(
        start=dates[0],
        end=dates[-1],
        total_return_pct=float((equity[-1] / capital - 1) * 100),
        annual_sharpe=sharpe,
        max_drawdown_pct=max_drawdown,
        win_rate_pct=float(win_rate),
        trade_count=len(trades),
        profit_factor=float(profit_factor),
        capital_per_unit=float(capital),
        equity_dates=dates,
        equity_values=[float(value) for value in equity],
        trades=trades,
    )


def _run_window(
    frame: pd.DataFrame,
    beta: float,
    lookback: int,
    cost_bps: float,
    borrow_bps_pa: float,
) -> WindowResult:
    price1 = frame["price1"].to_numpy()
    price2 = frame["price2"].to_numpy()
    pnl, path, gross_notional = _daily_pnl(
        price1, price2, beta, lookback, cost_bps, borrow_bps_pa
    )
    capital = float(np.nanmean(gross_notional))
    dates = [index.date().isoformat() for index in frame.index]
    sliced_reasons = {
        t - lookback: reason for t, reason in path.close_reasons.items() if t >= lookback
    }
    return _window_result(
        pnl[lookback:], path.position[lookback:], capital, dates[lookback:], sliced_reasons
    )


@dataclass(frozen=True)
class PairBacktest:
    ticker1: str
    ticker2: str
    beta: float
    scan_p_value: float
    scan_half_life_days: float | None
    train: WindowResult
    holdout: WindowResult

    @property
    def gates(self) -> dict[str, bool]:
        return {
            "significance": self.scan_p_value < MAX_PRESELECTION_P_VALUE,
            "trainSharpe": self.train.annual_sharpe > TRAIN_MIN_SHARPE,
            "trainDrawdown": self.train.max_drawdown_pct > TRAIN_MAX_DRAWDOWN_PCT,
            "trainWinRate": self.train.win_rate_pct > TRAIN_MIN_WIN_RATE_PCT,
            "holdoutSharpe": self.holdout.annual_sharpe > HOLDOUT_MIN_SHARPE,
        }

    @property
    def selected(self) -> bool:
        return all(self.gates.values())


def backtest_pair(
    series1: pd.Series,
    series2: pd.Series,
    beta: float,
    split: pd.Timestamp,
    scan_p_value: float,
    scan_half_life_days: float | None,
    lookback: int = LOOKBACK_DAYS,
    cost_bps: float = COST_BPS_PER_SIDE,
    borrow_bps_pa: float = BORROW_BPS_PER_ANNUM,
) -> PairBacktest:
    """Train and holdout for one pair, the beta fixed on the training
    window riding unchanged into the holdout (the plan's one-shot rule)."""
    joined = align_pair(series1, series2)
    train_frame = joined[joined.index <= split]
    holdout_from = int(joined.index.searchsorted(split, side="right"))
    warm_frame = joined.iloc[max(holdout_from - lookback, 0) :]
    return PairBacktest(
        ticker1=str(series1.name),
        ticker2=str(series2.name),
        beta=beta,
        scan_p_value=scan_p_value,
        scan_half_life_days=scan_half_life_days,
        train=_run_window(train_frame, beta, lookback, cost_bps, borrow_bps_pa),
        holdout=_run_window(warm_frame, beta, lookback, cost_bps, borrow_bps_pa),
    )
