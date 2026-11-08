-- Fixed deposits (docs/DATA_MODEL.md, "Fixed deposits"). One row per FD: bank, start and
-- maturity dates, principal, rate and how interest compounds. The maturity amount, the value
-- today and the days left are calculated, never stored.

create table public.fixed_deposits (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id   uuid not null references public.portfolios(id) on delete cascade,
  bank           text not null check (length(btrim(bank)) between 1 and 60),
  start_date     date not null,
  maturity_date  date not null,
  principal      numeric(18,2) not null check (principal > 0),
  -- Yearly rate in percent, e.g. 7.25.
  rate           numeric(6,3) not null check (rate > 0 and rate < 100),
  -- 'payout': interest is paid out as it is earned, so the FD returns its principal.
  compounding    text not null default 'quarterly'
                 check (compounding in ('monthly', 'quarterly', 'half_yearly', 'yearly', 'payout')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (maturity_date > start_date)
);

create index fixed_deposits_owner_maturity on public.fixed_deposits (owner_id, maturity_date);

create trigger t_fixed_deposits_touch before update on public.fixed_deposits
  for each row execute function public.touch_updated_at();

alter table public.fixed_deposits enable row level security;
create policy "owner_all" on public.fixed_deposits for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.fixed_deposits from public, anon;
grant select, insert, update, delete on public.fixed_deposits to authenticated;
grant all on public.fixed_deposits to service_role;

-- The daily snapshot keeps the FD value (principal + interest earned so far) too.
alter table public.portfolio_snapshots add column fd_value numeric(18,2) not null default 0;
