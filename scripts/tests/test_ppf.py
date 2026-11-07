"""ppf_entries constraints: the database refuses rows a PPF passbook could not contain."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest

from lib.supabase_rest import SupabaseRest

from .conftest import AuthUser


@pytest.fixture
def portfolio(anon: SupabaseRest, user_a: AuthUser) -> Iterator[str]:
    resp = anon.insert("portfolios", {"name": "pytest-ppf"}, token=user_a.token)
    assert resp.status_code == 201, resp.text
    pid = resp.json()[0]["id"]
    yield pid
    anon.delete("portfolios", token=user_a.token, id=f"eq.{pid}")  # cascades to ppf_entries


def entry(portfolio: str, **overrides: Any) -> dict[str, Any]:
    return {
        "portfolio_id": portfolio, "account": "SBI PPF", "entry_type": "investment",
        "entry_date": "2025-04-05", "amount": 150000, **overrides,
    }


def interest(portfolio: str, **overrides: Any) -> dict[str, Any]:
    return entry(portfolio, **{"entry_type": "interest", "entry_date": "2026-03-31",
                               "amount": 10650.5, **overrides})


def insert(anon: SupabaseRest, user: AuthUser, row: dict[str, Any]) -> int:
    return anon.insert("ppf_entries", row, token=user.token).status_code


def test_investments_and_interest_are_accepted(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, entry(portfolio)) == 201
    # Several deposits in one financial year are fine, even over the yearly limit (shown, not enforced)
    assert insert(anon, user_a, entry(portfolio, entry_date="2025-06-01", amount=500)) == 201
    assert insert(anon, user_a, interest(portfolio)) == 201


def test_one_interest_per_account_and_financial_year(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, interest(portfolio, entry_date="2025-04-01")) == 201
    # 31 March 2026 is still FY 2025-26
    assert insert(anon, user_a, interest(portfolio, entry_date="2026-03-31")) == 409
    # 1 April 2026 starts FY 2026-27
    assert insert(anon, user_a, interest(portfolio, entry_date="2026-04-01")) == 201
    # Another account in the same year is fine
    assert insert(anon, user_a, interest(portfolio, account="Post office PPF")) == 201


@pytest.mark.parametrize("row", [
    pytest.param(lambda p: entry(p, amount=0), id="zero-amount"),
    pytest.param(lambda p: entry(p, amount=-100), id="negative-amount"),
    pytest.param(lambda p: entry(p, entry_type="withdrawal"), id="unknown-type"),
    pytest.param(lambda p: entry(p, account="   "), id="blank-account"),
    pytest.param(lambda p: entry(p, account="x" * 101), id="long-account"),
    pytest.param(lambda p: entry(p, entry_date=None), id="no-date"),
])
def test_rows_a_passbook_cannot_have_are_refused(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str, row: Any
) -> None:
    assert insert(anon, user_a, row(portfolio)) == 400
