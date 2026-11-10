"""Latest stock prices and USD/INR, for what the owner holds only.

Symbols come from `stock_holdings` (India or US) and `rsu_grants` (US). Rows marked
`is_manual` are skipped (the owner set them by hand). India: NSE bhavcopy, then Yahoo for
any symbol the bhavcopy lacks. US: Yahoo. USD/INR is fetched only when something is priced
in USD. Prices are stored with `upsert_stock_price` / `upsert_fx_rate` (latest + previous).

Succeeds with a list of `missing` symbols when some cannot be priced (Data check and the
stale badge show them); fails when nothing could be priced or USD/INR is needed but missing.

Run: `python -m jobs.fetch_prices` from scripts/.
"""

from __future__ import annotations

import sys
from collections.abc import Callable
from datetime import date
from typing import Any

from jobs.providers import NseBhavcopy, PriceProvider, Quote, YahooChart, fetch_usd_inr
from lib import http
from lib.jobs import JobError, fetch_all, run_job, today_ist
from lib.supabase_rest import SupabaseRest

JOB = "fetch_prices"


def held_symbols(db: SupabaseRest) -> tuple[set[str], set[str], bool]:
    """(India symbols, US symbols, whether anything is priced in USD)."""
    stocks = fetch_all(db, "stock_holdings", "symbol,market,currency")
    grants = fetch_all(db, "rsu_grants", "symbol")
    india = {str(s["symbol"]).strip().upper() for s in stocks if s["market"] == "IN"}
    us = {str(s["symbol"]).strip().upper() for s in stocks if s["market"] == "US"}
    us |= {str(g["symbol"]).strip().upper() for g in grants}
    needs_fx = bool(grants) or any(s["currency"] == "USD" for s in stocks)
    return india - {""}, us - {""}, needs_fx


def manual_overrides(db: SupabaseRest) -> tuple[set[str], bool]:
    """(symbols with a manual price, whether USD/INR is set by hand)."""
    prices = fetch_all(db, "stock_price_latest", "symbol", is_manual="is.true")
    fx = fetch_all(db, "fx_latest", "pair", is_manual="is.true", pair="eq.USDINR")
    return {str(p["symbol"]) for p in prices}, bool(fx)


def price_india(symbols: set[str], today: date, nse: PriceProvider, yahoo: PriceProvider) -> dict[str, Quote]:
    quotes: dict[str, Quote] = {}
    try:
        quotes = nse.fetch(symbols, today)
    except (OSError, ValueError) as e:  # OSError includes requests.RequestException
        print(f"NSE bhavcopy unavailable ({type(e).__name__}); using the fallback", file=sys.stderr)
    rest = symbols - quotes.keys()
    if rest:
        quotes.update(yahoo.fetch(rest, today))
    return quotes


def work(
    db: SupabaseRest,
    *,
    today: date | None = None,
    nse: PriceProvider | None = None,
    yahoo_india: PriceProvider | None = None,
    yahoo_us: PriceProvider | None = None,
    usd_inr: Callable[[date], Quote | None] | None = None,
) -> dict[str, Any]:
    day = today or today_ist()
    india, us, needs_fx = held_symbols(db)
    manual, fx_manual = manual_overrides(db)
    india -= manual
    us -= manual

    session = http.session()
    quotes = price_india(
        india, day, nse or NseBhavcopy(session), yahoo_india or YahooChart(".NS", session)
    )
    quotes.update((yahoo_us or YahooChart("", session)).fetch(us, day))

    for symbol, q in sorted(quotes.items()):
        resp = db.rpc(
            "upsert_stock_price",
            {
                "p_symbol": symbol,
                "p_close": str(q.price),
                "p_date": q.price_date.isoformat(),
                "p_source": q.source,
            },
        )
        if resp.status_code not in (200, 204):
            raise JobError(f"Could not store the price for {symbol} (HTTP {resp.status_code})")

    wanted = india | us
    missing = sorted(wanted - quotes.keys())
    summary: dict[str, Any] = {
        "updated": len(quotes),
        "missing": missing,
        "sources": {
            name: sum(1 for q in quotes.values() if q.source == name)
            for name in sorted({q.source for q in quotes.values()})
        },
        "fx": "not needed",
    }
    if wanted and not quotes:
        raise JobError(f"No prices could be fetched for {len(wanted)} symbols")

    if needs_fx:
        if fx_manual:
            summary["fx"] = "manual"
        else:
            fx = (usd_inr or (lambda d: fetch_usd_inr(session, d)))(day)
            if fx is None:
                raise JobError("Could not fetch the USD/INR rate from any source")
            resp = db.rpc(
                "upsert_fx_rate",
                {"p_pair": "USDINR", "p_rate": str(fx.price), "p_date": fx.price_date.isoformat()},
            )
            if resp.status_code not in (200, 204):
                raise JobError(f"Could not store the USD/INR rate (HTTP {resp.status_code})")
            summary["fx"] = fx.source
    return summary


if __name__ == "__main__":
    sys.exit(run_job(JOB, work))
