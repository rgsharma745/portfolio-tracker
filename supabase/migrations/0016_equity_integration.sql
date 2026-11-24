-- A security's listing and quote currency determine every grant's valuation and tax
-- holding-period rule. Use a different security to track a different share class or listing.
create function public.keep_equity_security_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.market, new.symbol, new.currency) is distinct from (old.market, old.symbol, old.currency)
     and exists (select 1 from public.equity_grants where security_id = old.id) then
    raise exception 'Market, symbol and currency are fixed while grants reference this company.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.keep_equity_security_identity() from public, anon, authenticated;
create trigger keep_equity_security_identity before update on public.equity_securities
  for each row execute function public.keep_equity_security_identity();

create view public.v_equity_portfolio_values with (security_invoker = true) as
select owner_id, portfolio_id, sum(coalesce(value_inr, 0)) as value_inr
from public.v_equity_lots
group by owner_id, portfolio_id;
revoke all on public.v_equity_portfolio_values from public, anon, authenticated;
grant select on public.v_equity_portfolio_values to authenticated, service_role;

-- Export the ledger in one read snapshot, including every row and its dependencies.
create function public.export_equity_ledger()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'equity_securities', (select coalesce(jsonb_agg(s order by s.id), '[]') from public.equity_securities s),
    'equity_grants', (select coalesce(jsonb_agg(g order by g.id), '[]') from public.equity_grants g),
    'equity_schedule', (select coalesce(jsonb_agg(s order by s.id), '[]') from public.equity_schedule s),
    'equity_events', (select coalesce(jsonb_agg(e order by e.id), '[]') from public.equity_events e),
    'equity_sales', (select coalesce(jsonb_agg(s order by s.id), '[]') from public.equity_sales s),
    'equity_sale_lots', (select coalesce(jsonb_agg(l order by l.id), '[]') from public.equity_sale_lots l)
  );
$$;
revoke all on function public.export_equity_ledger() from public, anon, authenticated;
grant execute on function public.export_equity_ledger() to authenticated, service_role;
