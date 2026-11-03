# Loading your data (owner guide)

You load your own data. Three options: the app's forms, Supabase's table editor (CSV import), or the SQL editor. Load in this order because later tables point to earlier ones.

1. `portfolios`
2. `mf_holdings`, `stock_holdings`, `rsu_grants`, `savings_accounts`, `credit_cards` (each needs a `portfolio_id`)
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
| `credit_cards` | `owner_id,portfolio_id,name,bank,bill_day,due_day` |
| `card_bills` | `owner_id,card_id,statement_month,due_date,amount,paid_amount,paid_on,notes` |

## Value rules
- Numbers: plain digits with a decimal point, no `₹`, `$` or commas (`178818.00`).
- Dates: `YYYY-MM-DD`. `statement_month` must be the first day of a month.
- `tax_rate` is a fraction (`0.30` for 30%).
- `scheme_code` is the AMFI scheme code (a number). If unsure, leave it empty and fix it later; the app's Data check lists funds without a valid code.
- Stock `symbol` must match what the price job uses (for example NSE symbol `RELIANCE`, US ticker `CIEN`).
- `units_vested` cannot exceed `units_granted`, and `units_sold_for_tax` cannot exceed `units_vested`.

## After loading
- Compare invested totals per portfolio with your sheet.
- Run the NAV and price jobs once (GitHub Actions > Run workflow), then open the app and check the Data check list in Settings.
