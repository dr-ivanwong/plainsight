import numpy as np
import pandas as pd
import pytest

from pairs_engine.windows import align_pair, freeze_split, union_calendar

from conftest import make_series


def test_union_calendar_merges_and_sorts_different_listing_calendars():
    first = make_series(np.arange(5.0), start="2021-01-04")
    second = make_series(np.arange(5.0), start="2021-01-06")
    calendar = union_calendar({"AAA": first, "BBB": second})
    assert calendar == sorted(set(first.index) | set(second.index))
    assert len(calendar) == 7


def test_freeze_split_takes_the_calendar_element_at_the_train_fraction():
    series = make_series(np.arange(10.0))
    calendar = union_calendar({"AAA": series})
    split = freeze_split(calendar, train_fraction=0.8)
    assert split == calendar[8]
    train = [d for d in calendar if d <= split]
    assert len(train) == 9


def test_freeze_split_refuses_an_empty_calendar():
    with pytest.raises(ValueError):
        freeze_split([])


def test_align_pair_inner_joins_on_shared_dates_and_drops_gaps():
    first = make_series(np.arange(6.0), start="2021-01-04")
    second = make_series(np.arange(6.0), start="2021-01-06")
    second.iloc[1] = np.nan
    joined = align_pair(first, second)
    assert list(joined.columns) == ["price1", "price2"]
    assert len(joined) == 3
    assert joined.index.isin(first.index).all()
    assert joined.index.isin(second.index).all()
