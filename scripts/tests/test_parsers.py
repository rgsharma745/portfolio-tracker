"""Parsing the market-data sources (no network: payloads are samples of the real formats)."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import date
from decimal import Decimal

import pytest
import requests

from jobs.fetch_nav import parse_nav_file
from jobs.fetch_prices import price_india
from jobs.fetch_nps_nav import (
    Nav,
    Source,
    download_protean,
    first_good,
    parse_protean_file,
    parse_trust_file,
)
from jobs.providers import (
    NseBhavcopy,
    Quote,
    YahooChart,
    parse_bhavcopy,
    parse_frankfurter,
    parse_yahoo_chart,
)
from lib.jobs import JobError

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


def test_parse_yahoo_chart_prefers_the_live_market_price() -> None:
    payload = yahoo_payload([1324.4, 1340.1], 19800)
    # 2026-11-03 05:30 UTC = 11:00 IST: the market is open and the quote is newer than the candle.
    payload["chart"]["result"][0]["meta"].update(regularMarketPrice=1340.2, regularMarketTime=1793691000)
    quote = parse_yahoo_chart(payload)
    assert quote == Quote(Decimal("1340.2"), date(2026, 11, 3), "yahoo")
    # A live price older than the last candle, or a broken one, is ignored.
    payload["chart"]["result"][0]["meta"].update(regularMarketPrice=1300, regularMarketTime=1793500000)
    assert parse_yahoo_chart(payload) == Quote(Decimal("1340.1"), date(2026, 11, 3), "yahoo")
    payload["chart"]["result"][0]["meta"].update(regularMarketPrice="NaN", regularMarketTime=1793691000)
    assert parse_yahoo_chart(payload) == Quote(Decimal("1340.1"), date(2026, 11, 3), "yahoo")


class Fixed:
    def __init__(self, name: str, quotes: dict[str, Quote]) -> None:
        self.name = name
        self.quotes = quotes
        self.asked: set[str] = set()

    def fetch(self, symbols: set[str], today: date) -> dict[str, Quote]:
        self.asked |= symbols
        return {s: q for s, q in self.quotes.items() if s in symbols}


def test_price_india_takes_the_live_price_until_todays_bhavcopy() -> None:
    today, yesterday = date(2026, 11, 11), date(2026, 11, 10)
    nse = Fixed(
        "nse",
        {
            "DONE": Quote(Decimal("10"), today, "nse"),  # today's bhavcopy is out: final
            "OPEN": Quote(Decimal("20"), yesterday, "nse"),  # market open: live price is newer
            "TIE": Quote(Decimal("30"), yesterday, "nse"),  # holiday: same day, official wins
            "NOLIVE": Quote(Decimal("40"), yesterday, "nse"),
        },
    )
    yahoo = Fixed(
        "yahoo",
        {
            "DONE": Quote(Decimal("11"), today, "yahoo"),
            "OPEN": Quote(Decimal("21"), today, "yahoo"),
            "TIE": Quote(Decimal("31"), yesterday, "yahoo"),
            "NEW": Quote(Decimal("50"), today, "yahoo"),  # not in the bhavcopy at all
        },
    )
    quotes = price_india({"DONE", "OPEN", "TIE", "NOLIVE", "NEW", "GONE"}, today, nse, yahoo)
    assert {s: (q.price, q.source) for s, q in quotes.items()} == {
        "DONE": (Decimal("10"), "nse"),
        "OPEN": (Decimal("21"), "yahoo"),
        "TIE": (Decimal("30"), "nse"),
        "NOLIVE": (Decimal("40"), "nse"),
        "NEW": (Decimal("50"), "yahoo"),
    }
    assert "DONE" not in yahoo.asked


def test_price_india_uses_yahoo_when_nse_is_down() -> None:
    class Down:
        name = "nse"

        def fetch(self, symbols: set[str], today: date) -> dict[str, Quote]:
            raise requests.ConnectionError("down")

    live = Quote(Decimal("21"), date(2026, 11, 11), "yahoo")
    assert price_india({"OPEN"}, date(2026, 11, 11), Down(), Fixed("yahoo", {"OPEN": live})) == {"OPEN": live}


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


# ---- NPS NAVs ----

NPS_TRUST = (
    "﻿ID\tDATE OF NAV\tPFM NAME\tSCHEME ID\tSCHEME NAME\tNAV VALUE\n"
    "1\t2026-11-06\tSBI Pension Funds Pvt. Ltd.\tSM001003\tSBI PENSION FUND SCHEME E - TIER I\t57.3799\n"
    "149\t2026-11-06\tHDFC Pension Fund Management Limited\tSM008001\tHDFC SCHEME E - TIER I\t55.1949\n"
    "150\t2026-11-06\tHDFC Pension Fund Management Limited\tSM008002\tHDFC SCHEME C - TIER I\tN.A.\n"
    "151\t2026-11-06\tHDFC Pension Fund Management Limited\tSM008003\tHDFC SCHEME G - TIER I\t28.7705\n"
)

NPS_PROTEAN = (
    "11/05/2026,PFM008,HDFC PENSION FUND MANAGEMENT LIMITED,SM008001,HDFC SCHEME E - TIER I,54.4046\n"
    "11/05/2026,PFM008,HDFC PENSION FUND MANAGEMENT LIMITED,SM008003,HDFC SCHEME G, TIER I,28.8898\n"
    "11/05/2026,PFM001,SBI PENSION FUNDS PRIVATE LIMITED,SM001003,SBI SCHEME E - TIER I,56.6836\n"
)


def test_parse_nps_trust_file_finds_columns_by_header() -> None:
    navs, seen = parse_trust_file(NPS_TRUST, {"SM008001", "SM008002", "SM008003", "SM999999"})
    assert seen == 4
    assert navs["SM008001"] == Nav(Decimal("55.1949"), date(2026, 11, 6))
    assert navs["SM008003"].nav == Decimal("28.7705")
    # A non-numeric NAV is skipped; unheld and unknown codes are not stored.
    assert set(navs) == {"SM008001", "SM008003"}
    assert parse_trust_file("<html>maintenance</html>", {"SM008001"}) == ({}, 0)


def test_parse_nps_protean_file_reads_month_first_dates_and_commas_in_names() -> None:
    navs, seen = parse_protean_file(NPS_PROTEAN, {"SM008001", "SM008003"})
    assert seen == 3
    assert navs["SM008001"] == Nav(Decimal("54.4046"), date(2026, 11, 5))
    assert navs["SM008003"].nav == Decimal("28.8898")


def _nps_zip(text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("NAV_File_05112026.out", text)
        z.writestr("__MACOSX/._NAV_File_05112026.out", "junk")
    return buf.getvalue()


def test_protean_looks_back_to_the_newest_daily_file() -> None:
    session = FakeSession({"NAV_File_05112026": (200, _nps_zip(NPS_PROTEAN))})
    text = download_protean(session, date(2026, 11, 7))
    assert "SM008001" in text
    assert [u[-12:-4] for u in session.urls] == ["07112026", "06112026", "05112026"]


def test_protean_gives_up_after_a_week() -> None:
    session = FakeSession({})
    with pytest.raises(JobError, match="No Protean NAV file"):
        download_protean(session, date(2026, 11, 7))
    assert len(session.urls) == 8


def test_nps_sources_fall_back_in_order() -> None:
    def broken() -> str:
        raise requests.ConnectionError("down")

    filler = "".join(f"{i}\t2026-11-06\tPFM\tSM9{i:05d}\tFiller\t10\n" for i in range(150))
    sources = [
        Source("npstrust", broken, parse_trust_file),
        Source("empty", lambda: "", parse_trust_file),
        Source("good", lambda: NPS_TRUST + filler, parse_trust_file),
    ]
    name, navs = first_good(sources, {"SM008001"})
    assert name == "good" and navs["SM008001"].nav == Decimal("55.1949")
    with pytest.raises(JobError, match="npstrust: ConnectionError; empty: looked empty"):
        first_good(sources[:2], {"SM008001"})
