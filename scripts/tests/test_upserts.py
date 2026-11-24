"""Latest-only market data: upsert_mf_nav, upsert_stock_price, upsert_fx_rate, upsert_nps_nav."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import pytest

from lib.supabase_rest import SupabaseRest

from .conftest import AuthUser

D1, D2 = "2026-10-30", "2026-10-31"


@dataclass(frozen=True)
class Upsert:
    fn: str
    table: str
    key_col: str
    value_col: str
    date_col: str
    prev_value_col: str
    prev_date_col: str
    arg_names: tuple[str, str, str]
    has_manual: bool

    def args(self, key: str, value: str, day: str) -> dict[str, Any]:
        args = dict(zip(self.arg_names, (key, value, day)))
        if self.table == "stock_price_latest":
            args["p_market"] = "US"
        return args


MF = Upsert("upsert_mf_nav", "mf_nav_latest", "scheme_code", "nav", "nav_date",
            "prev_nav", "prev_nav_date", ("p_code", "p_nav", "p_date"), False)
STOCK = Upsert("upsert_stock_price", "stock_price_latest", "symbol", "close", "price_date",
               "prev_close", "prev_price_date", ("p_symbol", "p_close", "p_date"), True)
FX = Upsert("upsert_fx_rate", "fx_latest", "pair", "rate", "rate_date",
            "prev_rate", "prev_rate_date", ("p_pair", "p_rate", "p_date"), True)
NPS = Upsert("upsert_nps_nav", "nps_nav_latest", "scheme_code", "nav", "nav_date",
             "prev_nav", "prev_nav_date", ("p_code", "p_nav", "p_date"), True)
ALL = [pytest.param(MF, id="mf"), pytest.param(STOCK, id="stock"), pytest.param(FX, id="fx"),
       pytest.param(NPS, id="nps")]
MANUAL = [pytest.param(STOCK, id="stock"), pytest.param(FX, id="fx"), pytest.param(NPS, id="nps")]


@pytest.fixture
def key(service: SupabaseRest, test_key: str) -> Iterator[str]:
    yield test_key
    for u in (MF, STOCK, FX, NPS):
        service.delete(u.table, **{u.key_col: f"eq.{test_key}"})


def call(service: SupabaseRest, u: Upsert, key: str, value: str, day: str) -> None:
    resp = service.rpc(u.fn, u.args(key, value, day))
    assert resp.status_code in (200, 204), resp.text


def row(service: SupabaseRest, u: Upsert, key: str) -> dict[str, Any] | None:
    resp = service.select(u.table, **{u.key_col: f"eq.{key}"})
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else None


def num(value: Any) -> Decimal | None:
    return None if value is None else Decimal(str(value))


@pytest.mark.parametrize("u", ALL)
def test_newer_date_moves_value_into_prev(service: SupabaseRest, u: Upsert, key: str) -> None:
    call(service, u, key, "10", D1)
    call(service, u, key, "11", D2)
    r = row(service, u, key)
    assert r is not None
    assert num(r[u.value_col]) == Decimal("11") and r[u.date_col] == D2
    assert num(r[u.prev_value_col]) == Decimal("10") and r[u.prev_date_col] == D1


@pytest.mark.parametrize("u", ALL)
def test_same_date_corrects_in_place(service: SupabaseRest, u: Upsert, key: str) -> None:
    call(service, u, key, "10", D1)
    call(service, u, key, "12", D1)
    r = row(service, u, key)
    assert r is not None
    assert num(r[u.value_col]) == Decimal("12") and r[u.date_col] == D1
    assert r[u.prev_value_col] is None


@pytest.mark.parametrize("u", ALL)
def test_older_date_is_ignored(service: SupabaseRest, u: Upsert, key: str) -> None:
    call(service, u, key, "10", D2)
    call(service, u, key, "9", D1)
    r = row(service, u, key)
    assert r is not None
    assert num(r[u.value_col]) == Decimal("10") and r[u.date_col] == D2
    assert r[u.prev_value_col] is None


@pytest.mark.parametrize("u", MANUAL)
def test_manual_override_is_not_overwritten(service: SupabaseRest, u: Upsert, key: str) -> None:
    manual = {u.key_col: key, u.value_col: "100", u.date_col: D1, "is_manual": True}
    if u == STOCK:
        manual["market"] = "US"
    assert service.insert(u.table, manual).status_code == 201
    call(service, u, key, "200", D2)
    r = row(service, u, key)
    assert r is not None
    assert num(r[u.value_col]) == Decimal("100") and r[u.date_col] == D1


@pytest.mark.parametrize("u", ALL)
def test_anon_cannot_execute(
    anon: SupabaseRest, service: SupabaseRest, u: Upsert, key: str
) -> None:
    resp = anon.rpc(u.fn, u.args(key, "1", D1))
    assert resp.status_code in (401, 403, 404), resp.text
    assert row(service, u, key) is None


@pytest.mark.parametrize("u", ALL)
def test_authenticated_cannot_execute(
    anon: SupabaseRest, service: SupabaseRest, user_a: AuthUser, u: Upsert, key: str
) -> None:
    resp = anon.rpc(u.fn, u.args(key, "1", D1), token=user_a.token)
    assert resp.status_code in (401, 403, 404), resp.text
    assert row(service, u, key) is None
