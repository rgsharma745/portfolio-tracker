"""Parsing the market-data sources (no network: payloads are samples of the real formats)."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import date
from decimal import Decimal

import requests

from jobs.fetch_nav import parse_nav_file
from jobs.providers import (
    NseBhavcopy,
    YahooChart,
    parse_bhavcopy,
    parse_frankfurter,
    parse_yahoo_chart,
)

AMFI = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Large Cap Fund)

Axis Mutual Fund

120503;INF846K01EW2;-;Axis Bluechip Fund;Direct Plan;Growth Option;61.2345;03-Nov-2026
120504;INF846K01EX0;-;Axis Bluechip Fund;Direct Plan;IDCW Option;N.A.;03-Nov-2026
118989;INF179K01XQ0;INF179K01XR8;HDFC Mid-Cap Opportunities Fund - Growth;145.10;31-Oct-2026
999999;-;-;Some Other Fund;Regular Plan;Growth;10.0;03-Nov-2026
"""


def test_parse_nav_file_keeps_held_codes_and_both_column_layouts() -> None:
    navs, seen = parse_nav_file(AMFI, {"120503", "120504", "118989", "555555"})
    assert seen == 4
    assert navs["120503"].nav == Decimal("61.2345")
    assert navs["120503"].nav_date == date(2026, 11, 3)
    # Older layout without the Plan/Option columns still parses.
    assert navs["118989"].nav == Decimal("145.10")
    # "N.A." is skipped, unknown codes are not invented, unheld codes are ignored.
    assert "120504" not in navs and "555555" not in navs and "999999" not in navs


BHAV = """TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric
2026-11-03,2026-11-03,CM,NSE,STK,2885,INE002A01018,RELIANCE,EQ,,,,,RELIANCE INDUSTRIES LTD,1300,1320,1295,1311.00,1311.50,1307.90
2026-11-03,2026-11-03,CM,NSE,STK,1594,INE009A01021,INFY,BE,,,,,INFOSYS LIMITED,1500,1510,1490,1499.00,1499.00,1480.00
2026-11-03,2026-11-03,CM,NSE,STK,1594,INE009A01021,INFY,EQ,,,,,INFOSYS LIMITED,1500,1510,1490,1502.40,1502.00,1480.00
2026-11-03,2026-11-03,CM,NSE,STK,19078,IN0020200104,SGBJUN28,GB,,,,,GOLD BOND,13825,13875,13803,13830.00,13830.00,13822.76
"""


def test_parse_bhavcopy_prefers_eq_series_and_only_held_symbols() -> None:
    quotes = parse_bhavcopy(BHAV, {"RELIANCE", "INFY", "SGBJUN28", "TCS"})
    assert quotes["RELIANCE"].price == Decimal("1311.00")
    assert quotes["INFY"].price == Decimal("1502.40")  # EQ beats BE
    assert quotes["INFY"].price_date == date(2026, 11, 3)
    assert "SGBJUN28" not in quotes  # not an equity series
    assert "TCS" not in quotes


class FakeSession(requests.Session):
    """Answers GETs from a dict of URL substring -> (status, body)."""

    def __init__(self, responses: dict[str, tuple[int, bytes | dict]]) -> None:
        super().__init__()
        self.responses = responses
        self.urls: list[str] = []

    def get(self, url, **kwargs):  # type: ignore[override]
        self.urls.append(url)
        for key, (status, body) in self.responses.items():
            if key in url:
                resp = requests.Response()
                resp.status_code = status
                resp._content = body if isinstance(body, bytes) else json.dumps(body).encode()
                resp.url = url
                return resp
        resp = requests.Response()
        resp.status_code = 404
        resp._content = b""
        return resp


def _zip(text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("bhav.csv", text)
    return buf.getvalue()


def test_bhavcopy_looks_back_over_holidays() -> None:
    session = FakeSession({"20261103": (200, _zip(BHAV))})
    quotes = NseBhavcopy(session).fetch({"RELIANCE"}, date(2026, 11, 5))
    assert quotes["RELIANCE"].source == "nse"
    assert [u.split("_0_0_0_")[1][:8] for u in session.urls] == ["20261105", "20261104", "20261103"]


def yahoo_payload(closes: list[float | None], gmtoffset: int = -18000) -> dict:
    # 2026-11-02 and 2026-11-03 14:30 UTC (US market open), offset to New York time.
    return {
        "chart": {
            "result": [
                {
                    "meta": {"gmtoffset": gmtoffset},
                    "timestamp": [1793629800, 1793716200][: len(closes)],
                    "indicators": {"quote": [{"close": closes}]},
                }
            ]
        }
    }


def test_parse_yahoo_chart_takes_the_last_close_in_exchange_time() -> None:
    quote = parse_yahoo_chart(yahoo_payload([170.5, 171.32]))
    assert quote is not None
    assert quote.price == Decimal("171.32")
    assert quote.price_date == date(2026, 11, 3)
    # A trailing empty candle (no trades yet) falls back to the previous close.
    earlier = parse_yahoo_chart(yahoo_payload([170.5, None]))
    assert earlier is not None and earlier.price == Decimal("170.5")
    assert parse_yahoo_chart({"chart": {"result": None}}) is None


def test_yahoo_maps_symbols_and_skips_failures() -> None:
    session = FakeSession(
        {"RELIANCE.NS": (200, yahoo_payload([1311.0], 19800)), "BROKEN.NS": (500, b"oops")}
    )
    quotes = YahooChart(".NS", session).fetch({"RELIANCE", "BROKEN", "GONE"}, date(2026, 11, 4))
    assert set(quotes) == {"RELIANCE"}
    assert quotes["RELIANCE"].source == "yahoo"


def test_parse_frankfurter() -> None:
    quote = parse_frankfurter({"amount": 1.0, "base": "USD", "date": "2026-11-03", "rates": {"INR": 94.75}})
    assert quote is not None and quote.price == Decimal("94.75") and quote.source == "frankfurter"
    assert parse_frankfurter({"rates": {}}) is None
