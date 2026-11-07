"""Daily NPS NAVs, for the scheme codes in `nps_holdings` only.

Sources, both official, tried in order:
1. NPS Trust's latest-NAV export (one tab-separated file with every scheme's latest NAV).
2. Protean CRA's dated daily file (`NAV_File_DDMMYYYY.zip`, comma-separated), looking back a
   week from today (IST) for the newest one published.
Only held codes are stored, through `upsert_nps_nav` (latest and previous NAV, no history;
manual NAVs are left alone). The message is JSON: {"updated": n, "unmatched": [codes],
"nav_date": "...", "source": "..."}.

Run: `python -m jobs.fetch_nps_nav` from scripts/, with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
"""

from __future__ import annotations

import io
import sys
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

import requests

from lib import http
from lib.jobs import JobError, fetch_all, run_job, today_ist
from lib.supabase_rest import SupabaseRest

JOB = "fetch_nps_nav"
TRUST_URL = "https://npstrust.org.in/nav-report-excel"
PROTEAN_URL = "https://www.npscra.proteantech.in/download/NAV_File_{ddmmyyyy}.zip"
PROTEAN_LOOKBACK_DAYS = 7
# The files list about 260 schemes; far fewer means an error page or a broken download.
MIN_ROWS = 100


@dataclass(frozen=True)
class Nav:
    nav: Decimal
    nav_date: date


Parsed = tuple[dict[str, Nav], int]


def _keep(navs: dict[str, Nav], code: str, raw_nav: str, raw_date: str, fmt: str) -> None:
    try:
        nav = Decimal(raw_nav.strip())
        nav_date = datetime.strptime(raw_date.strip(), fmt).date()
    except (InvalidOperation, ValueError):
        return  # a malformed line: leave the stored NAV as it is
    if nav > 0 and (code not in navs or nav_date > navs[code].nav_date):
        navs[code] = Nav(nav, nav_date)


def parse_trust_file(text: str, wanted: set[str]) -> Parsed:
    """
    NPS Trust export: a header row (`ID, DATE OF NAV, PFM NAME, SCHEME ID, SCHEME NAME,
    NAV VALUE`) then one tab-separated row per scheme, dates as `YYYY-MM-DD`. Columns are
    found by header name. Returns the NAVs of `wanted` codes and the number of data rows.
    """
    lines = text.lstrip("﻿").splitlines()
    if not lines:
        return {}, 0
    header = [h.strip().upper() for h in lines[0].split("\t")]
    try:
        i_code, i_date, i_nav = (header.index(h) for h in ("SCHEME ID", "DATE OF NAV", "NAV VALUE"))
    except ValueError:
        return {}, 0
    navs: dict[str, Nav] = {}
    seen = 0
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) <= max(i_code, i_date, i_nav):
            continue
        seen += 1
        code = parts[i_code].strip()
        if code in wanted:
            _keep(navs, code, parts[i_nav], parts[i_date], "%Y-%m-%d")
    return navs, seen


def parse_protean_file(text: str, wanted: set[str]) -> Parsed:
    """
    Protean daily file: no header, `MM/DD/YYYY,PFM ID,PFM name,scheme ID,scheme name,NAV`.
    Names may contain commas, so only the first, fourth and last fields are used.
    """
    navs: dict[str, Nav] = {}
    seen = 0
    for line in text.splitlines():
        parts = line.split(",")
        if len(parts) < 6 or not parts[3].strip().startswith("SM"):
            continue
        seen += 1
        code = parts[3].strip()
        if code in wanted:
            _keep(navs, code, parts[-1], parts[0], "%m/%d/%Y")
    return navs, seen


def download_trust(session: requests.Session) -> str:
    resp = http.get(session, TRUST_URL)
    return resp.content.decode("utf-8-sig", errors="replace")


def download_protean(session: requests.Session, today: date) -> str:
    """The newest daily file on or before `today` (a missing day is a 404)."""
    for back in range(PROTEAN_LOOKBACK_DAYS + 1):
        day = today - timedelta(days=back)
        resp = session.get(PROTEAN_URL.format(ddmmyyyy=day.strftime("%d%m%Y")),
                           timeout=http.TIMEOUT_SECONDS)
        if resp.status_code == 404 or not resp.content.startswith(b"PK"):
            continue
        resp.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(resp.content)) as archive:
            names = [n for n in archive.namelist() if n.lower().endswith(".out") and "/" not in n]
            if names:
                return archive.read(names[0]).decode("utf-8", errors="replace")
    raise JobError(f"No Protean NAV file in the last {PROTEAN_LOOKBACK_DAYS} days")


@dataclass(frozen=True)
class Source:
    name: str
    download: Callable[[], str]
    parse: Callable[[str, set[str]], Parsed]


def default_sources() -> list[Source]:
    session = http.session()
    return [
        Source("npstrust", lambda: download_trust(session), parse_trust_file),
        Source("protean", lambda: download_protean(session, today_ist()), parse_protean_file),
    ]


def held_codes(db: SupabaseRest) -> set[str]:
    rows = fetch_all(db, "nps_holdings", "scheme_code", scheme_code="not.is.null")
    return {str(r["scheme_code"]).strip() for r in rows if str(r["scheme_code"]).strip()}


def first_good(sources: list[Source], codes: set[str]) -> tuple[str, dict[str, Nav]]:
    """NAVs from the first source that downloads and parses; the reasons when none does."""
    problems: list[str] = []
    for source in sources:
        try:
            navs, seen = source.parse(source.download(), codes)
        except (requests.RequestException, JobError, zipfile.BadZipFile) as e:
            problems.append(f"{source.name}: {type(e).__name__}")
            continue
        if seen < MIN_ROWS:
            problems.append(f"{source.name}: looked empty or broken ({seen} rows)")
            continue
        return source.name, navs
    raise JobError("No NPS NAV source worked (" + "; ".join(problems) + ")")


def work(db: SupabaseRest, sources: list[Source] | None = None) -> dict[str, Any]:
    codes = held_codes(db)
    if not codes:
        return {"updated": 0, "unmatched": []}
    source, navs = first_good(sources if sources is not None else default_sources(), codes)
    for code, nav in sorted(navs.items()):
        resp = db.rpc(
            "upsert_nps_nav",
            {"p_code": code, "p_nav": str(nav.nav), "p_date": nav.nav_date.isoformat()},
        )
        if resp.status_code not in (200, 204):
            raise JobError(f"Could not store the NPS NAV for {code} (HTTP {resp.status_code})")
    latest = max((n.nav_date for n in navs.values()), default=None)
    return {
        "updated": len(navs),
        "unmatched": sorted(codes - navs.keys()),
        "nav_date": latest.isoformat() if latest else None,
        "source": source,
    }


if __name__ == "__main__":
    sys.exit(run_job(JOB, work))
