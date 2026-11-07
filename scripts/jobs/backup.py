"""Weekly backup: every owner table as JSON, encrypted with `age` before it touches disk.

The plaintext only exists in memory and is piped straight to `age`; the workflow uploads the
encrypted file as an artifact (kept 90 days). Decrypt with
`age -d -i key.txt backup-YYYY-MM-DD.json.age > backup.json` (docs/RUNBOOK.md).

Needs BACKUP_AGE_RECIPIENT (an age public key, `age1...`) and the `age` command.
Run: `python -m jobs.backup` from scripts/ (BACKUP_DIR sets the output folder).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from lib.jobs import JobError, fetch_all, run_job, today_ist
from lib.supabase_rest import SupabaseRest

JOB = "backup"

# The owner's own data, the same list as the app's JSON export (web/src/app/core/data/export.service.ts).
TABLES = (
    "portfolios",
    "mf_holdings",
    "stock_holdings",
    "rsu_grants",
    "savings_accounts",
    "pf_entries",
    "ppf_entries",
    "credit_cards",
    "card_bills",
    "portfolio_snapshots",
    "settings",
)


def export(db: SupabaseRest) -> dict[str, Any]:
    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "tables": {table: fetch_all(db, table) for table in TABLES},
    }


def encrypt(plaintext: bytes, recipient: str, out: Path) -> None:
    if not shutil.which("age"):
        raise JobError("The `age` command is not installed")
    result = subprocess.run(
        ["age", "--recipient", recipient, "--output", str(out)],
        input=plaintext,
        capture_output=True,
        check=False,
        timeout=120,
    )
    if result.returncode != 0:
        raise JobError(f"age could not encrypt the backup (exit {result.returncode})")


def work(db: SupabaseRest) -> dict[str, Any]:
    recipient = os.environ.get("BACKUP_AGE_RECIPIENT", "").strip()
    if not recipient.startswith("age1"):
        raise JobError("BACKUP_AGE_RECIPIENT must be an age public key (age1...)")
    data = export(db)
    out_dir = Path(os.environ.get("BACKUP_DIR", "backup-out"))
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"backup-{today_ist().isoformat()}.json.age"
    encrypt(json.dumps(data, indent=1, default=str).encode(), recipient, out)
    return {"file": out.name, "rows": {t: len(rows) for t, rows in data["tables"].items()}}


if __name__ == "__main__":
    sys.exit(run_job(JOB, work))
