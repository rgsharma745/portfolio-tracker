"""fixed_deposits constraints: the database refuses an FD a bank receipt could not show."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest

from lib.supabase_rest import SupabaseRest

from .conftest import AuthUser


@pytest.fixture
def portfolio(anon: SupabaseRest, user_a: AuthUser) -> Iterator[str]:
    resp = anon.insert("portfolios", {"name": "pytest-fd"}, token=user_a.token)
    assert resp.status_code == 201, resp.text
    pid = resp.json()[0]["id"]
    yield pid
    anon.delete("portfolios", token=user_a.token, id=f"eq.{pid}")  # cascades to fixed_deposits


def fd(portfolio: str, **overrides: Any) -> dict[str, Any]:
    return {
        "portfolio_id": portfolio, "bank": "SBI", "start_date": "2026-04-05",
        "maturity_date": "2027-04-05", "principal": 100000, "rate": 7.1, **overrides,
    }


def insert(anon: SupabaseRest, user: AuthUser, row: dict[str, Any]) -> Any:
    return anon.insert("fixed_deposits", row, token=user.token)


def test_an_fd_is_accepted_and_compounds_quarterly_by_default(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    resp = insert(anon, user_a, fd(portfolio))
    assert resp.status_code == 201, resp.text
    assert resp.json()[0]["compounding"] == "quarterly"
    for compounding in ("monthly", "half_yearly", "yearly", "payout"):
        assert insert(anon, user_a, fd(portfolio, compounding=compounding)).status_code == 201


@pytest.mark.parametrize("row", [
    pytest.param(lambda p: fd(p, principal=0), id="zero-principal"),
    pytest.param(lambda p: fd(p, principal=-100), id="negative-principal"),
    pytest.param(lambda p: fd(p, rate=0), id="zero-rate"),
    pytest.param(lambda p: fd(p, rate=100), id="rate-100"),
    pytest.param(lambda p: fd(p, maturity_date="2026-04-05"), id="matures-on-start"),
    pytest.param(lambda p: fd(p, maturity_date="2026-01-01"), id="matures-before-start"),
    pytest.param(lambda p: fd(p, compounding="weekly"), id="unknown-compounding"),
    pytest.param(lambda p: fd(p, bank="   "), id="blank-bank"),
    pytest.param(lambda p: fd(p, bank="x" * 61), id="long-bank"),
    pytest.param(lambda p: fd(p, start_date=None), id="no-start"),
])
def test_fds_a_bank_cannot_issue_are_refused(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str, row: Any
) -> None:
    assert insert(anon, user_a, row(portfolio)).status_code == 400
