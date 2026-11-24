"""Restoring a backup (tools/restore.py) on the test project with throwaway users."""

from __future__ import annotations

from collections.abc import Iterator
import json
from pathlib import Path
import re
import shutil
import subprocess
from typing import Any

import pytest

from jobs.backup import TABLES
from lib.jobs import JobError, fetch_all
from lib.supabase_rest import SupabaseRest
from tools import restore as tool

from .conftest import AuthUser, Target, _make_user


@pytest.fixture
def owner(service: SupabaseRest, anon: SupabaseRest) -> Iterator[AuthUser]:
    yield from _make_user(service, anon)


@pytest.fixture
def new_owner(service: SupabaseRest, anon: SupabaseRest) -> Iterator[AuthUser]:
    yield from _make_user(service, anon)


def add(db: SupabaseRest, table: str, row: dict[str, Any]) -> str:
    resp = db.insert(table, row)
    assert resp.status_code == 201, f"{table}: {resp.status_code} {resp.text}"
    return str(resp.json()[0]["id"])


def seed(db: SupabaseRest, owner_id: str) -> None:
    """One or more rows in every backed-up table, with numbers that must survive exactly."""
    o = {"owner_id": owner_id}
    p = add(db, "portfolios", {**o, "name": "Me"})
    q = add(db, "portfolios", {**o, "name": "Wife", "sort_order": 1})
    add(db, "mf_holdings", {**o, "portfolio_id": p, "scheme_code": "120503",
                            "scheme_name": "Fund", "units": "1234.5678", "invested": "56789.12"})
    for index, kind in enumerate(("PURCHASE", "PURCHASE_SIP", "SWITCH_IN", "REDEMPTION", "SWITCH_OUT", "DIVIDEND_PAYOUT")):
        add(db, "mf_transactions", {
            **o, "portfolio_id": p, "source_key": f"{index:064x}", "scheme_name": "Fund",
            "folio": "folio", "transaction_date": "2026-10-01", "transaction_type": kind,
            "description": kind, "amount": "100.50",
        })
    add(db, "stock_holdings", {**o, "portfolio_id": q, "market": "US", "symbol": "AAPL",
                               "currency": "USD", "quantity": 3, "invested": "450.25"})
    security = add(db, "equity_securities", {**o, "name": "AAPL Inc", "symbol": "AAPL"})
    g = {**o, "portfolio_id": p}
    grant = add(db, "equity_grants", {
        **g, "security_id": security, "kind": "RSU", "label": "G1",
        "granted_on": "2024-05-01", "quantity": 100,
    })
    tranche = add(db, "equity_schedule", {
        **g, "grant_id": grant, "scheduled_on": "2025-06-01", "quantity": 40,
    })
    event = add(db, "equity_events", {
        **g, "grant_id": grant, "schedule_id": tranche, "kind": "vest", "occurred_on": "2025-06-01",
        "allotted_on": "2025-06-01", "quantity": 40, "fmv": 20, "fx": "85.0001", "currency": "USD",
    })
    sale = add(db, "equity_sales", {
        **g, "security_id": security, "sold_on": "2025-07-01", "price": 25, "fx": 85,
        "currency": "USD",
    })
    add(db, "equity_sale_lots", {**g, "sale_id": sale, "event_id": event, "quantity": 10})
    add(db, "savings_accounts", {**o, "portfolio_id": p, "bank": "HDFC", "balance": "-1500.50"})
    add(db, "pf_entries", {**o, "portfolio_id": p, "company": "Acme", "wage_month": "Oct",
                           "wage_year": 2026, "transaction_date": "2026-11-05",
                           "contribution_type": "monthly", "employee_amount": "1800.00",
                           "employer_amount": "550.00", "pension_amount": "1250"})
    add(db, "ppf_entries", {**o, "portfolio_id": q, "account": "SBI PPF",
                            "entry_date": "2026-04-05", "entry_type": "investment",
                            "amount": "150000.00"})
    add(db, "nps_holdings", {**o, "portfolio_id": p, "account": "Rahul PRAN", "scheme_class": "E",
                             "scheme_code": "SM008001", "scheme_name": "HDFC Scheme E",
                             "units": "1234.5678", "units_as_of": "2026-10-31"})
    add(db, "nps_contributions", {**o, "portfolio_id": p, "account": "Rahul PRAN",
                                  "contribution_date": "2026-10-05", "contributor": "employer",
                                  "amount": "8123.45"})
    add(db, "fixed_deposits", {**o, "portfolio_id": q, "bank": "SBI", "start_date": "2026-04-05",
                               "maturity_date": "2027-04-05", "principal": "100000.00",
                               "rate": "7.100", "compounding": "monthly"})
    add(db, "dividends", {**o, "portfolio_id": q, "market": "US", "symbol": "MSFT",
                          "paid_on": "2026-09-11", "amount_inr": "6890.15", "amount_usd": "82.40"})
    card = add(db, "credit_cards", {**o, "portfolio_id": p, "name": "Card", "bill_day": 14,
                                    "due_day": 3})
    add(db, "card_bills", {**o, "card_id": card, "statement_month": "2026-10-01",
                           "due_date": "2026-11-03", "amount": "5000.00", "paid_amount": "1000"})
    add(db, "portfolio_snapshots", {**o, "portfolio_id": p, "snap_date": "2026-10-31",
                                    "mf_value": "70123.45"})
    add(db, "settings", {**o, "key": "portfolio_scope", "value": {"ids": [p]}})


def snapshot(db: SupabaseRest, owner_id: str) -> tool.Backup:
    """The owner's rows, as the Backup job exports them."""
    return {t: fetch_all(db, t, owner_id=f"eq.{owner_id}") for t in TABLES}


def by_id(backup: tool.Backup) -> dict[str, dict[str, dict[str, Any]]]:
    return {t: {r["id"]: r for r in rows} for t, rows in backup.items()}


def counts(db: SupabaseRest, owner_id: str) -> dict[str, int]:
    return {t: len(rows) for t, rows in snapshot(db, owner_id).items()}


@pytest.mark.parametrize("legacy", [False, True])
def test_restores_lost_data_exactly(service: SupabaseRest, owner: AuthUser, legacy: bool) -> None:
    seed(service, owner.id)
    backup = snapshot(service, owner.id)
    expected = {
        "PURCHASE": "buy", "PURCHASE_SIP": "buy", "SWITCH_IN": "buy",
        "REDEMPTION": "sell", "SWITCH_OUT": "sell", "DIVIDEND_PAYOUT": None,
    }
    assert {row["transaction_type"]: row["transaction_side"] for row in backup["mf_transactions"]} == expected
    restore_input = backup if not legacy else {
        **backup,
        "mf_transactions": [
            {key: value for key, value in row.items() if key != "transaction_side"}
            for row in backup["mf_transactions"]
        ],
    }
    tool._wipe(service, f"in.({owner.id})")
    assert sum(counts(service, owner.id).values()) == 0

    after = tool.restore(service, restore_input)

    assert after == {t: len(rows) for t, rows in backup.items()}
    # Same ids, same values (numeric strings included), same links between tables.
    assert by_id(snapshot(service, owner.id)) == by_id(backup)


def test_refuses_to_write_over_existing_rows(service: SupabaseRest, owner: AuthUser) -> None:
    seed(service, owner.id)
    backup = snapshot(service, owner.id)
    with pytest.raises(JobError, match="--replace"):
        tool.restore(service, backup)
    assert by_id(snapshot(service, owner.id)) == by_id(backup)


def test_replace_returns_to_the_backup(service: SupabaseRest, owner: AuthUser) -> None:
    seed(service, owner.id)
    backup = snapshot(service, owner.id)
    # Changes after the backup: an edited balance, a new account, a deleted card.
    account = backup["savings_accounts"][0]["id"]
    service.update("savings_accounts", {"balance": 1}, id=f"eq.{account}")
    me = backup["portfolios"][0]["id"]
    add(service, "savings_accounts", {"owner_id": owner.id, "portfolio_id": me, "bank": "New"})
    service.delete("credit_cards", id=f"eq.{backup['credit_cards'][0]['id']}")

    tool.restore(service, backup, replace=True)

    assert by_id(snapshot(service, owner.id)) == by_id(backup)


def test_failed_replace_puts_the_previous_rows_back(
    service: SupabaseRest, owner: AuthUser
) -> None:
    seed(service, owner.id)
    before = snapshot(service, owner.id)
    broken = json.loads(json.dumps(before))
    broken["card_bills"][0]["amount"] = "-5"  # violates the amount check, after other tables

    with pytest.raises(JobError, match="previous rows were put back"):
        tool.restore(service, broken, replace=True)

    assert by_id(snapshot(service, owner.id)) == by_id(before)


def test_failed_restore_into_an_empty_project_leaves_it_empty(
    service: SupabaseRest, owner: AuthUser
) -> None:
    seed(service, owner.id)
    backup = json.loads(json.dumps(snapshot(service, owner.id)))
    tool._wipe(service, f"in.({owner.id})")
    backup["card_bills"][0]["amount"] = "-5"

    with pytest.raises(JobError, match="card_bills"):
        tool.restore(service, backup)

    assert sum(counts(service, owner.id).values()) == 0


def test_into_a_new_project_with_a_new_owner_id(
    service: SupabaseRest, owner: AuthUser, new_owner: AuthUser
) -> None:
    seed(service, owner.id)
    backup = snapshot(service, owner.id)
    tool._wipe(service, f"in.({owner.id})")  # the old project is gone

    tool.restore(service, tool.with_owner(backup, new_owner.id))

    restored = by_id(snapshot(service, new_owner.id))
    expected = by_id(tool.with_owner(backup, new_owner.id))
    assert restored == expected
    assert sum(counts(service, owner.id).values()) == 0


def test_owner_must_exist(service: SupabaseRest) -> None:
    ghost = "00000000-0000-4000-8000-000000000000"
    backup = {t: [] for t in TABLES}
    backup["portfolios"] = [{"id": ghost, "owner_id": ghost, "name": "x"}]
    with pytest.raises(JobError, match="--owner-email"):
        tool.restore(service, backup)


def test_with_owner_needs_a_single_owner_backup() -> None:
    backup = {t: [] for t in TABLES}
    backup["portfolios"] = [{"owner_id": "a"}, {"owner_id": "b"}]
    with pytest.raises(JobError, match="single owner"):
        tool.with_owner(backup, "c")


def test_load_backup_rejects_other_files(tmp_path: Path) -> None:
    junk = tmp_path / "junk.json"
    junk.write_text('{"rows": []}')
    with pytest.raises(JobError, match="Not a backup"):
        tool.load_backup(junk)
    odd = tmp_path / "odd.json"
    odd.write_text('{"tables": {"auth_users": []}}')
    with pytest.raises(JobError, match="Unknown tables"):
        tool.load_backup(odd)
    with pytest.raises(JobError, match="--identity"):
        tool.load_backup(tmp_path / "backup.json.age")


def test_load_backup_checks_paths_before_reading(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(JobError, match="not a file"):
        tool.load_backup(tmp_path / "missing.json")
    folder = tmp_path / "folder.json"
    folder.mkdir()
    with pytest.raises(JobError, match="not a file"):
        tool.load_backup(folder)
    wrong = tmp_path / "notes.txt"
    wrong.write_text("{}")
    with pytest.raises(JobError, match=r"\.json or \.age"):
        tool.load_backup(wrong)
    age = tmp_path / "backup.json.age"
    age.write_bytes(b"x")
    with pytest.raises(JobError, match="--identity key is not a file"):
        tool.load_backup(age, tmp_path / "no-key.txt")
    big = tmp_path / "big.json"
    big.write_text("{}")
    monkeypatch.setattr(tool, "MAX_FILE_BYTES", 1)
    with pytest.raises(JobError, match="larger than"):
        tool.load_backup(big)


def test_input_file_returns_an_absolute_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "-backup.json").write_text("{}")
    monkeypatch.chdir(tmp_path)
    resolved = tool.input_file(Path("-backup.json"), "backup", tool.BACKUP_SUFFIXES)
    assert resolved.is_absolute()
    assert not str(resolved).startswith("-")


@pytest.mark.skipif(not shutil.which("age"), reason="age is not installed")
def test_age_backup_round_trip(tmp_path: Path, service: SupabaseRest, owner: AuthUser) -> None:
    """The real path: the Backup job's encrypted file, decrypted in memory and restored."""
    from jobs.backup import encrypt

    key = tmp_path / "key.txt"
    subprocess.run(["age-keygen", "-o", str(key)], check=True, capture_output=True)
    recipient = next(
        line.split(": ")[1] for line in key.read_text().splitlines() if "public key" in line
    )
    seed(service, owner.id)
    backup = snapshot(service, owner.id)
    out = tmp_path / "backup.json.age"
    encrypt(json.dumps({"tables": backup}, default=str).encode(), recipient, out)
    tool._wipe(service, f"in.({owner.id})")

    tool.restore(service, tool.load_backup(out, key))

    assert by_id(snapshot(service, owner.id)) == by_id(backup)
    with pytest.raises(JobError, match="wrong key"):
        other = tmp_path / "other.txt"
        subprocess.run(["age-keygen", "-o", str(other)], check=True, capture_output=True)
        tool.load_backup(out, other)


def test_cli_shows_a_plan_and_needs_confirmation(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    target: Target,
    service: SupabaseRest,
    owner: AuthUser,
) -> None:
    monkeypatch.setenv("SUPABASE_URL", target.url)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", target.service_key)
    seed(service, owner.id)
    backup = snapshot(service, owner.id)
    path = tmp_path / "backup.json"
    path.write_text(json.dumps({"tables": backup}))

    # Rows exist and no --replace: plan shown, nothing written.
    assert tool.main([str(path)]) == 1
    out = capsys.readouterr().out
    assert "portfolios" in out and "Add --replace" in out

    # --replace but the confirmation is not typed: cancelled.
    service.update("savings_accounts", {"balance": 1}, owner_id=f"eq.{owner.id}")
    monkeypatch.setattr("builtins.input", lambda _prompt: "no")
    assert tool.main([str(path), "--replace"]) == 1
    assert snapshot(service, owner.id)["savings_accounts"][0]["balance"] == 1

    monkeypatch.setattr("builtins.input", lambda _prompt: "RESTORE")
    assert tool.main([str(path), "--replace"]) == 0
    assert by_id(snapshot(service, owner.id)) == by_id(backup)
    # Only names and counts are printed, never values.
    assert "HDFC" not in capsys.readouterr().out


def test_cli_into_a_new_owner_by_email(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    target: Target,
    service: SupabaseRest,
    owner: AuthUser,
    new_owner: AuthUser,
) -> None:
    monkeypatch.setenv("SUPABASE_URL", target.url)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", target.service_key)
    seed(service, owner.id)
    backup = snapshot(service, owner.id)
    tool._wipe(service, f"in.({owner.id})")
    path = tmp_path / "backup.json"
    path.write_text(json.dumps({"tables": backup}))
    email = next(
        u["email"]
        for u in service.request("GET", "/auth/v1/admin/users", params={"per_page": "1000"})
        .json()["users"]
        if u["id"] == new_owner.id
    )

    assert tool.main([str(path), "--owner-email", email.upper(), "--yes"]) == 0
    assert counts(service, new_owner.id) == {t: len(rows) for t, rows in backup.items()}
    assert tool.main([str(path), "--owner-email", "nobody@example.com", "--yes"]) == 1


def test_backup_covers_the_same_tables_as_the_app_export() -> None:
    # The owner's JSON export (Settings) and the weekly backup must list the same tables.
    source = (Path(__file__).resolve().parents[2]
              / "web/src/app/core/data/export.service.ts").read_text()
    equity = source.split("EQUITY_TABLES = [", 1)[1].split("] as const", 1)[0]
    block = source.split("EXPORT_TABLES = [", 1)[1].split("] as const", 1)[0]
    assert re.findall(r"'([a-z_]+)'", block.replace("...EQUITY_TABLES", equity)) == list(TABLES)


def test_legacy_rsu_backup_restores_other_assets(tmp_path: Path) -> None:
    path = tmp_path / "backup.json"
    legacy_snapshot = {"id": "snapshot", "owner_id": "owner", "mf_value": 100, "rsu_vested_value": 200}
    path.write_text(json.dumps({"tables": {
        "rsu_grants": [{"owner_id": "owner"}],
        "portfolio_snapshots": [legacy_snapshot],
    }}))
    loaded = tool.load_backup(path)
    assert "rsu_grants" not in loaded
    assert loaded["equity_grants"] == []
    assert loaded["portfolio_snapshots"] == [{"id": "snapshot", "owner_id": "owner", "mf_value": 100}]
