"""Run a job from this machine against the production Supabase project (docs/RUNBOOK.md, "Jobs").

    python -m tools.run_prod fetch_prices          # asks before it starts
    python -m tools.run_prod fetch_nav --yes       # no question (still prints the target)
    python -m tools.run_prod --list

Settings come from `scripts/.env.prod` (git-ignored by `.env.*`; copy `.env.prod.example`),
and the process environment wins over the file. Needs SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY; `backup` also needs BACKUP_AGE_RECIPIENT (BACKUP_DIR optional).

The job runs exactly as in GitHub Actions (`python -m jobs.<job>`) and records its run in
`job_runs`, so Settings shows it. Only these jobs, never the pytest suite: the job tests write
market data. Never prints the key, only the project host.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import stat
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = SCRIPTS_DIR / ".env.prod"
JOBS = ("fetch_nav", "fetch_nps_nav", "fetch_prices", "snapshot", "backup", "keepalive")
KEYS = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BACKUP_AGE_RECIPIENT", "BACKUP_DIR")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


class SetupError(Exception):
    """A problem with the settings; the message never contains a secret."""


def parse_env_file(text: str) -> dict[str, str]:
    """KEY=VALUE lines (optional `export `, quotes and # comments); only the known keys."""
    values: dict[str, str] = {}
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.removeprefix("export ").strip()
        key, sep, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if not sep or not key:
            raise SetupError(f"{ENV_FILE.name} line {number} is not KEY=VALUE")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        if key in KEYS:
            values[key] = value
    return values


def load_settings(env: dict[str, str], env_file: Path = ENV_FILE) -> dict[str, str]:
    settings: dict[str, str] = {}
    if env_file.is_file():
        mode = env_file.stat().st_mode
        if mode & (stat.S_IRWXG | stat.S_IRWXO):
            print(
                f"warning: {env_file.name} is readable by other users; run chmod 600 {env_file}",
                file=sys.stderr,
            )
        settings.update(parse_env_file(env_file.read_text(encoding="utf-8")))
    settings.update({k: env[k].strip() for k in KEYS if env.get(k, "").strip()})
    return settings


def project_host(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise SetupError("SUPABASE_URL must be the project's https URL (https://<ref>.supabase.co)")
    if parsed.hostname in LOCAL_HOSTS:
        raise SetupError("SUPABASE_URL points at this machine; run the job directly for the local stack")
    return parsed.hostname


def check_service_key(key: str) -> None:
    """A secret key (sb_secret_...) or a legacy JWT whose role is service_role."""
    if key.startswith("sb_secret_"):
        return
    if key.startswith("sb_publishable_"):
        raise SetupError("SUPABASE_SERVICE_ROLE_KEY is the publishable (anon) key, not the secret key")
    parts = key.split(".")
    try:
        if len(parts) != 3:
            raise ValueError
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
        role = payload.get("role") if isinstance(payload, dict) else None
    except (ValueError, UnicodeDecodeError):
        raise SetupError("SUPABASE_SERVICE_ROLE_KEY is not a Supabase secret key") from None
    if role != "service_role":
        raise SetupError("SUPABASE_SERVICE_ROLE_KEY is not the service role key")


def prepare(job: str, settings: dict[str, str]) -> str:
    """Checks the settings for `job`; returns the project host to show."""
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY") if not settings.get(k)]
    if job == "backup" and not settings.get("BACKUP_AGE_RECIPIENT"):
        missing.append("BACKUP_AGE_RECIPIENT")
    if missing:
        raise SetupError(f"Missing {', '.join(missing)} (set them in {ENV_FILE} or the environment)")
    host = project_host(settings["SUPABASE_URL"])
    check_service_key(settings["SUPABASE_SERVICE_ROLE_KEY"])
    return host


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m tools.run_prod", description=__doc__.split("\n")[0])
    parser.add_argument("job", nargs="?", choices=JOBS, help="the job to run")
    parser.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    parser.add_argument("--list", action="store_true", help="list the jobs and exit")
    args = parser.parse_args(argv)
    if args.list or not args.job:
        print("\n".join(JOBS))
        return 0 if args.list else 2

    try:
        settings = load_settings(dict(os.environ))
        host = prepare(args.job, settings)
    except SetupError as e:
        print(f"run_prod: {e}", file=sys.stderr)
        return 2

    print(f"Job {args.job} → {host} (production)")
    if not args.yes:
        try:
            answer = input("Run it? [y/N] ").strip().lower()
        except EOFError:
            answer = ""
        if answer not in ("y", "yes"):
            print("Not run.")
            return 1

    env = {**os.environ, **settings}
    # The job prints its own "ok {summary}" or "failed: ..." line.
    return subprocess.run([sys.executable, "-m", f"jobs.{args.job}"], cwd=SCRIPTS_DIR, env=env, check=False).returncode


if __name__ == "__main__":
    sys.exit(main())
