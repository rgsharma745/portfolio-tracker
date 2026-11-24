drop table public.rsu_grants;
alter table public.portfolio_snapshots rename column rsu_vested_value to employee_equity_value;

alter table public.portfolios add unique (owner_id, id);

create table public.equity_securities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  market text not null default 'US' check (market in ('US', 'IN', 'PRIVATE')),
  symbol text,
  currency text not null default 'USD' check (currency in ('USD', 'INR')),
  private_price numeric(18, 6) check (private_price >= 0),
  private_price_date date,
  unique (owner_id, id),
  unique (owner_id, market, symbol),
  check (
    (market = 'PRIVATE' and symbol is null and ((private_price is null) = (private_price_date is null)))
    or (
      market in ('US', 'IN') and symbol is not null and symbol ~ '^[A-Z0-9^][A-Z0-9.^&_-]{0,29}$'
      and currency = case when market = 'US' then 'USD' else 'INR' end
      and private_price is null and private_price_date is null
    )
  )
);

create table public.equity_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  portfolio_id uuid not null,
  security_id uuid not null,
  kind text not null check (kind in ('RSU', 'ESOP')),
  label text not null check (btrim(label) <> ''),
  granted_on date not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  grant_price numeric(18, 6) check (grant_price >= 0),
  expires_on date check (kind = 'ESOP' and expires_on >= granted_on),
  unique (owner_id, portfolio_id, id),
  unique (owner_id, portfolio_id, security_id, label),
  foreign key (owner_id, portfolio_id) references public.portfolios (owner_id, id) on delete cascade,
  foreign key (owner_id, security_id) references public.equity_securities (owner_id, id) on delete no action deferrable,
  check (kind = 'RSU' or grant_price is not null)
);

create table public.equity_schedule (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  portfolio_id uuid not null,
  grant_id uuid not null,
  scheduled_on date not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  unique (owner_id, portfolio_id, grant_id, id),
  foreign key (owner_id, portfolio_id, grant_id) references public.equity_grants (owner_id, portfolio_id, id)
    on delete no action deferrable initially deferred
);

create table public.equity_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  portfolio_id uuid not null,
  grant_id uuid not null,
  schedule_id uuid,
  kind text not null check (kind in ('vest', 'exercise')),
  occurred_on date not null,
  allotted_on date check (allotted_on >= occurred_on),
  quantity numeric(18, 6) not null check (quantity > 0),
  fmv numeric(18, 6) check (fmv >= 0),
  purchase_price numeric(18, 6) check (purchase_price >= 0),
  fees numeric(18, 6) not null default 0 check (fees >= 0),
  tax_units numeric(18, 6) not null default 0 check (tax_units between 0 and quantity),
  tax_paid_inr numeric(18, 2) check (tax_paid_inr >= 0),
  currency text check (currency in ('USD', 'INR')),
  fx numeric(18, 8) check (fx > 0 and (currency <> 'INR' or fx = 1)),
  unique (owner_id, portfolio_id, id),
  foreign key (owner_id, portfolio_id, grant_id) references public.equity_grants (owner_id, portfolio_id, id)
    on delete no action deferrable initially deferred,
  foreign key (owner_id, portfolio_id, grant_id, schedule_id) references public.equity_schedule (owner_id, portfolio_id, grant_id, id)
    on delete no action deferrable initially deferred,
  check ((currency is null) = (fx is null)),
  check ((fmv is null) = (fx is null)),
  check (kind = 'vest' or (schedule_id is null and purchase_price is not null and fmv is not null)),
  check (kind = 'exercise' or (purchase_price is null and fees = 0)),
  check (fmv is not null or (allotted_on is null and tax_units = 0 and tax_paid_inr is null))
);
create index on public.equity_events (owner_id, portfolio_id, grant_id, occurred_on);

create table public.equity_sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  portfolio_id uuid not null,
  security_id uuid not null,
  sold_on date not null,
  price numeric(18, 6) not null check (price > 0),
  brokerage numeric(18, 6) not null default 0 check (brokerage >= 0),
  other_fees numeric(18, 6) not null default 0 check (other_fees >= 0),
  currency text not null check (currency in ('USD', 'INR')),
  fx numeric(18, 8) not null check (fx > 0 and (currency <> 'INR' or fx = 1)),
  bank_inr numeric(18, 2) check (bank_inr >= 0),
  bank_on date check (bank_on >= sold_on),
  notes text,
  unique (owner_id, portfolio_id, id),
  foreign key (owner_id, portfolio_id) references public.portfolios (owner_id, id) on delete cascade,
  foreign key (owner_id, security_id) references public.equity_securities (owner_id, id) on delete no action deferrable,
  check ((bank_inr is null) = (bank_on is null))
);

create table public.equity_sale_lots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  portfolio_id uuid not null,
  sale_id uuid not null,
  event_id uuid not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  exercise_deduction numeric(18, 6) not null default 0 check (exercise_deduction >= 0),
  tax_deduction numeric(18, 6) not null default 0 check (tax_deduction >= 0),
  unique (sale_id, event_id),
  foreign key (owner_id, portfolio_id, sale_id) references public.equity_sales (owner_id, portfolio_id, id) on delete cascade,
  foreign key (owner_id, portfolio_id, event_id) references public.equity_events (owner_id, portfolio_id, id)
    on delete no action deferrable initially deferred
);
create index on public.equity_sale_lots (owner_id, portfolio_id, event_id);

do $$
declare t text;
begin
  foreach t in array array['equity_securities','equity_grants','equity_schedule','equity_events','equity_sales','equity_sale_lots']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_all on public.%I for all to authenticated
      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
grant insert, update, delete on public.equity_securities, public.equity_grants,
  public.equity_schedule, public.equity_events to authenticated;

-- Every grant write and sale RPC takes the portfolio row lock before checking the ledger.
-- The sale RPC alone can mutate sales and allocations on behalf of a signed-in user.
create function public.lock_equity_portfolio(p_owner uuid, p_portfolio uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from p_owner then
    raise exception 'Portfolio unavailable.' using errcode = '42501';
  end if;
  perform 1 from public.portfolios where owner_id = p_owner and id = p_portfolio for update;
  if not found then
    raise exception 'Portfolio unavailable.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.lock_equity_portfolio(uuid, uuid) from public, anon, authenticated;

create function public.equity_lock_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.owner_id, new.portfolio_id, new.id)
      is distinct from (old.owner_id, old.portfolio_id, old.id) then
    raise exception 'The record cannot move to another portfolio.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    -- Portfolio deletion cascades while the parent is already locked.
    perform 1 from public.portfolios where owner_id = old.owner_id and id = old.portfolio_id for update;
    return old;
  end if;
  perform public.lock_equity_portfolio(new.owner_id, new.portfolio_id);
  return new;
end;
$$;
revoke all on function public.equity_lock_write() from public, anon, authenticated;

create function public.validate_equity_grant(p_owner uuid, p_portfolio uuid, p_grant uuid)
returns void language plpgsql set search_path = '' as $$
declare
  g public.equity_grants;
begin
  select * into g from public.equity_grants
    where owner_id = p_owner and portfolio_id = p_portfolio and id = p_grant;
  if not found then
    if exists (select 1 from public.equity_events where grant_id = p_grant and owner_id = p_owner)
       or exists (select 1 from public.equity_schedule where grant_id = p_grant and owner_id = p_owner) then
      raise exception 'Remove vesting and exercise records before deleting this grant.' using errcode = 'P0001';
    end if;
    return;
  end if;

  if exists (
    select 1 from public.equity_events e
    where e.grant_id = g.id and (
      e.occurred_on < g.granted_on or e.occurred_on > (now() at time zone 'Asia/Kolkata')::date
      or e.allotted_on > (now() at time zone 'Asia/Kolkata')::date
      or (g.expires_on is not null and e.occurred_on > g.expires_on)
      or (g.kind = 'RSU' and (e.kind <> 'vest' or e.fmv is null or e.allotted_on is null))
      or (g.kind = 'ESOP' and e.kind = 'vest' and e.fmv is not null)
    )
  ) then
    raise exception 'Check the grant type and the dates of vesting, exercise and allotment.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.equity_schedule s where s.grant_id = g.id
    and (s.scheduled_on < g.granted_on or s.scheduled_on > g.expires_on
      or s.quantity < (select coalesce(sum(e.quantity), 0) from public.equity_events e where e.schedule_id = s.id))
  ) then
    raise exception 'A vesting tranche falls outside the grant dates or has more recorded vesting than scheduled.' using errcode = 'P0001';
  end if;
  if (
    coalesce((select sum(e.quantity) from public.equity_events e where e.grant_id = g.id and e.kind = 'vest' and e.schedule_id is null), 0)
    + coalesce((select sum(s.quantity) from public.equity_schedule s where s.grant_id = g.id), 0)
  ) > g.quantity then
    raise exception 'Actual and outstanding scheduled vesting exceed the granted quantity.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from (
      select sum(sum(case kind when 'vest' then quantity else -quantity end))
        over (order by occurred_on) as option_balance
      from public.equity_events where grant_id = g.id group by occurred_on
    ) balances where balances.option_balance < 0
  ) then
    raise exception 'An exercise exceeds the options vested on its date.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.equity_sale_lots a
    join public.equity_sales s on s.id = a.sale_id
    join public.equity_events e on e.id = a.event_id
    where e.grant_id = g.id and (e.allotted_on is null or e.allotted_on > s.sold_on
      or s.security_id <> g.security_id
      or (e.kind <> 'exercise' and a.exercise_deduction + a.tax_deduction > 0))
  ) or exists (
    select 1 from public.equity_events e where e.grant_id = g.id
    and e.quantity - e.tax_units < (
      select coalesce(sum(a.quantity), 0) from public.equity_sale_lots a where a.event_id = e.id
    )
  ) then
    raise exception 'The change conflicts with shares already sold from a lot.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.validate_equity_grant(uuid, uuid, uuid) from public, anon, authenticated;

create function public.equity_validate_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  grant_key uuid;
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.portfolios where id = old.portfolio_id) then
    return null;
  end if;
  if tg_table_name = 'equity_grants' then
    grant_key := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    grant_key := case when tg_op = 'DELETE' then old.grant_id else new.grant_id end;
    if tg_op = 'UPDATE' and old.grant_id <> new.grant_id then
      raise exception 'Move a record by removing it and adding it to the other grant.' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    if tg_table_name = 'equity_events' and exists (select 1 from public.equity_sale_lots where event_id = old.id) then
      raise exception 'Remove the linked sales before deleting this lot.' using errcode = 'P0001';
    end if;
    if tg_table_name = 'equity_schedule' and exists (select 1 from public.equity_events where schedule_id = old.id) then
      raise exception 'Remove or unlink recorded vesting before deleting a tranche.' using errcode = 'P0001';
    end if;
    perform public.validate_equity_grant(old.owner_id, old.portfolio_id, grant_key);
  else
    perform public.validate_equity_grant(new.owner_id, new.portfolio_id, grant_key);
  end if;
  return null;
end;
$$;
revoke all on function public.equity_validate_write() from public, anon, authenticated;

-- A portfolio removal is still a single cascading operation.
alter table public.equity_schedule add foreign key (owner_id, portfolio_id)
  references public.portfolios (owner_id, id) on delete cascade;
alter table public.equity_events add foreign key (owner_id, portfolio_id)
  references public.portfolios (owner_id, id) on delete cascade;

do $$
declare t text;
begin
  foreach t in array array['equity_grants','equity_schedule','equity_events']
  loop
    execute format('create trigger equity_lock_write before insert or update or delete on public.%I
      for each row execute function public.equity_lock_write()', t);
    execute format('create trigger equity_validate_write after insert or update or delete on public.%I
      for each row execute function public.equity_validate_write()', t);
  end loop;
end $$;

create function public.save_equity_sale(
  p_id uuid, p_portfolio uuid, p_security uuid, p_sold_on date, p_price numeric,
  p_brokerage numeric, p_other_fees numeric, p_currency text, p_fx numeric,
  p_lots jsonb, p_bank_inr numeric default null, p_bank_on date default null, p_notes text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  cutoff date := (now() at time zone 'Asia/Kolkata')::date;
  sale public.equity_sales;
  grant_id uuid;
begin
  if actor is null then raise exception 'Sign in to save sales.' using errcode = '42501'; end if;
  perform public.lock_equity_portfolio(actor, p_portfolio);

  if p_sold_on > cutoff or p_bank_on > cutoff then
    raise exception 'Sale and bank dates cannot be in the future.' using errcode = 'P0001';
  end if;
  if p_lots is null or jsonb_typeof(p_lots) <> 'array' or jsonb_array_length(p_lots) = 0 then
    raise exception 'Allocate the sale to at least one lot.' using errcode = 'P0001';
  end if;

  insert into public.equity_sales (
    id, owner_id, portfolio_id, security_id, sold_on, price, brokerage, other_fees,
    currency, fx, bank_inr, bank_on, notes
  ) values (
    p_id, actor, p_portfolio, p_security, p_sold_on, p_price, p_brokerage, p_other_fees,
    p_currency, p_fx, p_bank_inr, p_bank_on, p_notes
  )
  on conflict (id) do update set sold_on = excluded.sold_on, price = excluded.price,
    brokerage = excluded.brokerage, other_fees = excluded.other_fees, currency = excluded.currency,
    fx = excluded.fx, bank_inr = excluded.bank_inr, bank_on = excluded.bank_on, notes = excluded.notes
  where equity_sales.owner_id = actor and equity_sales.portfolio_id = p_portfolio
    and equity_sales.security_id = p_security
  returning * into sale;
  if not found then raise exception 'Sale unavailable.' using errcode = 'P0001'; end if;

  delete from public.equity_sale_lots where sale_id = sale.id and owner_id = actor;
  insert into public.equity_sale_lots (
    owner_id, portfolio_id, sale_id, event_id, quantity, exercise_deduction, tax_deduction
  )
  select actor, p_portfolio, sale.id, l.event_id, l.quantity,
    coalesce(l.exercise_deduction, 0), coalesce(l.tax_deduction, 0)
  from jsonb_to_recordset(p_lots) as l(
    event_id uuid, quantity numeric, exercise_deduction numeric, tax_deduction numeric
  );
  if exists (
    select 1 from public.equity_sale_lots a
    left join public.equity_events e on e.id = a.event_id and e.owner_id = actor and e.portfolio_id = p_portfolio
    where a.sale_id = sale.id and e.id is null
  ) then
    raise exception 'One or more sale lots are unavailable in this portfolio.' using errcode = 'P0001';
  end if;

  -- Check payout per lot using the same quantity-weighted fees as the read view.
  if exists (
    select 1 from (
      select a.*, sum(a.quantity) over () as total_quantity
      from public.equity_sale_lots a where a.sale_id = sale.id
    ) a
    where a.quantity * (sale.price * a.total_quantity - sale.brokerage - sale.other_fees)
      < (a.exercise_deduction + a.tax_deduction) * a.total_quantity
  ) then
    raise exception 'Charges and cashless deductions cannot exceed the proceeds for a lot.' using errcode = 'P0001';
  end if;
  if sale.bank_inr > 0 and (
    select sum(a.quantity) * sale.price - sale.brokerage - sale.other_fees
      - sum(a.exercise_deduction + a.tax_deduction)
    from public.equity_sale_lots a where a.sale_id = sale.id
  ) = 0 then
    raise exception 'A sale with no payout cannot have a positive bank credit.' using errcode = 'P0001';
  end if;

  for grant_id in select distinct e.grant_id from public.equity_sale_lots a
    join public.equity_events e on e.id = a.event_id
    where a.sale_id = sale.id
  loop
    perform public.validate_equity_grant(actor, p_portfolio, grant_id);
  end loop;
end;
$$;
revoke all on function public.save_equity_sale(uuid, uuid, uuid, date, numeric, numeric, numeric, text, numeric, jsonb, numeric, date, text)
  from public, anon, authenticated;
grant execute on function public.save_equity_sale(uuid, uuid, uuid, date, numeric, numeric, numeric, text, numeric, jsonb, numeric, date, text)
  to authenticated;

create function public.delete_equity_sale(p_id uuid, p_portfolio uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in to delete sales.' using errcode = '42501'; end if;
  perform public.lock_equity_portfolio(actor, p_portfolio);
  delete from public.equity_sales where id = p_id and owner_id = actor and portfolio_id = p_portfolio;
end;
$$;
revoke all on function public.delete_equity_sale(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_equity_sale(uuid, uuid) to authenticated;

alter table public.equity_securities add check (private_price <> 'NaN'::numeric);
alter table public.equity_grants add check (quantity <> 'NaN'::numeric and grant_price <> 'NaN'::numeric);
alter table public.equity_schedule add check (quantity <> 'NaN'::numeric);
alter table public.equity_events add check (
  quantity <> 'NaN'::numeric and fmv <> 'NaN'::numeric and purchase_price <> 'NaN'::numeric
  and fees <> 'NaN'::numeric and tax_units <> 'NaN'::numeric and tax_paid_inr <> 'NaN'::numeric and fx <> 'NaN'::numeric
);
alter table public.equity_sales add check (
  price <> 'NaN'::numeric and brokerage <> 'NaN'::numeric and other_fees <> 'NaN'::numeric
  and bank_inr <> 'NaN'::numeric and fx <> 'NaN'::numeric
);
alter table public.equity_sale_lots add check (
  quantity <> 'NaN'::numeric and exercise_deduction <> 'NaN'::numeric and tax_deduction <> 'NaN'::numeric
);

create view public.v_equity_lots with (security_invoker = true) as
with sold as (
  select event_id, sum(quantity) as quantity from public.equity_sale_lots group by event_id
), lots as (
  select e.*, g.security_id, g.kind as grant_kind,
    coalesce(sold.quantity, 0) as sold_units,
    case when e.allotted_on is null then 0
         else e.quantity - e.tax_units - coalesce(sold.quantity, 0) end as held_units,
    case when sec.market = 'PRIVATE' then sec.private_price else p.close end as current_price,
    case when sec.market = 'PRIVATE' then sec.private_price_date else p.price_date end as price_date,
    case when sec.currency = 'INR' then 1 else fx.rate end as current_fx
  from public.equity_events e
  join public.equity_grants g on g.id = e.grant_id
  join public.equity_securities sec on sec.id = g.security_id
  left join sold on sold.event_id = e.id
  left join public.stock_price_latest p on p.market = sec.market and p.symbol = sec.symbol
  left join public.fx_latest fx on fx.pair = 'USDINR'
  where e.fmv is not null
), valued as (
  select lots.*,
    quantity * fmv as gross_fmv,
    (quantity * purchase_price + fees) * fx + coalesce(tax_paid_inr, 0) as acquisition_expenses_inr,
    quantity * purchase_price * fx as purchase_cost_inr,
    case when purchase_price is not null then quantity * greatest(fmv - purchase_price, 0) end as perquisite,
    fmv * fx as basis_per_share_inr,
    case when held_units = 0 then 0 else held_units * current_price * current_fx end as value_inr
  from lots
)
select valued.*,
  held_units * basis_per_share_inr as held_basis_inr,
  value_inr - held_units * basis_per_share_inr as unrealized_inr,
  case when held_units > 0 then (value_inr - held_units * basis_per_share_inr)
    / nullif(held_units * basis_per_share_inr, 0) * 100 end as unrealized_return
from valued;

create view public.v_equity_sale_details with (security_invoker = true) as
with sale_totals as (
  select sale_id, sum(quantity) as total_quantity, sum(exercise_deduction + tax_deduction) as deductions
  from public.equity_sale_lots group by sale_id
), allocations as (
  select a.*, lot.grant_id, lot.allotted_on, s.sold_on, s.security_id, s.currency, s.fx, s.bank_on,
    s.bank_inr as sale_bank_inr,
    s.sold_on - lot.allotted_on as holding_days,
    case when s.sold_on >= date '2024-07-23' then
      case when s.sold_on > (lot.allotted_on + case when sec.market = 'IN' then interval '12 months'
                                                       else interval '24 months' end)::date
           then 'Long-term' else 'Short-term' end
    end as classification,
    a.quantity * s.price as gross,
    total.total_quantity * s.price - s.brokerage - s.other_fees as sale_net,
    total.total_quantity,
    total.deductions,
    a.quantity * lot.basis_per_share_inr as basis_inr
  from public.equity_sale_lots a
  join sale_totals total on total.sale_id = a.sale_id
  join public.equity_sales s on s.id = a.sale_id
  join public.v_equity_lots lot on lot.id = a.event_id
  join public.equity_securities sec on sec.id = s.security_id
), payouts as (
  select allocations.*, sale_net * quantity / total_quantity as net,
    sale_net - deductions as sale_payout
  from allocations
), proceeds as (
  select payouts.*, net - exercise_deduction - tax_deduction as payout,
    case when currency = 'USD' then sale_bank_inr / nullif(sale_payout, 0) end as effective_fx
  from payouts
), credits as (
  select proceeds.*,
    case when sale_bank_inr is null then null
         when sale_payout = 0 then 0
         else sale_bank_inr * payout / sale_payout end as bank_inr
  from proceeds
), realized as (
  select credits.*,
    case when bank_inr is null then net * fx
         else bank_inr + (exercise_deduction + tax_deduction) * coalesce(effective_fx, fx)
    end - basis_inr as realized_inr
  from credits
)
select realized.*, realized_inr / nullif(basis_inr, 0) * 100 as return_percent
from realized;

revoke all on public.v_equity_lots, public.v_equity_sale_details from public, anon, authenticated;
grant select on public.v_equity_lots, public.v_equity_sale_details to authenticated, service_role;
