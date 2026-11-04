"""Weekly keep-alive: one tiny query, so the free Supabase project never pauses for
inactivity even if the other jobs stop running.

Run: `python -m jobs.keepalive` from scripts/.
"""

from __future__ import annotations

import sys
from typing import Any

from lib.jobs import fetch_all, run_job
from lib.supabase_rest import SupabaseRest

JOB = "keepalive"


def work(db: SupabaseRest) -> dict[str, Any]:
    fetch_all(db, "portfolios", "id", limit="1")
    return {"ok": True}


if __name__ == "__main__":
    sys.exit(run_job(JOB, work))
