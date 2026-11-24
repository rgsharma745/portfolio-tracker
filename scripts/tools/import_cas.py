"""Import an original CAMS detailed CAS PDF into the owner's mutual funds.

Run from scripts/: python -m tools.import_cas /path/to/statement.pdf
The default is a read-only preview; pass --apply to write after a second confirmation.
Configuration is read from scripts/.env.prod or the process environment.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import date
from decimal import Decimal
from getpass import getpass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from casparser import read_cas_pdf
from casparser.enums import CASFileType, FileType
from casparser.types import CASData, Scheme
from requests import RequestException

from lib.jobs import JobError
from lib.supabase_rest import SupabaseRest
from tools.run_prod import SetupError, check_service_key, load_settings

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = SCRIPTS_DIR / ".env.prod"
MAX_PDF_BYTES = 100 * 1024 * 1024
WRITE_BATCH = 250
SKIPPED_TRANSACTION_TYPES = frozenset({"STT_TAX", "STAMP_DUTY_TAX", "MISC"})
LOOKUP_BATCH = 50
PORTFOLIO_CONFLICT = "A transaction is already assigned to another portfolio; check the selected portfolio"


def input_pdf(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if resolved.suffix.lower() != ".pdf" or not resolved.is_file():
        raise JobError("The statement must be an existing PDF file")
    if resolved.stat().st_size > MAX_PDF_BYTES:
        raise JobError("The PDF is larger than 100 MB")
    return resolved


def parse_statement(path: Path, password: str) -> CASData:
    try:
        data = read_cas_pdf(str(path), password)
    except Exception:
        raise JobError("Could not parse the statement. Check the original PDF and its password.") from None
    if _enum_value(data.file_type) != FileType.CAMS.value:
        raise JobError("Only original CAMS statements are supported")
    if _enum_value(data.cas_type) != CASFileType.DETAILED.value:
        raise JobError("A CAMS detailed statement is required; summary statements have no transactions")
    if data.parse_warnings:
        raise JobError(
            "The parser reported reconciliation warnings. No data was written; re-download and check the statement."
        )
    for scheme in _schemes(data):
        if scheme.close > 0 and scheme.valuation.cost is None:
            raise JobError(
                "At least one scheme has no reported cost basis. No data was written; review that statement manually."
            )
        if scheme.close < 0:
            raise JobError("The statement has a negative closing unit balance; no data was written")
    return data


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _schemes(data: CASData) -> list[Scheme]:
    return [scheme for folio in data.folios for scheme in folio.schemes]


def _api_rows(db: SupabaseRest, table: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    params = {"select": "*", "order": "id.asc", "limit": "500"}
    while True:
        response = db.request("GET", f"/rest/v1/{table}", params=params)
        if response.status_code != 200:
            raise JobError(f"Could not read {table} (HTTP {response.status_code})")
        page = response.json()
        rows.extend(page)
        if len(page) < 500:
            return rows
        params["id"] = f"gt.{page[-1]['id']}"


def _normal_name(value: str) -> str:
    return " ".join(value.casefold().split())


def _normal_folio(value: str) -> str:
    return "".join(value.split())


def _folio_mappings(
    folios: list[str], portfolios: list[dict[str, Any]], supplied: str | None
) -> dict[str, str]:
    by_name = {row["name"]: row for row in portfolios}
    by_id = {row["id"]: row for row in portfolios}
    if supplied is not None:
        portfolio = by_name.get(supplied) or by_id.get(supplied)
        if portfolio is None:
            raise JobError("--portfolio must match an active portfolio name or ID")
    elif len(portfolios) == 1:
        portfolio = portfolios[0]
    else:
        if not sys.stdin.isatty():
            raise JobError("Choose a portfolio with --portfolio PORTFOLIO_NAME")
        print("\nChoose the portfolio for this CAS statement:")
        for index, portfolio in enumerate(portfolios, 1):
            print(f"  {index}. {portfolio['name']}")
        try:
            choice = int(input("Portfolio number: ").strip())
        except (ValueError, EOFError):
            raise JobError("No valid portfolio selected") from None
        if not 1 <= choice <= len(portfolios):
            raise JobError("No valid portfolio selected")
        portfolio = portfolios[choice - 1]
    return {folio: str(portfolio["id"]) for folio in folios}


def _transaction_row(
    folio: str,
    portfolio_id: str,
    scheme: Scheme,
    transaction: Any,
    occurrence: int,
) -> dict[str, Any]:
    txn_date = transaction.date
    if not isinstance(txn_date, date):
        txn_date = date.fromisoformat(str(txn_date))
    identity = {
        "folio": folio,
        "scheme": scheme.amfi or scheme.isin or _normal_name(scheme.scheme),
        "date": txn_date.isoformat(),
        "type": str(_enum_value(transaction.type)),
        "description": transaction.description,
        "amount": _decimal(transaction.amount),
        "units": _decimal(transaction.units),
        "nav": _decimal(transaction.nav),
        "balance": _decimal(transaction.balance),
        "occurrence": occurrence,
    }
    source_key = hashlib.sha256(
        json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "source_key": source_key,
        "portfolio_id": portfolio_id,
        "scheme_code": scheme.amfi,
        "scheme_name": scheme.scheme,
        "folio": folio,
        "transaction_date": txn_date.isoformat(),
        "transaction_type": str(_enum_value(transaction.type)),
        "description": transaction.description,
        "amount": _decimal(transaction.amount),
        "units": _decimal(transaction.units),
        "nav": _decimal(transaction.nav),
        "balance": _decimal(transaction.balance),
    }


def _decimal(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


def prepare_import(
    data: CASData,
    portfolios: list[dict[str, Any]],
    holdings: list[dict[str, Any]],
    supplied_portfolio: str | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, str]]:
    folios = sorted({_normal_folio(folio.folio) for folio in data.folios if folio.schemes})
    active = [p for p in portfolios if p.get("is_active", True)]
    if not active:
        raise JobError("No active portfolio exists")
    owners = {str(p["owner_id"]) for p in portfolios}
    if len(owners) != 1:
        raise JobError("Expected portfolios belonging to one owner")
    mapping = _folio_mappings(folios, active, supplied_portfolio) if folios else {}
    transaction_rows: list[dict[str, Any]] = []
    holding_rows: list[dict[str, Any]] = []
    seen_positions: set[tuple[str, str, str]] = set()
    claimed_holdings: set[str] = set()

    for folio in data.folios:
        if not folio.schemes:
            continue
        folio_number = _normal_folio(folio.folio)
        portfolio_id = mapping[folio_number]
        for scheme in folio.schemes:
            same_fund = [
                row
                for row in holdings
                if str(row["portfolio_id"]) == portfolio_id
                and (
                    (scheme.amfi and row.get("scheme_code") == scheme.amfi)
                    or _normal_name(str(row["scheme_name"])) == _normal_name(scheme.scheme)
                )
            ]
            candidates = [row for row in same_fund if row.get("folio") == folio_number]
            if not candidates and scheme.close > 0:
                candidates = [
                    row for row in same_fund
                    if row.get("folio") is None and scheme.amfi and row.get("scheme_code") == scheme.amfi
                ]
            if len(candidates) > 1:
                raise JobError("A statement position matches multiple saved holdings; resolve the duplicate first")
            if candidates:
                holding_id = str(candidates[0]["id"])
                if holding_id in claimed_holdings:
                    raise JobError("Multiple statement positions match one saved holding; assign its folio first")
                claimed_holdings.add(holding_id)

            identity = (portfolio_id, folio_number, _normal_name(scheme.scheme))
            if identity in seen_positions:
                raise JobError("The statement contains duplicate fund positions in one folio")
            seen_positions.add(identity)
            prior: dict[str, int] = {}
            for transaction in scheme.transactions:
                transaction_type = str(_enum_value(transaction.type))
                if transaction_type in SKIPPED_TRANSACTION_TYPES:
                    continue
                txn_date = transaction.date
                if not isinstance(txn_date, date):
                    txn_date = date.fromisoformat(str(txn_date))
                fingerprint = json.dumps(
                    {
                        "date": txn_date.isoformat(),
                        "type": transaction_type,
                        "description": transaction.description,
                        "amount": _decimal(transaction.amount),
                        "units": _decimal(transaction.units),
                        "nav": _decimal(transaction.nav),
                        "balance": _decimal(transaction.balance),
                    },
                    sort_keys=True,
                    separators=(",", ":"),
                )
                occurrence = prior.get(fingerprint, 0)
                prior[fingerprint] = occurrence + 1
                transaction_rows.append(
                    _transaction_row(folio_number, portfolio_id, scheme, transaction, occurrence)
                )

            holding = {
                "portfolio_id": portfolio_id,
                "scheme_code": scheme.amfi,
                "scheme_name": scheme.scheme,
                "folio": folio_number,
                "units": str(scheme.close),
                "invested": str(scheme.valuation.cost) if scheme.close > 0 else "0",
            }
            if candidates:
                holding["id"] = holding_id
            holding_rows.append(holding)

    included_folios = {row["folio"] for row in holding_rows}
    return transaction_rows, holding_rows, {folio: mapping[folio] for folio in folios if folio in included_folios}


def check_transaction_portfolios(
    db: SupabaseRest, owner_id: str, transactions: list[dict[str, Any]]
) -> None:
    keys_by_portfolio: dict[str, list[str]] = {}
    for row in transactions:
        keys_by_portfolio.setdefault(row["portfolio_id"], []).append(row["source_key"])
    for portfolio_id, keys in keys_by_portfolio.items():
        for start in range(0, len(keys), LOOKUP_BATCH):
            batch = ",".join(keys[start : start + LOOKUP_BATCH])
            response = db.request("GET", "/rest/v1/mf_transactions", params={
                "select": "id",
                "owner_id": f"eq.{owner_id}",
                "portfolio_id": f"neq.{portfolio_id}",
                "source_key": f"in.({batch})",
                "limit": "1",
            })
            if response.status_code != 200:
                raise JobError(f"Could not verify transaction portfolios (HTTP {response.status_code})")
            if response.json():
                raise JobError(PORTFOLIO_CONFLICT)


def write_rows(db: SupabaseRest, owner_id: str, transactions: list[dict[str, Any]], holdings: list[dict[str, Any]]) -> None:
    for start in range(0, len(transactions), WRITE_BATCH):
        batch = [
            {**row, "owner_id": owner_id}
            for row in transactions[start : start + WRITE_BATCH]
        ]
        response = db.request(
            "POST",
            "/rest/v1/mf_transactions",
            params={"on_conflict": "owner_id,source_key"},
            json=batch,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        if response.status_code == 409:
            raise JobError(PORTFOLIO_CONFLICT)
        if response.status_code not in (200, 201, 204):
            raise JobError(f"Could not save transactions (HTTP {response.status_code}); re-running is safe")

    for row in holdings:
        values = {key: value for key, value in row.items() if key != "id"}
        if id_ := row.get("id"):
            response = db.request(
                "PATCH", "/rest/v1/mf_holdings", params={"id": f"eq.{id_}"}, json=values
            )
        else:
            response = db.request(
                "POST",
                "/rest/v1/mf_holdings",
                json={**values, "owner_id": owner_id},
                prefer="return=minimal",
            )
        if response.status_code not in (200, 201, 204):
            raise JobError(f"Could not reconcile holdings (HTTP {response.status_code}); re-running is safe")


def _database() -> SupabaseRest:
    settings = load_settings(dict(os.environ), ENV_FILE)
    url = settings.get("SUPABASE_URL", "")
    key = settings.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise JobError(f"Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in {ENV_FILE} or the environment")
    try:
        check_service_key(key)
        return SupabaseRest(url, key)
    except (SetupError, ValueError):
        raise JobError("Invalid Supabase connection settings; check the URL and service-role key") from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("pdf", type=Path, help="original CAMS detailed CAS PDF")
    parser.add_argument(
        "--portfolio",
        metavar="PORTFOLIO_NAME",
        help="portfolio for this entire CAS statement (portfolio ID is also accepted)",
    )
    parser.add_argument("--apply", action="store_true", help="write after preview and confirmation")
    args = parser.parse_args(argv)
    try:
        pdf = input_pdf(args.pdf)
        password = getpass("CAS PDF password: ")
        data = parse_statement(pdf, password)
        db = _database()
        portfolios = _api_rows(db, "portfolios")
        holdings = _api_rows(db, "mf_holdings")
        transactions, holding_rows, mapping = prepare_import(data, portfolios, holdings, args.portfolio)
        owner_id = str(portfolios[0]["owner_id"])
        check_transaction_portfolios(db, owner_id, transactions)
        names = {str(p["id"]): str(p["name"]) for p in portfolios}
        print("\nCAMS detailed statement preview")
        print(f"Supabase target: {urlsplit(db.url).hostname or 'unknown host'}")
        closed_positions = sum(Decimal(row["units"]) == 0 for row in holding_rows)
        print(
            f"Folios: {len(mapping)} · Fund positions: {len(holding_rows)} · "
            f"Transactions: {len(transactions)} · Zero-unit positions: {closed_positions}"
        )
        if not mapping:
            print("No new or tracked positions found. Nothing to import.")
            return 0
        for folio, portfolio_id in sorted(mapping.items()):
            print(f"  Folio {folio} → {names.get(portfolio_id, 'portfolio')}")
        existing = sum("id" in row for row in holding_rows)
        print(f"Holdings to update: {existing} · Holdings to add: {len(holding_rows) - existing}")
        for row in holding_rows:
            action = "update" if "id" in row else "add"
            print(
                f"  {action}: {row['scheme_name']} · folio {row['folio']} · "
                f"{row['units']} units · cost ₹{row['invested']}"
            )
        if not args.apply:
            print("Preview only. Nothing written. Re-run with --apply to import.")
            return 0
        if not sys.stdin.isatty() or input("Type IMPORT to write the transactions and reconcile holdings: ").strip() != "IMPORT":
            print("Cancelled. Nothing written.")
            return 1
        write_rows(db, owner_id, transactions, holding_rows)
        print(f"Imported {len(transactions)} transaction rows and reconciled {len(holding_rows)} positions.")
        return 0
    except (JobError, OSError, SetupError) as exc:
        print(f"import_cas: {exc}", file=sys.stderr)
        return 1
    except RequestException:
        print("import_cas: Supabase request failed; check connectivity and retry", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
