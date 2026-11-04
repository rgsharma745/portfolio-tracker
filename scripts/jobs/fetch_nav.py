"""Daily mutual fund NAVs from AMFI, for the scheme codes in `mf_holdings` only.

Downloads NAVAll.txt, keeps only the funds the owner holds, and calls `upsert_mf_nav` for
each (the function keeps the latest and previous NAV; no history). A holiday brings no new
dates, which is not an error. The message is JSON: {"updated": n, "unmatched": [codes]}.

Run: `python -m jobs.fetch_nav` from scripts/, with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from lib import http
from lib.jobs import JobError, fetch_all, run_job
from lib.supabase_rest import SupabaseRest

NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
JOB = "fetch_nav"


@dataclass(frozen=True)
class Nav:
    nav: Decimal
    nav_date: date


def parse_nav_file(text: str, wanted: set[str]) -> tuple[dict[str, Nav], int]:
    """
    Parses AMFI's `;`-separated file. Data lines start with a numeric scheme code and end
    with NAV and date (`03-Nov-2026`); the columns in between have changed over time, so
    only the first and the last two are used. Returns NAVs for `wanted` codes and the number
    of data lines seen (to detect an empty or broken download).
    """
    navs: dict[str, Nav] = {}
    seen = 0
    for line in text.splitlines():
        parts = [p.strip() for p in line.split(";")]
        if len(parts) < 4 or not parts[0].isdigit():
            continue
        seen += 1
        code = parts[0]
        if code not in wanted:
            continue
        try:
            nav = Decimal(parts[-2])
            nav_date = datetime.strptime(parts[-1], "%d-%b-%Y").date()
        except (InvalidOperation, ValueError):
            continue  # "N.A." or a malformed line: leave the stored NAV as it is
        if nav <= 0:
            continue
        navs[code] = Nav(nav, nav_date)
    return navs, seen


def held_codes(db: SupabaseRest) -> set[str]:
    rows = fetch_all(db, "mf_holdings", "scheme_code", scheme_code="not.is.null")
    return {str(r["scheme_code"]).strip() for r in rows if str(r["scheme_code"]).strip()}


def work(db: SupabaseRest, download: Any = None) -> dict[str, Any]:
    codes = held_codes(db)
    if not codes:
        return {"updated": 0, "unmatched": []}
    text = download() if download else http.get(http.session(), NAV_URL).text
    navs, seen = parse_nav_file(text, codes)
    if seen < 100:
        raise JobError(f"The AMFI file looked empty or broken ({seen} data lines)")
    for code, nav in sorted(navs.items()):
        resp = db.rpc(
            "upsert_mf_nav",
            {"p_code": code, "p_nav": str(nav.nav), "p_date": nav.nav_date.isoformat()},
        )
        if resp.status_code not in (200, 204):
            raise JobError(f"Could not store the NAV for {code} (HTTP {resp.status_code})")
    latest = max((n.nav_date for n in navs.values()), default=None)
    return {
        "updated": len(navs),
        "unmatched": sorted(codes - navs.keys()),
        "nav_date": latest.isoformat() if latest else None,
    }


if __name__ == "__main__":
    sys.exit(run_job(JOB, work))
