# Data model

Design goals: simple, light, and easy to maintain. **Holdings only** (no transaction ledger) and **latest-only market data** (no NAV or price history). One login owns everything; several **portfolios** (for example "Me", "Wife") sit under that owner.

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
| `stock_holdings` | Stocks (India and US) | `portfolio_id`, `market` (IN/US), `symbol`, `name`, `currency`, `quantity`, `avg_price`, `invested` |
| `rsu_grants` | RSU grants | `portfolio_id`, `symbol`, `grant_label`, `grant_date`, `units_granted`, `units_vested`, `units_sold_for_tax`, `tax_rate` |
| `savings_accounts` | Bank balances | `portfolio_id`, `bank`, `balance` |
| `credit_cards` | The card itself | `portfolio_id`, `name`, `bank`, `bill_day`, `due_day`, `is_active` |
| `card_bills` | One row per card per month | `card_id`, `statement_month` (first of month), `due_date`, `amount` (null = not received yet), `paid_amount`, `paid_on`, `notes`; unique (card_id, statement_month) |
| `portfolio_snapshots` | Daily totals per portfolio | `portfolio_id`, `snap_date`, `mf_value`, `stocks_value`, `rsu_vested_value`, `savings`, `card_dues` |
| `settings` | Preferences | `key`, `value` (jsonb) |

The same fund or stock can appear in several portfolios (different rows, same `scheme_code`/`symbol`). Deleting a portfolio deletes its holdings (cascade), so the UI must ask for explicit confirmation and suggest "deactivate" instead.

## Latest-only market data (shared, no personal data)
| Table | Key | Columns |
|---|---|---|
| `mf_nav_latest` | `scheme_code` | `nav`, `nav_date`, `prev_nav`, `prev_nav_date` |
| `stock_price_latest` | `symbol` | `close`, `price_date`, `prev_close`, `prev_price_date`, `source`, `is_manual` |
| `fx_latest` | `pair` (e.g. `USDINR`) | `rate`, `rate_date`, `prev_rate`, `prev_rate_date`, `is_manual` |
| `job_runs` | id | `job`, `status`, `message`, `started_at`, `finished_at` |

Each table holds one row per fund, stock or pair that you actually own (a few dozen rows in total). It never grows.

**How "today's change" works without history:** jobs call SQL functions `upsert_mf_nav`, `upsert_stock_price` and `upsert_fx_rate`. When the incoming date is newer than the stored one, the stored value moves into `prev_*` and the new value replaces it. If the date is the same, the value is corrected in place. If the date is older, it is ignored. Day change = `units * (nav - prev_nav)`.

Limitations to accept: a brand-new fund shows 0 day change until its second NAV date arrives; if jobs miss several days, "previous" is the last value the job saw. A stock or FX row with `is_manual = true` is never overwritten by jobs (manual override from Settings). Deleting the manual row hands the symbol back to the jobs on their next run.

## Job messages
`job_runs.message` for `fetch_nav` is JSON so the app can read it: `{"updated": 42, "unmatched": ["123456", ...]}`, where `unmatched` lists scheme codes from `mf_holdings` that were not in the AMFI file. Settings › Data check shows those funds as "not found in the AMFI file". On failure the message is plain text (the error), which the app ignores for this purpose.

## Views (security_invoker = true)
- `v_mf_holdings`: holdings + latest NAV, `prev_nav`, `current_value`, `pl`, `day_change`.
- `v_stock_holdings`: holdings + latest close, `prev_close`, `current_value`, `pl`, `day_change` (in the stock's own currency).
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

## Calculations (single source of truth)
Let `nav` be the latest NAV and `prev_nav` the previous stored NAV (equal to `nav` if none).
- MF current value = `units * nav`; P&L = `current_value - invested`; P&L % = `P&L / invested * 100` (0 if invested is 0); day change = `units * (nav - prev_nav)`.
- Stock current value = `quantity * last_close` (stock's currency); P&L and day change as above.
- USD to INR = multiply by `fx_latest` `USDINR` rate. Totals are shown in INR unless the user toggles USD.
- RSU per grant (price = `stock_price_latest.close` of the symbol, USD):
  - vested value USD = `units_vested * price`
  - sellable units = `units_vested - units_sold_for_tax`; pending vesting = `units_granted - units_vested`
  - after-tax value USD = `units_granted * price * (1 - tax_rate)` (verify against the sheet in Phase 3; the sheet is the reference)
  - INR values = USD value * USDINR
- Savings total = sum of balances.
- **Portfolio scope:** every total is computed for the selected portfolio, or for all active portfolios when "All" is selected. **The default is All (family total).**
- Overview combined = MF + Stocks (INR). RSU vested value, Savings and Card dues are shown as separate cards.

## Rules
- Money and units use `numeric`, never float.
- A NAV or price is stale when its date is older than 4 days; the UI shows a badge.
- Holdings are hard-deleted (the weekly backup is the safety net); the UI asks for confirmation.
- `portfolio_snapshots`: one row per portfolio per day (about 365 rows per portfolio per year); this is the only history the app keeps.
