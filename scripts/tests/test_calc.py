"""The snapshot formulas match the app's: both check the same shared fixture."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest

from lib.calc import MarketData, snapshot_values

FIXTURE = (
    Path(__file__).resolve().parents[2] / "web/src/app/core/calc/fixtures/snapshot-case.json"
)
CASE = json.loads(FIXTURE.read_text())


@pytest.mark.parametrize("portfolio_id", sorted(CASE["expected"]))
def test_snapshot_matches_the_app(portfolio_id: str) -> None:
    market = MarketData.from_rows(
        CASE["mf_nav_latest"], CASE["stock_price_latest"], CASE["fx_latest"], CASE["nps_nav_latest"]
    )
    values = snapshot_values(CASE, market, portfolio_id, CASE["today"]).rounded()
    expected = {k: f"{Decimal(str(v)):.2f}" for k, v in CASE["expected"][portfolio_id].items()}
    assert values == expected


def test_usd_values_are_left_out_without_a_rate() -> None:
    market = MarketData.from_rows(CASE["mf_nav_latest"], CASE["stock_price_latest"], [])
    values = snapshot_values(CASE, market, "p-me", CASE["today"])
    assert values.stocks_value == Decimal(15000)  # INFY only; SMPL is USD
    assert values.rsu_vested_value == 0
