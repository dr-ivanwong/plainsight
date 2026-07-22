"""EOD price data: fetch, cache, refresh.

Adjusted closes, always: raw prices drop on every ex-dividend date,
which manufactures fake mean reversion in a backtest and fake signals
live (pairs trading plan, Week 1). The refresh rule is whole-window
replacement, never append: adjustment factors move on every ex-date, so
an appended raw close silently mixes two series (pairs trading plan,
the live system's data note).

The vendor key lives in the environment only, per the house secrets
rule; nothing here reads a config file or stores a credential.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import httpx
import pandas as pd

EODHD_BASE_URL = "https://eodhd.com/api"
ASX_SUFFIX = ".AU"


class MissingTickersError(RuntimeError):
    """The scan universe is sacrosanct: a downloader that skips failures
    quietly shrinks it (pairs trading plan, the universe audit), so any
    missing ticker aborts the fetch loudly, all failures listed."""

    def __init__(self, failures: dict[str, str]):
        self.failures = dict(sorted(failures.items()))
        detail = "; ".join(f"{ticker}: {reason}" for ticker, reason in self.failures.items())
        super().__init__(f"no data for {len(self.failures)} ticker(s): {detail}")


@dataclass(frozen=True)
class EodhdClient:
    """Minimal client for the vendor's end-of-day endpoint. Tests inject
    an httpx mock transport; production passes none and talks HTTP."""

    api_key: str
    transport: httpx.BaseTransport | None = None
    pause_seconds: float = 0.2

    def adjusted_closes(self, ticker: str, start: date, end: date) -> pd.Series:
        with httpx.Client(base_url=EODHD_BASE_URL, transport=self.transport, timeout=30.0) as client:
            response = client.get(
                f"/eod/{ticker}{ASX_SUFFIX}",
                params={
                    "api_token": self.api_key,
                    "period": "d",
                    "fmt": "json",
                    "from": start.isoformat(),
                    "to": end.isoformat(),
                },
            )
            response.raise_for_status()
            rows = response.json()
        if not rows:
            return pd.Series(dtype=float, name=ticker)
        frame = pd.DataFrame(rows)
        frame["date"] = pd.to_datetime(frame["date"])
        series = (
            frame.set_index("date")["adjusted_close"]
            .astype(float)
            .dropna()
            .sort_index()
        )
        series = series[~series.index.duplicated(keep="last")]
        series.name = ticker
        return series

    def fetch_universe(
        self, tickers: tuple[str, ...], start: date, end: date
    ) -> dict[str, pd.Series]:
        closes: dict[str, pd.Series] = {}
        failures: dict[str, str] = {}
        for ticker in tickers:
            try:
                series = self.adjusted_closes(ticker, start, end)
            except httpx.HTTPError as error:
                failures[ticker] = str(error)
            else:
                if series.empty:
                    failures[ticker] = "empty response"
                else:
                    closes[ticker] = series
            if self.pause_seconds:
                time.sleep(self.pause_seconds)
        if failures:
            raise MissingTickersError(failures)
        return closes


@dataclass(frozen=True)
class CloseStore:
    """Per-ticker CSV cache of adjusted closes under one directory.

    Saving replaces the whole file: the refresh rule above means a fetch
    always supersedes everything previously cached for that ticker.
    """

    root: Path = field(default_factory=lambda: Path("data"))

    def path_for(self, ticker: str) -> Path:
        return self.root / f"{ticker}.csv"

    def save(self, ticker: str, series: pd.Series) -> Path:
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.path_for(ticker)
        frame = series.rename("adjustedClose").rename_axis("date").reset_index()
        frame["date"] = frame["date"].dt.date
        frame.to_csv(path, index=False)
        return path

    def load(self, ticker: str) -> pd.Series:
        frame = pd.read_csv(self.path_for(ticker), parse_dates=["date"])
        series = frame.set_index("date")["adjustedClose"].astype(float).sort_index()
        series.name = ticker
        return series

    def load_all(self) -> dict[str, pd.Series]:
        closes: dict[str, pd.Series] = {}
        for path in sorted(self.root.glob("*.csv")):
            ticker = path.stem
            closes[ticker] = self.load(ticker)
        return closes
