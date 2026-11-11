-- Dividends received (docs/DATA_MODEL.md, "Dividends"). One row per dividend credit, per
-- portfolio. A ledger by the owner's explicit choice (AGENTS.md rule 5). Rows count for the
-- financial year (April to March) of their payment date.
--
-- amount_inr is what was credited in rupees and is the figure that gets added up. US rows
-- also keep the dollar amount, because the USD/INR rate on the day of payment is not today's.

create table public.dividends (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  portfolio_id  uuid not null references public.portfolios(id) on delete cascade,
  market        text not null check (market in ('IN', 'US')),
  symbol        text not null check (symbol = upper(btrim(symbol)) and length(symbol) between 1 and 20),
  paid_on       date not null,
  amount_inr    numeric(18,2) not null check (amount_inr > 0),
  amount_usd    numeric(18,2) check (amount_usd > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- The dollar amount is required for a US dividend and absent for an Indian one.
  constraint dividends_usd_only_for_us check ((market = 'US') = (amount_usd is not null))
);

-- No unique key: one symbol can pay twice on the same day (an interim and a special dividend).
create index dividends_owner_paid_on on public.dividends (owner_id, paid_on);

create trigger t_dividends_touch before update on public.dividends
  for each row execute function public.touch_updated_at();

alter table public.dividends enable row level security;
create policy "owner_all" on public.dividends for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.dividends from public, anon;
grant select, insert, update, delete on public.dividends to authenticated;
grant all on public.dividends to service_role;
