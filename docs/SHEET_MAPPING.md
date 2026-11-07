# Google Sheet to database mapping

Source: the owner's "Portfolio" Google Sheet. **This file is a reference for the owner, who loads the data personally. Claude Code must not write an import script or access the sheet.** It was written from a partial look at the sheet, so treat column positions as hints.

## Portfolios
The sheets `MF`, `MF2`, `MF3` (and `Stocks`, `Stocks2`, `Stocks3`) are different people's portfolios (for example the owner and the owner's wife), not duplicates. Each becomes a row in `portfolios`. Suggested mapping: `MF` = first portfolio, `MF2` = second, `MF3` = third (the owner decides the names, and whether `Stocks`, `Stocks2`, `Stocks3` follow the same order). Sheets with no numbering (Saving, CreditCard, RSU, US-Stocks) can go to the first portfolio; holdings can be reassigned later in the UI.

## Sheets in v1 scope
| Sheet | Target tables | Notes |
|---|---|---|
| MF, MF2, MF3 | `mf_holdings` | One portfolio each. A totals row exists below the funds (blank name); skip it |
| Stocks, Stocks2, Stocks3 | `stock_holdings` (market `IN`) | One portfolio each (confirm); skip any totals row |
| US-Stocks | `stock_holdings` (market `US`, currency `USD`) | Has both USD and INR columns; store USD only, INR is derived |
| RSU | `rsu_grants` | Grant rows only. The totals row and the label rows (Pending Vesting, Sold for Tax, Sellable Units) are used only for reconciliation |
| Saving | `savings_accounts` | Column A bank, column B amount |
| CreditCard | `credit_cards` + one `card_bills` row per card | Columns: Bank, Pending Bills, Bill Date, Due Date |

## Known column positions (0-based; verify)
- **MF sheets:** 0 fund name, 3 current units, 4 invested amount, 7 current value, 8 P&L, 10 day change. Current value, P&L and day change are formulas: do not import them, recompute them.
- **Stocks sheets:** 0 instrument, 1 quantity, 3 invested, 5 current value, 6 P&L, 8 day change. Import quantity and invested; derive average price as `invested / quantity` if the sheet has no average price column.
- **RSU:** column 1 units granted, 4 units vested, 7 current price, 8 total value USD, 9 value after tax USD, 10 value after tax INR, 12 vested value INR. The sheet's totals row currently shows 619 granted, 332 vested, 227 sellable, 287 pending vesting and 105 sold for tax: use these as a reconciliation check, and derive `tax_rate` so the after-tax figures match.
- **Saving:** cell A1 holds the text "Kotak" in the header row. Treat row 1 as a header and ask the owner whether it is a real account.
- **PF:** one row per company, wage month and type → `pf_entries` (Company → `company`, Wage Month → `wage_month` as `Jan`…`Dec` plus `wage_year`, the credit date → `transaction_date`, Contribution Type → `monthly` or `interest`, Employee / Employer / Pension Contribution Amount → `employee_amount` / `employer_amount` / `pension_amount`). Interest rows have no wage month and pension 0; their transaction date decides the financial year. The owner loads these (docs/DATA_ENTRY.md); never read the sheet from code.
- **CreditCard:** columns Bank, Pending Bills, Bill Date, Due Date. Bill Date and Due Date are strings like `14th`, `4th`: parse to integers for `bill_day` and `due_day`. The totals row (blank name, only a total) is skipped.

## Credit card loading rule
For each card row:
1. Insert into `credit_cards` (`name` = Bank column, `bill_day`, `due_day`, `is_active` = true).
2. If `Pending Bills > 0`, insert one `card_bills` row: `amount = Pending Bills`, `paid_amount = 0`, `due_date` = the next occurrence of `due_day` from the import date, `statement_month` = the first day of the month that the due date rule (see `DATA_MODEL.md`) maps back to. Cards with `Pending Bills = 0` get no bill row; the app creates the next month's rows later.

## Number parsing
Sheet values may be strings like `₹1,78,818.00`, `₹178,818.00` or `$1,234.50`. Strip currency symbols, spaces and commas, handle `(123)` as negative, and keep decimals. Fail loudly if a value cannot be parsed.

## Out of scope for v1 (backlog)
Details, Details Pivot, FD, PPF, NPS, US Stock Transactions, ESPP Wallet, RSU Allocation, LIC, TATA AIA Term, Dividend, Realized Profit, Loan, Tradebook-*, MF-SIP-Monthly, MF Redeem/Switch Details, Expenses, SIP, MutualFund_NAV, Stocks-History, Stocks-Stats, NPS_NAV, Stock-NAV, MF-History, Total-Value-History, NPS-History, Hisab, NAV Data.
The app deliberately keeps no NAV or price history and no transaction ledger; do not import those sheets.

## Reconciliation checklist (after loading, and in Phase 10)
- Row counts per sheet equal row counts per portfolio in the database.
- Sum of `invested` per portfolio equals the sheet total exactly.
- RSU units (granted, vested, sold for tax) equal the sheet totals.
- Savings total equals the sheet; sum of imported bill amounts equals the sheet's card total.
- MF current value differs from the sheet only by NAV date differences.
