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
from .research import (
    HALF_LIFE_CEILING_DAYS,
    MAX_CANDIDATE_HALF_LIFE_DAYS,
    MAX_P_VALUE,
    MIN_ABS_REGRESSION_R,
    ScanResult,
)

SCHEMA_VERSION = 1
ARTEFACT_KIND = "pairScanReport"


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
