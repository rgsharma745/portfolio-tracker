"""Employee equity invariants, tax classification and bank reconciliation through Supabase."""

from __future__ import annotations

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import uuid4

import pytest

from lib.supabase_rest import SupabaseRest

from .conftest import AuthUser, _make_user
from .test_rls import insert_ok


@pytest.fixture
def equity_owner(service: SupabaseRest, anon: SupabaseRest) -> Iterator[AuthUser]:
    yield from _make_user(service, anon)


@pytest.fixture
def equity_other(service: SupabaseRest, anon: SupabaseRest) -> Iterator[AuthUser]:
    yield from _make_user(service, anon)


def setup_grant(
    api: SupabaseRest, user: AuthUser, *, market: str = "US", kind: str = "RSU",
    portfolio: str | None = None, security: str | None = None,
) -> tuple[str, str, str]:
    token = user.token
    if portfolio is None:
        portfolio = insert_ok(api, token, "portfolios", {"name": f"Equity {uuid4().hex[:8]}"})["id"]
    if security is None:
        security = insert_ok(api, token, "equity_securities", {
            "name": "Issuer", "market": market, "currency": "INR" if market != "US" else "USD",
            "symbol": None if market == "PRIVATE" else f"EQ{uuid4().hex[:8].upper()}",
        })["id"]
    grant = insert_ok(api, token, "equity_grants", {
        "portfolio_id": portfolio, "security_id": security, "kind": kind,
        "label": f"Award {uuid4().hex[:8]}", "granted_on": "2023-01-01", "quantity": 20,
        "grant_price": 10 if kind == "ESOP" else None,
    })["id"]
    return portfolio, security, grant


def sale_args(p: str, security: str, lots: list[dict[str, Any]], **fields: Any) -> dict[str, Any]:
    return {
        "p_id": str(uuid4()), "p_portfolio": p, "p_security": security,
        "p_sold_on": "2026-01-05", "p_price": 100, "p_brokerage": 0, "p_other_fees": 0,
        "p_currency": "USD", "p_fx": 82, "p_lots": lots, **fields,
    }


def vest_lot(
    api: SupabaseRest, token: str, portfolio: str, grant: str, **fields: Any
) -> str:
    return insert_ok(api, token, "equity_events", {
        "portfolio_id": portfolio, "grant_id": grant, "kind": "vest",
        "occurred_on": "2024-01-05", "allotted_on": "2024-01-05",
        "quantity": 10, "fmv": 50, "fx": 80, "currency": "USD", "tax_units": 2,
        **fields,
    })["id"]


def test_mixed_sale_reconciles_credit_to_both_lots(
    anon: SupabaseRest, equity_owner: AuthUser, equity_other: AuthUser,
) -> None:
    token = equity_owner.token
    p, security, award = setup_grant(anon, equity_owner)
    _, _, option = setup_grant(anon, equity_owner, kind="ESOP", portfolio=p, security=security)
    rsu = vest_lot(anon, token, p, award)
    vest = {
        "portfolio_id": p, "grant_id": option, "kind": "vest",
        "occurred_on": "2025-01-01", "quantity": 10,
    }
    insert_ok(anon, token, "equity_events", vest)
    exercise = {
        **vest, "kind": "exercise", "occurred_on": "2025-01-02", "quantity": 5,
        "purchase_price": 10, "fmv": 50, "currency": "USD", "fx": 80,
        "tax_paid_inr": 3200,
    }
    lot = insert_ok(anon, token, "equity_events", exercise)["id"]
    during = anon.select("v_equity_lots", token=token, id=f"eq.{lot}").json()[0]
    assert during["held_units"] == 0 and during["purchase_cost_inr"] == 4000

    args = sale_args(p, security, [
        {"event_id": rsu, "quantity": 2},
        {"event_id": lot, "quantity": 3, "exercise_deduction": 40, "tax_deduction": 35},
    ], p_brokerage=10)
    assert anon.rpc("save_equity_sale", args, token=token).status_code == 400
    assert anon.select("equity_sales", token=token, id=f"eq.{args['p_id']}").json() == []
    allotted = anon.update(
        "equity_events", {"allotted_on": "2025-01-03"}, token=token, id=f"eq.{lot}",
    )
    assert allotted.ok, allotted.text

    saved = anon.rpc("save_equity_sale", args, token=token)
    assert saved.ok, saved.text
    before = anon.select("v_equity_sale_details", token=token, sale_id=f"eq.{args['p_id']}").json()
    assert sum(a["realized_inr"] for a in before) == (490 * 82) - 20000
    assert all(a["bank_inr"] is None for a in before)

    args.update(p_bank_on="2026-01-06", p_bank_inr=33200)
    saved = anon.rpc("save_equity_sale", args, token=token)
    assert saved.ok, saved.text
    details = anon.select("v_equity_sale_details", token=token, sale_id=f"eq.{args['p_id']}").json()
    assert len(details) == 2
    assert sum(a["bank_inr"] for a in details) == 33200
    assert sum(a["realized_inr"] for a in details) == (490 * 80) - 20000
    assert {a["effective_fx"] for a in details} == {80}
    assert {a["classification"] for a in details} == {"Short-term"}

    other_p, _, _ = setup_grant(anon, equity_other)
    assert not anon.rpc("save_equity_sale", {**args, "p_portfolio": other_p}, token=equity_other.token).ok
    assert not anon.rpc("save_equity_sale", args, token=equity_other.token).ok
    assert not anon.rpc("save_equity_sale", args).ok
    other_export = anon.rpc("export_equity_ledger", {}, token=equity_other.token)
    assert other_export.ok and not other_export.json()["equity_sales"]

    assert not anon.update(
        "equity_events", {"quantity": 2}, token=token, id=f"eq.{lot}",
    ).ok
    assert not anon.delete("equity_events", token=token, id=f"eq.{lot}").ok


@pytest.mark.parametrize(("market", "anniversary", "late"), [
    ("IN", "2025-01-05", "2025-01-06"), ("US", "2026-01-05", "2026-01-06"),
    ("PRIVATE", "2026-01-05", "2026-01-06"),
])
def test_classification_uses_allotment_and_calendar_months(
    anon: SupabaseRest, equity_owner: AuthUser, market: str, anniversary: str, late: str,
) -> None:
    p, security, grant = setup_grant(anon, equity_owner, market=market)
    lot = vest_lot(anon, equity_owner.token, p, grant, occurred_on="2024-01-01")
    for sold_on, expected in [(anniversary, "Short-term"), (late, "Long-term")]:
        args = sale_args(p, security, [{"event_id": lot, "quantity": 1}], p_sold_on=sold_on)
        res = anon.rpc("save_equity_sale", args, token=equity_owner.token)
        assert res.ok, res.text
        rows = anon.select("v_equity_sale_details", token=equity_owner.token, sale_id=f"eq.{args['p_id']}").json()
        assert rows[0]["classification"] == expected


def test_concurrent_sales_cannot_oversell(
    anon: SupabaseRest, equity_owner: AuthUser,
) -> None:
    p, security, grant = setup_grant(anon, equity_owner)
    lot = vest_lot(anon, equity_owner.token, p, grant)

    def sell(_: int) -> bool:
        api = SupabaseRest(anon.url, anon.key)
        return api.rpc(
            "save_equity_sale", sale_args(p, security, [{"event_id": lot, "quantity": 5}]),
            token=equity_owner.token,
        ).ok

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(sell, range(2))) == [False, True]
    holdings = anon.select("v_equity_lots", token=equity_owner.token, id=f"eq.{lot}").json()
    assert holdings[0]["held_units"] == 3


def test_cashless_sale_with_zero_bank_payout(
    anon: SupabaseRest, equity_owner: AuthUser,
) -> None:
    token = equity_owner.token
    p, security, grant = setup_grant(anon, equity_owner, kind="ESOP")
    base = {"portfolio_id": p, "grant_id": grant, "occurred_on": "2025-01-01"}
    insert_ok(anon, token, "equity_events", {**base, "kind": "vest", "quantity": 2})
    lot = insert_ok(anon, token, "equity_events", {
        **base, "kind": "exercise", "quantity": 2, "allotted_on": "2025-01-01",
        "purchase_price": 90, "fmv": 100, "currency": "USD", "fx": 80,
    })["id"]
    args = sale_args(p, security, [
        {"event_id": lot, "quantity": 2, "exercise_deduction": 180, "tax_deduction": 20},
    ], p_bank_on="2026-01-06", p_bank_inr=0)
    response = anon.rpc("save_equity_sale", args, token=token)
    assert response.ok, response.text
    detail = anon.select("v_equity_sale_details", token=token, sale_id=f"eq.{args['p_id']}").json()[0]
    assert detail["effective_fx"] is None
    assert detail["bank_inr"] == 0
    assert detail["realized_inr"] == 400


def test_backdated_and_expired_exercises_fail(
    anon: SupabaseRest, equity_owner: AuthUser,
) -> None:
    token = equity_owner.token
    p, _, grant = setup_grant(anon, equity_owner, kind="ESOP")
    assert anon.update("equity_grants", {"expires_on": "2025-02-01"}, token=token, id=f"eq.{grant}").ok
    base = {"portfolio_id": p, "grant_id": grant}
    tranche = insert_ok(anon, token, "equity_schedule", {
        **base, "scheduled_on": "2025-01-01", "quantity": 10,
    })["id"]
    vest = insert_ok(anon, token, "equity_events", {
        **base, "kind": "vest", "schedule_id": tranche, "occurred_on": "2025-01-01", "quantity": 5,
    })["id"]
    exercise = {
        **base, "kind": "exercise", "quantity": 5, "purchase_price": 10,
        "fmv": 25, "currency": "USD", "fx": 85,
    }
    for day in ["2024-12-31", "2025-02-02"]:
        assert not anon.insert("equity_events", {**exercise, "occurred_on": day}, token=token).ok
    insert_ok(anon, token, "equity_events", {**exercise, "occurred_on": "2025-01-01"})
    assert not anon.update("equity_events", {"quantity": 4}, token=token, id=f"eq.{vest}").ok
    response = anon.delete("portfolios", token=token, id=f"eq.{p}")
    assert response.ok, response.text
    assert anon.select("equity_events", token=token, portfolio_id=f"eq.{p}").json() == []
