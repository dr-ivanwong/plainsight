"""The pair scan artefact: versioned JSON, camelCase on the wire.

This is the boundary where Python ends (docs/adr/0005). The models here
are the write-side half of the artefact contract; the read side lands in
the api-contract package as Zod schemas in the transport slice, and the
two are tested against each other there. Field names serialise camelCase
to match the app's wire conventions; floats are rounded to six decimals
at build time so a rerun over the same inputs writes identical bytes.
"""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Literal

import pandas as pd
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from . import ENGINE_VERSION
from .backtest import (
    BORROW_BPS_PER_ANNUM,
    COST_BPS_PER_SIDE,
    HOLDOUT_MIN_SHARPE,
    MAX_PRESELECTION_P_VALUE,
    TRAIN_MAX_DRAWDOWN_PCT,
    TRAIN_MIN_SHARPE,
    TRAIN_MIN_WIN_RATE_PCT,
    PairBacktest,
    WindowResult,
)
from .research import (
    HALF_LIFE_CEILING_DAYS,
    MAX_CANDIDATE_HALF_LIFE_DAYS,
    MAX_P_VALUE,
    MIN_ABS_REGRESSION_R,
    ScanResult,
)
from .signals import ENTRY_Z, EXIT_Z, LOOKBACK_DAYS, MAX_HOLD_DAYS, STOP_Z

SCHEMA_VERSION = 1
ARTEFACT_KIND = "pairScanReport"
BACKTEST_SCHEMA_VERSION = 1
BACKTEST_ARTEFACT_KIND = "backtestReport"


class WireModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class WindowSpec(WireModel):
    start: date
    end: date
    split_date: date
    train_fraction: float
    min_shared_train_days: int


class CriteriaSpec(WireModel):
    max_p_value: float
    max_candidate_half_life_days: float
    half_life_ceiling_days: float
    min_abs_regression_r: float
    require_positive_beta: bool


class PairRow(WireModel):
    ticker1: str
    ticker2: str
    shared_train_days: int
    p_value: float
    beta: float
    intercept: float
    correlation: float
    half_life_days: float | None
    half_life_valid: bool
    candidate: bool


class SkippedRow(WireModel):
    ticker1: str
    ticker2: str
    shared_train_days: int
    reason: str


class CandidateRow(WireModel):
    ticker1: str
    ticker2: str
    beta: float
    p_value: float
    half_life_days: float
    correlation: float


class PairScanReport(WireModel):
    artefact: Literal["pairScanReport"]
    schema_version: int
    engine_version: str
    run_date: date
    generated_at: datetime
    universe: list[str]
    window: WindowSpec
    criteria: CriteriaSpec
    pairs_tested: int
    pairs: list[PairRow]
    skipped: list[SkippedRow]
    candidates: list[CandidateRow]


def _rounded(value: float) -> float:
    return round(value, 6)


def build_report(
    result: ScanResult,
    calendar: list[pd.Timestamp],
    split: pd.Timestamp,
    train_fraction: float,
    min_shared_train_days: int,
    generated_at: datetime,
) -> PairScanReport:
    pairs = [
        PairRow(
            ticker1=stats.ticker1,
            ticker2=stats.ticker2,
            shared_train_days=stats.shared_train_days,
            p_value=_rounded(stats.p_value),
            beta=_rounded(stats.beta),
            intercept=_rounded(stats.intercept),
            correlation=_rounded(stats.correlation),
            half_life_days=None if stats.half_life_days is None else _rounded(stats.half_life_days),
            half_life_valid=stats.half_life_valid,
            candidate=stats.candidate,
        )
        for stats in result.pairs
    ]
    candidates = [
        CandidateRow(
            ticker1=stats.ticker1,
            ticker2=stats.ticker2,
            beta=_rounded(stats.beta),
            p_value=_rounded(stats.p_value),
            half_life_days=_rounded(stats.half_life_days or 0.0),
            correlation=_rounded(stats.correlation),
        )
        for stats in result.candidates
    ]
    skipped = [
        SkippedRow(
            ticker1=item.ticker1,
            ticker2=item.ticker2,
            shared_train_days=item.shared_train_days,
            reason=item.reason,
        )
        for item in result.skipped
    ]
    tickers = sorted({t for row in pairs for t in (row.ticker1, row.ticker2)}
                     | {t for row in skipped for t in (row.ticker1, row.ticker2)})
    return PairScanReport(
        artefact=ARTEFACT_KIND,
        schema_version=SCHEMA_VERSION,
        engine_version=ENGINE_VERSION,
        run_date=calendar[-1].date(),
        generated_at=generated_at,
        universe=tickers,
        window=WindowSpec(
            start=calendar[0].date(),
            end=calendar[-1].date(),
            split_date=split.date(),
            train_fraction=train_fraction,
            min_shared_train_days=min_shared_train_days,
        ),
        criteria=CriteriaSpec(
            max_p_value=MAX_P_VALUE,
            max_candidate_half_life_days=MAX_CANDIDATE_HALF_LIFE_DAYS,
            half_life_ceiling_days=HALF_LIFE_CEILING_DAYS,
            min_abs_regression_r=MIN_ABS_REGRESSION_R,
            require_positive_beta=True,
        ),
        pairs_tested=result.pairs_tested,
        pairs=pairs,
        skipped=skipped,
        candidates=candidates,
    )


def write_report(report: PairScanReport, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"pair-scan-{report.run_date.isoformat()}.json"
    path.write_text(report.model_dump_json(by_alias=True, indent=2) + "\n")
    return path


class BacktestSeries(WireModel):
    dates: list[date]
    values: list[float]

    def model_post_init(self, _context: object) -> None:
        if len(self.dates) != len(self.values):
            raise ValueError("equity dates and values must align one to one")


class BacktestTrade(WireModel):
    entry_date: date
    exit_date: date | None
    direction: int
    days_held: int
    pnl: float
    exit_reason: str


class BacktestWindowReport(WireModel):
    start: date
    end: date
    total_return_pct: float
    annual_sharpe: float
    max_drawdown_pct: float
    win_rate_pct: float
    trade_count: int
    profit_factor: float
    capital_per_unit: float
    equity: BacktestSeries
    trades: list[BacktestTrade]


class BacktestGates(WireModel):
    significance: bool
    train_sharpe: bool
    train_drawdown: bool
    train_win_rate: bool
    holdout_sharpe: bool


class BacktestPairReport(WireModel):
    ticker1: str
    ticker2: str
    beta: float
    scan_p_value: float
    scan_half_life_days: float | None
    train: BacktestWindowReport
    holdout: BacktestWindowReport
    gates: BacktestGates
    selected: bool


class BacktestWindowSpec(WireModel):
    start: date
    end: date
    split_date: date
    train_fraction: float


class BacktestAssumptions(WireModel):
    lookback_days: int
    entry_z: float
    exit_z: float
    stop_z: float
    max_hold_days: int
    cost_bps_per_side: float
    borrow_bps_per_annum: float


class BacktestCriteria(WireModel):
    max_preselection_p_value: float
    train_min_sharpe: float
    train_max_drawdown_pct: float
    train_min_win_rate_pct: float
    holdout_min_sharpe: float


class BacktestReport(WireModel):
    artefact: Literal["backtestReport"]
    schema_version: int
    engine_version: str
    run_date: date
    generated_at: datetime
    scan_run_date: date
    window: BacktestWindowSpec
    assumptions: BacktestAssumptions
    criteria: BacktestCriteria
    pairs: list[BacktestPairReport]


def _window_report(result: WindowResult) -> BacktestWindowReport:
    return BacktestWindowReport(
        start=date.fromisoformat(result.start),
        end=date.fromisoformat(result.end),
        total_return_pct=_rounded(result.total_return_pct),
        annual_sharpe=_rounded(result.annual_sharpe),
        max_drawdown_pct=_rounded(result.max_drawdown_pct),
        win_rate_pct=_rounded(result.win_rate_pct),
        trade_count=result.trade_count,
        profit_factor=_rounded(result.profit_factor),
        capital_per_unit=_rounded(result.capital_per_unit),
        equity=BacktestSeries(
            dates=[date.fromisoformat(value) for value in result.equity_dates],
            values=[round(value, 4) for value in result.equity_values],
        ),
        trades=[
            BacktestTrade(
                entry_date=date.fromisoformat(trade.entry_date),
                exit_date=None if trade.exit_date is None else date.fromisoformat(trade.exit_date),
                direction=trade.direction,
                days_held=trade.days_held,
                pnl=round(trade.pnl, 4),
                exit_reason=trade.exit_reason,
            )
            for trade in result.trades
        ],
    )


def build_backtest_report(
    results: list[PairBacktest],
    scan: PairScanReport,
    generated_at: datetime,
) -> BacktestReport:
    pairs = [
        BacktestPairReport(
            ticker1=result.ticker1,
            ticker2=result.ticker2,
            beta=_rounded(result.beta),
            scan_p_value=_rounded(result.scan_p_value),
            scan_half_life_days=None
            if result.scan_half_life_days is None
            else _rounded(result.scan_half_life_days),
            train=_window_report(result.train),
            holdout=_window_report(result.holdout),
            gates=BacktestGates(
                significance=result.gates["significance"],
                train_sharpe=result.gates["trainSharpe"],
                train_drawdown=result.gates["trainDrawdown"],
                train_win_rate=result.gates["trainWinRate"],
                holdout_sharpe=result.gates["holdoutSharpe"],
            ),
            selected=result.selected,
        )
        for result in results
    ]
    return BacktestReport(
        artefact=BACKTEST_ARTEFACT_KIND,
        schema_version=BACKTEST_SCHEMA_VERSION,
        engine_version=ENGINE_VERSION,
        run_date=scan.run_date,
        generated_at=generated_at,
        scan_run_date=scan.run_date,
        window=BacktestWindowSpec(
            start=scan.window.start,
            end=scan.window.end,
            split_date=scan.window.split_date,
            train_fraction=scan.window.train_fraction,
        ),
        assumptions=BacktestAssumptions(
            lookback_days=LOOKBACK_DAYS,
            entry_z=ENTRY_Z,
            exit_z=EXIT_Z,
            stop_z=STOP_Z,
            max_hold_days=MAX_HOLD_DAYS,
            cost_bps_per_side=COST_BPS_PER_SIDE,
            borrow_bps_per_annum=BORROW_BPS_PER_ANNUM,
        ),
        criteria=BacktestCriteria(
            max_preselection_p_value=MAX_PRESELECTION_P_VALUE,
            train_min_sharpe=TRAIN_MIN_SHARPE,
            train_max_drawdown_pct=TRAIN_MAX_DRAWDOWN_PCT,
            train_min_win_rate_pct=TRAIN_MIN_WIN_RATE_PCT,
            holdout_min_sharpe=HOLDOUT_MIN_SHARPE,
        ),
        pairs=pairs,
    )


def write_backtest_report(report: BacktestReport, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"backtest-{report.run_date.isoformat()}.json"
    path.write_text(report.model_dump_json(by_alias=True, indent=2) + "\n")
    return path
