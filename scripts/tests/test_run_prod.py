"""The run_prod helper: settings, key checks and confirmation (never runs a real job)."""

from __future__ import annotations

import base64
import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from tools import run_prod
from tools.run_prod import SetupError, check_service_key, load_settings, parse_env_file, prepare, project_host

URL = "https://abcdefgh.supabase.co"


def jwt(role: str) -> str:
    def part(obj: dict[str, Any]) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    return f"{part({'alg': 'HS256'})}.{part({'role': role})}.sig"


def test_parse_env_file_reads_known_keys_only() -> None:
    text = "# comment\n\nexport SUPABASE_URL='https://x.supabase.co'\nSUPABASE_SERVICE_ROLE_KEY=\"sb_secret_a=b\"\nOTHER=1\n"
    assert parse_env_file(text) == {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_a=b"}
    with pytest.raises(SetupError, match="line 1"):
        parse_env_file("nonsense")


def test_environment_wins_over_the_file(tmp_path: Path) -> None:
    env_file = tmp_path / ".env.prod"
    env_file.write_text(f"SUPABASE_URL={URL}\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_file\n")
    env_file.chmod(0o600)
    settings = load_settings({"SUPABASE_SERVICE_ROLE_KEY": "sb_secret_env", "HOME": "/x"}, env_file)
    assert settings == {"SUPABASE_URL": URL, "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_env"}
    assert load_settings({}, tmp_path / "missing") == {}


def test_project_host_needs_a_remote_https_url() -> None:
    assert project_host(URL) == "abcdefgh.supabase.co"
    for bad in ("http://abcdefgh.supabase.co", "https://127.0.0.1:54321", "abcdefgh.supabase.co"):
        with pytest.raises(SetupError):
            project_host(bad)


def test_check_service_key_refuses_the_anon_key() -> None:
    check_service_key("sb_secret_abc")
    check_service_key(jwt("service_role"))
    for bad in ("sb_publishable_abc", jwt("anon"), "not-a-key", "a.!!!.c"):
        with pytest.raises(SetupError) as e:
            check_service_key(bad)
        assert bad not in str(e.value)


def test_prepare_lists_what_is_missing() -> None:
    with pytest.raises(SetupError, match="SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"):
        prepare("fetch_prices", {})
    good = {"SUPABASE_URL": URL, "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_abc"}
    assert prepare("fetch_prices", good) == "abcdefgh.supabase.co"
    with pytest.raises(SetupError, match="BACKUP_AGE_RECIPIENT"):
        prepare("backup", good)


@pytest.fixture
def configured(monkeypatch: pytest.MonkeyPatch) -> list[list[str]]:
    monkeypatch.setattr(run_prod, "load_settings", lambda env: {"SUPABASE_URL": URL, "SUPABASE_SERVICE_ROLE_KEY": "sb_secret_abc"})
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        assert kwargs["env"]["SUPABASE_SERVICE_ROLE_KEY"] == "sb_secret_abc"
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr(run_prod.subprocess, "run", fake_run)
    return calls


def test_main_asks_first_and_runs_the_job(configured: list[list[str]], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr("builtins.input", lambda prompt: "n")
    assert run_prod.main(["fetch_prices"]) == 1 and configured == []
    monkeypatch.setattr("builtins.input", lambda prompt: "y")
    assert run_prod.main(["fetch_prices"]) == 0
    assert configured[0][1:] == ["-m", "jobs.fetch_prices"]
    assert run_prod.main(["snapshot", "--yes"]) == 0
    out = capsys.readouterr().out
    assert "abcdefgh.supabase.co" in out and "sb_secret_abc" not in out


def test_main_reports_bad_settings_without_running(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr(run_prod, "load_settings", lambda env: {})
    assert run_prod.main(["fetch_nav", "--yes"]) == 2
    assert "Missing" in capsys.readouterr().err
    assert run_prod.main(["--list"]) == 0
