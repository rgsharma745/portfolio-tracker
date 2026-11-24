# Data model

Design goals: simple, light, and easy to maintain. Mutual fund transactions are imported from original CAMS detailed CAS PDFs; other holdings remain current-state entries. Market data is **latest-only** (no NAV or price history). One login owns everything; several **portfolios** (for example "Me", "Wife") sit under that owner.

The SQL lives in `supabase/migrations/0001_init.sql`; this doc explains intent. Keep them in sync.

## Ownership and access
- One Supabase user (the owner). Every owner table has `owner_id uuid not null default auth.uid()` and one RLS policy: `owner_id = auth.uid()` for all operations.
- A **portfolio** is a label for whose money it is, not a login. All portfolios are visible to the one owner.
- Market data tables hold no personal data and have no `owner_id`: RLS is enabled, and any signed-in user (in practice only the owner) may read and write them, which is how manual overrides work. Jobs write through the service role. Anonymous callers have no privileges at all.

## Owner tables
| Table | Purpose | Key columns |
|---|---|---|
| `portfolios` | People or accounts being tracked | `name` (unique), `sort_order`, `is_active` |
| `mf_holdings` | Mutual fund holdings | `portfolio_id`, `scheme_code` (AMFI), `scheme_name`, `folio`, `units`, `invested` |
| `mf_transactions` | Imported CAMS mutual-fund transactions | `portfolio_id`, `source_key` (stable import identity), `scheme_code`, `scheme_name`, `folio`, `transaction_date`, `transaction_type`, generated `transaction_side`, `description`, signed `amount` / `units`, `nav`, `balance` |
| `stock_holdings` | Stocks (India and US) | `portfolio_id`, `market` (IN/US), `symbol`, `name`, `currency`, `quantity`, `avg_price`, `invested` |
| `equity_securities` | Companies | Name, market, symbol, currency and latest dated manual price for private shares |
| `equity_grants`, `equity_schedule` | RSU and ESOP awards and dated tranches | Portfolio, company, award type, grant date and quantity, strike or grant price, optional expiry |
| `equity_events` | Actual vesting and exercise lots | Grant, optional tranche, event and allotment dates, quantity, historical FMV and FX, taxes and exercise cost |
| `equity_sales`, `equity_sale_lots` | Sale headers and lot allocations | Portfolio and security, sale price and fees, trade FX, bank credit and cashless deductions |
| `savings_accounts` | Bank balances | `portfolio_id`, `bank`, `balance` |
| `pf_entries` | Provident fund passbook: one row per company, wage month and type | `portfolio_id`, `company`, `contribution_type` (`monthly` or `interest`), `transaction_date` (when it was credited), `wage_month` (`Jan`…`Dec`) and `wage_year` (monthly rows only; null for interest), `employee_amount`, `employer_amount`, `pension_amount` (0 for interest). One monthly row per portfolio, company, wage month and year; one interest row per portfolio, company and financial year of its transaction date (partial unique indexes, `0006`). A ledger by the owner's choice |
| `ppf_entries` | Public Provident Fund passbook: one row per deposit or yearly interest credit | `portfolio_id`, `account` (a label such as `SBI PPF`; the same name in two portfolios is two accounts), `entry_date`, `entry_type` (`investment` or `interest`), `amount` (> 0). One interest row per portfolio, account and financial year of its date (partial unique index, `0007`). Deposits above ₹1,50,000 a year are allowed and only flagged. A ledger by the owner's choice |
| `nps_holdings` | NPS Tier I: current units per account and scheme | `portfolio_id`, `account` (a label such as `Rahul PRAN`; the same name in two portfolios is two accounts), `scheme_class` (`E`, `C`, `G`, or `A` for old accounts), `scheme_code` (NPS code such as `SM008001`, null until known), `scheme_name`, `units`, `units_as_of` (statement date). One row per portfolio, account and scheme class. Schemes are rows, not columns: each has its own code and NAV |
| `nps_contributions` | NPS contributions | `portfolio_id`, `account` (same label as `nps_holdings`), `contribution_date`, `contributor` (`self` or `employer`), `amount` (> 0). Not split by scheme. A ledger by the owner's choice |
| `fixed_deposits` | Fixed deposits: one row per FD | `portfolio_id`, `bank` (1 to 60 characters), `start_date` (date of investment), `maturity_date` (after the start), `principal` (> 0), `rate` (yearly %, > 0 and < 100, up to 3 decimals), `compounding` (`monthly`, `quarterly` (default), `half_yearly`, `yearly`, or `payout` when interest is paid out). Maturity amount, value and days left are calculated, never stored (`0009`) |
| `dividends` | Dividends received: one row per credit (a ledger at the owner's request) | `portfolio_id`, `market` (`IN` or `US`), `symbol` (stored trimmed and upper-case, 1 to 20 characters; free text, so sold stocks can be entered), `paid_on`, `amount_inr` (> 0, the rupees credited), `amount_usd` (> 0, the dollars paid; required for `US`, absent for `IN`). No unique key: a stock can pay twice on one day. Not on Overview and not in snapshots (`0010`) |
| `credit_cards` | The card itself | `portfolio_id`, `name`, `bank`, `bill_day`, `due_day`, `is_active` |
| `card_bills` | One row per card per month | `card_id`, `statement_month` (first of month), `due_date`, `amount` (null = not received yet), `paid_amount`, `paid_on`, `notes`; unique (card_id, statement_month) |
| `portfolio_snapshots` | Daily totals per portfolio | `portfolio_id`, `snap_date`, `mf_value`, `stocks_value`, `employee_equity_value`, `savings`, `card_dues`, `pf_balance` (0 on days before PF was added), `ppf_balance` (0 on days before PPF was added), `nps_value` (0 on days before NPS was added), `fd_value` (0 on days before FDs were added) |
| `settings` | Preferences | `key`, `value` (jsonb) |

The same fund or stock can appear in several portfolios (different rows, same `scheme_code`/`symbol`). Deleting a portfolio deletes its holdings (cascade), so the UI must ask for explicit confirmation and suggest "deactivate" instead.

## Latest-only market data (shared, no personal data)
| Table | Key | Columns |
|---|---|---|
| `mf_nav_latest` | `scheme_code` | `nav`, `nav_date`, `prev_nav`, `prev_nav_date` |
| `stock_price_latest` | `(market, symbol)` | `close`, `price_date`, `prev_close`, `prev_price_date`, `source`, `is_manual` |
| `nps_nav_latest` | `scheme_code` (e.g. `SM008001`) | `nav`, `nav_date`, `prev_nav`, `prev_nav_date`, `is_manual` |
| `fx_latest` | `pair` (e.g. `USDINR`) | `rate`, `rate_date`, `prev_rate`, `prev_rate_date`, `is_manual` |
| `job_runs` | id | `job`, `status`, `message`, `started_at`, `finished_at` |
| `job_triggers` | `job` (`fetch_nav`, `fetch_prices`) | `triggered_at`, `triggered_by`: the last Run now from the website. One row per job, written only by `claim_job_trigger` / `release_job_trigger` (30-minute lock, docs/ARCHITECTURE.md) |

Each table holds one row per fund, stock or pair that you actually own (a few dozen rows in total). It never grows.

**How "today's change" works without history:** jobs call SQL functions `upsert_mf_nav`, `upsert_nps_nav`, `upsert_stock_price` and `upsert_fx_rate`. When the incoming date is newer than the stored one, the stored value moves into `prev_*` and the new value replaces it. If the date is the same, the value is corrected in place. If the date is older, it is ignored. Day change = `units * (nav - prev_nav)`.

Limitations to accept: a brand-new fund shows 0 day change until its second NAV date arrives; if jobs miss several days, "previous" is the last value the job saw. A stock, FX or NPS NAV row with `is_manual = true` is never overwritten by jobs (manual override from Settings). Deleting the manual row hands the symbol back to the jobs on their next run.

## Job messages
On success `job_runs.message` is a JSON summary; on failure it is plain text (the error). Settings › Job runs shows both in words.
- `fetch_nav`: `{"updated": 42, "unmatched": ["123456", ...], "nav_date": "2026-11-03"}`. `unmatched` lists scheme codes from `mf_holdings` that were not in the AMFI file; Settings › Data check shows those funds as "not found in the AMFI file".
- `fetch_nps_nav`: `{"updated": 3, "unmatched": ["SM000000"], "nav_date": "2026-11-06", "source": "npstrust" | "protean"}`. `unmatched` lists codes from `nps_holdings` not in the file; Settings › Data check shows those schemes as "not found".
- `fetch_prices`: `{"updated": 5, "missing": ["US:SYMBOL"], "sources": {"nse": 3, "yahoo": 2}, "fx": "frankfurter" | "yahoo" | "manual" | "not needed"}`. A missing symbol keeps its last price (the stale badge shows its age); the job fails only when nothing could be priced or USD/INR is needed and unavailable.
- `snapshot`: `{"rows": 2, "snap_date": "2026-11-04"}`; `backup`: `{"file": "backup-2026-11-08.json.age", "rows": {table: count}}`; `keepalive`: `{"ok": true}`.

## Views (security_invoker = true)
- `v_mf_holdings`: holdings + latest NAV, `prev_nav`, `current_value`, `pl`, `day_change`.
- `v_stock_holdings`: holdings + latest close, `prev_close`, `current_value`, `pl`, `day_change` (in the stock's own currency).
- `v_equity_lots` values acquired shares. `v_equity_sale_details` calculates proceeds and P&L per lot. `v_equity_portfolio_values` rolls the shared lot valuation up for snapshots.
- `v_card_bills`: bills + `card_name`, `portfolio_id`, `balance` and derived `status`.

## Credit card bills (monthly)
- A `credit_cards` row describes the card (bill day, due day). Each month gets one `card_bills` row.
- **Creating a month:** a "Create this month's bills" action adds a row for every active card with `amount = null` ("awaiting statement") and `due_date` computed from the card's days. You enter the amount when the statement arrives.
- **Due date rule:** statement month M. If `due_day > bill_day`, due date is in month M on `due_day`; otherwise it is in month M+1. If the month is shorter than `due_day`, use the last day of that month.
- **Status (derived in `v_card_bills`, never stored):**
  - `awaiting`: amount is null
  - `paid`: `paid_amount >= amount`
  - `overdue`: not paid and `due_date < today`
  - `partial`: some paid, not overdue
  - `unpaid`: nothing paid, not overdue
- **Mark paid:** sets `paid_amount = amount` and `paid_on = today` (editable). A partial payment is just a smaller `paid_amount`.
- **Balance** = `max(amount - paid_amount, 0)`; "Card dues" on the Overview = sum of balances across all bills (only bills with an amount contribute).
- **Next due** = the unpaid bill (balance > 0) with the earliest `due_date`. Urgent if it is due within 3 days or overdue.
- **Earlier months:** the Cards page lists bills from months before the selected one that are not paid, including ones whose amount was never entered.
- **Cards without a bill day or due day** are skipped by "Create this month's bills" (their due date cannot be computed) and are listed by Settings › Data check.

## Calculations (single source of truth)
Let `nav` be the latest NAV and `prev_nav` the previous stored NAV (equal to `nav` if none).
- MF current value = `units * nav`; P&L = `current_value - invested`; P&L % = `P&L / invested * 100` (0 if invested is 0); day change = `units * (nav - prev_nav)`.
- Stock current value = `quantity * last_close` (stock's currency); P&L and day change as above.
- USD to INR = multiply by `fx_latest` `USDINR` rate. Totals are shown in INR unless the user toggles USD.
- **Employee equity.** Record actual vesting independently of scheduled tranches. Allotted shares held equal acquired quantity less shares withheld or automatically sold for taxes and recorded sale quantities. Options are consumed on the exercise date. A pending allotment has no held shares. Use the current market quote or latest dated private value and USD/INR for valuation.
- **Basis and returns.** Historical INR basis per share equals the vesting or exercise FMV multiplied by the entered acquisition FX. Unrealized P&L is current value less held basis. ESOP purchase cost is quantity times exercise price. Perquisite is the positive difference between FMV and exercise price times quantity. Acquisition expenses include purchase cost, fees and recorded INR tax. Return divides P&L by the corresponding FMV basis and is blank for zero basis.
- **Sale reconciliation.** Allocate fees by quantity and bank credit by post-deduction payout. Before credit use net proceeds multiplied by trade FX. After credit use the INR credit plus cashless deductions converted at the effective bank rate. This rate is actual INR credit divided by the post-deduction foreign payout. If the foreign payout is zero, use trade FX for deductions. INR trades use a rate of 1. Subtract allocated FMV basis for realized P&L. The tax total uses the lot's reported INR amount when entered and otherwise counts recorded cashless tax deductions at the effective or trade rate. Holding-period classification for ordinary equity sales from 23 July 2024 uses the allotment date and the applicable 12- or 24-month calendar threshold. The exact threshold is short-term. [Income Tax Department](https://www.incometaxindia.gov.in/w/capital-gain) · [Income-tax Act, 2025, section 2](https://egazette.gov.in/WriteReadData/2025/265620.pdf?v=20261118203520)
- **PF** (`core/calc/pf.ts`, and `pf_balance` in `scripts/lib/calc.py`): balance = employee + employer amounts of every row (monthly contributions and interest). Pension (EPS) = sum of `pension_amount`, shown on its own and **not** part of the balance (it is not withdrawable like PF). Employee and employer totals count monthly rows; Interest = employee + employer of interest rows. Financial years run April to March and are taken from the transaction date (as in the EPFO passbook), for the interest rule and the passbook filter. "Add next month" = the wage month after a company's latest one, credited one month after that row's transaction date, with the same three amounts; a new company starts at last month's wages credited today.
- **PPF** (`core/calc/ppf.ts`, and `ppf_balance` in `scripts/lib/calc.py`): balance = sum of every `amount` (investments and interest). Rows count for the financial year (April to March) of `entry_date`. Per financial year: investment, interest and the closing balance (running total up to that year), listed from the first year with an entry to the last, with empty years in between at 0. PPF allows ₹500 to ₹1,50,000 of deposits per account and year; the app **shows** this but never refuses a row: "Room left" = ₹1,50,000 − this year's deposits, shown on the "Invested in FY …" card (only when one account is in scope; the per-year table has no room-left column, though `ppfByFinancialYear` still computes `roomLeft` per year and its tests cover it), "Over ₹1.5 lakh" when an account's deposits pass ₹1,50,000, "Below ₹500" for a finished year (before the current one, from the account's first year) with less than ₹500 deposited. Interest never counts towards the limits.
- **NPS** (`core/calc/nps.ts`, and `nps_value` in `scripts/lib/calc.py`): value = Σ `units` × the latest NPS NAV over schemes with a NAV (a scheme without one is left out and counted as unpriced); day change = units × (NAV − previous NAV). Invested = self + employer contributions; P&L = value − invested. Contributions are not split by scheme, so invested, P&L and XIRR are per account (or over several accounts), never per scheme. Scheme mix = each class's share of value. Per financial year (April to March, of `contribution_date`): self, employer, total and the running total contributed, from the first year with a contribution to the last (empty years at 0). An account whose latest contribution is newer than its `units_as_of` is flagged ("Units older than last contribution"): value and XIRR read low until the units are updated.
- **Mutual-fund XIRR** (`core/calc/mf-transactions.ts`): purchases and SIPs are negative cash flows; redemptions and dividend payouts are positive. Overall XIRR includes closed positions and treats switches as internal. Live XIRR uses only open imported positions and treats switch-ins as investments and switch-outs as proceeds. STT, stamp duty and miscellaneous rows are omitted from new imports. The ledger generates `transaction_side` from the CAS type. Purchase, SIP purchase and switch-in are Buy. Redemption and switch-out are Sell. Other retained types have no side. Both portfolio returns use today’s value for open positions with imported transactions. A manual-only fund in that same folio contributes no terminal value. Live XIRR and XIRR are shown as header stats; folio XIRR is calculated per scheme within a folio using only that position’s transactions and current value. It includes switch-ins and switch-outs, and appears beside P&L for each eligible fund. Clicking or keyboard-activating a fund opens its own imported-transaction dialog. Unpriced positions make the relevant XIRR unavailable, and tracked positions with zero units have zero terminal value. This is app-only; daily snapshots are unchanged.
- **Fixed deposits** (`core/calc/fd.ts`, and `fd_value` in `scripts/lib/calc.py`): with `n` compounding periods a year (monthly 12, quarterly 4, half-yearly 2, yearly 1) and `t` = days / 365, amount = principal × (1 + rate / 100 / n)^(n × t). Maturity amount uses the whole term (start to maturity); value today uses the days from the start to today, capped at the term (the principal before the start, the maturity amount once matured). A `payout` FD pays interest out, so its maturity amount and value are the principal. Days left = maturity date − today (never below 0); progress = days gone by / term. "Matures soon" within 30 days; matured on or after the maturity date. Matured FDs keep counting at their maturity amount until the owner deletes them. Banks round per quarter, so their figure can differ by a few rupees.
- **Dividends** (`core/calc/dividends.ts`, app only): totals add `amount_inr`, the rupees as credited; `amount_usd` is shown beside US totals but never converted at today's rate (the rate on the payment day is what the bank used). Rows count for the financial year (April to March) of `paid_on`. Per financial year: India, US (₹ and $), total and number of dividends, only years with a dividend, newest first. Per stock for one year: market and symbol (the same ticker in two markets is two stocks), ₹, $ for US, count, largest first. Stat cards: this FY, last FY, all time.
- **XIRR** (`core/calc/xirr.ts`): the yearly rate r with Σ amount / (1 + r)^(days since the first flow / 365) = 0 (Actual/365, as Excel's `XIRR`). NPS uses dated contributions and current value; mutual funds use the external transaction cash flows described above and current value. Solved by Newton's method with a bisection fallback between −99% and +1000% a year; shown as "—" when there is no answer or the relevant positions are unpriced. App only: snapshots store value, not XIRR.
- Savings total = sum of balances. An account's share (the share bar) = its balance / the sum of positive balances, so an overdrawn account shows 0% and never pushes others past 100%.
- **Missing prices:** a holding without a NAV or price (or a USD holding without a USDINR rate, when shown in INR) has no value, P&L or day change. Totals leave it out of value, invested and P&L alike (so value - invested = P&L) and report it separately as "N holdings, ₹X invested, not valued" for the UI to flag. Employee equity still reports all share and option quantities. Unpriced lots are excluded from valuation and unrealized P&L.
- **Day change in INR** for USD holdings = USD day change * today's USDINR rate; the exchange-rate move itself is not counted.
- **Portfolio scope:** every total is computed for the selected portfolio, or for all active portfolios when "All" is selected. **The default is All (family total).**
- Overview lists mutual funds, stocks (INR), employee equity still held and NPS under Investments. The By portfolio table uses FMV basis for the employee equity portion of Invested and P&L. Savings and dues lists savings, PF, PPF, fixed deposits and card dues. Mutual funds, stocks and NPS display their daily changes. Allocation includes all of these balances except card dues.

## Rules
- Money and units use `numeric`, never float.
- A NAV or price is stale when its date is older than 4 days; the UI shows a badge.
- Holdings are hard-deleted (the weekly backup is the safety net); the UI asks for confirmation.
- The importer upserts transactions by `(owner_id, source_key)`. The source key is a SHA-256 hash of the normalized folio, scheme identifier, date, CAS type, description, amount, units, NAV, balance and occurrence index. The occurrence index distinguishes otherwise identical entries. The key is independent of portfolio assignment, so re-imports match the same transaction even if a different destination is selected. The importer rejects an attempt to reassign a transaction to a different portfolio. The CAS closing units and reported cost replace manual units/invested only for matching fund/folio positions present in that statement. A tracked closing position has its redemption history saved and its units and cost set to zero. Manual edits never alter imported transactions; the next matching import replaces the manual holding values.
- `portfolio_snapshots`: one row per portfolio per day (about 365 rows per portfolio per year); this is the only history the app keeps.
