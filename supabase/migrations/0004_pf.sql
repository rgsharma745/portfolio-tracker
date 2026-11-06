-- Provident fund (docs/DATA_MODEL.md, "PF"). One row per company, wage month and contribution
-- type, as in the PF passbook. This is a ledger by the owner's explicit choice (AGENTS.md rule 5).
-- Interest is credited once a financial year and recorded in March of that FY; EPS earns none.

create table public.pf_entries (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id       uuid not null references public.portfolios(id) on delete cascade,
  company            text not null check (length(btrim(company)) between 1 and 100),
  wage_month         date not null check (extract(day from wage_month) = 1),   -- first of the month
  contribution_type  text not null check (contribution_type in ('monthly', 'interest')),
  employee_amount    numeric(18,2) not null default 0 check (employee_amount >= 0),
  employer_amount    numeric(18,2) not null default 0 check (employer_amount >= 0),
  pension_amount     numeric(18,2) not null default 0 check (pension_amount >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint pf_interest_in_march_without_pension check (
    contribution_type <> 'interest' or (extract(month from wage_month) = 3 and pension_amount = 0)
  ),
  unique (owner_id, portfolio_id, company, wage_month, contribution_type)
);
create index on public.pf_entries (owner_id, wage_month);
create trigger t_pf_touch before update on public.pf_entries
  for each row execute function public.touch_updated_at();

alter table public.pf_entries enable row level security;
create policy "owner_all" on public.pf_entries for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.pf_entries from public, anon;
grant select, insert, update, delete on public.pf_entries to authenticated;
grant all on public.pf_entries to service_role;

-- The daily snapshot keeps the PF balance too (history chart).
alter table public.portfolio_snapshots add column pf_balance numeric(18,2) not null default 0;
