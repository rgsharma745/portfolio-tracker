"""Focused tests for CAMS statement mapping and idempotent writes."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from lib.jobs import JobError
from casparser.enums import CASFileType, FileType
from tools import import_cas


def transaction(*, amount: str = "100", units: str = "10") -> SimpleNamespace:
    return SimpleNamespace(
        date=date(2025, 1, 2),
        type="PURCHASE",
        description="Systematic investment",
        amount=Decimal(amount),
        units=Decimal(units),
        nav=Decimal("10"),
        balance=Decimal("10"),
    )


def scheme(
    name: str = "Index Fund",
    *,
    code: str | None = "12345",
    transactions: list[Any] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        scheme=name,
        amfi=code,
        isin=None,
        close=Decimal("12"),
        valuation=SimpleNamespace(cost=Decimal("120")),
        transactions=transactions or [transaction()],
    )


def statement(*folios: tuple[str, list[Any]]) -> SimpleNamespace:
    return SimpleNamespace(
        folios=[SimpleNamespace(folio=folio, schemes=schemes) for folio, schemes in folios]
    )


PORTFOLIOS = [
    {"id": "p1", "owner_id": "owner", "name": "Me", "is_active": True},
    {"id": "p2", "owner_id": "owner", "name": "Wife", "is_active": True},
]


def test_prepare_import_maps_folios_and_reconciles_matching_manual_holding() -> None:
    holdings = [
        {
            "id": "holding-1",
            "portfolio_id": "p1",
            "scheme_code": "12345",
            "scheme_name": "Index Fund",
            "folio": None,
        }
    ]

    transactions, positions, mapping = import_cas.prepare_import(
        statement(("folio-1", [scheme()])), PORTFOLIOS, holdings, ["folio-1=Me"]
    )

    assert mapping == {"folio-1": "p1"}
    assert positions == [
        {
            "portfolio_id": "p1",
            "scheme_code": "12345",
            "scheme_name": "Index Fund",
            "folio": "folio-1",
            "units": "12",
            "invested": "120",
            "id": "holding-1",
        }
    ]
    assert transactions[0]["portfolio_id"] == "p1"
    assert transactions[0]["folio"] == "folio-1"
    assert transactions[0]["amount"] == "100"


def test_repeated_identical_statement_rows_get_stable_distinct_source_keys() -> None:
    data = statement(("folio-1", [scheme(transactions=[transaction(), transaction()])]))

    first, _, _ = import_cas.prepare_import(data, PORTFOLIOS, [], ["folio-1=Me"])
    second, _, _ = import_cas.prepare_import(data, PORTFOLIOS, [], ["folio-1=Me"])

    assert [row["source_key"] for row in first] == [row["source_key"] for row in second]
    assert len({row["source_key"] for row in first}) == 2


def test_prepare_import_requires_explicit_mapping_for_multiple_portfolios() -> None:
    with pytest.raises(JobError, match="Map every folio"):
        import_cas.prepare_import(statement(("folio-1", [scheme()])), PORTFOLIOS, [], [])


def test_prepare_import_rejects_duplicate_matching_positions() -> None:
    with pytest.raises(JobError, match="duplicate fund positions"):
        import_cas.prepare_import(
            statement(("folio-1", [scheme(), scheme()])),
            PORTFOLIOS,
            [],
            ["folio-1=Me"],
        )


class FakeDatabase:
    def __init__(self, status_codes: list[int] | None = None):
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.status_codes = iter(status_codes or [])

    def request(self, method: str, path: str, **kwargs: Any) -> SimpleNamespace:
        self.calls.append((method, path, kwargs))
        return SimpleNamespace(status_code=next(self.status_codes, 201))


def test_write_rows_upserts_transactions_then_patches_and_inserts_positions() -> None:
    db = FakeDatabase()
    import_cas.write_rows(
        db,
        "owner",
        [{"source_key": "a" * 64, "portfolio_id": "p1"}],
        [
            {"id": "existing", "portfolio_id": "p1", "units": "12"},
            {"portfolio_id": "p2", "units": "5"},
        ],
    )

    assert [call[:2] for call in db.calls] == [
        ("POST", "/rest/v1/mf_transactions"),
        ("PATCH", "/rest/v1/mf_holdings"),
        ("POST", "/rest/v1/mf_holdings"),
    ]
    assert db.calls[0][2]["params"] == {"on_conflict": "owner_id,source_key"}
    assert db.calls[0][2]["json"][0]["owner_id"] == "owner"
    assert db.calls[1][2]["params"] == {"id": "eq.existing"}
    assert "owner_id" not in db.calls[1][2]["json"]
    assert db.calls[2][2]["json"]["owner_id"] == "owner"


def test_write_rows_reports_database_failure_as_retryable() -> None:
    with pytest.raises(JobError, match="re-running is safe"):
        import_cas.write_rows(
            FakeDatabase([500]),
            "owner",
            [{"source_key": "a" * 64}],
            [],
        )


def test_input_pdf_rejects_non_pdf_and_oversized_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    text = tmp_path / "statement.txt"
    text.write_text("not a pdf")
    with pytest.raises(JobError, match="existing PDF"):
        import_cas.input_pdf(text)

    pdf = tmp_path / "statement.pdf"
    pdf.write_bytes(b"%PDF")
    assert import_cas.input_pdf(pdf) == pdf.resolve()
    monkeypatch.setattr(import_cas, "MAX_PDF_BYTES", 3)
    pdf.write_bytes(b"four")
    with pytest.raises(JobError, match="100 MB"):
        import_cas.input_pdf(pdf)


def test_parse_statement_accepts_only_warning_free_cams_detailed_data(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pdf = tmp_path / "statement.pdf"
    pdf.write_bytes(b"%PDF")
    data = SimpleNamespace(
        file_type=FileType.CAMS,
        cas_type=CASFileType.DETAILED,
        parse_warnings=[],
        folios=[SimpleNamespace(schemes=[scheme()])],
    )
    monkeypatch.setattr(import_cas, "read_cas_pdf", lambda *_args: data)

    assert import_cas.parse_statement(pdf, "secret") is data

    for field, value, message in (
        ("file_type", FileType.KFINTECH, "Only original CAMS"),
        ("cas_type", CASFileType.SUMMARY, "detailed statement"),
        ("parse_warnings", ["reconciliation mismatch"], "reconciliation warnings"),
    ):
        monkeypatch.setattr(data, field, value)
        with pytest.raises(JobError, match=message):
            import_cas.parse_statement(pdf, "secret")
        monkeypatch.setattr(data, field, getattr(SimpleNamespace(
            file_type=FileType.CAMS,
            cas_type=CASFileType.DETAILED,
            parse_warnings=[],
        ), field))


def test_parse_statement_refuses_missing_cost_basis_before_any_write(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pdf = tmp_path / "statement.pdf"
    pdf.write_bytes(b"%PDF")
    data = SimpleNamespace(
        file_type=FileType.CAMS,
        cas_type=CASFileType.DETAILED,
        parse_warnings=[],
        folios=[SimpleNamespace(schemes=[scheme()])],
    )
    data.folios[0].schemes[0].valuation.cost = None
    monkeypatch.setattr(import_cas, "read_cas_pdf", lambda *_args: data)

    with pytest.raises(JobError, match="no reported cost basis"):
        import_cas.parse_statement(pdf, "secret")


def test_cli_is_preview_only_by_default_and_requires_typed_confirmation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    pdf = tmp_path / "statement.pdf"
    pdf.write_bytes(b"%PDF")
    parsed = statement(("folio-1", [scheme()]))
    portfolios = [PORTFOLIOS[0]]
    db = FakeDatabase()
    db.url = "https://example.supabase.co"
    monkeypatch.setattr(import_cas, "input_pdf", lambda _path: pdf)
    monkeypatch.setattr(import_cas, "getpass", lambda _prompt: "local-password")
    monkeypatch.setattr(import_cas, "parse_statement", lambda _path, _password: parsed)
    monkeypatch.setattr(import_cas, "_database", lambda: db)
    monkeypatch.setattr(
        import_cas,
        "_api_rows",
        lambda _db, table: portfolios if table == "portfolios" else [],
    )
    monkeypatch.setattr(import_cas.sys.stdin, "isatty", lambda: True)
    monkeypatch.setattr("builtins.input", lambda _prompt: "CANCEL")

    assert import_cas.main([str(pdf)]) == 0
    assert db.calls == []
    assert "Preview only. Nothing written." in capsys.readouterr().out

    assert import_cas.main([str(pdf), "--apply"]) == 1
    assert db.calls == []
    assert "Cancelled. Nothing written." in capsys.readouterr().out

    monkeypatch.setattr("builtins.input", lambda _prompt: "IMPORT")
    assert import_cas.main([str(pdf), "--apply"]) == 0
    assert [call[1] for call in db.calls] == [
        "/rest/v1/mf_transactions",
        "/rest/v1/mf_holdings",
    ]
