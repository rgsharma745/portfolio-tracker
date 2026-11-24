"""Latest stock prices and USD/INR, for what the owner holds only.

Symbols come from stocks and listed employee equity grants in India and the US. Rows marked
`is_manual` are skipped (the owner set them by hand). India: NSE bhavcopy, and Yahoo for any
symbol the bhavcopy lacks or has only an older day for (so a run during market hours stores
the live price, and the evening run replaces it with the official close). US: Yahoo. USD/INR is fetched only when something is priced
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
    security_ids = {g["security_id"] for g in fetch_all(db, "equity_grants", "security_id")}
    securities = [
        s for s in fetch_all(db, "equity_securities", "id,market,symbol,currency")
        if s["id"] in security_ids
    ]
    india = {str(s["symbol"]).strip().upper() for s in stocks if s["market"] == "IN"}
    us = {str(s["symbol"]).strip().upper() for s in stocks if s["market"] == "US"}
    india |= {str(s["symbol"]) for s in securities if s["market"] == "IN"}
    us |= {str(s["symbol"]) for s in securities if s["market"] == "US"}
    needs_fx = any(s["currency"] == "USD" for s in stocks + securities)
    return india - {""}, us - {""}, needs_fx


def manual_overrides(db: SupabaseRest) -> tuple[set[tuple[str, str]], bool]:
    """(symbols with a manual price, whether USD/INR is set by hand)."""
    prices = fetch_all(db, "stock_price_latest", "market,symbol", is_manual="is.true")
    fx = fetch_all(db, "fx_latest", "pair", is_manual="is.true", pair="eq.USDINR")
    return {(str(p["market"]), str(p["symbol"])) for p in prices}, bool(fx)


def price_india(symbols: set[str], today: date, nse: PriceProvider, yahoo: PriceProvider) -> dict[str, Quote]:
    """
    The freshest price per symbol. NSE's bhavcopy is official but only exists after the
    close, so a symbol without today's bhavcopy price also asks Yahoo, whose quote is live
    during market hours. Yahoo wins only when it is newer; on a tie (weekend, holiday,
    before the open) the bhavcopy is kept. Once today's bhavcopy is out it replaces the
    live price (`upsert_stock_price` lets a same-day price overwrite).
    """
    official: dict[str, Quote] = {}
    try:
        official = nse.fetch(symbols, today)
    except (OSError, ValueError) as e:  # OSError includes requests.RequestException
        print(f"NSE bhavcopy unavailable ({type(e).__name__}); using the fallback", file=sys.stderr)
    quotes = {s: q for s, q in official.items() if q.price_date >= today}
    rest = symbols - quotes.keys()
    live = yahoo.fetch(rest, today) if rest else {}
    for symbol in rest:
        newest = [q for q in (official.get(symbol), live.get(symbol)) if q]
        if newest:
            # max() returns the first of equal dates: the bhavcopy.
            quotes[symbol] = max(newest, key=lambda q: q.price_date)
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
    india = {symbol for symbol in india if ("IN", symbol) not in manual}
    us = {symbol for symbol in us if ("US", symbol) not in manual}

    session = http.session()
    indian_quotes = price_india(
        india, day, nse or NseBhavcopy(session), yahoo_india or YahooChart(".NS", session)
    )
    us_quotes = (yahoo_us or YahooChart("", session)).fetch(us, day)
    quotes = {
        (market, symbol): quote
        for market, market_quotes in (("IN", indian_quotes), ("US", us_quotes))
        for symbol, quote in market_quotes.items()
    }

    for (market, symbol), q in sorted(quotes.items()):
        resp = db.rpc(
            "upsert_stock_price",
            {
                "p_market": market,
                "p_symbol": symbol,
                "p_close": str(q.price),
                "p_date": q.price_date.isoformat(),
                "p_source": q.source,
            },
        )
        if resp.status_code not in (200, 204):
            raise JobError(f"Could not store the price for {symbol} (HTTP {resp.status_code})")

    wanted = {("IN", symbol) for symbol in india} | {("US", symbol) for symbol in us}
    missing = [f"{market}:{symbol}" for market, symbol in sorted(wanted - quotes.keys())]
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
