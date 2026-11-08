"""Portfolio totals for the daily snapshot: the same formulas as web/src/app/core/calc.

Kept in step with the TypeScript by a shared fixture
(web/src/app/core/calc/fixtures/snapshot-case.json) that both test suites check.
Money uses Decimal; amounts are rounded to paise only when stored.

Rules (docs/DATA_MODEL.md): a holding without a price, or a USD holding without a USDINR
rate, is left out of value; RSU value is vested units x price x USDINR; savings are summed;
card dues are the sum of max(amount - paid, 0) over bills with an amount; the PF balance is
employee + employer amounts over all PF rows (monthly and interest), pension left out; the
PPF balance is the sum of all PPF amounts (investments and interest); the NPS value is
units x NPS NAV over schemes with a NAV; the FD value is each FD's principal compounded to
today (to maturity once matured, the principal for a payout FD).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

Row = Mapping[str, Any]
ZERO = Decimal(0)
PAISE = Decimal("0.01")


def dec(value: Any) -> Decimal:
    """Decimal from a JSON number or string, via str to avoid float noise."""
    return ZERO if value is None else Decimal(str(value))


@dataclass(frozen=True)
class MarketData:
    navs: dict[str, Decimal]
    prices: dict[str, Decimal]
    usd_inr: Decimal | None
    nps_navs: dict[str, Decimal] = field(default_factory=dict)

    @classmethod
    def from_rows(
        cls,
        navs: Iterable[Row],
        prices: Iterable[Row],
        fx: Iterable[Row],
        nps_navs: Iterable[Row] = (),
    ) -> MarketData:
        rate = next((dec(r["rate"]) for r in fx if r["pair"] == "USDINR"), None)
        return cls(
            navs={str(r["scheme_code"]): dec(r["nav"]) for r in navs},
            prices={str(r["symbol"]): dec(r["close"]) for r in prices},
            usd_inr=rate,
            nps_navs={str(r["scheme_code"]): dec(r["nav"]) for r in nps_navs},
        )


@dataclass(frozen=True)
class SnapshotValues:
    mf_value: Decimal
    stocks_value: Decimal
    rsu_vested_value: Decimal
    savings: Decimal
    card_dues: Decimal
    pf_balance: Decimal
    ppf_balance: Decimal
    nps_value: Decimal
    fd_value: Decimal

    def rounded(self) -> dict[str, str]:
        """For storage: numeric(18,2) as strings."""
        return {
            k: str(v.quantize(PAISE, rounding=ROUND_HALF_UP)) for k, v in self.__dict__.items()
        }


def _in(rows: Iterable[Row], portfolio_id: str) -> list[Row]:
    return [r for r in rows if r["portfolio_id"] == portfolio_id]


def _units_value(holdings: Iterable[Row], navs: Mapping[str, Decimal]) -> Decimal:
    total = ZERO
    for h in holdings:
        code = (h.get("scheme_code") or "").strip()
        nav = navs.get(code) if code else None
        if nav is not None:
            total += dec(h["units"]) * nav
    return total


def mf_value(holdings: Iterable[Row], market: MarketData) -> Decimal:
    return _units_value(holdings, market.navs)


def nps_value(holdings: Iterable[Row], market: MarketData) -> Decimal:
    """Units x NAV over NPS schemes with a NAV."""
    return _units_value(holdings, market.nps_navs)


def stocks_value_inr(holdings: Iterable[Row], market: MarketData) -> Decimal:
    total = ZERO
    for h in holdings:
        price = market.prices.get(h["symbol"])
        if price is None:
            continue
        value = dec(h["quantity"]) * price
        if h["currency"] == "USD":
            if market.usd_inr is None:
                continue
            value *= market.usd_inr
        total += value
    return total


def rsu_vested_inr(grants: Iterable[Row], market: MarketData) -> Decimal:
    if market.usd_inr is None:
        return ZERO
    total = ZERO
    for g in grants:
        price = market.prices.get(g["symbol"])
        if price is not None:
            total += dec(g["units_vested"]) * price * market.usd_inr
    return total


def card_dues(bills: Iterable[Row]) -> Decimal:
    return sum(
        (max(dec(b["amount"]) - dec(b["paid_amount"]), ZERO) for b in bills if b["amount"] is not None),
        ZERO,
    )


def pf_balance(entries: Iterable[Row]) -> Decimal:
    """Employee + employer amounts of every PF row (contributions and interest); EPS excluded."""
    return sum((dec(e["employee_amount"]) + dec(e["employer_amount"]) for e in entries), ZERO)


def ppf_balance(entries: Iterable[Row]) -> Decimal:
    """Investments + interest over every PPF row."""
    return sum((dec(e["amount"]) for e in entries), ZERO)


# Compounding periods per year (web/src/app/core/calc/fd.ts); 0 pays interest out.
COMPOUNDING_PER_YEAR = {"monthly": 12, "quarterly": 4, "half_yearly": 2, "yearly": 1, "payout": 0}


def _days(start: Any, end: Any) -> int:
    return (date.fromisoformat(str(end)) - date.fromisoformat(str(start))).days


def fd_amount(fd: Row, today: str) -> Decimal:
    """Principal x (1 + rate/100/n) ^ (n x days/365), days counted to today or maturity."""
    principal = dec(fd["principal"])
    n = COMPOUNDING_PER_YEAR.get(str(fd["compounding"]), 4)
    if n == 0:
        return principal
    term = _days(fd["start_date"], fd["maturity_date"])
    days = min(max(_days(fd["start_date"], today), 0), term)
    if days == 0:
        return principal
    return principal * (1 + dec(fd["rate"]) / 100 / n) ** (Decimal(n * days) / 365)


def fd_value(fds: Iterable[Row], today: str) -> Decimal:
    return sum((fd_amount(fd, today) for fd in fds), ZERO)


def snapshot_values(
    data: Mapping[str, Iterable[Row]], market: MarketData, portfolio_id: str, today: str
) -> SnapshotValues:
    """
    Totals for one portfolio on `today` (`YYYY-MM-DD`). `data` holds the owner tables:
    mf_holdings, stock_holdings, rsu_grants, savings_accounts, card_bills (each bill carrying
    its card's portfolio_id), pf_entries, ppf_entries, nps_holdings and fixed_deposits.
    """
    return SnapshotValues(
        mf_value=mf_value(_in(data["mf_holdings"], portfolio_id), market),
        stocks_value=stocks_value_inr(_in(data["stock_holdings"], portfolio_id), market),
        rsu_vested_value=rsu_vested_inr(_in(data["rsu_grants"], portfolio_id), market),
        savings=sum((dec(a["balance"]) for a in _in(data["savings_accounts"], portfolio_id)), ZERO),
        card_dues=card_dues(_in(data["card_bills"], portfolio_id)),
        pf_balance=pf_balance(_in(data["pf_entries"], portfolio_id)),
        ppf_balance=ppf_balance(_in(data["ppf_entries"], portfolio_id)),
        nps_value=nps_value(_in(data["nps_holdings"], portfolio_id), market),
        fd_value=fd_value(_in(data["fixed_deposits"], portfolio_id), today),
    )
