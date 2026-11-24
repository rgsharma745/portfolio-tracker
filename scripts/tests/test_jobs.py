"""The jobs end to end against the database, with the network replaced by fixed data.

Each test creates its own holdings under a throwaway user (removed with the user) and uses
unique scheme codes and symbols, cleaning up the shared market rows it wrote.
"""

from __future__ import annotations

import json
import random
import shutil
import subprocess
from collections.abc import Iterator
from datetime import date
from decimal import Decimal
from typing import Any

import pytest

from jobs import backup, fetch_nav, fetch_nps_nav, fetch_prices, keepalive, snapshot
from jobs.providers import Quote
from lib import jobs as joblib
from lib.supabase_rest import SupabaseRest

from .conftest import AuthUser

TODAY = date(2026, 11, 4)


def rows(db: SupabaseRest, table: str, **filters: str) -> list[dict[str, Any]]:
    resp = db.select(table, **filters)
    assert resp.status_code == 200, resp.text
    return resp.json()


def insert(db: SupabaseRest, table: str, row: dict[str, Any]) -> dict[str, Any]:
    resp = db.insert(table, row)
    assert resp.status_code == 201, resp.text
    return resp.json()[0]


@pytest.fixture
def portfolio(service: SupabaseRest, user_a: AuthUser) -> Iterator[dict[str, Any]]:
    p = insert(
        service,
        "portfolios",
        {"owner_id": user_a.id, "name": f"pytest-{random.randrange(10**9)}"},
    )
    yield p
    service.delete("portfolios", id=f"eq.{p['id']}")


@pytest.fixture
def codes(service: SupabaseRest) -> Iterator[list[str]]:
    """Two numeric scheme codes (AMFI codes are numbers) that no real fund uses here."""
    picked = [str(90_000_000 + random.randrange(9_000_000)) for _ in range(2)]
    yield picked
    for code in picked:
        service.delete("mf_nav_latest", scheme_code=f"eq.{code}")


@pytest.fixture
def symbols(service: SupabaseRest) -> Iterator[dict[str, str]]:
    tag = f"{random.randrange(10**6):06d}"
    picked = {"india": f"PYIN{tag}", "us": f"PYUS{tag}", "rsu": f"PYRS{tag}"}
    yield picked
    for s in picked.values():
        service.delete("stock_price_latest", symbol=f"eq.{s}")


def amfi_file(navs: dict[str, str], nav_date: str = "03-Nov-2026") -> str:
    filler = "\n".join(f"{100000 + i};-;-;Filler Fund {i};Direct;Growth;10.0;{nav_date}" for i in range(150))
    held = "\n".join(f"{code};-;-;Pytest Fund;Direct;Growth;{nav};{nav_date}" for code, nav in navs.items())
    return f"Scheme Code;x;x;Scheme Name;Plan;Option;Net Asset Value;Date\n{filler}\n{held}\n"


# ---- fetch_nav ----


def test_fetch_nav_stores_held_codes_only_and_reports_unmatched(
    service: SupabaseRest, user_a: AuthUser, portfolio: dict[str, Any], codes: list[str]
) -> None:
    held, missing = codes
    for code, units in ((held, 1), (missing, 1), ("100000", 0)):
        insert(
            service,
            "mf_holdings",
            {"owner_id": user_a.id, "portfolio_id": portfolio["id"], "scheme_name": f"Pytest {code}", "scheme_code": code, "units": units},
        )
    file = amfi_file({held: "12.3456"})

    summary = fetch_nav.work(service, download=lambda: file)
    assert missing in summary["unmatched"]
    assert held not in summary["unmatched"]
    stored = rows(service, "mf_nav_latest", scheme_code=f"eq.{held}")
    assert Decimal(str(stored[0]["nav"])) == Decimal("12.3456")
    assert stored[0]["nav_date"] == "2026-11-03"
    # The AMFI file contains this closed fund, which needs no NAV refresh.
    assert rows(service, "mf_nav_latest", scheme_code="eq.100000") == []

    # Re-running (or a holiday with no new date) changes nothing and adds no rows.
    fetch_nav.work(service, download=lambda: file)
    assert len(rows(service, "mf_nav_latest", scheme_code=f"eq.{held}")) == 1
    # The next day moves the NAV into prev_nav, which is how "today" works.
    fetch_nav.work(service, download=lambda: amfi_file({held: "12.5"}, "04-Nov-2026"))
    after = rows(service, "mf_nav_latest", scheme_code=f"eq.{held}")[0]
    assert Decimal(str(after["prev_nav"])) == Decimal("12.3456")
    assert after["nav_date"] == "2026-11-04"


def test_fetch_nav_fails_on_a_broken_file(service: SupabaseRest, user_a: AuthUser, portfolio: dict[str, Any], codes: list[str]) -> None:
    insert(
        service,
        "mf_holdings",
        {"owner_id": user_a.id, "portfolio_id": portfolio["id"], "scheme_name": "Pytest", "scheme_code": codes[0], "units": 1},
    )
    with pytest.raises(joblib.JobError, match="empty or broken"):
        fetch_nav.work(service, download=lambda: "<html>maintenance</html>")


# ---- fetch_nps_nav ----


@pytest.fixture
def nps_codes(service: SupabaseRest) -> Iterator[list[str]]:
    """Three NPS-style scheme codes that no real scheme uses."""
    picked = [f"SMPY{random.randrange(10**6):06d}" for _ in range(3)]
    yield picked
    for code in picked:
        service.delete("nps_nav_latest", scheme_code=f"eq.{code}")


def trust_file(navs: dict[str, str], nav_date: str = "2026-11-06") -> str:
    head = "ID\tDATE OF NAV\tPFM NAME\tSCHEME ID\tSCHEME NAME\tNAV VALUE\n"
    filler = "".join(f"{i}\t{nav_date}\tPFM\tSMFILL{i:04d}\tFiller\t10\n" for i in range(150))
    held = "".join(f"9\t{nav_date}\tPFM\t{code}\tPytest\t{nav}\n" for code, nav in navs.items())
    return head + filler + held


def test_fetch_nps_nav_stores_held_codes_skips_manual_and_reports_unmatched(
    service: SupabaseRest, user_a: AuthUser, portfolio: dict[str, Any], nps_codes: list[str]
) -> None:
    held, manual, missing = nps_codes
    for cls, code in zip("ECG", nps_codes, strict=True):
        insert(service, "nps_holdings", {
            "owner_id": user_a.id, "portfolio_id": portfolio["id"], "account": "Pytest PRAN",
            "scheme_class": cls, "scheme_code": code, "scheme_name": f"Pytest {cls}", "units": 10,
        })
    insert(service, "nps_nav_latest", {"scheme_code": manual, "nav": 99, "nav_date": "2026-11-01",
                                       "is_manual": True})
    file = trust_file({held: "55.1949", manual: "12"})
    source = fetch_nps_nav.Source("test", lambda: file, fetch_nps_nav.parse_trust_file)

    summary = fetch_nps_nav.work(service, sources=[source])
    # Other users' codes (e.g. the local seed) may be unmatched too: check membership.
    assert missing in summary["unmatched"] and held not in summary["unmatched"]
    assert manual not in summary["unmatched"] and summary["source"] == "test"
    stored = rows(service, "nps_nav_latest", scheme_code=f"eq.{held}")[0]
    assert Decimal(str(stored["nav"])) == Decimal("55.1949") and stored["nav_date"] == "2026-11-06"
    assert Decimal(str(rows(service, "nps_nav_latest", scheme_code=f"eq.{manual}")[0]["nav"])) == 99
    assert rows(service, "nps_nav_latest", scheme_code="eq.SMFILL0000") == []

    nxt = fetch_nps_nav.Source("test", lambda: trust_file({held: "56"}, "2026-11-07"),
                               fetch_nps_nav.parse_trust_file)
    fetch_nps_nav.work(service, sources=[nxt])
    after = rows(service, "nps_nav_latest", scheme_code=f"eq.{held}")[0]
    assert Decimal(str(after["prev_nav"])) == Decimal("55.1949") and after["nav_date"] == "2026-11-07"


def test_fetch_nps_nav_fails_when_no_source_works(
    service: SupabaseRest, user_a: AuthUser, portfolio: dict[str, Any], nps_codes: list[str]
) -> None:
    insert(service, "nps_holdings", {
        "owner_id": user_a.id, "portfolio_id": portfolio["id"], "account": "Pytest PRAN",
        "scheme_class": "E", "scheme_code": nps_codes[0], "scheme_name": "Pytest E",
    })
    broken = fetch_nps_nav.Source("x", lambda: "<html>maintenance</html>", fetch_nps_nav.parse_trust_file)
    with pytest.raises(joblib.JobError, match="No NPS NAV source worked"):
        fetch_nps_nav.work(service, sources=[broken])


# ---- fetch_prices ----


class FakeProvider:
    def __init__(self, name: str, prices: dict[str, str]) -> None:
        self.name = name
        self.prices = prices
        self.asked: set[str] = set()

    def fetch(self, wanted: set[str], today: date) -> dict[str, Quote]:
        self.asked |= wanted
        return {s: Quote(Decimal(p), date(2026, 11, 3), self.name) for s, p in self.prices.items() if s in wanted}


def test_fetch_prices_uses_fallbacks_skips_manual_and_stores_fx(
    service: SupabaseRest, user_a: AuthUser, portfolio: dict[str, Any], symbols: dict[str, str]
) -> None:
    pid = portfolio["id"]
    base = {"owner_id": user_a.id, "portfolio_id": pid, "quantity": 1, "invested": 1}
    insert(service, "stock_holdings", {**base, "market": "IN", "symbol": symbols["india"], "currency": "INR"})
    insert(service, "stock_holdings", {**base, "market": "US", "symbol": symbols["us"], "currency": "USD"})
    insert(
        service,
        "rsu_grants",
        {"owner_id": user_a.id, "portfolio_id": pid, "symbol": symbols["rsu"], "grant_label": "pytest"},
    )
    # The owner set the RSU symbol's price by hand: the job must not fetch or overwrite it.
    insert(service, "stock_price_latest", {"symbol": symbols["rsu"], "close": 99, "price_date": "2026-11-01", "is_manual": True})
    fx_before = rows(service, "fx_latest", pair="eq.USDINR")

    nse = FakeProvider("nse", {})  # bhavcopy lacks the symbol: the Yahoo fallback is used
    yahoo_in = FakeProvider("yahoo", {symbols["india"]: "1500.5"})
    yahoo_us = FakeProvider("yahoo", {symbols["us"]: "60.25"})
    try:
        summary = fetch_prices.work(
            service,
            today=TODAY,
            nse=nse,
            yahoo_india=yahoo_in,
            yahoo_us=yahoo_us,
            usd_inr=lambda d: Quote(Decimal("85.5"), date(2026, 11, 3), "frankfurter"),
        )
        assert symbols["rsu"] not in yahoo_us.asked
        india = rows(service, "stock_price_latest", symbol=f"eq.{symbols['india']}")[0]
        assert Decimal(str(india["close"])) == Decimal("1500.5") and india["source"] == "yahoo"
        manual = rows(service, "stock_price_latest", symbol=f"eq.{symbols['rsu']}")[0]
        assert Decimal(str(manual["close"])) == 99
        assert symbols["india"] not in summary["missing"] and symbols["us"] not in summary["missing"]
        fx = rows(service, "fx_latest", pair="eq.USDINR")
        assert fx and (fx[0]["is_manual"] or summary["fx"] == "frankfurter")
    finally:
        # Put the shared USDINR row back as it was, so local data is not disturbed.
        service.delete("fx_latest", pair="eq.USDINR")
        if fx_before:
            service.request("POST", "/rest/v1/fx_latest", json=fx_before[0], prefer="resolution=merge-duplicates")


def test_fetch_prices_fails_when_nothing_can_be_priced(
    service: SupabaseRest, user_a: AuthUser, portfolio: dict[str, Any], symbols: dict[str, str]
) -> None:
    insert(
        service,
        "stock_holdings",
        {"owner_id": user_a.id, "portfolio_id": portfolio["id"], "market": "IN", "symbol": symbols["india"], "currency": "INR"},
    )
    empty = FakeProvider("x", {})
    # Other local users' symbols are also asked for; none of them are priced either.
    with pytest.raises(joblib.JobError, match="No prices"):
        fetch_prices.work(service, today=TODAY, nse=empty, yahoo_india=empty, yahoo_us=empty, usd_inr=lambda d: None)


# ---- snapshot ----


def test_snapshot_writes_one_row_per_portfolio_per_day(
    service: SupabaseRest, user_a: AuthUser, portfolio: dict[str, Any], nps_codes: list[str]
) -> None:
    insert(service, "savings_accounts", {"owner_id": user_a.id, "portfolio_id": portfolio["id"], "bank": "Pytest", "balance": 1234.5})
    card = insert(service, "credit_cards", {"owner_id": user_a.id, "portfolio_id": portfolio["id"], "name": f"pytest-{portfolio['id'][:8]}"})
    insert(service, "card_bills", {"owner_id": user_a.id, "card_id": card["id"], "statement_month": "2026-10-01", "due_date": "2026-11-03", "amount": 500, "paid_amount": 100})
    pf = {"owner_id": user_a.id, "portfolio_id": portfolio["id"], "company": "Pytest Co"}
    insert(service, "pf_entries", {**pf, "contribution_type": "monthly", "wage_month": "Oct", "wage_year": 2026, "transaction_date": "2026-11-05", "employee_amount": 1800, "employer_amount": 550.25, "pension_amount": 1250})
    insert(service, "pf_entries", {**pf, "contribution_type": "interest", "transaction_date": "2026-08-20", "employee_amount": 100, "employer_amount": 50, "pension_amount": 0})
    ppf = {"owner_id": user_a.id, "portfolio_id": portfolio["id"], "account": "Pytest PPF"}
    insert(service, "ppf_entries", {**ppf, "entry_type": "investment", "entry_date": "2026-04-05", "amount": 150000})
    insert(service, "ppf_entries", {**ppf, "entry_type": "interest", "entry_date": "2026-03-31", "amount": 10650.75})
    insert(service, "nps_nav_latest", {"scheme_code": nps_codes[0], "nav": "55.1949", "nav_date": "2026-11-06"})
    nps = {"owner_id": user_a.id, "portfolio_id": portfolio["id"], "account": "Pytest PRAN"}
    insert(service, "nps_holdings", {**nps, "scheme_class": "E", "scheme_code": nps_codes[0], "scheme_name": "E", "units": "100.5"})
    insert(service, "nps_holdings", {**nps, "scheme_class": "G", "scheme_code": nps_codes[1], "scheme_name": "G", "units": 7})
    fd = {"owner_id": user_a.id, "portfolio_id": portfolio["id"], "bank": "Pytest Bank"}
    insert(service, "fixed_deposits", {**fd, "start_date": "2000-07-01", "maturity_date": "2001-07-01", "principal": 100000, "rate": 7})
    insert(service, "fixed_deposits", {**fd, "start_date": "1999-01-01", "maturity_date": "2000-01-01", "principal": 50000, "rate": 6, "compounding": "yearly"})

    day = date(2001, 1, 1)  # a date no real snapshot uses, so other users' history is untouched
    try:
        snapshot.work(service, today=day)
        snapshot.work(service, today=day)  # idempotent: replaces the row
        mine = rows(service, "portfolio_snapshots", portfolio_id=f"eq.{portfolio['id']}", snap_date="eq.2001-01-01")
        assert len(mine) == 1
        assert Decimal(str(mine[0]["savings"])) == Decimal("1234.5")
        assert Decimal(str(mine[0]["card_dues"])) == Decimal(400)
        assert Decimal(str(mine[0]["pf_balance"])) == Decimal("2500.25")  # pension left out
        assert Decimal(str(mine[0]["ppf_balance"])) == Decimal("160650.75")
        assert Decimal(str(mine[0]["nps_value"])) == Decimal("5547.09")  # G has no NAV yet
        assert Decimal(str(mine[0]["fd_value"])) == Decimal("156560.15")  # 184 of 365 days; one matured
        assert mine[0]["owner_id"] == user_a.id
    finally:
        service.delete("portfolio_snapshots", snap_date="eq.2001-01-01")


# ---- backup, keepalive, run_job ----


def test_backup_encrypts_every_owner_table(service: SupabaseRest, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:  # noqa: ANN001
    captured: dict[str, Any] = {}

    def fake_encrypt(plaintext: bytes, recipient: str, out) -> None:  # noqa: ANN001
        captured.update(data=json.loads(plaintext), recipient=recipient, out=out)

    monkeypatch.setenv("BACKUP_AGE_RECIPIENT", "age1pytestrecipient")
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path))
    monkeypatch.setattr(backup, "encrypt", fake_encrypt)
    summary = backup.work(service)
    assert set(captured["data"]["tables"]) == set(backup.TABLES)
    assert captured["recipient"] == "age1pytestrecipient"
    assert summary["file"].endswith(".json.age")
    assert not any(tmp_path.iterdir())  # nothing unencrypted was written


def test_backup_needs_a_recipient(service: SupabaseRest, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BACKUP_AGE_RECIPIENT", "not-a-key")
    with pytest.raises(joblib.JobError, match="age public key"):
        backup.work(service)


def test_run_job_records_success_and_failure(service: SupabaseRest, target, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: ANN001
    monkeypatch.setenv("SUPABASE_URL", target.url)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", target.service_key)
    job = f"pytest-{random.randrange(10**9)}"
    try:
        assert joblib.run_job(job, keepalive.work) == 0

        def boom(db: SupabaseRest) -> dict[str, Any]:
            raise joblib.JobError("source is down")

        assert joblib.run_job(job, boom) == 1
        runs = rows(service, "job_runs", job=f"eq.{job}", order="id")
        assert [r["status"] for r in runs] == ["success", "failure"]
        assert json.loads(runs[0]["message"]) == {"ok": True}
        assert runs[1]["message"] == "source is down"
        assert all(r["finished_at"] for r in runs)
    finally:
        service.delete("job_runs", job=f"eq.{job}")


def test_run_job_needs_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    assert joblib.run_job("pytest-unconfigured", keepalive.work) == 1


@pytest.mark.skipif(
    not (shutil.which("age") and shutil.which("age-keygen")), reason="age is not installed"
)
def test_backup_round_trips_through_age(tmp_path) -> None:  # noqa: ANN001
    key = tmp_path / "key.txt"
    subprocess.run(["age-keygen", "-o", str(key)], check=True, capture_output=True)
    recipient = next(
        line.split(": ", 1)[1] for line in key.read_text().splitlines() if "public key" in line
    )
    out = tmp_path / "b.json.age"
    backup.encrypt(b'{"tables": {}}', recipient, out)
    assert b"tables" not in out.read_bytes()
    plain = subprocess.run(
        ["age", "--decrypt", "--identity", str(key), str(out)], check=True, capture_output=True
    ).stdout
    assert json.loads(plain) == {"tables": {}}
