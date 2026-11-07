-- Public Provident Fund (docs/DATA_MODEL.md, "PPF"). One row per deposit (investment) or
-- yearly interest credit, per portfolio and account. A ledger by the owner's explicit choice
-- (AGENTS.md rule 5). Rows count for the financial year (April to March) of their date.

create table public.ppf_entries (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id  uuid not null references public.portfolios(id) on delete cascade,
  account       text not null check (length(btrim(account)) between 1 and 100),
  entry_date    date not null,
  entry_type    text not null check (entry_type in ('investment', 'interest')),
  amount        numeric(18,2) not null check (amount > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One interest credit per portfolio, account and financial year of its date
-- (April 2025 to March 2026 is FY 2025: the date three months earlier is in 2025).
create unique index ppf_entries_one_interest_per_fy
  on public.ppf_entries (owner_id, portfolio_id, account,
                         extract(year from (entry_date - interval '3 months')))
  where entry_type = 'interest';

create index ppf_entries_owner_entry_date on public.ppf_entries (owner_id, entry_date);

create trigger t_ppf_touch before update on public.ppf_entries
  for each row execute function public.touch_updated_at();

alter table public.ppf_entries enable row level security;
create policy "owner_all" on public.ppf_entries for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.ppf_entries from public, anon;
grant select, insert, update, delete on public.ppf_entries to authenticated;
grant all on public.ppf_entries to service_role;

-- The daily snapshot keeps the PPF balance too (history chart).
alter table public.portfolio_snapshots add column ppf_balance numeric(18,2) not null default 0;
