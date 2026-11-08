# Loading your data (owner guide)

You load your own data. Three options: the app's forms, Supabase's table editor (CSV import), or the SQL editor. Load in this order because later tables point to earlier ones.

**The app is the easiest way.** On first sign-in it asks you to create your first portfolio (more in Settings › Portfolios). Then use **Add fund**, **Add stock**, **Add grant**, **Add account**, **Add first month** (PF) and **Add card** on each page; rows created in the app get the right `owner_id` automatically. On the Cards page, **Create this month's bills** adds a bill for every card that has a statement day and due day; enter each amount when the statement arrives and use **Mark paid**. CSV or SQL (below) is quicker for loading many rows at once.

On the PF page, **Add next month** opens the wage month after a company's last contribution, credited a month after it, with the same amounts, so each month is usually one tap on Save; **Add interest** records an interest credit by its transaction date (it counts for that date's financial year).

For stocks, enter either the amount invested or the average price; the app works out the other from the quantity. RSU tax rates are entered as a percentage (30 for 30%).

**Try it locally first** if you like: `cd web && npm run db:start && npm run start:local` gives you a throwaway copy of the app and database on your machine (see AGENTS.md).

1. `portfolios`
2. `mf_holdings`, `stock_holdings`, `rsu_grants`, `savings_accounts`, `pf_entries`, `credit_cards` (each needs a `portfolio_id`)
3. `card_bills` (needs a `card_id`)

## Important: owner_id
The dashboard and SQL editor run without a logged-in user, so the default `auth.uid()` is empty there. Always supply `owner_id` yourself: your user UUID from Supabase > Authentication > Users. Rows without the right `owner_id` are invisible in the app (RLS) or rejected.

## SQL snippets (replace `OWNER_UUID`)
```sql
-- 1. portfolios
insert into portfolios (owner_id, name, sort_order) values
  ('OWNER_UUID', 'Me', 1),
  ('OWNER_UUID', 'Wife', 2);

-- 2. mutual funds (portfolio looked up by name)
insert into mf_holdings (owner_id, portfolio_id, scheme_code, scheme_name, folio, units, invested)
select 'OWNER_UUID', p.id, v.code, v.name, v.folio, v.units, v.invested
from (values
  ('120503', 'Example Fund - Direct Growth', '1234567', 100.123, 50000.00)
) as v(code, name, folio, units, invested)
join portfolios p on p.owner_id = 'OWNER_UUID' and p.name = 'Me';

-- stocks (market IN or US; currency INR or USD)
insert into stock_holdings (owner_id, portfolio_id, market, symbol, name, currency, quantity, invested)
select 'OWNER_UUID', p.id, 'IN', 'RELIANCE', 'Reliance Industries', 'INR', 10, 25000
from portfolios p where p.owner_id = 'OWNER_UUID' and p.name = 'Me';

-- savings
insert into savings_accounts (owner_id, portfolio_id, bank, balance)
select 'OWNER_UUID', p.id, 'HDFC', 100000
from portfolios p where p.owner_id = 'OWNER_UUID' and p.name = 'Me';

-- PF: monthly contributions (wage month Jan..Dec + year, and the date credited) and an
-- interest credit (no wage month, pension 0; it counts for the financial year of its date)
insert into pf_entries (owner_id, portfolio_id, company, contribution_type, wage_month, wage_year,
                        transaction_date, employee_amount, employer_amount, pension_amount)
select 'OWNER_UUID', p.id, v.company, v.kind, v.wage_month, v.wage_year, v.credited::date,
       v.ee, v.er, v.eps
from (values
  ('Acme Pvt Ltd', 'monthly', 'Sep', 2026, '2026-10-08', 7200, 5950, 1250),
  ('Acme Pvt Ltd', 'monthly', 'Oct', 2026, '2026-11-08', 7200, 5950, 1250),
  ('Acme Pvt Ltd', 'interest', null, null, '2026-08-20', 18240.50, 14110, 0)
) as v(company, kind, wage_month, wage_year, credited, ee, er, eps)
join portfolios p on p.owner_id = 'OWNER_UUID' and p.name = 'Me';

-- PPF: deposits (investment) and the yearly interest credit, per account
insert into ppf_entries (owner_id, portfolio_id, account, entry_type, entry_date, amount)
select 'OWNER_UUID', p.id, v.account, v.kind, v.on_date::date, v.amount
from (values
  ('SBI PPF', 'investment', '2025-04-05', 150000),
  ('SBI PPF', 'interest', '2026-03-31', 10650.50)
) as v(account, kind, on_date, amount)
join portfolios p on p.owner_id = 'OWNER_UUID' and p.name = 'Me';

-- Fixed deposits: one row per FD (compounding defaults to quarterly)
insert into fixed_deposits (owner_id, portfolio_id, bank, start_date, maturity_date, principal, rate, compounding)
select 'OWNER_UUID', p.id, v.bank, v.start_on::date, v.matures_on::date, v.principal, v.rate, v.compounding
from (values
  ('SBI', '2026-01-15', '2027-01-15', 200000, 6.80, 'quarterly'),
  ('Post Office TD', '2026-04-01', '2031-04-01', 100000, 7.50, 'payout')
) as v(bank, start_on, matures_on, principal, rate, compounding)
join portfolios p on p.owner_id = 'OWNER_UUID' and p.name = 'Me';

-- NPS: units per scheme (from your statement), then contributions
insert into nps_holdings (owner_id, portfolio_id, account, scheme_class, scheme_code, scheme_name, units, units_as_of)
select 'OWNER_UUID', p.id, v.account, v.cls, v.code, v.name, v.units, v.as_of::date
from (values
  ('Rahul PRAN', 'E', 'SM008001', 'HDFC Scheme E Tier I', 1234.5678, '2026-10-31'),
  ('Rahul PRAN', 'C', 'SM008002', 'HDFC Scheme C Tier I', 456.7890, '2026-10-31'),
  ('Rahul PRAN', 'G', 'SM008003', 'HDFC Scheme G Tier I', 321.0000, '2026-10-31')
) as v(account, cls, code, name, units, as_of)
join portfolios p on p.owner_id = 'OWNER_UUID' and p.name = 'Me';

insert into nps_contributions (owner_id, portfolio_id, account, contribution_date, contributor, amount)
select 'OWNER_UUID', p.id, v.account, v.on_date::date, v.who, v.amount
from (values
  ('Rahul PRAN', '2026-04-05', 'self', 5000),
  ('Rahul PRAN', '2026-04-05', 'employer', 8123.45)
) as v(account, on_date, who, amount)
join portfolios p on p.owner_id = 'OWNER_UUID' and p.name = 'Me';

-- portfolio ids, for CSV files
select id, name from portfolios where owner_id = 'OWNER_UUID';

-- credit cards (bill_day = statement day, due_day = payment day)
insert into credit_cards (owner_id, portfolio_id, name, bank, bill_day, due_day)
select 'OWNER_UUID', p.id, 'HDFC Neu', 'HDFC', 14, 3
from portfolios p where p.owner_id = 'OWNER_UUID' and p.name = 'Me';

-- 3. card bills (statement_month is the first of the month; amount null = statement not received yet)
insert into card_bills (owner_id, card_id, statement_month, due_date, amount, paid_amount)
select 'OWNER_UUID', c.id, date '2026-10-01', date '2026-11-03', 34485, 0
from credit_cards c where c.owner_id = 'OWNER_UUID' and c.name = 'HDFC Neu';
```

## CSV headers (Supabase table editor > Insert > Import data from CSV)
Include `owner_id` and the parent id columns (`portfolio_id`, `card_id`) with real UUIDs. Open `portfolios` first and copy the generated ids.
| Table | Columns |
|---|---|
| `portfolios` | `owner_id,name,sort_order` |
| `mf_holdings` | `owner_id,portfolio_id,scheme_code,scheme_name,folio,units,invested` |
| `stock_holdings` | `owner_id,portfolio_id,market,symbol,name,currency,quantity,avg_price,invested` |
| `rsu_grants` | `owner_id,portfolio_id,symbol,grant_label,grant_date,units_granted,units_vested,units_sold_for_tax,tax_rate` |
| `savings_accounts` | `owner_id,portfolio_id,bank,balance` |
| `pf_entries` | `owner_id,portfolio_id,company,contribution_type,wage_month,wage_year,transaction_date,employee_amount,employer_amount,pension_amount` |
| `ppf_entries` | `owner_id,portfolio_id,account,entry_type,entry_date,amount` |
| `nps_holdings` | `owner_id,portfolio_id,account,scheme_class,scheme_code,scheme_name,units,units_as_of` |
| `nps_contributions` | `owner_id,portfolio_id,account,contribution_date,contributor,amount` |
| `fixed_deposits` | `owner_id,portfolio_id,bank,start_date,maturity_date,principal,rate,compounding` |
| `credit_cards` | `owner_id,portfolio_id,name,bank,bill_day,due_day` |
| `card_bills` | `owner_id,card_id,statement_month,due_date,amount,paid_amount,paid_on,notes` |

## Value rules
- Numbers: plain digits with a decimal point, no `₹`, `$` or commas (`178818.00`).
- Dates: `YYYY-MM-DD`. `statement_month` must be the first day of a month.
- `tax_rate` is a fraction (`0.30` for 30%).
- `scheme_code` is the AMFI scheme code (a number). If unsure, leave it empty and fix it later; the app's Data check lists funds without a valid code.
- Stock `symbol` must match what the price job uses (for example NSE symbol `RELIANCE`, US ticker `CIEN`).
- `units_vested` cannot exceed `units_granted`, and `units_sold_for_tax` cannot exceed `units_vested`.
- PF: `contribution_type` is `monthly` or `interest`. `transaction_date` (`YYYY-MM-DD`, when it was credited) is required. Monthly rows need `wage_month` as `Jan` … `Dec` (exactly these three-letter names) and `wage_year` (e.g. `2025`); interest rows leave both **empty** and have `pension_amount` 0. Fill every amount column, with `0` where there is none: an empty amount is stored as empty and the row is refused. One monthly row per company, wage month and year, and one interest row per company and financial year (of the transaction date, April to March), per portfolio; a second one is refused.

- PPF: `entry_type` is `investment` or `interest`; `entry_date` is `YYYY-MM-DD`; `amount` is more than 0. Use the same `account` name on every row of one account (e.g. `SBI PPF`). One interest row per account and financial year (April to March) per portfolio; a second one is refused. Deposits over ₹1,50,000 in a year are accepted and flagged on the PPF page.

- NPS: one `nps_holdings` row per account and scheme class (`E`, `C`, `G`, or `A`), with the units from your latest statement and its date in `units_as_of`. `scheme_code` is the NPS scheme ID (`SM` + six digits, e.g. `SM008001` for HDFC Scheme E Tier I; listed on NPS Trust's NAV page, npstrust.org.in › NAV, and on your statement); without it the scheme has no NAV and no value. `nps_contributions`: `contributor` is `self` or `employer`, `amount` more than 0, dated `YYYY-MM-DD`; use the same `account` name as the holdings. After each statement, update the units (NPS page › Update units) so value and XIRR stay right.

- Fixed deposits: `start_date` (date of investment) and `maturity_date` as `YYYY-MM-DD`, maturity after the start; `principal` more than 0; `rate` the yearly rate in percent (`7.25`, not `0.0725`); `compounding` one of `monthly`, `quarterly`, `half_yearly`, `yearly`, `payout` (interest paid out; leave it empty for quarterly, which most bank FDs use). Check the FD receipt for the compounding.

## After loading
- Compare invested totals per portfolio with your sheet.
- Open Settings › Data check. Before the jobs have run it lists every fund and stock as "no NAV yet" / "without a price"; that is expected.
- Run the NAV and price jobs once (GitHub Actions > Run workflow), then re-run the Data check. Anything still listed needs fixing:
  - **Funds without a scheme code** / **scheme codes not found in the AMFI file**: correct `scheme_code`.
  - **Stocks or RSU grants without a price**: correct `symbol`, or set a manual price in Settings.
  - **Cards missing a bill day or due day**: set `bill_day` and `due_day`.
- Only active portfolios are checked.
