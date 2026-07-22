import json
from datetime import datetime, timezone

import numpy as np

from pairs_engine import ENGINE_VERSION
from pairs_engine.artefacts import build_report, write_report
from pairs_engine.research import scan
from pairs_engine.windows import TRAIN_FRACTION, freeze_split, union_calendar

from conftest import cointegrated_pair, make_series

FIXED_NOW = datetime(2026, 7, 22, 9, 30, 0, tzinfo=timezone.utc)


def small_report():
    rng = np.random.default_rng(7)
    price1, price2 = cointegrated_pair(rng, 800)
    closes = {"AAA": make_series(price1, name="AAA"), "BBB": make_series(price2, name="BBB")}
    calendar = union_calendar(closes)
    split = freeze_split(calendar)
    result = scan(closes, split)
    return build_report(
        result,
        calendar=calendar,
        split=split,
        train_fraction=TRAIN_FRACTION,
        min_shared_train_days=500,
        generated_at=FIXED_NOW,
    )


def test_report_serialises_camel_case_with_version_and_provenance(tmp_path):
    report = small_report()
    path = write_report(report, tmp_path)
    assert path.name == f"pair-scan-{report.run_date.isoformat()}.json"

    parsed = json.loads(path.read_text())
    assert parsed["artefact"] == "pairScanReport"
    assert parsed["schemaVersion"] == 1
    assert parsed["engineVersion"] == ENGINE_VERSION
    assert parsed["runDate"] == report.window.end.isoformat()
    assert parsed["universe"] == ["AAA", "BBB"]
    assert parsed["window"]["splitDate"] == report.window.split_date.isoformat()
    assert parsed["criteria"]["requirePositiveBeta"] is True
    assert parsed["pairsTested"] == 1

    row = parsed["pairs"][0]
    for key in (
        "ticker1",
        "ticker2",
        "sharedTrainDays",
        "pValue",
        "beta",
        "intercept",
        "correlation",
        "halfLifeDays",
        "halfLifeValid",
        "candidate",
    ):
        assert key in row
    assert row["beta"] == round(row["beta"], 6)

    candidate = parsed["candidates"][0]
    assert {candidate["ticker1"], candidate["ticker2"]} == {"AAA", "BBB"}


def test_same_inputs_write_identical_bytes(tmp_path):
    first = write_report(small_report(), tmp_path / "one")
    second = write_report(small_report(), tmp_path / "two")
    assert first.read_bytes() == second.read_bytes()
