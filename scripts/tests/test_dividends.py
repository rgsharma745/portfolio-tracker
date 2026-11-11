"""dividends constraints: the database refuses rows a dividend credit could not be."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest

from lib.supabase_rest import SupabaseRest

from .conftest import AuthUser


@pytest.fixture
def portfolio(anon: SupabaseRest, user_a: AuthUser) -> Iterator[str]:
    resp = anon.insert("portfolios", {"name": "pytest-dividends"}, token=user_a.token)
    assert resp.status_code == 201, resp.text
    pid = resp.json()[0]["id"]
    yield pid
    anon.delete("portfolios", token=user_a.token, id=f"eq.{pid}")  # cascades to dividends


def indian(portfolio: str, **overrides: Any) -> dict[str, Any]:
    return {
        "portfolio_id": portfolio, "market": "IN", "symbol": "ITC", "paid_on": "2025-06-11",
        "amount_inr": 1250.5, **overrides,
    }


def us(portfolio: str, **overrides: Any) -> dict[str, Any]:
    return indian(portfolio, **{"market": "US", "symbol": "MSFT", "amount_inr": 6890,
                                "amount_usd": 82.4, **overrides})


def insert(anon: SupabaseRest, user: AuthUser, row: dict[str, Any]) -> int:
    return anon.insert("dividends", row, token=user.token).status_code


def test_indian_and_us_dividends_are_accepted(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, indian(portfolio)) == 201
    # The same symbol can pay twice on one day (interim and special)
    assert insert(anon, user_a, indian(portfolio)) == 201
    assert insert(anon, user_a, us(portfolio)) == 201


@pytest.mark.parametrize("row", [
    pytest.param(lambda p: indian(p, amount_inr=0), id="zero-amount"),
    pytest.param(lambda p: indian(p, amount_inr=-5), id="negative-amount"),
    pytest.param(lambda p: indian(p, amount_inr=None), id="no-inr"),
    pytest.param(lambda p: indian(p, amount_usd=10), id="usd-on-indian"),
    pytest.param(lambda p: us(p, amount_usd=None), id="us-without-usd"),
    pytest.param(lambda p: us(p, amount_usd=0), id="zero-usd"),
    pytest.param(lambda p: indian(p, market="UK"), id="unknown-market"),
    pytest.param(lambda p: indian(p, symbol="itc"), id="lower-case-symbol"),
    pytest.param(lambda p: indian(p, symbol=" ITC"), id="padded-symbol"),
    pytest.param(lambda p: indian(p, symbol=""), id="blank-symbol"),
    pytest.param(lambda p: indian(p, symbol="X" * 21), id="long-symbol"),
    pytest.param(lambda p: indian(p, paid_on=None), id="no-date"),
])
def test_rows_a_dividend_cannot_be_are_refused(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str, row: Any
) -> None:
    assert insert(anon, user_a, row(portfolio)) == 400
