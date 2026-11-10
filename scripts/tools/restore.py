"""Restore a backup made by the Backup job into Supabase (docs/RUNBOOK.md, "Restore a backup").

    python -m tools.restore backup-2026-11-08.json.age --identity ~/portfolio-backup-key.txt
    python -m tools.restore backup.json --replace            # wipe the owner's rows first
    python -m tools.restore backup.json --owner-email me@example.com   # into a new project
    python -m tools.restore backup.json --owner-id <uuid>              # same, by user id

Always shows a plan (rows in the backup and in the database now) and asks you to type RESTORE.
Refuses to write over existing rows unless --replace, which deletes the owner's rows in the
backed-up tables and inserts the backup, so the result is exactly the backup. Market data
(NAVs, prices, FX) is not in backups: the jobs refill it. Never prints row contents.
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, like the jobs.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from jobs.backup import TABLES
from lib.jobs import JobError, fetch_all, service_client
from lib.supabase_rest import SupabaseRest

Backup = dict[str, list[dict[str, Any]]]
BATCH = 500
BACKUP_SUFFIXES = (".json", ".age")
MAX_FILE_BYTES = 100 * 1024 * 1024  # backups are a few MB; refuse anything far bigger


def input_file(path: Path, what: str, suffixes: tuple[str, ...] | None = None) -> Path:
    """The absolute path of an existing regular file, checked before anything reads it.

    The restore tool is run by hand with paths the owner types, so this guards against a typo
    (a directory, a device, the wrong kind of file) rather than an attacker.
    """
    resolved = path.expanduser().resolve()
    if suffixes is not None and resolved.suffix not in suffixes:
        raise JobError(f"The {what} must be a {' or '.join(suffixes)} file")
    if not resolved.is_file():
        raise JobError(f"The {what} is not a file: {path}")
    if resolved.stat().st_size > MAX_FILE_BYTES:
        raise JobError(f"The {what} is larger than {MAX_FILE_BYTES // (1024 * 1024)} MB")
    return resolved


def decrypt(path: Path, identity: Path) -> bytes:
    """Decrypts an .age backup in memory. Both paths come from input_file (absolute)."""
    if not shutil.which("age"):
        raise JobError("The `age` command is not installed (brew install age)")
    result = subprocess.run(
        # Absolute paths, so a file name starting with "-" is never read as an age option.
        ["age", "--decrypt", "--identity", str(identity), str(path)],
        capture_output=True,
        check=False,
        timeout=120,
    )
    if result.returncode != 0:
        raise JobError("age could not decrypt the backup: wrong key or damaged file")
    return result.stdout


def load_backup(path: Path, identity: Path | None = None) -> Backup:
    """Reads a backup: plain JSON, or `.age` decrypted in memory with the private key."""
    if path.suffix == ".age":
        if identity is None:
            raise JobError("An .age backup needs --identity (the private key file from age-keygen)")
        raw = decrypt(input_file(path, "backup", BACKUP_SUFFIXES), input_file(identity, "--identity key"))
    else:
        raw = input_file(path, "backup", BACKUP_SUFFIXES).read_bytes()
    try:
        tables = json.loads(raw)["tables"]
    except (ValueError, KeyError, TypeError) as exc:
        raise JobError("Not a backup file: expected JSON with a `tables` object") from exc
    unknown = set(tables) - set(TABLES)
    if unknown:
        raise JobError(f"Unknown tables in the backup: {', '.join(sorted(unknown))}")
    return {table: list(tables.get(table, [])) for table in TABLES}


def with_owner(backup: Backup, owner_id: str | None) -> Backup:
    """Moves every row to `owner_id` (restoring into a project where the owner has a new id)."""
    if owner_id is None:
        return backup
    owners = backup_owners(backup)
    if len(owners) > 1:
        raise JobError("--owner-id needs a backup with a single owner")
    return {t: [{**row, "owner_id": owner_id} for row in rows] for t, rows in backup.items()}


def backup_owners(backup: Backup) -> set[str]:
    return {str(row["owner_id"]) for rows in backup.values() for row in rows}


def plan(db: SupabaseRest, backup: Backup) -> list[tuple[str, int, int]]:
    """(table, rows in the backup, the owners' rows in the database now) per table."""
    owners = backup_owners(backup)
    missing = sorted(o for o in owners if not db.admin_user_exists(o))
    if missing:
        raise JobError(
            "The backup's owner is not a user in this project. Create the owner user first "
            "(Supabase › Authentication › Users), then pass --owner-email (or --owner-id)."
        )
    in_list = f"in.({','.join(sorted(owners))})" if owners else "in.()"
    return [
        (t, len(backup[t]), len(fetch_all(db, t, "id", owner_id=in_list)) if owners else 0)
        for t in TABLES
    ]


def restore(db: SupabaseRest, backup: Backup, *, replace: bool = False) -> dict[str, int]:
    """Writes the backup. Returns rows per table after the restore."""
    steps = plan(db, backup)
    occupied = [t for t, _, now in steps if now]
    if occupied and not replace:
        raise JobError(
            f"The database already has rows in {', '.join(occupied)}. "
            "Use --replace to delete them and restore the backup exactly."
        )
    owners = f"in.({','.join(sorted(backup_owners(backup)))})"
    # Kept in memory so a failed restore can put the owner's rows back as they were.
    before: Backup = {t: fetch_all(db, t, owner_id=owners) for t in TABLES} if replace else {}
    try:
        _write(db, backup, owners, wipe=replace)
    except JobError as failure:
        if replace:
            _write(db, before, owners, wipe=True)
            raise JobError(f"{failure}. Nothing changed: the previous rows were put back.") from failure
        _wipe(db, owners)
        raise
    after = {t: len(fetch_all(db, t, "id", owner_id=owners)) for t in TABLES}
    wrong = [t for t in TABLES if after[t] != len(backup[t])]
    if wrong:
        raise JobError(f"Row counts differ after the restore: {', '.join(wrong)}")
    return after


def _write(db: SupabaseRest, backup: Backup, owners: str, *, wipe: bool) -> None:
    if wipe:
        _wipe(db, owners)
    for table in TABLES:
        rows = backup[table]
        for start in range(0, len(rows), BATCH):
            chunk = rows[start : start + BATCH]
            resp = db.request("POST", f"/rest/v1/{table}", json=chunk, prefer="return=minimal")
            _check(resp, table)


def _wipe(db: SupabaseRest, owners: str) -> None:
    """Deletes the owners' rows in every backed-up table, children first."""
    for table in reversed(TABLES):
        _check(db.request("DELETE", f"/rest/v1/{table}", params={"owner_id": owners}), table)


def _check(resp: Any, table: str) -> None:
    if resp.status_code not in (200, 201, 204):
        try:
            detail = resp.json().get("message", "")[:200]
        except ValueError:
            detail = ""
        raise JobError(f"{table}: HTTP {resp.status_code} {detail}".strip())


def main(argv: list[str] | None = None) -> int:
    args = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    args.add_argument("backup", type=Path, help="backup .json, or .json.age with --identity")
    args.add_argument("--identity", type=Path, help="age private key file (for .age backups)")
    owner = args.add_mutually_exclusive_group()
    owner.add_argument("--owner-email", help="move every row to this user (a new project)")
    owner.add_argument("--owner-id", help="the same, by user id")
    args.add_argument("--replace", action="store_true", help="delete the owner's rows first")
    args.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    opts = args.parse_args(argv)
    try:
        db = service_client()
        owner_id = opts.owner_id
        if opts.owner_email:
            owner_id = db.admin_find_user(opts.owner_email)
            if owner_id is None:
                raise JobError(f"No user {opts.owner_email} in this project: create it first")
        backup = with_owner(load_backup(opts.backup, opts.identity), owner_id)
        steps = plan(db, backup)
        print(f"{'table':22s} {'backup':>7s} {'now':>7s}")
        for table, rows, now in steps:
            print(f"{table:22s} {rows:7d} {now:7d}")
        if any(now for _, _, now in steps) and not opts.replace:
            print("\nThe database already has rows. Nothing written. Add --replace to overwrite.")
            return 1
        action = "DELETE the rows under 'now' and restore" if opts.replace else "restore"
        if not opts.yes and input(f"\nType RESTORE to {action} the backup: ").strip() != "RESTORE":
            print("Cancelled. Nothing written.")
            return 1
        after = restore(db, backup, replace=opts.replace)
        print(f"\nRestored {sum(after.values())} rows. Market data refills on the next job runs.")
        return 0
    except JobError as exc:
        print(f"restore: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
