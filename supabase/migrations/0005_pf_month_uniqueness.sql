-- PF wage months may be any day of the month (a passbook or CSV may carry the credit date
-- rather than the 1st). Uniqueness moves from the exact date to the calendar month:
-- one monthly contribution per portfolio, company and month, and one interest row per
-- portfolio, company and month (interest stays in March of the financial year).

alter table public.pf_entries drop constraint if exists pf_entries_wage_month_check;
alter table public.pf_entries
  drop constraint if exists pf_entries_owner_id_portfolio_id_company_wage_month_contrib_key;

create unique index pf_entries_one_monthly_per_month
  on public.pf_entries (owner_id, portfolio_id, company, date_trunc('month', wage_month::timestamp))
  where contribution_type = 'monthly';

create unique index pf_entries_one_interest_per_month
  on public.pf_entries (owner_id, portfolio_id, company, date_trunc('month', wage_month::timestamp))
  where contribution_type = 'interest';
