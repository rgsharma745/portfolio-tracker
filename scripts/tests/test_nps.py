"""nps_holdings and nps_contributions constraints: rows an NPS statement could not contain."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest

from lib.supabase_rest import SupabaseRest

from .conftest import AuthUser


@pytest.fixture
def portfolio(anon: SupabaseRest, user_a: AuthUser) -> Iterator[str]:
    resp = anon.insert("portfolios", {"name": "pytest-nps"}, token=user_a.token)
    assert resp.status_code == 201, resp.text
    pid = resp.json()[0]["id"]
    yield pid
    anon.delete("portfolios", token=user_a.token, id=f"eq.{pid}")  # cascades to the NPS rows


def holding(portfolio: str, **overrides: Any) -> dict[str, Any]:
    return {
        "portfolio_id": portfolio, "account": "Rahul PRAN", "scheme_class": "E",
        "scheme_code": "SM008001", "scheme_name": "HDFC Pension Fund Scheme E Tier I",
        "units": 1234.5678, "units_as_of": "2026-10-31", **overrides,
    }


def contribution(portfolio: str, **overrides: Any) -> dict[str, Any]:
    return {
        "portfolio_id": portfolio, "account": "Rahul PRAN", "contribution_date": "2026-04-05",
        "contributor": "self", "amount": 5000, **overrides,
    }


def insert(anon: SupabaseRest, user: AuthUser, table: str, row: dict[str, Any]) -> int:
    return anon.insert(table, row, token=user.token).status_code


def test_one_row_per_scheme_class_and_account(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, "nps_holdings", holding(portfolio)) == 201
    for cls, code in (("C", "SM008002"), ("G", "SM008003"), ("A", None)):
        row = holding(portfolio, scheme_class=cls, scheme_code=code, scheme_name=f"Scheme {cls}")
        assert insert(anon, user_a, "nps_holdings", row) == 201
    assert insert(anon, user_a, "nps_holdings", holding(portfolio, units=1)) == 409
    assert insert(anon, user_a, "nps_holdings", holding(portfolio, account="Wife PRAN")) == 201


def test_self_and_employer_contributions_are_accepted(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, "nps_contributions", contribution(portfolio)) == 201
    # The same day, contributor and amount twice is fine (two separate credits)
    assert insert(anon, user_a, "nps_contributions", contribution(portfolio)) == 201
    row = contribution(portfolio, contributor="employer", amount=8123.45)
    assert insert(anon, user_a, "nps_contributions", row) == 201


@pytest.mark.parametrize("row", [
    pytest.param(lambda p: holding(p, scheme_class="X"), id="unknown-class"),
    pytest.param(lambda p: holding(p, units=-1), id="negative-units"),
    pytest.param(lambda p: holding(p, account="  "), id="blank-account"),
    pytest.param(lambda p: holding(p, scheme_name=" "), id="blank-name"),
    pytest.param(lambda p: holding(p, scheme_code=" "), id="blank-code"),
])
def test_bad_holdings_are_refused(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str, row: Any
) -> None:
    assert insert(anon, user_a, "nps_holdings", row(portfolio)) == 400


@pytest.mark.parametrize("row", [
    pytest.param(lambda p: contribution(p, amount=0), id="zero-amount"),
    pytest.param(lambda p: contribution(p, amount=-5), id="negative-amount"),
    pytest.param(lambda p: contribution(p, contributor="government"), id="unknown-contributor"),
    pytest.param(lambda p: contribution(p, account="x" * 101), id="long-account"),
    pytest.param(lambda p: contribution(p, contribution_date=None), id="no-date"),
])
def test_bad_contributions_are_refused(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str, row: Any
) -> None:
    assert insert(anon, user_a, "nps_contributions", row(portfolio)) == 400
