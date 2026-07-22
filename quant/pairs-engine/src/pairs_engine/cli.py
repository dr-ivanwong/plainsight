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

    args = parser.parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    raise SystemExit(main())
