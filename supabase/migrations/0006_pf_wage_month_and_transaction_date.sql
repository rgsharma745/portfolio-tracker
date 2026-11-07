-- PF rows as in the EPFO passbook: a transaction date (when the amount was credited) and,
-- for monthly contributions, the wage month (Jan to Dec) and wage year it pays for. Interest
-- has no wage month; it counts for the financial year (April to March) of its transaction date.
--
-- The owner chose to reload PF data in this format, so existing pf_entries rows are removed.
-- Works whether or not 0005 was applied.

delete from public.pf_entries;

drop index if exists public.pf_entries_one_monthly_per_month;
drop index if exists public.pf_entries_one_interest_per_month;
alter table public.pf_entries drop constraint if exists pf_entries_wage_month_check;
alter table public.pf_entries
  drop constraint if exists pf_entries_owner_id_portfolio_id_company_wage_month_contrib_key;
alter table public.pf_entries drop constraint if exists pf_interest_in_march_without_pension;
drop index if exists public.pf_entries_owner_id_wage_month_idx;

alter table public.pf_entries drop column wage_month;
alter table public.pf_entries
  add column transaction_date date not null,
  add column wage_month text check (wage_month in
    ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')),
  add column wage_year smallint check (wage_year between 1990 and 2100);

-- Monthly rows name their wage month and year; interest rows have neither and no pension.
alter table public.pf_entries add constraint pf_wage_month_by_type check (
  (contribution_type = 'monthly' and wage_month is not null and wage_year is not null)
  or (contribution_type = 'interest' and wage_month is null and wage_year is null
      and pension_amount = 0)
);

-- One contribution per portfolio, company and wage month of a year.
create unique index pf_entries_one_monthly_per_wage_month
  on public.pf_entries (owner_id, portfolio_id, company, wage_year, wage_month)
  where contribution_type = 'monthly';

-- One interest credit per portfolio, company and financial year of the transaction date
-- (April 2025 to March 2026 is FY 2025: the date three months earlier is in 2025).
create unique index pf_entries_one_interest_per_fy
  on public.pf_entries (owner_id, portfolio_id, company,
                        extract(year from (transaction_date - interval '3 months')))
  where contribution_type = 'interest';

create index pf_entries_owner_transaction_date on public.pf_entries (owner_id, transaction_date);
