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


def monthly(portfolio: str, **overrides: Any) -> dict[str, Any]:
    return {
        "portfolio_id": portfolio, "company": "Acme", "contribution_type": "monthly",
        "wage_month": "Mar", "wage_year": 2025, "transaction_date": "2025-04-08",
        "employee_amount": 1800, "employer_amount": 550, "pension_amount": 1250, **overrides,
    }


def interest(portfolio: str, **overrides: Any) -> dict[str, Any]:
    return {
        "portfolio_id": portfolio, "company": "Acme", "contribution_type": "interest",
        "wage_month": None, "wage_year": None, "transaction_date": "2025-08-20",
        "employee_amount": 12000.5, "employer_amount": 4100, "pension_amount": 0, **overrides,
    }


def insert(anon: SupabaseRest, user: AuthUser, row: dict[str, Any]) -> int:
    return anon.insert("pf_entries", row, token=user.token).status_code


def test_monthly_and_interest_rows_are_accepted(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, monthly(portfolio)) == 201
    assert insert(anon, user_a, interest(portfolio)) == 201
    # The next wage month, and the same wage month of another year
    assert insert(anon, user_a, monthly(portfolio, wage_month="Apr", transaction_date="2025-05-08")) == 201
    assert insert(anon, user_a, monthly(portfolio, wage_year=2026, transaction_date="2026-04-08")) == 201


def test_one_contribution_per_company_and_wage_month(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, monthly(portfolio)) == 201
    # Same wage month and year, credited on another date: refused
    assert insert(anon, user_a, monthly(portfolio, transaction_date="2025-04-30")) == 409
    # Another company, or the same company in another portfolio, is fine
    assert insert(anon, user_a, monthly(portfolio, company="Other Ltd")) == 201


def test_one_interest_per_company_and_financial_year(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str
) -> None:
    assert insert(anon, user_a, interest(portfolio, transaction_date="2025-04-01")) == 201
    # 31 March 2026 is still FY 2025-26
    assert insert(anon, user_a, interest(portfolio, transaction_date="2026-03-31")) == 409
    # 1 April 2026 starts FY 2026-27
    assert insert(anon, user_a, interest(portfolio, transaction_date="2026-04-01")) == 201


@pytest.mark.parametrize("row", [
    pytest.param(lambda p: monthly(p, wage_month=None), id="monthly-without-wage-month"),
    pytest.param(lambda p: monthly(p, wage_year=None), id="monthly-without-wage-year"),
    pytest.param(lambda p: monthly(p, wage_month="March"), id="wage-month-not-short-name"),
    pytest.param(lambda p: monthly(p, wage_year=1890), id="wage-year-out-of-range"),
    pytest.param(lambda p: interest(p, wage_month="Mar", wage_year=2025), id="interest-with-wage-month"),
    pytest.param(lambda p: interest(p, pension_amount=10), id="interest-with-pension"),
    pytest.param(lambda p: monthly(p, contribution_type="bonus"), id="unknown-type"),
    pytest.param(lambda p: monthly(p, employer_amount=-1), id="negative-amount"),
    pytest.param(lambda p: monthly(p, company="   "), id="blank-company"),
])
def test_rows_the_passbook_cannot_have_are_refused(
    anon: SupabaseRest, user_a: AuthUser, portfolio: str, row: Any
) -> None:
    assert insert(anon, user_a, row(portfolio)) == 400


def test_transaction_date_is_required(anon: SupabaseRest, user_a: AuthUser, portfolio: str) -> None:
    row = monthly(portfolio)
    del row["transaction_date"]
    assert insert(anon, user_a, row) == 400
