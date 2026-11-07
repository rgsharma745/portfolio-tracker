"""pf_entries constraints: the database refuses rows the PF passbook could not contain."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest

from lib.supabase_rest import SupabaseRest

from .conftest import AuthUser


@pytest.fixture
def portfolio(anon: SupabaseRest, user_a: AuthUser) -> Iterator[str]:
    resp = anon.insert("portfolios", {"name": "pytest-pf"}, token=user_a.token)
    assert resp.status_code == 201, resp.text
    pid = resp.json()[0]["id"]
    yield pid
    anon.delete("portfolios", token=user_a.token, id=f"eq.{pid}")  # cascades to pf_entries


def entry(portfolio: str, **overrides: Any) -> dict[str, Any]:
    return {
        "portfolio_id": portfolio, "company": "Acme", "wage_month": "2026-10-01",
        "contribution_type": "monthly", "employee_amount": 1800, "employer_amount": 550,
        "pension_amount": 1250, **overrides,
    }


def insert(anon: SupabaseRest, user: AuthUser, row: dict[str, Any]) -> int:
    return anon.insert("pf_entries", row, token=user.token).status_code


def test_monthly_and_interest_rows_are_accepted(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, entry(portfolio)) == 201
    interest = entry(portfolio, contribution_type="interest", wage_month="2026-03-01",
                     employee_amount=12000.5, employer_amount=4100, pension_amount=0)
    assert insert(anon, user_a, interest) == 201
    # Interest and the monthly contribution can share a March.
    assert insert(anon, user_a, entry(portfolio, wage_month="2026-03-01")) == 201


def test_same_company_month_and_type_only_once(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, entry(portfolio)) == 201
    assert insert(anon, user_a, entry(portfolio, employee_amount=1)) == 409
    # Another company in the same month is fine.
    assert insert(anon, user_a, entry(portfolio, company="Other Ltd")) == 201


def test_wage_month_may_be_any_day_but_counts_by_calendar_month(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, entry(portfolio, wage_month="2026-10-31")) == 201
    # Same company and month on another day: still the same month's contribution.
    assert insert(anon, user_a, entry(portfolio, wage_month="2026-10-01")) == 409
    assert insert(anon, user_a, entry(portfolio, wage_month="2026-11-15")) == 201
    # Interest is counted by month too, and does not clash with that month's contribution.
    interest = {"contribution_type": "interest", "pension_amount": 0}
    assert insert(anon, user_a, entry(portfolio, wage_month="2026-03-31", **interest)) == 201
    assert insert(anon, user_a, entry(portfolio, wage_month="2026-03-01", **interest)) == 409
    assert insert(anon, user_a, entry(portfolio, wage_month="2026-03-10")) == 201


@pytest.mark.parametrize("overrides", [
    pytest.param({"contribution_type": "interest", "wage_month": "2026-04-01",
                  "pension_amount": 0}, id="interest-not-in-march"),
    pytest.param({"contribution_type": "interest", "wage_month": "2026-03-01"},
                 id="interest-with-pension"),
    pytest.param({"contribution_type": "bonus"}, id="unknown-type"),
    pytest.param({"employer_amount": -1}, id="negative-amount"),
    pytest.param({"company": "   "}, id="blank-company"),
])
def test_rows_the_passbook_cannot_have_are_refused(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str, overrides: dict[str, Any]
) -> None:
    assert insert(anon, user_a, entry(portfolio, **overrides)) == 400
