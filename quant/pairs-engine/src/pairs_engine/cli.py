"""Operator commands: fetch the universe's closes, run the scan.

Both are operator-run on the operator's machine; nothing here is called
by the app or any serving path. The vendor key comes from the
environment only (EODHD_API_KEY); see docs/runbook.md for the
first-scan steps.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .artefacts import build_report, write_report
from .data import CloseStore, EodhdClient, MissingTickersError
from .research import MAX_P_VALUE, scan
from .universe import UNIVERSE
from .windows import TRAIN_FRACTION, freeze_split, union_calendar

DEFAULT_LOOKBACK_DAYS = 5 * 365


def _fetch(args: argparse.Namespace) -> int:
    import os

    api_key = os.environ.get("EODHD_API_KEY")
    if not api_key:
        print(
            "EODHD_API_KEY is not set; keys live in the environment only "
            "(see docs/runbook.md, the pairs first-scan section)",
            file=sys.stderr,
        )
        return 2
    end = date.fromisoformat(args.end) if args.end else date.today()
    start = date.fromisoformat(args.start) if args.start else end - timedelta(days=DEFAULT_LOOKBACK_DAYS)
    store = CloseStore(Path(args.data_dir))
    client = EodhdClient(api_key=api_key)
    try:
        closes = client.fetch_universe(UNIVERSE, start, end)
    except MissingTickersError as error:
        print(str(error), file=sys.stderr)
        return 1
    for ticker, series in closes.items():
        store.save(ticker, series)
        print(f"{ticker}: {len(series)} days cached")
    print(f"cached {len(closes)} tickers under {store.root}")
    return 0


def _scan(args: argparse.Namespace) -> int:
    store = CloseStore(Path(args.data_dir))
    closes = store.load_all()
    if not closes:
        print(f"no cached closes under {store.root}; run fetch first", file=sys.stderr)
        return 1
    calendar = union_calendar(closes)
    split = freeze_split(calendar)
    result = scan(closes, split)
    report = build_report(
        result,
        calendar=calendar,
        split=split,
        train_fraction=TRAIN_FRACTION,
        min_shared_train_days=500,
        generated_at=datetime.now(timezone.utc),
    )
    path = write_report(report, Path(args.out_dir))
    significant = sum(1 for pair in result.pairs if pair.p_value < MAX_P_VALUE)
    print(
        f"scanned {len(closes)} tickers: {report.pairs_tested} pairs tested, "
        f"{len(report.skipped)} skipped"
    )
    print(
        f"significant at the nominal threshold: {significant}; "
        f"candidates after the half-life and hedge-ratio gates: {len(report.candidates)}"
    )
    print(f"training window ends {report.window.split_date.isoformat()}; the holdout after it stays untouched")
    print(f"artefact: {path}")
    return 0


def _backtest(args: argparse.Namespace) -> int:
    import pandas as pd

    from .artefacts import PairScanReport, build_backtest_report, write_backtest_report
    from .backtest import backtest_pair
    from .publish import newest_artefact

    if args.scan:
        scan_path = Path(args.scan)
    else:
        found = newest_artefact(Path(args.out_dir), "pair-scan")
        if found is None:
            print(f"no pair-scan artefacts under {args.out_dir}; run scan first", file=sys.stderr)
            return 1
        scan_path = found
    scan_report = PairScanReport.model_validate_json(scan_path.read_text())
    store = CloseStore(Path(args.data_dir))
    split = pd.Timestamp(scan_report.window.split_date)
    stats_by_pair = {(row.ticker1, row.ticker2): row for row in scan_report.pairs}
    results = []
    for candidate in scan_report.candidates:
        stats = stats_by_pair[(candidate.ticker1, candidate.ticker2)]
        results.append(
            backtest_pair(
                store.load(candidate.ticker1),
                store.load(candidate.ticker2),
                beta=candidate.beta,
                split=split,
                scan_p_value=stats.p_value,
                scan_half_life_days=stats.half_life_days,
            )
        )
    report = build_backtest_report(results, scan_report, datetime.now(timezone.utc))
    path = write_backtest_report(report, Path(args.out_dir))
    selected = sum(1 for pair in report.pairs if pair.selected)
    print(
        f"backtested {len(report.pairs)} candidate pair(s) from scan {scan_report.run_date.isoformat()}: "
        f"{selected} selected by the stated gates"
    )
    print(
        "the holdout is spent once: iterate inside the training window only "
        "(pairs trading plan, Week 4)"
    )
    print(f"artefact: {path}")
    return 0


def _publish(args: argparse.Namespace) -> int:
    import os

    from .publish import DEFAULT_REGION, PublishConfig, PublishError, newest_artefact, publish_artefact

    missing = [
        name
        for name in ("PLAINSIGHT_API_URL", "PLAINSIGHT_COGNITO_CLIENT_ID", "PLAINSIGHT_COGNITO_REFRESH_TOKEN")
        if not os.environ.get(name)
    ]
    if missing:
        print(
            "missing " + ", ".join(missing) + "; publish credentials live in the "
            "environment only (see docs/runbook.md, the pairs publish step)",
            file=sys.stderr,
        )
        return 2
    if args.artefact:
        artefact_path = Path(args.artefact)
    else:
        found = newest_artefact(Path(args.out_dir), args.kind)
        if found is None:
            print(
                f"no {args.kind} artefacts under {args.out_dir}; run the engine first",
                file=sys.stderr,
            )
            return 1
        artefact_path = found
    config = PublishConfig(
        api_url=os.environ["PLAINSIGHT_API_URL"],
        client_id=os.environ["PLAINSIGHT_COGNITO_CLIENT_ID"],
        refresh_token=os.environ["PLAINSIGHT_COGNITO_REFRESH_TOKEN"],
        region=os.environ.get("PLAINSIGHT_AWS_REGION", DEFAULT_REGION),
    )
    try:
        stored = publish_artefact(artefact_path, config, kind=args.kind)
    except PublishError as error:
        print(str(error), file=sys.stderr)
        return 1
    print(f"published {artefact_path.name}: run {stored.get('runDate', '?')} stored")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pairs-engine")
    commands = parser.add_subparsers(dest="command", required=True)

    fetch = commands.add_parser("fetch", help="refresh the whole close window for the audited universe")
    fetch.add_argument("--start", help="first date, YYYY-MM-DD (default: five years before end)")
    fetch.add_argument("--end", help="last date, YYYY-MM-DD (default: today)")
    fetch.add_argument("--data-dir", default="data", help="close cache directory")
    fetch.set_defaults(run=_fetch)

    scan_cmd = commands.add_parser("scan", help="run the cointegration scan and write the artefact")
    scan_cmd.add_argument("--data-dir", default="data", help="close cache directory")
    scan_cmd.add_argument("--out-dir", default="artefacts", help="artefact output directory")
    scan_cmd.set_defaults(run=_scan)

    backtest_cmd = commands.add_parser(
        "backtest", help="backtest the scan's candidates: train window, then the one-shot holdout"
    )
    backtest_cmd.add_argument("--data-dir", default="data", help="close cache directory")
    backtest_cmd.add_argument("--out-dir", default="artefacts", help="artefact output directory")
    backtest_cmd.add_argument("--scan", help="scan artefact file (default: newest in the output directory)")
    backtest_cmd.set_defaults(run=_backtest)

    publish_cmd = commands.add_parser("publish", help="PUT the newest artefact of a kind to the app's API")
    publish_cmd.add_argument("--artefact", help="artefact file (default: newest of the kind in the output directory)")
    publish_cmd.add_argument("--out-dir", default="artefacts", help="artefact output directory")
    publish_cmd.add_argument("--kind", default="pair-scan", choices=["pair-scan", "backtest"], help="artefact kind")
    publish_cmd.set_defaults(run=_publish)

    args = parser.parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    raise SystemExit(main())
