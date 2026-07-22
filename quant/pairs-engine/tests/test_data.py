from datetime import date

import httpx
import numpy as np
import pytest

from pairs_engine.data import CloseStore, EodhdClient, MissingTickersError

from conftest import make_series, random_walk

START = date(2021, 1, 4)
END = date(2021, 1, 8)


def rows_for(prices):
    days = ["2021-01-06", "2021-01-04", "2021-01-05"]
    return [
        {"date": day, "close": price, "adjusted_close": price + 0.5}
        for day, price in zip(days, prices)
    ]


def make_client(handler):
    transport = httpx.MockTransport(handler)
    return EodhdClient(api_key="test-key", transport=transport, pause_seconds=0)


def test_adjusted_closes_parses_sorts_and_uses_the_adjusted_column():
    def handler(request):
        assert request.url.path == "/api/eod/AAA.AU"
        assert request.url.params["api_token"] == "test-key"
        assert request.url.params["from"] == START.isoformat()
        assert request.url.params["to"] == END.isoformat()
        return httpx.Response(200, json=rows_for([3.0, 1.0, 2.0]))

    series = make_client(handler).adjusted_closes("AAA", START, END)
    assert series.name == "AAA"
    assert list(series.index.strftime("%Y-%m-%d")) == ["2021-01-04", "2021-01-05", "2021-01-06"]
    assert list(series.values) == [1.5, 2.5, 3.5]


def test_duplicate_dates_keep_the_last_row():
    def handler(request):
        rows = rows_for([3.0, 1.0, 2.0]) + [
            {"date": "2021-01-06", "close": 9.0, "adjusted_close": 9.5}
        ]
        return httpx.Response(200, json=rows)

    series = make_client(handler).adjusted_closes("AAA", START, END)
    assert len(series) == 3
    assert series.iloc[-1] == 9.5


def test_fetch_universe_aborts_listing_every_missing_ticker():
    def handler(request):
        if "BBB" in request.url.path:
            return httpx.Response(404, json={"error": "unknown"})
        if "CCC" in request.url.path:
            return httpx.Response(200, json=[])
        return httpx.Response(200, json=rows_for([3.0, 1.0, 2.0]))

    client = make_client(handler)
    with pytest.raises(MissingTickersError) as excinfo:
        client.fetch_universe(("AAA", "BBB", "CCC"), START, END)
    assert set(excinfo.value.failures) == {"BBB", "CCC"}
    assert "BBB" in str(excinfo.value)
    assert "CCC" in str(excinfo.value)


def test_close_store_round_trips_a_series(tmp_path):
    store = CloseStore(tmp_path)
    rng = np.random.default_rng(1)
    series = make_series(random_walk(rng, 10), name="AAA")
    store.save("AAA", series)
    loaded = store.load("AAA")
    assert list(loaded.index) == list(series.index)
    assert np.allclose(loaded.values, series.values)


def test_save_replaces_the_whole_window_never_appends(tmp_path):
    store = CloseStore(tmp_path)
    rng = np.random.default_rng(2)
    long_series = make_series(random_walk(rng, 20), name="AAA")
    short_series = make_series(random_walk(rng, 5), start="2022-01-03", name="AAA")
    store.save("AAA", long_series)
    store.save("AAA", short_series)
    loaded = store.load("AAA")
    assert len(loaded) == 5
    assert list(loaded.index) == list(short_series.index)


def test_load_all_finds_every_cached_ticker(tmp_path):
    store = CloseStore(tmp_path)
    rng = np.random.default_rng(3)
    store.save("BBB", make_series(random_walk(rng, 5), name="BBB"))
    store.save("AAA", make_series(random_walk(rng, 5), name="AAA"))
    closes = store.load_all()
    assert list(closes) == ["AAA", "BBB"]
