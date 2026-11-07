-- National Pension System (docs/DATA_MODEL.md, "NPS"), Tier I.
-- nps_holdings: the current units per account and scheme (E, C, G, and A for old accounts),
--   one row per scheme so each one joins to its own NAV.
-- nps_contributions: one row per contribution (self or employer). A ledger by the owner's
--   explicit choice (AGENTS.md rule 5); it gives the per-financial-year table and the XIRR.
-- nps_nav_latest: latest-only NAV per NPS scheme code (shared market data, no personal data).

create table public.nps_holdings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id  uuid not null references public.portfolios(id) on delete cascade,
  account       text not null check (length(btrim(account)) between 1 and 100),
  scheme_class  text not null check (scheme_class in ('E', 'C', 'G', 'A')),
  scheme_code   text check (scheme_code is null or length(btrim(scheme_code)) between 1 and 20),
  scheme_name   text not null check (length(btrim(scheme_name)) between 1 and 200),
  units         numeric(18,4) not null default 0 check (units >= 0),
  units_as_of   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, portfolio_id, account, scheme_class)
);
create index on public.nps_holdings (owner_id, portfolio_id);
create trigger t_nps_holdings_touch before update on public.nps_holdings
  for each row execute function public.touch_updated_at();

create table public.nps_contributions (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id       uuid not null references public.portfolios(id) on delete cascade,
  account            text not null check (length(btrim(account)) between 1 and 100),
  contribution_date  date not null,
  contributor        text not null check (contributor in ('self', 'employer')),
  amount             numeric(18,2) not null check (amount > 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index nps_contributions_owner_date on public.nps_contributions (owner_id, contribution_date);
create trigger t_nps_contributions_touch before update on public.nps_contributions
  for each row execute function public.touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['nps_holdings', 'nps_contributions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated
                    using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Latest-only NAVs. Like stock_price_latest, the signed-in owner may write a manual NAV
-- (is_manual = true), which the job never overwrites; deleting the row hands it back.
create table public.nps_nav_latest (
  scheme_code    text primary key,
  nav            numeric(18,4) not null check (nav > 0),
  nav_date       date not null,
  prev_nav       numeric(18,4),
  prev_nav_date  date,
  is_manual      boolean not null default false,
  updated_at     timestamptz not null default now()
);
alter table public.nps_nav_latest enable row level security;
create policy "authenticated_all" on public.nps_nav_latest for all to authenticated
  using (true) with check (true);
revoke all on public.nps_nav_latest from public, anon;
grant select, insert, update, delete on public.nps_nav_latest to authenticated;
grant all on public.nps_nav_latest to service_role;

-- Same rules as upsert_mf_nav: a newer date moves the current NAV into prev_*, the same date
-- corrects it, an older date is ignored; manual rows are left alone.
create or replace function public.upsert_nps_nav(p_code text, p_nav numeric, p_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into nps_nav_latest (scheme_code, nav, nav_date) values (p_code, p_nav, p_date)
  on conflict (scheme_code) do update set
    prev_nav      = case when excluded.nav_date > nps_nav_latest.nav_date then nps_nav_latest.nav      else nps_nav_latest.prev_nav end,
    prev_nav_date = case when excluded.nav_date > nps_nav_latest.nav_date then nps_nav_latest.nav_date else nps_nav_latest.prev_nav_date end,
    nav           = case when excluded.nav_date >= nps_nav_latest.nav_date then excluded.nav else nps_nav_latest.nav end,
    nav_date      = greatest(excluded.nav_date, nps_nav_latest.nav_date),
    updated_at    = now()
  where not nps_nav_latest.is_manual;
end $$;
revoke all on function public.upsert_nps_nav(text, numeric, date) from public, anon, authenticated;
grant execute on function public.upsert_nps_nav(text, numeric, date) to service_role;

-- The daily snapshot keeps the NPS value too (history chart).
alter table public.portfolio_snapshots add column nps_value numeric(18,2) not null default 0;
