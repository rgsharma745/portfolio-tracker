-- Quotes are keyed by listing market and symbol. Preserve ambiguous manual prices for
-- review in Settings, without applying them to either market.
alter table public.stock_price_latest add column market text;

with markets as (
  select symbol, market from public.stock_holdings
  union
  select symbol, 'US' from public.rsu_grants
), candidates as (
  select symbol, min(market) as market, count(*) as matches from markets group by symbol
)
update public.stock_price_latest p set market = case
  when c.matches = 1 then c.market
  when c.matches > 1 and p.is_manual then 'UNASSIGNED'
  when p.source = 'nse' then 'IN'
  when c.matches is null and p.is_manual then 'IN'
  else 'UNASSIGNED' end
from (select symbol from public.stock_price_latest) existing
left join candidates c using (symbol)
where p.symbol = existing.symbol;

delete from public.stock_price_latest where market = 'UNASSIGNED' and not is_manual;
alter table public.stock_price_latest
  alter column market set not null,
  add check (market in ('IN', 'US') or (market = 'UNASSIGNED' and is_manual)),
  drop constraint stock_price_latest_pkey,
  add primary key (market, symbol);

create or replace view public.v_stock_holdings with (security_invoker = true) as
select
  h.*,
  p.close as last_close,
  p.price_date,
  coalesce(p.prev_close, p.close) as prev_close,
  h.quantity * p.close as current_value,
  h.quantity * p.close - h.invested as pl,
  h.quantity * (p.close - coalesce(p.prev_close, p.close)) as day_change
from public.stock_holdings h
left join public.stock_price_latest p on p.market = h.market and p.symbol = h.symbol;

drop function public.upsert_stock_price(text, numeric, date, text);
create function public.upsert_stock_price(
  p_market text, p_symbol text, p_close numeric, p_date date, p_source text default null
)
returns void language sql set search_path = '' as $$
  insert into public.stock_price_latest (market, symbol, close, price_date, source)
  values (p_market, p_symbol, p_close, p_date, p_source)
  on conflict (market, symbol) do update set
    prev_close = case when excluded.price_date > stock_price_latest.price_date
                      then stock_price_latest.close else stock_price_latest.prev_close end,
    prev_price_date = case when excluded.price_date > stock_price_latest.price_date
                           then stock_price_latest.price_date else stock_price_latest.prev_price_date end,
    close = excluded.close,
    price_date = excluded.price_date,
    source = excluded.source,
    updated_at = now()
  where not stock_price_latest.is_manual and excluded.price_date >= stock_price_latest.price_date;
$$;
revoke all on function public.upsert_stock_price(text, text, numeric, date, text) from public, anon, authenticated;
grant execute on function public.upsert_stock_price(text, text, numeric, date, text) to service_role;
