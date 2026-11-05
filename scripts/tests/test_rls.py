"""Row Level Security and privileges.

User A seeds one row in every owner table; user B (a second login) must not see or change any
of it, through tables or views. Anonymous callers get nothing at all.
"""

from __future__ import annotations

from typing import Any

import pytest

from lib.supabase_rest import SupabaseRest

from .conftest import AuthUser

OWNER_TABLES = [
    "portfolios", "mf_holdings", "stock_holdings", "rsu_grants", "savings_accounts",
    "credit_cards", "card_bills", "portfolio_snapshots", "settings",
]
MARKET_TABLES = ["mf_nav_latest", "stock_price_latest", "fx_latest", "job_runs", "job_triggers"]
VIEWS = ["v_mf_holdings", "v_stock_holdings", "v_card_bills"]


def insert_ok(api: SupabaseRest, token: str, table: str, values: dict[str, Any]) -> dict[str, Any]:
    resp = api.insert(table, values, token=token)
    assert resp.status_code == 201, f"{table}: {resp.status_code} {resp.text}"
    return resp.json()[0]


@pytest.fixture(scope="module")
def seeded(anon: SupabaseRest, user_a: AuthUser) -> dict[str, str]:
    """One row per owner table, created by user A through the normal API (owner_id defaults)."""
    t = user_a.token
    p = insert_ok(anon, t, "portfolios", {"name": "pytest-A"})["id"]
    ids = {"portfolios": p}
    ids["mf_holdings"] = insert_ok(anon, t, "mf_holdings", {
        "portfolio_id": p, "scheme_code": "pytest-0", "scheme_name": "Fund", "units": 1, "invested": 10,
    })["id"]
    ids["stock_holdings"] = insert_ok(anon, t, "stock_holdings", {
        "portfolio_id": p, "symbol": "PYTEST", "quantity": 1, "invested": 10,
    })["id"]
    ids["rsu_grants"] = insert_ok(anon, t, "rsu_grants", {
        "portfolio_id": p, "symbol": "PYTEST", "grant_label": "G1", "units_granted": 10,
    })["id"]
    ids["savings_accounts"] = insert_ok(anon, t, "savings_accounts", {
        "portfolio_id": p, "bank": "Bank", "balance": 100,
    })["id"]
    card = insert_ok(anon, t, "credit_cards", {
        "portfolio_id": p, "name": "pytest-card", "bill_day": 14, "due_day": 3,
    })["id"]
    ids["credit_cards"] = card
    ids["card_bills"] = insert_ok(anon, t, "card_bills", {
        "card_id": card, "statement_month": "2026-10-01", "due_date": "2026-11-03", "amount": 500,
    })["id"]
    ids["portfolio_snapshots"] = insert_ok(anon, t, "portfolio_snapshots", {
        "portfolio_id": p, "snap_date": "2026-10-31", "mf_value": 10,
    })["id"]
    ids["settings"] = insert_ok(anon, t, "settings", {"key": "pytest", "value": {"a": 1}})["id"]
    return ids


@pytest.mark.parametrize("relation", OWNER_TABLES + MARKET_TABLES + VIEWS)
def test_anon_cannot_read(anon: SupabaseRest, relation: str, seeded: dict[str, str]) -> None:
    resp = anon.select(relation)
    assert resp.status_code != 200 or resp.json() == [], f"{relation}: {resp.text}"


@pytest.mark.parametrize("table", OWNER_TABLES + MARKET_TABLES)
def test_anon_has_no_table_privileges(anon: SupabaseRest, table: str) -> None:
    # With "auto expose" off and explicit revokes, anon is refused before RLS is even consulted.
    assert anon.select(table).status_code in (401, 403)


def test_anon_cannot_insert(anon: SupabaseRest) -> None:
    assert anon.insert("portfolios", {"name": "pytest-anon"}).status_code in (401, 403)


@pytest.mark.parametrize("relation", OWNER_TABLES + VIEWS)
def test_owner_sees_own_rows(
    anon: SupabaseRest, user_a: AuthUser, relation: str, seeded: dict[str, str]
) -> None:
    resp = anon.select(relation, token=user_a.token)
    assert resp.status_code == 200 and len(resp.json()) == 1, f"{relation}: {resp.text}"


@pytest.mark.parametrize("relation", OWNER_TABLES + VIEWS)
def test_other_user_sees_nothing(
    anon: SupabaseRest, user_b: AuthUser, relation: str, seeded: dict[str, str]
) -> None:
    # Views pass this only because they use security_invoker = true.
    resp = anon.select(relation, token=user_b.token)
    assert resp.status_code == 200 and resp.json() == [], f"{relation}: {resp.text}"


@pytest.mark.parametrize("table", OWNER_TABLES)
def test_other_user_cannot_update_or_delete(
    anon: SupabaseRest, user_a: AuthUser, user_b: AuthUser, table: str, seeded: dict[str, str]
) -> None:
    row_filter = {"id": f"eq.{seeded[table]}"}
    updated = anon.update(table, {"owner_id": user_b.id}, token=user_b.token, **row_filter)
    assert updated.status_code == 200 and updated.json() == []
    deleted = anon.delete(table, token=user_b.token, **row_filter)
    assert deleted.status_code == 200 and deleted.json() == []
    still_there = anon.select(table, token=user_a.token, **row_filter)
    assert len(still_there.json()) == 1


def test_cannot_insert_rows_owned_by_someone_else(
    anon: SupabaseRest, user_a: AuthUser, user_b: AuthUser
) -> None:
    resp = anon.insert("portfolios", {"owner_id": user_a.id, "name": "pytest-forged"},
                       token=user_b.token)
    assert resp.status_code in (401, 403), resp.text


def test_authenticated_can_override_market_data(
    anon: SupabaseRest, user_a: AuthUser, test_key: str
) -> None:
    # By design the signed-in owner may write shared market data (manual overrides).
    t = user_a.token
    insert_ok(anon, t, "fx_latest", {"pair": test_key, "rate": 84.5, "rate_date": "2026-10-31",
                                     "is_manual": True})
    assert len(anon.select("fx_latest", token=t, pair=f"eq.{test_key}").json()) == 1
    assert len(anon.delete("fx_latest", token=t, pair=f"eq.{test_key}").json()) == 1
