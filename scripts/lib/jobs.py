"""Running a scheduled job: configuration, the `job_runs` record and the exit code.

Every job records one `job_runs` row (status, message, start and finish time) and exits
non-zero on failure, so GitHub emails the owner. Messages never contain secrets.
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from lib.supabase_rest import SupabaseRest

IST = ZoneInfo("Asia/Kolkata")
MESSAGE_MAX = 2000


class JobError(Exception):
    """A failure with a message that is safe to store and show in Settings."""


def today_ist(now: datetime | None = None) -> date:
    return (now or datetime.now(UTC)).astimezone(IST).date()


def service_client() -> SupabaseRest:
    """The service-role client, from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise JobError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return SupabaseRest(url, key)


def fetch_all(db: SupabaseRest, table: str, columns: str = "*", **filters: str) -> list[dict[str, Any]]:
    """Reads a whole (small) table with the service role."""
    resp = db.request("GET", f"/rest/v1/{table}", params={"select": columns, **filters})
    if resp.status_code != 200:
        raise JobError(f"Could not read {table} (HTTP {resp.status_code})")
    rows: list[dict[str, Any]] = resp.json()
    return rows


def record_run(
    db: SupabaseRest, job: str, status: str, message: str, started_at: datetime
) -> None:
    resp = db.insert(
        "job_runs",
        {
            "job": job,
            "status": status,
            "message": message[:MESSAGE_MAX],
            "started_at": started_at.isoformat(),
            "finished_at": datetime.now(UTC).isoformat(),
        },
    )
    if resp.status_code not in (200, 201):
        print(f"warning: could not record the job run (HTTP {resp.status_code})", file=sys.stderr)


def run_job(job: str, work: Callable[[SupabaseRest], dict[str, Any]]) -> int:
    """
    Runs `work`, records the outcome in `job_runs` and returns the process exit code.
    `work` returns a summary dict, stored as JSON in the message. A JobError or any other
    exception is a failure; its message (not the traceback) is stored.
    """
    started = datetime.now(UTC)
    try:
        db = service_client()
    except JobError as e:
        print(f"{job}: failed: {e}", file=sys.stderr)
        return 1
    try:
        summary = work(db)
    except Exception as e:  # noqa: BLE001 - any failure must be recorded and reported
        message = str(e) if isinstance(e, JobError) else f"{type(e).__name__}: {e}"
        traceback.print_exc()
        record_run(db, job, "failure", message, started)
        print(f"{job}: failed: {message}", file=sys.stderr)
        return 1
    message = json.dumps(summary, separators=(",", ":"), sort_keys=True)
    record_run(db, job, "success", message, started)
    print(f"{job}: ok {message}")
    return 0
