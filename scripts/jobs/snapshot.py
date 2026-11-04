"""Daily snapshot: one `portfolio_snapshots` row per active portfolio for today (IST).

Uses the same formulas as the app (lib/calc.py, checked against the app by a shared
fixture). Upserts on (owner_id, portfolio_id, snap_date), so re-running a day replaces that
day's row instead of adding one. This is the only history the app keeps.

Run: `python -m jobs.snapshot` from scripts/.
"""

from __future__ import annotations

import sys
from datetime import date
from typing import Any

from lib.calc import MarketData, snapshot_values
from lib.jobs import JobError, fetch_all, run_job, today_ist
from lib.supabase_rest import SupabaseRest

JOB = "snapshot"


def load(db: SupabaseRest) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]], MarketData]:
    portfolios = fetch_all(db, "portfolios", "id,owner_id", is_active="is.true")
    cards = {c["id"]: c["portfolio_id"] for c in fetch_all(db, "credit_cards", "id,portfolio_id")}
    bills = [
        {**b, "portfolio_id": cards[b["card_id"]]}
        for b in fetch_all(db, "card_bills", "card_id,amount,paid_amount")
        if b["card_id"] in cards
    ]
    data = {
        "mf_holdings": fetch_all(db, "mf_holdings", "portfolio_id,scheme_code,units"),
        "stock_holdings": fetch_all(db, "stock_holdings", "portfolio_id,symbol,currency,quantity"),
        "rsu_grants": fetch_all(db, "rsu_grants", "portfolio_id,symbol,units_vested"),
        "savings_accounts": fetch_all(db, "savings_accounts", "portfolio_id,balance"),
        "card_bills": bills,
    }
    market = MarketData.from_rows(
        fetch_all(db, "mf_nav_latest", "scheme_code,nav"),
        fetch_all(db, "stock_price_latest", "symbol,close"),
        fetch_all(db, "fx_latest", "pair,rate"),
    )
    return portfolios, data, market


def work(db: SupabaseRest, *, today: date | None = None) -> dict[str, Any]:
    day = (today or today_ist()).isoformat()
    portfolios, data, market = load(db)
    rows = [
        {
            "owner_id": p["owner_id"],
            "portfolio_id": p["id"],
            "snap_date": day,
            **snapshot_values(data, market, p["id"]).rounded(),
        }
        for p in portfolios
    ]
    if rows:
        resp = db.request(
            "POST",
            "/rest/v1/portfolio_snapshots",
            params={"on_conflict": "owner_id,portfolio_id,snap_date"},
            json=rows,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        if resp.status_code not in (200, 201, 204):
            raise JobError(f"Could not store the snapshot (HTTP {resp.status_code})")
    return {"rows": len(rows), "snap_date": day}


if __name__ == "__main__":
    sys.exit(run_job(JOB, work))
