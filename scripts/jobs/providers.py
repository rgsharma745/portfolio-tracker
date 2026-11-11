"""Market-data sources behind one small interface, so a source can be swapped in one place.

- India stocks: NSE's official daily bhavcopy (one CSV with every closing price).
- US stocks and RSUs, and for India the fallback and the live price during market hours:
  Yahoo Finance's chart endpoint (unofficial; answers an honestly identified script, no key).
- USD/INR: Frankfurter (European Central Bank reference rate), Yahoo as the fallback.

Every source returns only the symbols asked for.
"""

from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Protocol

import requests

from lib import http


@dataclass(frozen=True)
class Quote:
    price: Decimal
    price_date: date
    source: str


class PriceProvider(Protocol):
    name: str

    def fetch(self, symbols: set[str], today: date) -> dict[str, Quote]:
        """Latest close for each symbol it can find; unknown symbols are left out."""
        ...


# ---- NSE bhavcopy ----

BHAVCOPY_URL = (
    "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{yyyymmdd}_F_0000.csv.zip"
)
# Equity series, in order of preference when a symbol trades in more than one.
EQUITY_SERIES = ("EQ", "BE", "BZ", "SM", "ST")


def parse_bhavcopy(text: str, symbols: set[str]) -> dict[str, Quote]:
    best: dict[str, tuple[int, Quote]] = {}
    for row in csv.DictReader(io.StringIO(text)):
        symbol = (row.get("TckrSymb") or "").strip().upper()
        series = (row.get("SctySrs") or "").strip().upper()
        if symbol not in symbols or series not in EQUITY_SERIES:
            continue
        try:
            price = Decimal(row["ClsPric"])
            day = date.fromisoformat(row["TradDt"].strip())
        except (InvalidOperation, ValueError, KeyError):
            continue
        rank = EQUITY_SERIES.index(series)
        if price > 0 and (symbol not in best or rank < best[symbol][0]):
            best[symbol] = (rank, Quote(price, day, "nse"))
    return {s: q for s, (_, q) in best.items()}


class NseBhavcopy:
    """The most recent bhavcopy on or before today (looks back over weekends and holidays)."""

    name = "nse"

    def __init__(self, session: requests.Session | None = None, lookback_days: int = 7) -> None:
        self.http = session or http.session()
        self.lookback_days = lookback_days

    def fetch(self, symbols: set[str], today: date) -> dict[str, Quote]:
        if not symbols:
            return {}
        for back in range(self.lookback_days):
            day = today - timedelta(days=back)
            resp = self.http.get(
                BHAVCOPY_URL.format(yyyymmdd=day.strftime("%Y%m%d")), timeout=http.TIMEOUT_SECONDS
            )
            if resp.status_code == 404:
                continue  # not a trading day, or not published yet
            resp.raise_for_status()
            with zipfile.ZipFile(io.BytesIO(resp.content)) as archive:
                text = archive.read(archive.namelist()[0]).decode("utf-8-sig")
            return parse_bhavcopy(text, symbols)
        return {}


# ---- Yahoo Finance ----

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"


def parse_yahoo_chart(payload: dict) -> Quote | None:
    """
    The latest price, dated in the exchange's own time zone: `regularMarketPrice` (live
    during market hours, the close after it), else the last daily close in the chart.
    """
    try:
        result = payload["chart"]["result"][0]
        meta = result["meta"]
        offset = int(meta.get("gmtoffset", 0))
        stamps = result.get("timestamp") or []
        closes = result["indicators"]["quote"][0].get("close") or []
    except (KeyError, IndexError, TypeError, AttributeError):
        return None
    candle: Quote | None = None
    for stamp, close in reversed(list(zip(stamps, closes, strict=False))):
        if close is not None:
            candle = _yahoo_quote(close, stamp, offset)
            break
    live = _yahoo_quote(meta.get("regularMarketPrice"), meta.get("regularMarketTime"), offset)
    if live and (candle is None or live.price_date >= candle.price_date):
        return live
    return candle


def _yahoo_quote(price: object, stamp: object, offset: int) -> Quote | None:
    if price is None or not isinstance(stamp, int | float):
        return None
    try:
        value = Decimal(str(price))
    except InvalidOperation:
        return None
    if not value.is_finite() or value <= 0:
        return None
    return Quote(value, datetime.fromtimestamp(stamp + offset, UTC).date(), "yahoo")


class YahooChart:
    """One request per symbol. `suffix` maps our symbol to Yahoo's (".NS" for NSE)."""

    name = "yahoo"

    def __init__(self, suffix: str = "", session: requests.Session | None = None) -> None:
        self.suffix = suffix
        self.http = session or http.session()

    def fetch(self, symbols: set[str], today: date) -> dict[str, Quote]:
        quotes: dict[str, Quote] = {}
        for symbol in sorted(symbols):
            try:
                resp = self.http.get(
                    YAHOO_CHART_URL.format(symbol=f"{symbol}{self.suffix}"),
                    params={"range": "5d", "interval": "1d"},
                    timeout=http.TIMEOUT_SECONDS,
                )
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                payload = resp.json()
            except (requests.RequestException, ValueError):
                continue  # one symbol failing must not stop the others; it is reported missing
            quote = parse_yahoo_chart(payload)
            if quote and quote.price_date <= today:
                quotes[symbol] = quote
        return quotes


# ---- USD/INR ----

FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"


def parse_frankfurter(payload: dict) -> Quote | None:
    try:
        rate = Decimal(str(payload["rates"]["INR"]))
        day = date.fromisoformat(payload["date"])
    except (KeyError, InvalidOperation, ValueError, TypeError):
        return None
    return Quote(rate, day, "frankfurter") if rate > 0 else None


def fetch_usd_inr(session: requests.Session, today: date) -> Quote | None:
    """Frankfurter first; Yahoo's USDINR=X if that fails."""
    try:
        resp = http.get(session, FRANKFURTER_URL, base="USD", symbols="INR")
        quote = parse_frankfurter(resp.json())
        if quote:
            return quote
    except requests.RequestException:
        pass
    yahoo = YahooChart(session=session).fetch({"INR=X"}, today).get("INR=X")
    return Quote(yahoo.price, yahoo.price_date, "yahoo") if yahoo else None
