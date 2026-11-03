-- 0001_init.sql : initial schema for Portfolio Tracker
-- Single login (the owner). Several PORTFOLIOS (e.g. "Me", "Wife") live under that one owner.
-- Every owner table is protected by RLS (owner_id = auth.uid()).
-- Market data is "latest only": one small row per fund/stock/pair, no history tables.

-- ============ Portfolios ============

create table public.portfolios (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

-- ============ Owner tables ============

create table public.mf_holdings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id  uuid not null references public.portfolios(id) on delete cascade,
  scheme_code   text,                        -- AMFI scheme code (null until matched)
  scheme_name   text not null,
  folio         text,
  units         numeric(18,4) not null default 0 check (units >= 0),
  invested      numeric(18,2) not null default 0 check (invested >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.mf_holdings (owner_id, portfolio_id);
create unique index mf_holdings_natural
  on public.mf_holdings (owner_id, portfolio_id, scheme_name, coalesce(folio, ''));

create table public.stock_holdings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id  uuid not null references public.portfolios(id) on delete cascade,
  market        text not null default 'IN' check (market in ('IN','US')),
  symbol        text not null,
  name          text,
  currency      text not null default 'INR' check (currency in ('INR','USD')),
  quantity      numeric(18,4) not null default 0 check (quantity >= 0),
  avg_price     numeric(18,4),
  invested      numeric(18,2) not null default 0 check (invested >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.stock_holdings (owner_id, portfolio_id);
create unique index stock_holdings_natural
  on public.stock_holdings (owner_id, portfolio_id, market, symbol);

create table public.rsu_grants (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id        uuid not null references public.portfolios(id) on delete cascade,
  symbol              text not null,
  grant_label         text not null,
  grant_date          date,
  units_granted       numeric(18,4) not null default 0 check (units_granted >= 0),
  units_vested        numeric(18,4) not null default 0 check (units_vested >= 0),
  units_sold_for_tax  numeric(18,4) not null default 0 check (units_sold_for_tax >= 0),
  tax_rate            numeric(6,4)  not null default 0 check (tax_rate >= 0 and tax_rate <= 1),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (units_vested <= units_granted),
  check (units_sold_for_tax <= units_vested)
);
create unique index rsu_grants_natural
  on public.rsu_grants (owner_id, portfolio_id, symbol, grant_label);

create table public.savings_accounts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id  uuid not null references public.portfolios(id) on delete cascade,
  bank          text not null,
  balance       numeric(18,2) not null default 0,
  updated_at    timestamptz not null default now()
);
create unique index savings_natural on public.savings_accounts (owner_id, portfolio_id, bank);

-- Credit cards: the card itself. Bills live in card_bills (one row per card per month).
create table public.credit_cards (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id  uuid not null references public.portfolios(id) on delete cascade,
  name          text not null,
  bank          text,
  bill_day      smallint check (bill_day between 1 and 31),   -- statement generation day
  due_day       smallint check (due_day between 1 and 31),    -- payment due day
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.card_bills (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id          uuid not null references public.credit_cards(id) on delete cascade,
  statement_month  date not null check (extract(day from statement_month) = 1)   -- always the first of the month,
  due_date         date not null,
  amount           numeric(18,2) check (amount >= 0),          -- null = statement not received yet
  paid_amount      numeric(18,2) not null default 0 check (paid_amount >= 0),
  paid_on          date,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (card_id, statement_month)
);
create index on public.card_bills (owner_id, due_date);

create table public.portfolio_snapshots (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id      uuid not null references public.portfolios(id) on delete cascade,
  snap_date         date not null,
  mf_value          numeric(18,2) not null default 0,
  stocks_value      numeric(18,2) not null default 0,
  rsu_vested_value  numeric(18,2) not null default 0,
  savings           numeric(18,2) not null default 0,
  card_dues         numeric(18,2) not null default 0,
  unique (owner_id, portfolio_id, snap_date)
);

create table public.settings (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key       text not null,
  value     jsonb not null default '{}'::jsonb,
  unique (owner_id, key)
);

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger t_mf_touch    before update on public.mf_holdings      for each row execute function public.touch_updated_at();
create trigger t_stock_touch before update on public.stock_holdings   for each row execute function public.touch_updated_at();
create trigger t_rsu_touch   before update on public.rsu_grants       for each row execute function public.touch_updated_at();
create trigger t_sav_touch   before update on public.savings_accounts for each row execute function public.touch_updated_at();
create trigger t_card_touch  before update on public.credit_cards     for each row execute function public.touch_updated_at();
create trigger t_bill_touch  before update on public.card_bills       for each row execute function public.touch_updated_at();

-- ============ Latest-only market data (no history, no personal data) ============

create table public.mf_nav_latest (
  scheme_code    text primary key,
  nav            numeric(18,6) not null,
  nav_date       date not null,
  prev_nav       numeric(18,6),
  prev_nav_date  date,
  updated_at     timestamptz not null default now()
);

create table public.stock_price_latest (
  symbol           text primary key,        -- e.g. 'RELIANCE' (IN) or 'CIEN' (US); symbols are unique per market in practice
  close            numeric(18,4) not null,
  price_date       date not null,
  prev_close       numeric(18,4),
  prev_price_date  date,
  source           text,
  is_manual        boolean not null default false,   -- manual override: jobs must not overwrite
  updated_at       timestamptz not null default now()
);

create table public.fx_latest (
  pair            text primary key,         -- e.g. 'USDINR'
  rate            numeric(18,6) not null,
  rate_date       date not null,
  prev_rate       numeric(18,6),
  prev_rate_date  date,
  updated_at      timestamptz not null default now()
);

create table public.job_runs (
  id           bigint generated always as identity primary key,
  job          text not null,
  status       text not null check (status in ('success','failure')),
  message      text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- Upsert helpers used by the jobs (service role only).
-- A newer date moves the current value into prev_*; the same date corrects the value;
-- an older date is ignored. This is how "today's change" works without storing history.

create or replace function public.upsert_mf_nav(p_code text, p_nav numeric, p_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into mf_nav_latest (scheme_code, nav, nav_date) values (p_code, p_nav, p_date)
  on conflict (scheme_code) do update set
    prev_nav      = case when excluded.nav_date > mf_nav_latest.nav_date then mf_nav_latest.nav      else mf_nav_latest.prev_nav end,
    prev_nav_date = case when excluded.nav_date > mf_nav_latest.nav_date then mf_nav_latest.nav_date else mf_nav_latest.prev_nav_date end,
    nav           = case when excluded.nav_date >= mf_nav_latest.nav_date then excluded.nav else mf_nav_latest.nav end,
    nav_date      = greatest(excluded.nav_date, mf_nav_latest.nav_date),
    updated_at    = now();
end $$;

create or replace function public.upsert_stock_price(p_symbol text, p_close numeric, p_date date, p_source text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into stock_price_latest (symbol, close, price_date, source) values (p_symbol, p_close, p_date, p_source)
  on conflict (symbol) do update set
    prev_close      = case when excluded.price_date > stock_price_latest.price_date then stock_price_latest.close      else stock_price_latest.prev_close end,
    prev_price_date = case when excluded.price_date > stock_price_latest.price_date then stock_price_latest.price_date else stock_price_latest.prev_price_date end,
    close           = case when excluded.price_date >= stock_price_latest.price_date then excluded.close else stock_price_latest.close end,
    price_date      = greatest(excluded.price_date, stock_price_latest.price_date),
    source          = p_source,
    updated_at      = now()
  where not stock_price_latest.is_manual;
end $$;

create or replace function public.upsert_fx_rate(p_pair text, p_rate numeric, p_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into fx_latest (pair, rate, rate_date) values (p_pair, p_rate, p_date)
  on conflict (pair) do update set
    prev_rate      = case when excluded.rate_date > fx_latest.rate_date then fx_latest.rate      else fx_latest.prev_rate end,
    prev_rate_date = case when excluded.rate_date > fx_latest.rate_date then fx_latest.rate_date else fx_latest.prev_rate_date end,
    rate           = case when excluded.rate_date >= fx_latest.rate_date then excluded.rate else fx_latest.rate end,
    rate_date      = greatest(excluded.rate_date, fx_latest.rate_date),
    updated_at     = now();
end $$;

revoke all on function public.upsert_mf_nav(text, numeric, date)               from public, anon, authenticated;
revoke all on function public.upsert_stock_price(text, numeric, date, text)    from public, anon, authenticated;
revoke all on function public.upsert_fx_rate(text, numeric, date)              from public, anon, authenticated;
grant execute on function public.upsert_mf_nav(text, numeric, date)            to service_role;
grant execute on function public.upsert_stock_price(text, numeric, date, text) to service_role;
grant execute on function public.upsert_fx_rate(text, numeric, date)           to service_role;

-- ============ Row Level Security ============

do $$
declare t text;
begin
  foreach t in array array['portfolios','mf_holdings','stock_holdings','rsu_grants','savings_accounts',
                           'credit_cards','card_bills','portfolio_snapshots','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated
                    using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;

  foreach t in array array['mf_nav_latest','stock_price_latest','fx_latest','job_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "read_authenticated" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Manual price override is the only write the owner may do on market data.
create policy "owner_manual_price_insert" on public.stock_price_latest for insert to authenticated
  with check (is_manual);
create policy "owner_manual_price_update" on public.stock_price_latest for update to authenticated
  using (is_manual) with check (is_manual);

-- ============ Views (respect caller RLS) ============

create view public.v_mf_holdings with (security_invoker = true) as
select
  h.*,
  n.nav,
  n.nav_date,
  coalesce(n.prev_nav, n.nav)                    as prev_nav,
  h.units * n.nav                                as current_value,
  h.units * n.nav - h.invested                   as pl,
  h.units * (n.nav - coalesce(n.prev_nav, n.nav)) as day_change
from public.mf_holdings h
left join public.mf_nav_latest n on n.scheme_code = h.scheme_code;

create view public.v_stock_holdings with (security_invoker = true) as
select
  h.*,
  p.close                                        as last_close,
  p.price_date,
  coalesce(p.prev_close, p.close)                as prev_close,
  h.quantity * p.close                           as current_value,
  h.quantity * p.close - h.invested              as pl,
  h.quantity * (p.close - coalesce(p.prev_close, p.close)) as day_change
from public.stock_holdings h
left join public.stock_price_latest p on p.symbol = h.symbol;

create view public.v_card_bills with (security_invoker = true) as
select
  b.*,
  c.name as card_name,
  c.portfolio_id,
  greatest(coalesce(b.amount, 0) - b.paid_amount, 0) as balance,
  case
    when b.amount is null                 then 'awaiting'   -- statement not entered yet
    when b.paid_amount >= b.amount        then 'paid'
    when b.due_date < current_date        then 'overdue'
    when b.paid_amount > 0                then 'partial'
    else 'unpaid'
  end as status
from public.card_bills b
join public.credit_cards c on c.id = b.card_id;
